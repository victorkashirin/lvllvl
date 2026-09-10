import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("new-project preset selectors load their assets from the landing page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();
  await page.locator("#start2D").click();

  await page.locator("#newProjectChooseTileSetButton").click();
  await expect(page.locator('.characterSetListEntry[value="petscii"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const chooser = g_app.textModeEditor.tileSetManager.getChoosePresetDialog();
    return Boolean(chooser.img?.complete && chooser.img.naturalWidth > 0 && chooser.tileSet);
  })).toBe(true);

  await page.evaluate(() =>
    g_app.textModeEditor.tileSetManager.getChoosePresetDialog().tabPanel.showTab("load"),
  );
  await page.locator("#loadTileSetFile").setInputFiles(
    path.join(projectRoot, "src/charsets/petscii.png"),
  );
  await expect.poll(() => page.evaluate(() => {
    const loader = g_app.textModeEditor.tileSetManager.getChoosePresetDialog().tileSetImport;
    return Boolean(loader.onscreenCanvas && loader.loadImageData);
  })).toBe(true);
  await page.evaluate(() => UI.closeDialog());

  await page.locator("#newProductChooseColourPaletteButton").click();
  await expect(page.locator('.colorPaletteListEntry[value="c64_colodore"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const chooser = g_app.textModeEditor.colorPaletteManager.getChoosePresetDialog();
    return Boolean(chooser.img?.complete && chooser.img.naturalWidth > 0 && chooser.paletteImage);
  })).toBe(true);

  await page.evaluate(() =>
    g_app.textModeEditor.colorPaletteManager.getChoosePresetDialog().tabPanel.showTab("load"),
  );
  await page.locator("#colourPaletteFile").setInputFiles(
    path.join(projectRoot, "src/palettes/c64_colodore.png"),
  );
  await expect.poll(() => page.evaluate(() => {
    const loader = g_app.textModeEditor.colorPaletteManager.getChoosePresetDialog().colorPaletteLoad;
    return Boolean(loader.paletteCanvas && loader.colors?.length > 0);
  })).toBe(true);
});
