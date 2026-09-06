import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

async function open2DProject(page) {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();
  await page.locator("#start2D").click();
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();
  await expect.poll(() => page.evaluate(() => Boolean(
    g_app.textModeEditor.history &&
    g_app.textModeEditor.tileSetManager.getCurrentTileSet(),
  ))).toBe(true);
}

test("landing page and About show plus release information", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();

  await expect(page.locator(".start-edition")).toHaveText(/plus/i);
  await expect(page.locator(".lvllvl-version")).toHaveText(`v${packageJson.version}`);
  await expect(page.locator(".start-improvement-list li")).toHaveCount(8);
  await expect(page.locator(".start-github-link")).toHaveAttribute(
    "href",
    "https://github.com/victorkashirin/lvllvl",
  );

  const buildInfo = await page.evaluate(() => g_app.getBuildInfo());
  expect(buildInfo).toMatchObject({ version: packageJson.version });
  expect(buildInfo.buildDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await page.evaluate(() => g_app.menuClick("help-about"));
  const aboutDialog = page.locator(".ui-dialog:visible").filter({
    hasText: "About lvllvl plus",
  }).last();
  await expect(aboutDialog).toContainText(new RegExp(`Version\\s+${packageJson.version}`));
  await expect(aboutDialog).toContainText(new RegExp(`Build date\\s+${buildInfo.buildDate} UTC`));
  await expect(aboutDialog.getByRole("link", {
    name: "View lvllvl plus on GitHub",
  })).toHaveAttribute("href", "https://github.com/victorkashirin/lvllvl");
});

test("tile editor, keyboard, desktop menu, and mobile menu share classic history", async ({ page }) => {
  await open2DProject(page);

  const before = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const tileEditor = editor.tileEditor.tileEditorGrid;
    editor.tileEditor.setVisible(true);
    tileEditor.setCharacters([[0]]);
    return {
      canvasScale: tileEditor.canvasScale,
      historyLength: editor.history.historyLength,
      pixelHeight: tileEditor.pixelHeight,
      pixelWidth: tileEditor.pixelWidth,
      revision: g_app.doc.modifiedRevision,
      value: tileEditor.getPixel(0, 0),
    };
  });

  const canvas = page.locator("#tileEditorCanvas");
  await expect(canvas).toBeVisible();
  await canvas.click({
    position: {
      x: before.pixelWidth / (before.canvasScale * 2),
      y: before.pixelHeight / (before.canvasScale * 2),
    },
  });

  const edit = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    return {
      dirtyRevision: g_app.doc.modifiedRevision,
      historyLength: editor.history.historyLength,
      value: editor.tileEditor.tileEditorGrid.getPixel(0, 0),
    };
  });
  const expected = before.value === 1 ? 0 : 1;
  expect(edit.value).toBe(expected);
  expect(edit.dirtyRevision).toBeGreaterThan(before.revision);
  expect(edit.historyLength).toBe(before.historyLength + 1);

  const modifier = await page.evaluate(() => UI.os === "Mac OS" ? "Meta" : "Control");
  await page.keyboard.press(`${modifier}+z`);
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.tileEditor.tileEditorGrid.getPixel(0, 0),
  )).toBe(before.value);

  await page.evaluate(() => g_app.menuClick("edit-redo"));
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.tileEditor.tileEditorGrid.getPixel(0, 0),
  )).toBe(expected);

  await page.locator("#mobileMenuBarUndo").evaluate((button) => button.click());
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.tileEditor.tileEditorGrid.getPixel(0, 0),
  )).toBe(before.value);
});
