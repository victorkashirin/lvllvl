import { expect, test } from "@playwright/test";

async function openProject(page) {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#start2D").click();
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();
}

async function rowGeometry(row) {
  return row.evaluate((element) => {
    const origin = element.getBoundingClientRect();
    const bounds = (child) => {
      const rect = child.getBoundingClientRect();
      const round = (value) => Math.round(value * 1000) / 1000;
      return {
        height: round(rect.height),
        left: round(rect.left - origin.left),
        top: round(rect.top - origin.top),
        width: round(rect.width),
      };
    };
    return {
      gradient: bounds(element.querySelector("canvas, .oklchTrack")),
      input: bounds(element.querySelector("input[type=number]")),
      label: bounds(element.querySelector("label")),
    };
  });
}

async function oklchSliderStyle(root) {
  return root.evaluate((element) => {
    const slider = element.querySelector(".oklchSlider");
    const caret = element.querySelector(".oklchCaret");
    const line = getComputedStyle(caret, "::before");
    const triangle = getComputedStyle(caret, "::after");
    return {
      borderWidth: getComputedStyle(slider).borderWidth,
      lineColor: line.backgroundColor,
      lineWidth: line.width,
      triangleBottomColor: triangle.borderBottomColor,
      triangleBottomWidth: triangle.borderBottomWidth,
      triangleLeftWidth: triangle.borderLeftWidth,
      triangleRightWidth: triangle.borderRightWidth,
    };
  });
}

test("panel OKLCH edits update the palette and stay in sync with RGB/HSV/hex", async ({ page }) => {
  await openProject(page);
  await page.evaluate(() => g_app.textModeEditor.showColorEditor());
  const hsvGeometry = await rowGeometry(page.locator("#colorEditorHSV .colorComponentSelector").first());
  await page.locator("#colorEditorTab-rgb").click();
  const rgbGeometry = await rowGeometry(page.locator("#colorEditorRGB .colorComponentSelector").first());
  expect(rgbGeometry).toEqual(hsvGeometry);
  await page.locator("#colorEditorTab-oklch").click();
  const root = page.locator("#colorEditorOKLCH");
  await expect(root).toBeVisible();
  expect(await rowGeometry(root.locator(".colorComponentSelector").first())).toEqual(rgbGeometry);
  expect(rgbGeometry.gradient.height).toBe(34);
  expect(rgbGeometry.input.width).toBe(50);
  expect(await oklchSliderStyle(root)).toEqual({
    borderWidth: "0px",
    lineColor: "rgba(255, 255, 255, 0.6)",
    lineWidth: "1px",
    triangleBottomColor: "rgb(255, 255, 255)",
    triangleBottomWidth: "4px",
    triangleLeftWidth: "2px",
    triangleRightWidth: "2px",
  });
  await page.locator("#editColorHex").fill("ff0000");
  await page.locator("#editColorHex").dispatchEvent("change");
  await expect(root.locator("#colorEditorOKLCH-l")).toHaveValue("62.8");
  await expect(root.locator("#colorEditorOKLCH-c")).toHaveValue("0.258");
  await root.locator("#colorEditorOKLCH-l").fill("65.5");
  await root.locator("#colorEditorOKLCH-c").fill("0.125");
  await root.locator("#colorEditorOKLCH-h").fill("240.5");
  await root.locator("#colorEditorOKLCH-h").blur();
  const rgb = await page.evaluate(() => {
    const editor = g_app.textModeEditor.colorEditor;
    return { rgb: editor.rgb, saved: g_app.textModeEditor.colorPaletteManager
      .getCurrentColorPalette().getHex(editor.colorIndex) };
  });
  expect(rgb.saved).toBe(rgb.rgb);
  await expect(page.locator("#editColorHex")).toHaveValue(rgb.rgb.toString(16).padStart(6, "0"));
  await page.locator("#colorEditorTab-rgb").click();
  await expect(root).toBeHidden();
  await expect(page.locator("#editColorR")).toHaveValue(String((rgb.rgb >> 16) & 255));
  await page.locator("#colorEditorTab-hsv").click();
  await page.locator("#editColorV").fill("50");
  await page.locator("#editColorV").dispatchEvent("change");
  await page.locator("#colorEditorTab-oklch").click();
  await expect(root.locator("#colorEditorOKLCH-l")).not.toHaveValue("65.5");
  // Keyboard adjustment keeps the entered hue, even when chroma is zero.
  await root.locator("#colorEditorOKLCH-c").fill("0");
  await root.locator("#colorEditorOKLCH-h").fill("120");
  const slider = root.locator("#colorEditorOKLCH-h-slider");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(root.locator("#colorEditorOKLCH-h")).toHaveValue("120.1");

  await root.locator("#colorEditorOKLCH-l").fill("20");
  await root.locator("#colorEditorOKLCH-h").fill("0");
  const chroma = root.locator("#colorEditorOKLCH-c");
  await chroma.fill("0.0014");
  await chroma.blur();
  await expect(chroma).toHaveValue("0.001");
  const committedRgb = await page.evaluate(() => g_app.textModeEditor.colorEditor.rgb);
  await chroma.fill("0.002");
  await chroma.fill("0.001");
  const roundedRgb = await page.evaluate(() => g_app.textModeEditor.colorEditor.rgb);
  expect(committedRgb).toBe(roundedRgb);
});

test("palette dialog OKLCH supports dragging, hex sync, drawing and saving", async ({ page }) => {
  await openProject(page);
  await page.locator("#editColorPaletteButton").click();
  const rgbGeometry = await rowGeometry(page.locator("#colorPaletteEditSelectionMethod_rgb .colorComponentSelector").first());
  await page.locator("#colorPaletteEdit .rb-container").filter({ hasText: "OKLCH" }).click();
  const root = page.locator("#colorPaletteEditOKLCH");
  await expect(root).toBeVisible();
  expect(await rowGeometry(root.locator(".colorComponentSelector").first())).toEqual(rgbGeometry);
  expect(rgbGeometry.gradient.height).toBe(28);
  expect(rgbGeometry.input.width).toBe(50);
  await page.locator("#colorPaletteEditOklchHex").fill("ff0000");
  await expect(root.locator("#colorPaletteEditOKLCH-c")).toHaveValue("0.258");
  await root.locator("#colorPaletteEditOKLCH-l").fill("70.5");
  await root.locator("#colorPaletteEditOKLCH-c").fill("0.12");
  const slider = root.locator("#colorPaletteEditOKLCH-h-slider");
  const bounds = await slider.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 4, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 3 / 4, bounds.y + bounds.height / 2);
  await page.mouse.up();
  expect(Number(await root.locator("#colorPaletteEditOKLCH-h").inputValue())).toBeGreaterThan(250);
  const hex = await page.locator("#colorPaletteEditOklchHex").inputValue();
  await expect(page.locator("#colorPaletteEditHex")).toHaveValue(hex);
  expect(await page.evaluate(() => g_app.textModeEditor.colorPaletteEdit.selectedColor)).toBe(parseInt(hex, 16));
  await page.locator("#colorPaletteEditCanvas").click({ position: { x: 12, y: 12 } });
  const dialog = page.locator("#dialog-edit-color-palette-dialog");
  await dialog.getByText("OK", { exact: true }).click();
  expect(await page.evaluate(() => {
    const palette = g_app.textModeEditor.colorPaletteManager.getCurrentColorPalette();
    const index = palette.getColorMap('default')[0][0];
    return palette.getHex(index);
  })).toBe(parseInt(hex, 16));
});
