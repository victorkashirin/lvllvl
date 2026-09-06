import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

async function startDefaultProject(page) {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#start2D").click();
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();
}

test("PNG export can crop to the active canvas selection", async ({ page }) => {
  await startDefaultProject(page);

  await page.evaluate(() => g_app.menuClick("export-image"));
  const areaRow = page.locator("#exportImageAreaRow");
  await expect(page.locator("#exportImageAs")).toBeVisible();
  await expect(page.locator("input[name='exportImageFormat'][value='png']")).toBeChecked();
  await expect(areaRow).toBeHidden();
  await page.evaluate(() => UI.closeDialog());

  await page.evaluate(() => {
    const layer = g_app.textModeEditor.layers.getSelectedLayerObject();
    layer.setColorPerMode("cell");
    layer.setCell({
      x: 2,
      y: 3,
      t: 0,
      fc: 1,
      bc: 2,
      fh: 0,
      fv: 0,
      rz: 0,
      update: false,
    });
    g_app.textModeEditor.tools.drawTools.select.setSelection({
      from: { x: 2, y: 3, z: 0 },
      to: { x: 4, y: 4, z: 0 },
      saveInHistory: false,
    });
    g_app.menuClick("export-image");
  });

  await expect(areaRow).toBeVisible();
  await expect(
    page.locator("input[name='exportImageArea'][value='document']"),
  ).toBeChecked();
  const controlsSize = await page.locator("#exportImagePanel > div").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(controlsSize.scrollHeight).toBeLessThanOrEqual(controlsSize.clientHeight);

  await page.locator("#exportImageScale").selectOption("1");
  await areaRow.locator("label.rb-container", { hasText: "Selection" }).click();
  await expect(page.locator("#exportImageDimensions")).toHaveText("24x16 pixels");

  const state = await page.evaluate(() => {
    const dialog = g_app.textModeEditor.exportImageDialog;
    dialog.drawFrame();
    const frameCanvas = g_app.textModeEditor.exportFrameImage.getCanvas();
    const selectedColor = g_app.textModeEditor.layers
      .getSelectedLayerObject()
      .getColorPalette()
      .getRGBA(2);
    return {
      area: dialog.exportArea,
      bounds: dialog.getSelectionBounds(),
      canvas: { width: dialog.canvas.width, height: dialog.canvas.height },
      frameCanvas: { width: frameCanvas.width, height: frameCanvas.height },
      firstPixel: Array.from(dialog.context.getImageData(0, 0, 1, 1).data),
      selectedColor,
    };
  });
  expect(state).toMatchObject({
    area: "selection",
    bounds: { x: 16, y: 24, width: 24, height: 16 },
    canvas: { width: 24, height: 16 },
    frameCanvas: { width: 24, height: 16 },
  });
  expect(state.firstPixel.slice(0, 3)).toEqual(state.selectedColor.slice(0, 3));
  expect(state.firstPixel[3]).toBe(255);

  const downloadPromise = page.waitForEvent("download");
  await page.evaluate(() => g_app.textModeEditor.exportImageDialog.exportPng());
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBe(24);
  expect(bytes.readUInt32BE(20)).toBe(16);
});

test("image export can crop to a pixel-mode selection", async ({ page }) => {
  await startDefaultProject(page);

  await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    editor.setEditorMode("pixel");
    editor.tools.drawTools.pixelSelect.setSelection({
      from: { x: 5, y: 6 },
      to: { x: 11, y: 14 },
      saveInHistory: false,
    });
    g_app.menuClick("export-image");
  });

  const areaRow = page.locator("#exportImageAreaRow");
  await expect(areaRow).toBeVisible();
  await page.locator("#exportImageScale").selectOption("1");
  await areaRow.locator("label.rb-container", { hasText: "Selection" }).click();
  await expect(page.locator("#exportImageDimensions")).toHaveText("7x9 pixels");

  expect(
    await page.evaluate(() => {
      const dialog = g_app.textModeEditor.exportImageDialog;
      return {
        area: dialog.exportArea,
        bounds: dialog.getSelectionBounds(),
        canvas: { width: dialog.canvas.width, height: dialog.canvas.height },
      };
    }),
  ).toEqual({
    area: "selection",
    bounds: { x: 5, y: 6, width: 7, height: 9 },
    canvas: { width: 7, height: 9 },
  });

  await page
    .locator("#exportImagePanel > div > .formGroup label.rb-container", {
      hasText: "GIF",
    })
    .click();
  await expect(areaRow).toBeVisible();
  await expect(page.locator("#exportImageDimensions")).toHaveText("7x9 pixels");
});

test("GIF export can crop to the active canvas selection", async ({ page }) => {
  await startDefaultProject(page);

  await page.evaluate(() => {
    g_app.textModeEditor.tools.drawTools.select.setSelection({
      from: { x: 2, y: 3, z: 0 },
      to: { x: 4, y: 4, z: 0 },
      saveInHistory: false,
    });
    g_app.menuClick("export-image");
  });

  await page.locator("#exportImageScale").selectOption("1");
  await page
    .locator("#exportImageAreaRow label.rb-container", { hasText: "Selection" })
    .click();
  await page
    .locator("#exportImagePanel > div > .formGroup label.rb-container", {
      hasText: "GIF",
    })
    .click();

  await expect(page.locator("#exportImageAreaRow")).toBeVisible();
  await expect(page.locator("#exportImageDimensions")).toHaveText("24x16 pixels");
  expect(
    await page.evaluate(() => ({
      area: g_app.textModeEditor.exportImageDialog.exportArea,
      width: g_app.textModeEditor.exportImageDialog.canvas.width,
      height: g_app.textModeEditor.exportImageDialog.canvas.height,
    })),
  ).toEqual({ area: "selection", width: 24, height: 16 });

  const downloadPromise = page.waitForEvent("download");
  await page.evaluate(() => g_app.textModeEditor.exportImageDialog.exportGif());
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 6).toString()).toMatch(/^GIF8[79]a$/);
  expect(bytes.readUInt16LE(6)).toBe(24);
  expect(bytes.readUInt16LE(8)).toBe(16);
});

test("PNG and GIF export can omit the document background", async ({ page }) => {
  await startDefaultProject(page);

  await page.evaluate(() => g_app.menuClick("export-image"));
  await page.locator("#exportImageScale").selectOption("1");
  await page.locator("#exportImageBackground").selectOption("transparent");

  const pngState = await page.evaluate(async () => {
    const dialog = g_app.textModeEditor.exportImageDialog;
    dialog.drawFrame();
    const pngBlob = await new Promise((resolve) => dialog.canvas.toBlob(resolve, "image/png"));
    const bitmap = await createImageBitmap(pngBlob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const alpha = context.getImageData(0, 0, 1, 1).data[3];
    bitmap.close();
    return {
      alpha,
      includeBackground: dialog.includeBackground,
      selectedValue: document.querySelector("#exportImageBackground").value,
    };
  });
  expect(pngState).toEqual({
    alpha: 0,
    includeBackground: false,
    selectedValue: "transparent",
  });

  await page
    .locator("#exportImagePanel > div > .formGroup label.rb-container", {
      hasText: "GIF",
    })
    .click();
  const gifDownloadPromise = page.waitForEvent("download");
  await page.evaluate(() => g_app.textModeEditor.exportImageDialog.exportGif());
  const gifDownload = await gifDownloadPromise;
  const gifBytes = await readFile(await gifDownload.path());

  let hasTransparentFrame = false;
  for(let i = 0; i <= gifBytes.length - 8; i++) {
    if(gifBytes[i] == 0x21 && gifBytes[i + 1] == 0xf9 && gifBytes[i + 2] == 0x04) {
      hasTransparentFrame = (gifBytes[i + 3] & 1) == 1;
      if(hasTransparentFrame) break;
    }
  }
  expect(hasTransparentFrame).toBe(true);

  const gifAlpha = await page.evaluate(async (base64) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = `data:image/gif;base64,${base64}`;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, 1, 1).data[3];
  }, gifBytes.toString("base64"));
  expect(gifAlpha).toBe(0);
});

test("GIF transparency preserves opaque pixels with the same RGB value", async ({ page }) => {
  await startDefaultProject(page);

  await page.evaluate(() => g_app.menuClick("export-image"));
  const alpha = await page.evaluate(async () => {
    const dialog = g_app.textModeEditor.exportImageDialog;
    dialog.canvas.width = 2;
    dialog.canvas.height = 1;
    dialog.context = dialog.canvas.getContext("2d");
    dialog.context.putImageData(new ImageData(new Uint8ClampedArray([
      255, 0, 255, 0,
      255, 0, 255, 255,
    ]), 2, 1), 0, 0);
    dialog.includeBackground = false;

    const gif = new GIF({
      workers: 1,
      workerScript: "lib/gif/gif.worker.js",
      quality: 10,
      width: 2,
      height: 1,
      repeat: 0,
    });
    dialog.addGifFrame(gif, 100);
    const blob = await new Promise((resolve) => {
      gif.on("finished", resolve);
      gif.render();
    });

    const image = new Image();
    const url = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 2, 1).data;
    URL.revokeObjectURL(url);
    return [pixels[3], pixels[7]];
  });

  expect(alpha).toEqual([0, 255]);
});

test("transparent image export does not force an NES background", async ({ page }) => {
  await startDefaultProject(page);

  const alpha = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    layer.doc.screenMode = TextModeEditor.Mode.NES;
    editor.exportFrameImage.exportFrame({
      scale: 1,
      includeBorder: false,
      includeBackground: false,
      layers: "all",
      frame: editor.graphic.getCurrentFrame(),
    });
    return editor.exportFrameImage
      .getCanvas()
      .getContext("2d")
      .getImageData(0, 0, 1, 1).data[3];
  });

  expect(alpha).toBe(0);
});
