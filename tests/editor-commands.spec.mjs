import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const legacyTextmodeProject = await readFile(
  new URL("./fixtures/legacy-textmode-project.json", import.meta.url),
  "utf8",
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

test("maintained editors work without the retired runtime shells", async ({ page }) => {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();

  const legacyRecord = await page.evaluate(async (contents) => {
    const doc = g_app.createDocument();
    await new Promise((resolve) => doc.loadLocalFile(contents, resolve));

    const path = "/screens/Legacy Screen";
    const migratedRecord = doc.getDocRecord(path);
    doc.openDoc({ view: path });

    const selectedLayer = g_app.textModeEditor.layers.getSelectedLayerObject();
    return {
      cell: selectedLayer.getCell({ x: 0, y: 0 }).t,
      currentEditor: g_app.projectNavigator.getCurrentEditor() === g_app.textModeEditor,
      currentPath: g_app.projectNavigator.getCurrentPath(),
      migratedType: migratedRecord.type,
      mode: g_app.getMode(),
      path,
    };
  }, legacyTextmodeProject);
  expect(legacyRecord).toMatchObject({
    cell: 0,
    currentEditor: true,
    currentPath: "/screens/Legacy Screen",
    migratedType: "graphic",
    mode: "2d",
  });

  const spritePath = "/sprites/Untitled Sprite";
  await page.goto("/?editor=sprite", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeHidden();
  await expect.poll(() => page.evaluate(() => ({
    exists: Boolean(g_app.doc.getDocRecord("/sprites/Untitled Sprite")),
    mode: g_app.getMode(),
    spriteEditorDefined: typeof globalThis.SpriteEditor !== "undefined",
    type: g_app.textModeEditor.graphic.getType(),
  }))).toEqual({
    exists: true,
    mode: "2d",
    spriteEditorDefined: false,
    type: "sprite",
  });

  const menuState = await page.evaluate(() => ({
    active: [
      "c64debugger-sound",
      "c64debugger-joystick1",
      "c64debugger-mouse1",
      "c64debugger-size-1",
      "c64debugger-prgloadrun",
      "c64debugger-viewraster",
    ].every((id) => UI.exists(id)),
    retired: [
      "c64-sound",
      "c64-joystick1",
      "c64-mouse1",
      "c64-size-1",
      "c64-prgloadrun",
      "c64-viewraster",
    ].some((id) => UI.exists(id)),
  }));
  expect(menuState).toEqual({ active: true, retired: false });

  await page.evaluate(() => g_app.setMode("c64"));
  await expect.poll(() => page.evaluate(() => ({
    mode: g_app.getMode(),
    visible: UI("c64debuggerPanel").getVisible(),
  }))).toEqual({ mode: "c64", visible: true });

  const assemblerOpened = await page.evaluate(() =>
    g_app.projectNavigator.showDocRecord("/asm/main.asm", { forceReload: true }));
  expect(assemblerOpened).toBe(true);
  await expect.poll(() => page.evaluate(() => ({
    currentEditor: g_app.projectNavigator.getCurrentEditor() === g_app.assemblerEditor,
    mode: g_app.getMode(),
  }))).toEqual({ currentEditor: true, mode: "assembler" });

  await page.evaluate((path) => {
    g_app.projectNavigator.showDocRecord(path, { forceReload: true });
    g_app.menuClick("export-x16assembly");
  }, spritePath);
  await expect(page.locator("#exportX16AssemblyPanel")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(
    g_app.textModeEditor.exportX16Assembly?.asmEditor,
  ))).toBe(true);
});
