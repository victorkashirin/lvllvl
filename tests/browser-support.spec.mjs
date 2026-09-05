import { expect, test } from "@playwright/test";

import { browserPolicy } from "../scripts/browser-policy.mjs";

const desktop2DRendererProjects = new Set(["chromium-desktop", "firefox-desktop"]);

function isDesktop2DRendererProject(testInfo) {
  return desktop2DRendererProjects.has(testInfo.project.name);
}

function observeLocalFailures(page, baseURL) {
  const localFailures = [];
  const localOrigin = new URL(baseURL).origin;

  page.on("pageerror", (error) =>
    localFailures.push(`page error: ${error.stack ?? error.message}`),
  );
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).origin === localOrigin) {
      localFailures.push(`request failed: ${request.method()} ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    if (new URL(response.url()).origin === localOrigin && response.status() >= 400) {
      localFailures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  return localFailures;
}

async function waitForStableStartPage(page, timeout, observedFailures = []) {
  try {
    await expect(page.locator("#startPage")).toBeVisible({ timeout });
  } catch (error) {
    const pageState = await page.evaluate(() => ({
      body: document.body?.innerText.slice(0, 500) ?? "",
      readyState: document.readyState,
      uiReady: typeof UI === "undefined" ? "unavailable" : UI.ready,
      url: window.location.href,
    }));
    throw new Error(
      `${error.message}\nPage state: ${JSON.stringify(pageState)}${
        observedFailures.length > 0 ? `\nObserved failures:\n${observedFailures.join("\n")}` : ""
      }`,
    );
  }
  await page.waitForLoadState("load");
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function startupState(page, testInfo) {
  const state = await page.evaluate(() => ({
    mobile: Boolean(UI.isMobile.any()),
    ready: UI.ready,
  }));
  const expectsMobileInterface = testInfo.project.metadata.deviceClass !== "desktop";

  expect(state).toEqual({ mobile: expectsMobileInterface, ready: true });
}

async function open2DProject(page, testInfo, { vector = false } = {}) {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForStableStartPage(
    page,
    browserPolicy.performanceBudgets.startupMilliseconds,
  );

  await page.locator("#start2D").click();
  if (vector) {
    await page.locator('input[name="newProjectMode"][value="vector"]').evaluate((input) => {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect.poll(() => page.evaluate(() =>
    Array.from(document.querySelectorAll(".ui-dialog-background"))
      .every((element) => getComputedStyle(element).display === "none"),
  )).toBe(true);
}

for (const vector of [false, true]) {
  test(`2D ${vector ? "vector" : "bitmap"} thumbnails batch edits and retain correct full-layer final state`, async ({ page }, testInfo) => {
    test.skip(!isDesktop2DRendererProject(testInfo));
    await open2DProject(page, testInfo, { vector });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const result = await page.evaluate(async (vector) => {
      const editor = g_app.textModeEditor;
      const { graphic, layers, gridView2d: view } = editor;
      const layer = layers.getSelectedLayerObject();
      const tileSet = layer.getTileSet();
      if (vector) {
        tileSet.unitsPerEm = tileSet.ascent = 8;
        tileSet.vectorData = Array.from({ length: 256 }, (_, i) => ({
          path: i === 65 || i === 1 ? "M1 1H7V7H1Z" : "", path2d: null,
        }));
        tileSet.modified();
      }
      graphic.setGridDimensions({ width: 80, height: 50 });
      view.setScale(8, false);
      view.setCameraPosition(0, 0);
      layer.setBackgroundColor(-1);
      graphic.redraw({ allCells: true });
      layers.updateAllLayerPreviews();
      const pixels = () => layer.previewCanvas.getContext("2d").getImageData(
        0, 0, layer.previewCanvas.width, layer.previewCanvas.height).data;
      const equal = (a, b) => a.every((value, i) => value === b[i]);
      const state = () => JSON.stringify([layer.updatedCellRanges, layer.drawnBounds,
        layer.lastDrawScale, layer.lastDrawFromGridX, layer.lastDrawFromGridY]);
      // Independent full-layer, scale-1 control, never the viewport canvas.
      const freshEqual = () => {
        const raster = document.createElement("canvas");
        raster.width = layer.getWidth(); raster.height = layer.getHeight();
        layer.draw({ canvas: raster, frame: layer.currentFrame, draw: "prevgrid", allCells: true,
          drawBackground: layers.isBackgroundVisible(), scale: 1,
          drawFromX: 0, drawFromY: 0, drawToX: raster.width, drawToY: raster.height });
        const preview = document.createElement("canvas");
        preview.width = layer.previewCanvas.width; preview.height = layer.previewCanvas.height;
        const context = preview.getContext("2d");
        context.drawImage(layer.backgroundCanvas, 0, 0);
        context.drawImage(raster, 0, 0, preview.width, preview.height);
        return equal(pixels(), context.getImageData(0, 0, preview.width, preview.height).data);
      };
      let updates = 0;
      const original = layer.updatePreview;
      layer.updatePreview = function(...args) { updates++; return original.apply(this, args); };
      const checks = [];
      const baseline = pixels();
      try {
        editor.history.startEntry("thumbnail stroke");
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          layer.setCell({ x, y, t: vector ? 65 : 1, fc: 1, bc: -1 });
          editor.grid.grid2d.redrawUpdatedCells(layer);
        }
        editor.history.endEntry();
        const synchronousUpdates = updates;
        const beforeBatch = state();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const batchedUpdates = updates;
        checks.push(["scheduled offscreen pixels", freshEqual()]);
        checks.push(["scratch preserves dirtiness", state() === beforeBatch]);
        checks.push(["nonvacuous edit", !equal(baseline, pixels())]);
        updates = 0;
        view.setScale(2.25, false);
        view.setCameraPosition(19, 11);
        graphic.redraw({ allCells: true });
        layers.updateAllLayerPreviews();
        checks.push(["view changes reuse thumbnail", updates === 0]);
        checks.push(["view independent pixels", freshEqual()]);
        editor.history.undo();
        checks.push(["undo final state", equal(baseline, pixels()) && freshEqual()]);
        editor.history.redo();
        checks.push(["redo final state", !equal(baseline, pixels()) && freshEqual()]);
        editor.history.startEntry("release before timer");
        layer.setCell({ x: 1, y: 1, t: vector ? 65 : 1, fc: 2, bc: -1 });
        graphic.redraw();
        editor.tools.drawTools.tool = "pen";
        view.toolEnd(false, {});
        checks.push(["release flush", layers.previewTimer === null && freshEqual()]);
        const releaseUpdates = updates;
        await new Promise((resolve) => setTimeout(resolve, 150));
        checks.push(["no trailing duplicate", releaseUpdates === updates]);
        graphic.duplicateFrame(0);
        layer.setBackgroundColor(3);
        graphic.redraw();
        await new Promise((resolve) => setTimeout(resolve, 150));
        checks.push(["frame switch", freshEqual()]);
        graphic.setCurrentFrame(0);
        await new Promise((resolve) => setTimeout(resolve, 150));
        checks.push(["return to frame", freshEqual()]);
        // Dependency changes without a main raster must not sample stale artwork.
        layer.getColorPalette().setColorRGB(1, 0x23abcd);
        layers.updateAllLayerPreviews();
        checks.push(["palette dependency", freshEqual()]);
        if (!vector) {
          tileSet.setPixel(1, 0, 0, tileSet.getPixel(1, 0, 0) ? 0 : 1, false);
          layers.updateAllLayerPreviews();
          checks.push(["tile dependency", freshEqual()]);
        }
        editor.frames.setShowPrevFrame(true);
        graphic.redraw({ allCells: true });
        layers.updateAllLayerPreviews();
        checks.push(["onion independent", freshEqual()]);

        // Exercise the real direct-draw mutation handlers, without a redraw or
        // explicit thumbnail flush after the input. These bypass Graphic.redraw.
        editor.tools.drawTools.setDrawTool("type");
        const typing = editor.tools.drawTools.typing;
        // Choose a cell whose glyph intersects the thumbnail's sample footprint.
        editor.currentTile.setColor(1);
        editor.currentTile.setBGColor(-1);
        typing.setCursorPosition({ x: 20, y: 2, z: 0 });
        layers.updateAllLayerPreviews();
        updates = 0;
        const beforeTyping = pixels();
        typing.keyDown({ keyCode: 65, shiftKey: false, ctrlKey: false, altKey: false,
          metaKey: false, getModifierState: () => false });
        checks.push(["typing schedules without synchronous sampling", updates === 0 && layers.previewTimer !== null]);
        await new Promise((resolve) => setTimeout(resolve, 150));
        checks.push([`typing publishes once (${updates})`, updates === 1]);
        checks.push(["typing changes pixels", !equal(beforeTyping, pixels())]);
        checks.push(["typing pixels match full render", freshEqual()]);
        updates = 0;
        const beforePalette = pixels();
        editor.colorEditor.colorIndex = 1;
        editor.colorEditor.setRGB(0xabcdef);
        editor.colorEditor.updatePaletteColor();
        checks.push(["palette editor schedules without synchronous sampling", updates === 0 && layers.previewTimer !== null]);
        await new Promise((resolve) => setTimeout(resolve, 150));
        checks.push([`palette editor publishes once (${updates})`, updates === 1]);
        checks.push(["palette editor changes pixels", !equal(beforePalette, pixels())]);
        checks.push(["palette editor pixels match full render", freshEqual()]);

        editor.tools.drawTools.setDrawTool("pen");
        const work = [];
        for (const [width, height] of [[40, 25], [160, 100], [320, 200]]) {
          graphic.setGridDimensions({ width, height });
          if (!vector) {
            const image = document.createElement("canvas");
            image.width = layer.getWidth(); image.height = layer.getHeight();
            const context = image.getContext("2d");
            context.fillStyle = "#254763"; context.fillRect(0, 0, image.width, image.height);
            context.fillStyle = "#9a6123";
            for (let x = 0; x < image.width; x += 27) context.fillRect(x, x % 17, 13, image.height);
            layer.setReferenceImage({ image, imageData: image.toDataURL(), params: {} });
          }
          view.setScale(3.5, false);
          view.setCameraPosition(0, 0);
          // Deliberately keep offscreen artwork dirty. Onion skin also prevents
          // the bitmap fast path from supplying a complete thumbnail source.
          graphic.invalidateAllCells();
          graphic.redraw();
          layers.updateAllLayerPreviews();
          const render = layer.draw;
          const read = CanvasRenderingContext2D.prototype.getImageData;
          const glyph = tileSet.getGlyphPath;
          let active = false, readPixels = 0, glyphs = 0, rasters = 0;
          layer.draw = function(args) {
            const previous = active;
            active = args.draw === "thumbnail";
            if (active) rasters++;
            try { return render.call(this, args); } finally { active = previous; }
          };
          CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
            if (active) readPixels += w * h;
            return read.apply(this, arguments);
          };
          tileSet.getGlyphPath = function(...args) {
            if (active) glyphs++;
            return glyph.apply(this, args);
          };
          try {
            const positions = [[Math.floor(width / 2), Math.floor(height / 2)], [1, 1], [width - 2, height - 2]];
            for (let i = 0; i < 6; i++) {
              readPixels = glyphs = rasters = 0;
              const [x, y] = positions[i % positions.length];
              const fc = layer.getCell({ x, y }).fc === 1 ? 2 : 1;
              layer.setCell({ x, y, t: vector ? 65 : 1, fc, bc: -1 });
              editor.grid.grid2d.redrawUpdatedCells(layer);
              checks.push([`no synchronous thumbnail raster ${width}/${i}`, rasters === 0]);
              const before = state();
              if (i % 2) await new Promise((resolve) => setTimeout(resolve, 150));
              else view.toolEnd(false, {});
              work.push({ width, height, rasters, readPixels, glyphs,
                scratchPixels: layers.previewScratchCanvas.width * layers.previewScratchCanvas.height,
                documentPixels: layer.getWidth() * layer.getHeight() });
              checks.push([`bounded repair pixels ${width}/${i}`, freshEqual()]);
              checks.push([`bounded repair preserves artwork ${width}/${i}`, state() === before]);
            }
          } finally {
            layer.draw = render;
            CanvasRenderingContext2D.prototype.getImageData = read;
            tileSet.getGlyphPath = glyph;
          }
        }
        return { synchronousUpdates, batchedUpdates, checks, work };
      } finally { layer.updatePreview = original; }
    }, vector);
    expect(result.synchronousUpdates).toBe(0);
    expect(result.batchedUpdates).toBe(1);
    expect(result.checks.filter(([, passed]) => !passed), JSON.stringify(result.work)).toEqual([]);
    for (const work of result.work) {
      const label = JSON.stringify(work);
      expect(work.rasters, label).toBe(1);
      expect(work.scratchPixels, label).toBeLessThan(work.documentPixels / 8);
      if (vector) {
        expect(work.glyphs, label).toBeGreaterThan(0);
        expect(work.glyphs, label).toBeLessThan(work.width * work.height / 8);
      } else {
        expect(work.readPixels, label).toBeGreaterThan(0);
        expect(work.readPixels, label).toBeLessThan(work.documentPixels / 8);
      }
    }
    expect(errors).toEqual([]);
  });
}

for (const vector of [false, true]) {
  test(`2D ${vector ? "vector" : "bitmap"} onion skin reuses unchanged rasters and matches a fresh composite`, async ({ page }, testInfo) => {
    test.skip(!isDesktop2DRendererProject(testInfo));
    await open2DProject(page, testInfo, { vector });
    const result = await page.evaluate((vector) => {
      const editor = g_app.textModeEditor;
      const graphic = editor.graphic;
      const view = editor.gridView2d;
      const layer = editor.layers.getSelectedLayerObject();
      const tileSet = layer.getTileSet();
      const palette = layer.getColorPalette();
      if (vector) {
        // Self-contained glyphs: the new-project vector choice need not have
        // loaded a font yet, and an empty font would make equivalence vacuous.
        tileSet.unitsPerEm = tileSet.ascent = 8;
        tileSet.vectorData = Array.from({ length: 256 }, (_, i) => ({
          path: i === 65 ? "M1 1H7V7H1Z" : i === 66 ? "M1 1H7L4 7Z" : "",
          path2d: null,
        }));
        tileSet.modified();
      }
      editor.setGridVisible(false);
      editor.grid.grid2d.setCursorEnabled(false);
      view.setScale(2.25, false);
      const tile = vector ? 65 : 1;
      for (let x = 10; x < 16; x++) layer.setCell({ x, y: 10, t: tile, fc: 1, bc: -1 });
      graphic.duplicateFrame(0);
      for (let x = 10; x < 16; x++) layer.setCell({ x, y: 10, t: tileSet.getBlankCharacter(), fc: 1, bc: -1 });
      editor.frames.setShowPrevFrame(true);
      graphic.redraw({ allCells: true });
      const method = vector ? "drawVector" : "draw";
      const original = layer[method];
      let rasters = 0;
      layer[method] = function(args) {
        if (args.draw === "prevgrid") rasters++;
        return original.call(this, args);
      };
      const pixels = () => view.context.getImageData(0, 0, view.canvas.width, view.canvas.height).data;
      const compareFresh = () => {
        const cached = pixels();
        layer.invalidatePrevFrame();
        graphic.redraw({ allCells: true });
        const fresh = pixels();
        return cached.every((value, i) => value === fresh[i]);
      };
      const steps = [];
      try {
        for (let i = 0; i < 8; i++) {
          layer.setCell({ x: 20, y: 12, t: i % 2 + tile, fc: 1, bc: -1 });
          editor.grid.grid2d.redrawUpdatedCells(layer);
        }
        steps.push({ name: "current-frame edits", rasters, equal: compareFresh() });
        const changes = [
          ["previous cell", () => layer.setCell({ frame: 0, x: 10, y: 10, t: tile + 1, fc: 2, bc: -1 })],
          ["palette", () => palette.setColorRGB(1, 0x12ab34)],
          ["previous background", () => layer.setBackgroundColor(3, 0)],
          ["zoom", () => view.setScale(3.5, false)],
          ["pan", () => view.setCameraPosition(13, 15)],
        ];
        if (!vector) changes.push(["shared tile pixels", () => tileSet.setPixel(1, 0, 0, tileSet.getPixel(1, 0, 0) ? 0 : 1, false)]);
        for (const [name, change] of changes) {
          rasters = 0;
          change();
          graphic.redraw({ allCells: true });
          const refreshed = rasters;
          rasters = 0;
          graphic.redraw({ allCells: true });
          steps.push({ name, refreshed, rasters, equal: compareFresh() });
        }
        const withOnion = pixels();
        editor.frames.setShowPrevFrame(false);
        graphic.redraw({ allCells: true });
        const withoutOnion = pixels();
        return { steps, visible: withOnion.some((value, i) => value !== withoutOnion[i]) };
      } finally {
        layer[method] = original;
      }
    }, vector);
    expect(result.visible, JSON.stringify(result)).toBe(true);
    for (const step of result.steps) {
      expect(step.rasters, step.name).toBe(0);
      expect(step.equal, step.name).toBe(true);
      // Bitmap pan/zoom may reuse the full-resolution cached raster.
      if (step.refreshed !== undefined && (vector || !["pan", "zoom"].includes(step.name))) {
        expect(step.refreshed, step.name).toBeGreaterThan(0);
      }
    }
  });
}

for (const vector of [false, true]) {
  test(`2D ${vector ? "vector" : "bitmap"} shape previews stay bounded and match a fresh full preview`, async ({ page }, testInfo) => {
    test.skip(!isDesktop2DRendererProject(testInfo));
    await open2DProject(page, testInfo, { vector });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const results = await page.evaluate(async (vector) => {
      const editor = g_app.textModeEditor;
      const graphic = editor.graphic;
      const view = editor.gridView2d;
      const layer = editor.layers.getSelectedLayerObject();
      const tools = editor.tools.drawTools;
      const shapes = tools.shapes;
      const tileSet = layer.getTileSet();
      if (vector) {
        tileSet.unitsPerEm = tileSet.ascent = 8;
        tileSet.vectorData = Array.from({ length: 256 }, (_, i) => ({
          path: i === 65 ? "M1 1H7L4 7Z" : i === 66 ? "M1 1H7V7H1Z" : "", path2d: null,
        }));
        tileSet.modified();
      }
      editor.setGridVisible(false);
      view.setScale(2.25, false);
      layer.setBackgroundColor(-1);
      editor.currentTile.setCharacters([[vector ? 65 : 1]]);
      editor.currentTile.setColor(1);
      editor.currentTile.setBGColor(-1);
      Object.assign(tools, { drawCharacter: true, drawColor: true, drawBgColor: true });
      const pixels = () => view.backBufferContext.getImageData(0, 0, view.width, view.height).data;
      const equal = (a, b) => a.every((value, i) => value === b[i]);
      const originalPreview = shapes.drawPreview;
      const fullPreviewEqual = () => {
        const bounded = pixels();
        // Independent full-visible-region control. It uses the same cell
        // renderer without the optimization's old/new dirty clip or crop.
        shapes.drawPreview = function(layer, args) {
          const bounds = this.bounds;
          this.bounds = { minX: 0, minY: 0, maxX: this.width, maxY: this.height };
          try { return originalPreview.call(this, layer, args); }
          finally { this.bounds = bounds; }
        };
        try { graphic.redraw({ allCells: true }); }
        finally { shapes.drawPreview = originalPreview; }
        return equal(bounded, pixels());
      };
      const results = [];
      for (const [width, height] of [[40, 25], [320, 200]]) {
        graphic.setGridDimensions({ width, height });
        view.setCameraPosition(0, 0);
        const x = Math.floor(width / 2), y = Math.floor(height / 2);
        for (let cy = y - 6; cy <= y + 7; cy++) {
          for (let cx = x - 6; cx <= x + 7; cx++) {
            layer.setCell({ x: cx, y: cy, t: vector ? 66 : 2, fc: 2, bc: -1 });
          }
        }
        tools.tool = "rect";
        // Warm only the viewport, leaving offscreen artwork dirty on purpose.
        graphic.invalidateAllCells();
        graphic.redraw();
        const baseline = pixels();
        let artworkPixels = 0, artworkGlyphs = 0, shapePixels = 0, shapeGlyphs = 0, presentations = 0;
        let active = null;
        let previewStatePreserved = true;
        const rendererState = () => JSON.stringify([
          layer.updatedCellRanges, layer.drawnBounds, layer.lastDrawScale,
          layer.lastDrawFromGridX, layer.lastDrawFromGridY, layer.lastDrawToGridX, layer.lastDrawToGridY,
        ]);
        const proto = CanvasRenderingContext2D.prototype;
        const getImageData = proto.getImageData, fill = proto.fill;
        const method = vector ? "drawVector" : "draw", original = layer[method];
        layer[method] = function(args) {
          const previous = active;
          active = args.draw === "shapes" ? "shapes" : "artwork";
          try { return original.call(this, args); } finally { active = previous; }
        };
        proto.getImageData = function(x, y, w, h, ...rest) {
          if (active === "artwork") artworkPixels += w * h;
          if (active === "shapes") shapePixels += w * h;
          return getImageData.call(this, x, y, w, h, ...rest);
        };
        proto.fill = function(...args) {
          if (active === "artwork") artworkGlyphs++;
          if (active === "shapes") shapeGlyphs++;
          return fill.apply(this, args);
        };
        shapes.drawPreview = function(...args) {
          presentations++;
          const before = rendererState();
          const preview = originalPreview.apply(this, args);
          previewStatePreserved &&= before === rendererState();
          return preview;
        };
        try {
          shapes.startShape("rect", x, y, 0);
          for (let i = 0; i < 8; i++) shapes.setShapeTo(x + 2 + i % 2, y + 2, 0);
          const synchronous = presentations;
          await new Promise((resolve) => requestAnimationFrame(resolve));
          results.push({ width, synchronous, presentations, artworkPixels, artworkGlyphs, shapePixels, shapeGlyphs,
            previewStatePreserved, visible: !equal(baseline, pixels()),
            scratch: shapes.previewCanvas.width * shapes.previewCanvas.height,
            maxScratch: (view.width + tileSet.getTileWidth() * view.displayScale * 2)
              * (view.height + tileSet.getTileHeight() * view.displayScale * 2) });
        } finally {
          layer[method] = original;
          proto.getImageData = getImageData;
          proto.fill = fill;
          shapes.drawPreview = originalPreview;
        }
        const checks = [];
        checks.push(fullPreviewEqual());
        for (const [dx, dy] of [[6, 5], [1, 1], [-3, -2], [0, 0]]) {
          shapes.setShapeTo(x + dx, y + dy, 0);
          shapes.flushPreview();
          checks.push(fullPreviewEqual());
        }
        // Full controls may populate offscreen caches; visible artwork must
        // still match the shape-free baseline after cancel.
        shapes.cancelShape();
        checks.push(equal(baseline, pixels()));
        for (const tool of ["line", "oval"]) {
          tools.tool = tool;
          shapes.startShape(tool, x, y, 0, "xy", true);
          shapes.setShapeTo(x + 3, y + 2, 0);
          shapes.flushPreview();
          checks.push(fullPreviewEqual());
          shapes.cancelShape();
          checks.push(equal(baseline, pixels()));
        }
        // Panning must reveal offscreen cells, including an endpoint still
        // pending when the viewport changes. Fractional scales keep crop phase.
        tools.tool = "rect";
        shapes.startShape("rect", x, y, 0);
        shapes.setShapeTo(x + 3, y + 2, 0);
        view.setScale(0.1, false);
        view.setCameraPosition(13, 15);
        shapes.flushPreview();
        checks.push(fullPreviewEqual());
        shapes.cancelShape();
        view.setScale(2.25, false);
        view.setCameraPosition(0, 0);
        graphic.redraw({ allCells: true });
        if (width === 320) {
          shapes.startShape("rect", x + 80, y, 0);
          shapes.setShapeTo(x + 82, y + 2, 0);
          shapes.flushPreview();
          checks.push(equal(baseline, pixels()));
          view.setCameraPosition(80 * tileSet.getTileWidth(), 0);
          shapes.flushPreview();
          checks.push(fullPreviewEqual());
          shapes.cancelShape();
          view.setCameraPosition(0, 0);
          graphic.redraw({ allCells: true });
        }
        // Release before RAF must commit the latest endpoint and cancel work.
        tools.tool = "rect";
        Object.assign(tools, { mirrorH: true, mirrorV: true, mirrorHX: x, mirrorVY: y });
        shapes.startShape("rect", x, y, 0);
        shapes.setShapeTo(x + 2, y + 2, 0);
        shapes.endShape();
        checks.push(shapes.previewRequest === null);
        checks.push(layer.getCell({ x: x + 2, y: y + 2 }).t === (vector ? 65 : 1));
        const committed = pixels();
        graphic.redraw({ allCells: true });
        checks.push(equal(committed, pixels()));
        editor.history.undo();
        checks.push(equal(baseline, pixels()));
        editor.history.redo();
        checks.push(equal(committed, pixels()));
        Object.assign(tools, { mirrorH: false, mirrorV: false });
        results.at(-1).checks = checks;
      }
      return results;
    }, vector);
    expect(errors).toEqual([]);
    for (const result of results) {
      expect(result.visible, JSON.stringify(result)).toBe(true);
      expect(result.previewStatePreserved, JSON.stringify(result)).toBe(true);
      expect(result.synchronous, JSON.stringify(result)).toBe(0);
      expect(result.presentations, JSON.stringify(result)).toBe(1);
      expect(result.artworkPixels, JSON.stringify(result)).toBe(0);
      expect(result.artworkGlyphs, JSON.stringify(result)).toBe(0);
      expect(result.checks, JSON.stringify(result)).not.toContain(false);
      expect(result.shapeGlyphs, JSON.stringify(result)).toBeLessThan(100);
      expect(result.scratch, JSON.stringify(result)).toBeLessThan(vector ? result.maxScratch : 100000);
    }
    expect(results[1].shapePixels).toBe(results[0].shapePixels);
    expect(results[1].shapeGlyphs).toBe(results[0].shapeGlyphs);
    if (!vector) expect(results[1].scratch).toBe(results[0].scratch);
  });
}

test("2D shape previews retain offscreen artwork dirtiness across animation-preview renders", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));
  await open2DProject(page, testInfo);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor, graphic = editor.graphic, view = editor.gridView2d;
    const layer = editor.layers.getSelectedLayerObject(), shapes = editor.tools.drawTools.shapes;
    const preview = editor.animationPreview;
    editor.setGridVisible(false);
    graphic.setGridDimensions({ width: 160, height: 100 });
    graphic.duplicateFrame(0);
    graphic.setCurrentFrame(0);
    view.setScale(2.25, false);
    view.setCameraPosition(0, 0);
    editor.currentTile.setCharacters([[2]]);
    editor.currentTile.setColor(2);
    editor.tools.drawTools.tool = "rect";
    // Set the brush before changing cells: its UI can request a full redraw.
    for (let y = 0; y < 100; y++) for (let x = 0; x < 160; x++) {
      for (const frame of [0, 1]) layer.setCell({ frame, x, y, t: 1, fc: frame + 1, bc: frame + 1, update: false });
    }
    graphic.invalidateAllCells();
    graphic.redraw(); // Populate only the viewport; the offscreen raster is stale.
    shapes.startShape("rect", 80, 50, 0);
    shapes.setShapeTo(83, 52, 0);
    shapes.flushPreview();
    const sample = (canvas, x, y) => Array.from(canvas.getContext("2d").getImageData(x * 8, y * 8, 8, 8).data);
    const equal = (a, b) => a.every((value, i) => value === b[i]);
    const state = () => JSON.stringify([
      layer.updatedCellRanges, layer.drawnBounds, graphic.getOnlyViewBoundsDrawn(),
    ]);
    const before = state(), cold = sample(layer.canvas, 124, 46);
    const dirty = { ...layer.updatedCellRanges };
    const auxiliarySamples = [];
    let statePreserved = true;
    const wasVisible = preview.visible;
    try {
      preview.visible = true;
      if (!preview.canvas) preview.canvas = document.createElement("canvas");
      preview.context = preview.canvas.getContext("2d");
      for (const frame of [0, 1]) {
        preview.currentFrame = frame;
        preview.draw();
        statePreserved &&= state() === before;
        auxiliarySamples.push(sample(preview.screenCanvas, 70, 45));
      }
    } finally { preview.visible = wasVisible; }
    const mainUnchanged = equal(cold, sample(layer.canvas, 124, 46));
    view.setCameraPosition(40 * 8, 0);
    shapes.setShapeTo(121, 52, 0);
    shapes.flushPreview();
    const revealed = sample(layer.canvas, 124, 46);
    const pixels = () => view.backBufferContext.getImageData(0, 0, view.width, view.height).data;
    const actual = pixels();
    graphic.invalidateAllCells();
    graphic.redraw({ allCells: true });
    const freshEqual = equal(actual, pixels());
    shapes.cancelShape();
    return { statePreserved, mainUnchanged, freshEqual,
      offscreenWasDirty: dirty.minX === 0 && dirty.maxX === 160,
      offscreenWasRefreshed: !equal(cold, revealed),
      auxiliaryFramesDiffer: !equal(auxiliarySamples[0], auxiliarySamples[1]),
      frameUnchanged: graphic.getCurrentFrame() === 0 };
  });
  expect(errors).toEqual([]);
  for (const [name, value] of Object.entries(result)) expect(value, name).toBe(true);
});

test("2D vector shape composites have no fractional-edge seams with odd tiles and layer blending", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));
  await open2DProject(page, testInfo, { vector: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const results = await page.evaluate(() => {
    const editor = g_app.textModeEditor, graphic = editor.graphic, view = editor.gridView2d;
    const layer = editor.layers.getSelectedLayerObject(), tileSet = layer.getTileSet();
    const shapes = editor.tools.drawTools.shapes, meta = editor.layers.getSelectedLayer();
    tileSet.unitsPerEm = tileSet.ascent = 8;
    tileSet.vectorData = Array.from({ length: 256 }, (_, i) => ({
      path: i === 65 ? "M1 1H7L4 7Z" : i === 66 ? "M0 0H8V8H0Z" : "", path2d: null,
    }));
    tileSet.modified();
    editor.setGridVisible(false);
    editor.currentTile.setCharacters([[65]]);
    editor.currentTile.setColor(1);
    editor.currentTile.setBGColor(-1);
    editor.tools.drawTools.tool = "rect";
    layer.setBackgroundColor(-1);
    for (let y = 0; y < 25; y++) for (let x = 0; x < 40; x++) {
      layer.setCell({ x, y, t: 66, fc: 2, bc: -1 });
    }
    const pixels = () => view.backBufferContext.getImageData(0, 0, view.width, view.height).data;
    const maxDifference = (a, b) => {
      let max = 0;
      for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
      return max;
    };
    const original = shapes.drawPreview;
    const compareFullPreview = () => {
      const bounded = pixels();
      shapes.drawPreview = function(layer, args) {
        const bounds = this.bounds;
        this.bounds = { minX: 0, minY: 0, maxX: this.width, maxY: this.height };
        try { return original.call(this, layer, args); }
        finally { this.bounds = bounds; }
      };
      try { graphic.redraw({ allCells: true }); }
      finally { shapes.drawPreview = original; }
      return maxDifference(bounded, pixels());
    };
    const results = [];
    for (const [tileSize, zoom, pan] of [[9, 3.5, 13], [9, 2.25, 0], [9, 0.1, 13], [8, 2.25, 0]]) {
      for (const opacity of [1, 0.5]) for (const blend of ["source-over", "multiply"]) {
        tileSet.setTileDimensions({ width: tileSize, height: tileSize });
        graphic.setCellDimensionsFromTiles();
        Object.assign(meta, { opacity, compositeOperation: blend });
        view.setScale(zoom, false);
        view.setCameraPosition(pan, pan);
        graphic.invalidateAllCells();
        graphic.redraw({ allCells: true });
        const baseline = pixels();
        const differences = [];
        shapes.startShape("rect", 20, 12, 0);
        for (const [x, y] of [[23, 14], [21, 13], [18, 11], [23, 14]]) {
          shapes.setShapeTo(x, y, 0);
          shapes.flushPreview();
          differences.push(compareFullPreview());
        }
        shapes.cancelShape();
        differences.push(maxDifference(baseline, pixels()));
        // At low zoom the document edge is visible and its extent is fractional.
        if (zoom === 0.1) {
          shapes.startShape("rect", 38, 23, 0);
          shapes.setShapeTo(39, 24, 0);
          shapes.flushPreview();
          differences.push(compareFullPreview());
          shapes.cancelShape();
          differences.push(maxDifference(baseline, pixels()));
        }
        results.push({ tileSize, zoom, pan, opacity, blend, differences });
      }
    }
    return results;
  });
  expect(errors).toEqual([]);
  for (const result of results) {
    // Translucent pixels (layer opacity or low-zoom antialiased document edges)
    // can differ by one 8-bit blend-rounding level across source textures.
    // Interior coverage at opaque magnification is exact; seams were 76 levels.
    const tolerance = result.opacity < 1 || result.zoom < 1 ? 1 : 0;
    expect(Math.max(...result.differences), JSON.stringify(result)).toBeLessThanOrEqual(tolerance);
  }
});

test("first-party production startup stays within budget", async ({ page }, testInfo) => {
  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);

  // Any unexpected external startup request is isolated from the first-party
  // timing and is rejected by the dedicated no-external-request test below.
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );

  const startedAt = Date.now();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForStableStartPage(
    page,
    browserPolicy.performanceBudgets.startupMilliseconds,
    localFailures,
  );
  const startupMilliseconds = Date.now() - startedAt;

  await startupState(page, testInfo);
  expect(startupMilliseconds).toBeLessThanOrEqual(
    browserPolicy.performanceBudgets.startupMilliseconds,
  );
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test("production starts offline without external provider requests", async ({ page }, testInfo) => {
  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);
  const externalRequests = [];

  await page.route(/^https:\/\//, (route) => {
    externalRequests.push(route.request().url());
    return route.abort("internetdisconnected");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForStableStartPage(
    page,
    browserPolicy.performanceBudgets.startupMilliseconds,
    localFailures,
  );

  await startupState(page, testInfo);
  expect(externalRequests).toEqual([]);
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test("image import opens, reuses its editor instance, and closes cleanly", async ({ page }, testInfo) => {
  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);
  await open2DProject(page, testInfo);

  const panel = page.locator(".ui-dialog:visible, .ui-mobilepanel:visible")
    .filter({ hasText: "Import Image" });
  const opened = await page.evaluate(async () => {
    const first = await g_app.openImageImport();
    const [second, third] = await Promise.all([
      g_app.openImageImport(),
      g_app.openImageImport(),
    ]);
    return {
      active: g_app.featureRegistry.isActive("imageImport", g_app.textModeEditor),
      sameInstance: first === second && second === third,
      status: g_app.services.imageImportCoordinator.getStatus(),
    };
  });
  expect(opened).toEqual({ active: true, sameInstance: true, status: "ready" });
  await expect(panel).toBeVisible();
  expect(await page.evaluate(() => UI.dialogStack.filter((dialog) =>
    dialog.uiID === "importImageDialog" || dialog.uiID === "importImageMobile",
  ).length)).toBe(1);

  await page.evaluate(() => g_app.closeImageImport());
  await expect.poll(() => page.evaluate(() =>
    g_app.services.imageImportCoordinator.getStatus(),
  )).toBe("disposed");
  await expect(panel).toHaveCount(0);
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test("mobile image import serializes rapid close and reopen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-handheld");

  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);
  await open2DProject(page, testInfo);
  await page.evaluate(() => g_app.openImageImport());
  await expect.poll(() => page.evaluate(() =>
    g_app.services.imageImportCoordinator.getStatus(),
  )).toBe("ready");

  await page.evaluate(async () => {
    const closing = g_app.closeImageImport();
    const reopening = g_app.openImageImport();
    await Promise.all([closing, reopening]);
  });

  expect(await page.evaluate(() => ({
    stackEntries: UI.dialogStack.filter((dialog) => dialog.uiID === "importImageMobile").length,
    status: g_app.services.imageImportCoordinator.getStatus(),
    visible: g_app.services.imageImport.getActive(g_app.textModeEditor)?.visible,
  }))).toEqual({ stackEntries: 1, status: "ready", visible: true });
  await expect(page.locator(".ui-mobilepanel:visible").filter({
    hasText: "Import Image",
  })).toBeVisible();

  const mode = await page.evaluate(() => {
    g_app.setMode("start");
    return g_app.getMode();
  });
  expect(mode).toBe("start");
  await expect.poll(() => page.evaluate(() =>
    g_app.services.imageImportCoordinator.getStatus(),
  )).toBe("disposed");
  await expect(page.locator(".ui-mobilepanel:visible").filter({
    hasText: "Import Image",
  })).toHaveCount(0);
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test("production image-import entry points share their context-scoped instance", async ({ page }, testInfo) => {
  test.skip(!["chromium-desktop", "chromium-handheld"].includes(testInfo.project.name));

  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForStableStartPage(
    page,
    browserPolicy.performanceBudgets.startupMilliseconds,
    localFailures,
  );

  const rememberInstance = () => page.evaluate(() => {
    if (!globalThis.__entrypointImporter) {
      globalThis.__entrypointImporter = g_app.services.imageImport.getActive(g_app.textModeEditor);
    }
    return g_app.services.imageImport.getActive(g_app.textModeEditor) ===
      globalThis.__entrypointImporter;
  });
  const waitForImport = async () => {
    await expect.poll(() => page.evaluate(() =>
      g_app.services.imageImportCoordinator.getStatus(),
    )).toBe("ready");
    expect(await rememberInstance()).toBe(true);
    const focusTarget = testInfo.project.metadata.deviceClass === "desktop"
      ? page.locator("#importImageChooseFile")
      : page.locator("#importImageMobileChooseFile");
    await expect(focusTarget).toBeFocused();
  };
  const closeImport = async () => {
    await page.evaluate(() => g_app.closeImageImport());
    await expect.poll(() => page.evaluate(() =>
      g_app.services.imageImportCoordinator.getStatus(),
    )).toBe("disposed");
  };

  if (testInfo.project.metadata.deviceClass === "desktop") {
    await page.keyboard.press("Alt+Shift+I");
    expect(await page.evaluate(() => g_app.services.imageImportCoordinator.isOpen())).toBe(false);
  }
  await page.locator("#startImportImage").click();
  await waitForImport();
  await closeImport();

  if (testInfo.project.metadata.deviceClass === "desktop") {
    const importMenu = page.locator(".ui-menubar-item:visible").filter({ hasText: /^Import$/ });
    await importMenu.click();
    await page.locator(".ui-menu-item:visible").filter({
      has: page.locator(".ui-menu-item-label", { hasText: /^Image \/ Video\.\.\.$/ }),
    }).click();
    await waitForImport();
    await closeImport();

    await page.keyboard.press("Alt+Shift+I");
    await waitForImport();
    await closeImport();

    await page.evaluate(() => {
      const file = new File([
        Uint8Array.from(atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAFgAI/ScL3WQAAAABJRU5ErkJggg==",
        ), (character) => character.charCodeAt(0)),
      ], "import-test.png", { type: "image/png" });
      const event = new Event("drop", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
      document.dispatchEvent(event);
    });
    const dropDialog = page.locator(".ui-dialog:visible").filter({
      has: page.locator("#dropImageAction_import"),
    });
    await expect(dropDialog).toBeVisible();
    await dropDialog.getByText("OK", { exact: true }).click();
    await waitForImport();

    await page.evaluate(() => {
      const nested = UI.create("UI.Dialog", {
        id: "imageImportNestedDialog",
        title: "Nested import dialog",
        width: 200,
        height: 100,
      });
      nested.on("close", () => { globalThis.__nestedRouteDialogClosed = true; });
      UI.showDialog(nested);
      g_app.setMode("start");
    });
    await expect.poll(() => page.evaluate(() => ({
      importVisible: g_app.services.imageImport.getActive(g_app.textModeEditor)?.visible,
      nestedClosed: globalThis.__nestedRouteDialogClosed === true,
      status: g_app.services.imageImportCoordinator.getStatus(),
      stackHasImporter: UI.dialogStack.some((dialog) =>
        dialog.uiID === "importImageDialog" || dialog.uiID === "importImageMobile"),
    }))).toEqual({
      importVisible: false,
      nestedClosed: true,
      status: "disposed",
      stackHasImporter: false,
    });
  } else {
    await page.locator("#mobileMenuBarHamburger").click();
    await page.locator(".mobile-menu-item").filter({ hasText: "Import Image / Video" }).click();
    await waitForImport();
    await closeImport();
  }

  await page.evaluate(() => {
    delete globalThis.__entrypointImporter;
    delete globalThis.__nestedRouteDialogClosed;
  });
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test("2D startup remains available when WebGL is unavailable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) {
        return null;
      }
      return originalGetContext.call(this, type, ...args);
    };
  });
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForStableStartPage(
    page,
    browserPolicy.performanceBudgets.startupMilliseconds,
    localFailures,
  );

  expect(await page.evaluate(() => ({ renderer: UI.renderer, enabled: UI.webGLEnabled }))).toEqual({
    renderer: null,
    enabled: false,
  });
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test(
  "Firefox creates a default project without unexpected first-party console issues",
  async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "firefox-desktop");

    const page = await browser.newPage({ baseURL: testInfo.project.use.baseURL });
    const consoleIssues = [];
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type())) {
        const location = message.location();
        consoleIssues.push(
          `${message.type()}: ${message.text()}${location.url ? ` (${location.url})` : ""}`,
        );
      }
    });
    page.on("pageerror", (error) => consoleIssues.push(`page error: ${error.message}`));

    await page.route(/^https:\/\//, (route) =>
      route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
    );
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForStableStartPage(
      page,
      browserPolicy.performanceBudgets.startupMilliseconds,
      consoleIssues,
    );

    await page.locator("#start2D").click();
    await page.getByText("OK", { exact: true }).last().click();
    await expect(page.locator("#startPage")).toBeHidden();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );

    const webGLUnavailable = await page.evaluate(
      () => UI.renderer === null && UI.webGLEnabled === false,
    );
    const unexpectedConsoleIssues = consoleIssues.filter(
      (issue) =>
        !(
          webGLUnavailable &&
          (issue.includes("THREE.WebGLRenderer: Error creating WebGL context") ||
            issue.includes("Failed to create WebGL context: WebGL creation failed") ||
            issue.includes("WebGL warning: <Create>"))
        ),
    );

    expect(unexpectedConsoleIssues, unexpectedConsoleIssues.join("\n")).toEqual([]);
    await page.close();
  },
);

test("2D renderer keeps only its base and overlay at full device resolution", async ({ page }, testInfo) => {
  await open2DProject(page, testInfo);
  const result = await page.evaluate(() => {
    const gridView = g_app.textModeEditor.gridView2d;
    const frontRect = gridView.canvas.getBoundingClientRect();
    const overlayRect = gridView.overlayCanvas.getBoundingClientRect();

    return {
      baseConnected: gridView.baseCanvas.isConnected,
      baseSize: [gridView.baseCanvas.width, gridView.baseCanvas.height],
      contextStillTargetsFront: gridView.context === gridView.canvas.getContext("2d"),
      frontSize: [gridView.canvas.width, gridView.canvas.height],
      hasFullSizeGridCache: "gridCanvas" in gridView,
      overlayConnected: gridView.overlayCanvas.isConnected,
      overlayPointerEvents: getComputedStyle(gridView.overlayCanvas).pointerEvents,
      overlayRect: [overlayRect.x, overlayRect.y, overlayRect.width, overlayRect.height],
      overlaySize: [gridView.overlayCanvas.width, gridView.overlayCanvas.height],
      frontRect: [frontRect.x, frontRect.y, frontRect.width, frontRect.height],
    };
  });

  expect(result.frontSize[0]).toBeGreaterThan(0);
  expect(result.frontSize[1]).toBeGreaterThan(0);
  expect(result.baseSize).toEqual(result.frontSize);
  expect(result.overlaySize).toEqual(result.frontSize);
  expect(result.overlayRect).toEqual(result.frontRect);
  expect(result).toMatchObject({
    baseConnected: false,
    contextStillTargetsFront: true,
    hasFullSizeGridCache: false,
    overlayConnected: true,
    overlayPointerEvents: "none",
  });
});

test("2D renderer invalidates the right cache when stationary controls change", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo);
  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const grid2d = editor.grid.grid2d;
    const gridView = editor.gridView2d;

    const resetInvalidation = () => {
      gridView.backBufferNeedsRedraw = false;
      gridView.overlayNeedsRedraw = false;
    };
    const captureInvalidation = () => ({
      artwork: gridView.backBufferNeedsRedraw,
      overlay: gridView.overlayNeedsRedraw,
    });

    resetInvalidation();
    grid2d.setCursorColor(grid2d.cursor.color === 1 ? 2 : 1);
    const cursorStyle = captureInvalidation();

    resetInvalidation();
    editor.currentTile.drawCursor();
    const cursorRaster = captureInvalidation();

    resetInvalidation();
    editor.tools.drawTools.setDrawMode();
    const drawMode = captureInvalidation();

    resetInvalidation();
    editor.tools.drawTools.toggleDrawCharacter();
    const drawToggle = captureInvalidation();

    resetInvalidation();
    editor.tools.drawTools.setDrawTool("pen");
    const tool = captureInvalidation();

    return { cursorRaster, cursorStyle, drawMode, drawToggle, tool };
  });

  expect(result).toEqual({
    cursorRaster: { artwork: false, overlay: true },
    cursorStyle: { artwork: false, overlay: true },
    drawMode: { artwork: false, overlay: true },
    drawToggle: { artwork: false, overlay: true },
    tool: { artwork: true, overlay: true },
  });
});

test("2D editor reuses cached artwork while a marquee animates", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo);
  const result = await page.evaluate(async () => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const select = editor.tools.drawTools.select;
    let frameDraws = 0;
    let selectionDraws = 0;
    const originalDrawFrame = editor.graphic.drawFrame;
    const originalLayerDraw = layer.draw;

    editor.graphic.drawFrame = function (...args) {
      frameDraws++;
      return originalDrawFrame.apply(this, args);
    };
    layer.draw = function (args) {
      if (args.draw === "selection") selectionDraws++;
      return originalLayerDraw.call(this, args);
    };

    select.setSelection({
      from: { x: 1, y: 1, z: 0 },
      to: { x: 5, y: 4, z: 0 },
    });
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });
    const stationarySelectionDraws = selectionDraws;

    frameDraws = 0;
    await new Promise((resolve) => {
      let frames = 0;
      const next = () => {
        if (++frames === 20) resolve();
        else requestAnimationFrame(next);
      };
      requestAnimationFrame(next);
    });
    const animatedFrameDraws = frameDraws;

    select.selectionOffsetX = 1;
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    return {
      animatedFrameDraws,
      movingSelectionDraws: selectionDraws - stationarySelectionDraws,
      stationarySelectionDraws,
    };
  });

  expect(result).toEqual({
    animatedFrameDraws: 0,
    movingSelectionDraws: 1,
    stationarySelectionDraws: 0,
  });
});

test("2D editor confines pencil rasterization and repaint to edited cells", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo);
  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const grid2d = editor.grid.grid2d;
    const gridView = editor.gridView2d;
    const tile = layer.getCell({ x: 10, y: 6 }).t === 1 ? 2 : 1;

    gridView.setScale(3.5, false);
    editor.setSelectedTiles([[tile]]);
    layer.setCell({
      x: 1,
      y: 1,
      t: tile,
      fc: editor.currentTile.color,
      bc: editor.currentTile.bgColor,
    });
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    const drawRanges = [];
    const clipRects = [];
    const originalDraw = layer.draw;
    const context = gridView.backBufferContext;
    const originalRect = context.rect;
    const originalClip = context.clip;
    let pendingRect = false;
    layer.draw = function (args) {
      drawRanges.push({
        allCells: args.allCells,
        minX: this.updatedCellRanges.minX,
        minY: this.updatedCellRanges.minY,
        maxX: this.updatedCellRanges.maxX,
        maxY: this.updatedCellRanges.maxY,
      });
      return originalDraw.call(this, args);
    };
    context.rect = function (...args) {
      pendingRect = args;
      return originalRect.apply(this, args);
    };
    context.clip = function (...args) {
      if (pendingRect) clipRects.push(pendingRect);
      pendingRect = false;
      return originalClip.apply(this, args);
    };

    grid2d.setCursor(10, 6, 0, editor.currentTile.color, editor.currentTile.bgColor);
    grid2d.setCursorEnabled(true);
    grid2d.setCursorCells();
    layer.draw = originalDraw;
    context.rect = originalRect;
    context.clip = originalClip;

    return {
      clipRects,
      displayScale: gridView.displayScale,
      drawRanges,
      tileHeight: layer.getTileSet().getTileHeight(),
      tileWidth: layer.getTileSet().getTileWidth(),
      tileWasDrawn: layer.getCell({ x: 10, y: 6 }).t === tile,
    };
  });

  expect(result.tileWasDrawn).toBe(true);
  expect(result.drawRanges).toContainEqual({
    allCells: false,
    minX: 10,
    minY: 6,
    maxX: 11,
    maxY: 7,
  });
  expect(result.displayScale).toBe(3.5);
  expect(result.clipRects).toContainEqual(expect.arrayContaining([
    expect.any(Number),
    expect.any(Number),
    expect.any(Number),
    expect.any(Number),
  ]));
  expect(
    result.clipRects.some(([, , width, height]) =>
      width <= Math.ceil(result.tileWidth * result.displayScale) + 1
      && height <= Math.ceil(result.tileHeight * result.displayScale) + 1),
  ).toBe(true);
});

test("2D editor redraws the clipped grid without a full-size grid cache", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo);
  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const grid2d = editor.grid.grid2d;
    const gridView = editor.gridView2d;

    gridView.setScale(3.5, false);
    grid2d.setCursorEnabled(false);
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    const originalDrawGrid = gridView.drawGrid;
    const baseContext = gridView.baseContext;
    const originalRect = baseContext.rect;
    const originalClip = baseContext.clip;
    let gridRasterizations = 0;
    let pendingRect = false;
    const baseClipRects = [];
    gridView.drawGrid = function (...args) {
      gridRasterizations++;
      return originalDrawGrid.apply(this, args);
    };
    baseContext.rect = function (...args) {
      pendingRect = args;
      return originalRect.apply(this, args);
    };
    baseContext.clip = function (...args) {
      if (pendingRect) baseClipRects.push(pendingRect);
      pendingRect = false;
      return originalClip.apply(this, args);
    };

    const tile = layer.getCell({ x: 12, y: 12 }).t === 1 ? 2 : 1;
    editor.setSelectedTiles([[tile]]);
    grid2d.setCursor(12, 12, 0, editor.currentTile.color, editor.currentTile.bgColor);
    grid2d.setCursorEnabled(true);
    grid2d.setCursorCells();
    gridView.drawLineWithCursor(12, 12, 18, 12, 0);
    gridView.drawGrid = originalDrawGrid;
    baseContext.rect = originalRect;
    baseContext.clip = originalClip;

    return {
      baseClipRects,
      baseMatchesFront: gridView.baseCanvas.width === gridView.canvas.width
        && gridView.baseCanvas.height === gridView.canvas.height,
      displayScale: gridView.displayScale,
      gridRasterizations,
      hasFullSizeGridCache: "gridCanvas" in gridView,
      pixelRatio: gridView.uiComponent.getScale(),
      drawnCells: Array.from(
        { length: 7 },
        (_, index) => layer.getCell({ x: 12 + index, y: 12 }).t,
      ),
      tileHeight: layer.getTileSet().getTileHeight(),
      tileWidth: layer.getTileSet().getTileWidth(),
      tile,
    };
  });

  expect(result.displayScale).toBe(3.5);
  expect(result.baseMatchesFront).toBe(true);
  expect(result.hasFullSizeGridCache).toBe(false);
  expect(result.gridRasterizations).toBeGreaterThan(0);
  expect(result.baseClipRects.length).toBeGreaterThan(0);
  expect(
    result.baseClipRects.some(([, , width, height]) =>
      width <= Math.ceil(result.tileWidth * result.displayScale * result.pixelRatio) + 2
      && height <= Math.ceil(result.tileHeight * result.displayScale * result.pixelRatio) + 2),
  ).toBe(true);
  expect(result.drawnCells).toEqual(Array(7).fill(result.tile));
});

test("2D editor keeps a real 350% pencil hold and drag stable", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo);
  const drag = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const gridView = editor.gridView2d;
    const tileWidth = layer.getTileSet().getTileWidth();
    const tileHeight = layer.getTileSet().getTileHeight();

    UI.devicePixelRatio = 2;
    gridView.uiComponent.resize({ force: true });
    editor.tools.drawTools.setDrawTool("pen");
    const drawnTile = 2;
    editor.setSelectedTiles([[drawnTile]]);
    gridView.setScale(3.5, false);
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    const artworkX = Math.floor(
      gridView.width / 2
        - editor.graphic.getGraphicWidth() * gridView.displayScale / 2
        - gridView.camera.position.x * gridView.displayScale,
    );
    const artworkY = Math.floor(
      gridView.height / 2
        - editor.graphic.getGraphicHeight() * gridView.displayScale / 2
        + gridView.camera.position.y * gridView.displayScale,
    );
    const cellWidth = tileWidth * gridView.displayScale;
    const cellHeight = tileHeight * gridView.displayScale;
    const firstVisibleX = Math.max(0, Math.ceil(-artworkX / cellWidth));
    const lastVisibleX = Math.min(
      layer.getGridWidth() - 1,
      Math.floor((gridView.width - artworkX) / cellWidth) - 1,
    );
    const firstVisibleY = Math.max(0, Math.ceil(-artworkY / cellHeight));
    const lastVisibleY = Math.min(
      layer.getGridHeight() - 1,
      Math.floor((gridView.height - artworkY) / cellHeight) - 1,
    );
    const startCell = {
      x: Math.max(firstVisibleX, Math.floor((firstVisibleX + lastVisibleX) / 2) - 2),
      y: Math.floor((firstVisibleY + lastVisibleY) / 2),
    };
    const endCell = {
      x: Math.min(lastVisibleX, startCell.x + 4),
      y: startCell.y,
    };
    const canvasRect = gridView.canvas.getBoundingClientRect();
    const pointForCell = (cell) => ({
      x: canvasRect.left + artworkX + (cell.x + 0.5) * cellWidth,
      y: canvasRect.top + artworkY + (cell.y + 0.5) * cellHeight,
    });
    const sampleCell = {
      x: Math.min(lastVisibleX - 3, firstVisibleX + 2),
      y: Math.min(lastVisibleY - 3, firstVisibleY + 2),
    };
    const sampleLocal = {
      x: Math.floor(artworkX + sampleCell.x * cellWidth),
      y: Math.floor(artworkY + sampleCell.y * cellHeight),
      width: Math.floor(cellWidth * 3),
      height: Math.floor(cellHeight * 3),
    };
    const context = gridView.context;
    const hashSample = () => {
      const pixelRatio = gridView.uiComponent.getScale();
      const pixels = context.getImageData(
        sampleLocal.x * pixelRatio,
        sampleLocal.y * pixelRatio,
        sampleLocal.width * pixelRatio,
        sampleLocal.height * pixelRatio,
      ).data;
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index++) {
        hash ^= pixels[index];
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    };
    const emptySampleHash = hashSample();
    for (let y = sampleCell.y; y < sampleCell.y + 3; y++) {
      for (let x = sampleCell.x; x < sampleCell.x + 3; x++) {
        layer.setCell({
          x,
          y,
          t: 1,
          fc: 1,
          bc: editor.colorPaletteManager.noColor,
        });
      }
    }
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });
    const seededSampleHash = hashSample();

    const originalDrawImage = context.drawImage;
    const backBufferContext = gridView.backBufferContext;
    const originalBackBufferRect = backBufferContext.rect;
    const originalBackBufferClip = backBufferContext.clip;
    const frontWrites = [];
    const backBufferClipRects = [];
    let pendingBackBufferRect = false;
    context.drawImage = function (...args) {
      const result = originalDrawImage.apply(this, args);
      if (args[0] === gridView.baseCanvas || args[0] === gridView.backBufferCanvas) {
        frontWrites.push({
          argumentCount: args.length,
          source: args[0] === gridView.baseCanvas ? "base" : "artwork",
          compositeOperation: this.globalCompositeOperation,
          hash: hashSample(),
          sourceHeight: args.length === 9 ? args[4] : args[0].height,
          sourceWidth: args.length === 9 ? args[3] : args[0].width,
        });
      }
      return result;
    };
    backBufferContext.rect = function (...args) {
      pendingBackBufferRect = args;
      return originalBackBufferRect.apply(this, args);
    };
    backBufferContext.clip = function (...args) {
      if (pendingBackBufferRect) backBufferClipRects.push(pendingBackBufferRect);
      pendingBackBufferRect = false;
      return originalBackBufferClip.apply(this, args);
    };

    window.__pencilDrag = {
      backBufferClipRects,
      startCell,
      endCell,
      frontWrites,
      restore: () => {
        context.drawImage = originalDrawImage;
        backBufferContext.rect = originalBackBufferRect;
        backBufferContext.clip = originalBackBufferClip;
      },
    };
    return {
      start: pointForCell(startCell),
      end: pointForCell(endCell),
      startCell,
      endCell,
      cellHeight,
      cellWidth,
      pixelRatio: gridView.uiComponent.getScale(),
      drawnTile,
      emptySampleHash,
      seededSampleHash,
      sample: {
        x: Math.floor(canvasRect.left + artworkX + sampleCell.x * cellWidth),
        y: Math.floor(canvasRect.top + artworkY + sampleCell.y * cellHeight),
        width: Math.floor(cellWidth * 3),
        height: Math.floor(cellHeight * 3),
      },
    };
  });

  await page.mouse.move(drag.start.x, drag.start.y);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const baseline = await page.screenshot({ clip: drag.sample });
  const stableFrames = [];
  await page.mouse.down();
  expect(await page.evaluate(() => g_app.textModeEditor.gridView2d.mouseIsDown)).toBe(true);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  stableFrames.push(baseline.equals(await page.screenshot({ clip: drag.sample })));
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(
      drag.start.x + (drag.end.x - drag.start.x) * step / 8,
      drag.start.y + (drag.end.y - drag.start.y) * step / 8,
    );
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    stableFrames.push(baseline.equals(await page.screenshot({ clip: drag.sample })));
  }
  await page.mouse.up();

  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const {
      backBufferClipRects,
      startCell,
      endCell,
      frontWrites,
      restore,
    } = window.__pencilDrag;
    const drawnCells = [];
    for (let x = startCell.x; x <= endCell.x; x++) {
      drawnCells.push(layer.getCell({ x, y: startCell.y }).t);
    }
    restore();
    return {
      backBufferClipRects,
      drawnCells,
      frontWrites,
      mouseIsDown: editor.gridView2d.mouseIsDown,
    };
  });

  expect(result.mouseIsDown).toBe(false);
  expect(drag.seededSampleHash).not.toBe(drag.emptySampleHash);
  expect(stableFrames).toEqual(Array(9).fill(true));
  expect(result.backBufferClipRects.length).toBeGreaterThan(0);
  expect(result.backBufferClipRects[0][2]).toBeLessThanOrEqual(Math.ceil(drag.cellWidth) + 1);
  expect(result.backBufferClipRects[0][3]).toBeLessThanOrEqual(Math.ceil(drag.cellHeight) + 1);
  expect(result.frontWrites.length).toBeGreaterThanOrEqual(
    drag.endCell.x - drag.startCell.x + 1,
  );
  expect(result.frontWrites.every(({ source }) => source === "base")).toBe(true);
  expect(
    result.frontWrites.every(({ argumentCount }) => [3, 9].includes(argumentCount)),
  ).toBe(true);
  const dirtyFrontWrites = result.frontWrites.filter(
    ({ argumentCount }) => argumentCount === 9,
  );
  expect(dirtyFrontWrites.length).toBeGreaterThanOrEqual(
    drag.endCell.x - drag.startCell.x + 1,
  );
  expect(
    dirtyFrontWrites.every(({ sourceWidth, sourceHeight }) =>
      sourceWidth <= Math.ceil(drag.cellWidth * drag.pixelRatio) + 2
      && sourceHeight <= Math.ceil(drag.cellHeight * drag.pixelRatio) + 2),
  ).toBe(true);
  expect(
    result.frontWrites.every(
      ({ compositeOperation }) => compositeOperation === "source-over",
    ),
  ).toBe(true);
  expect(new Set(result.frontWrites.map(({ hash }) => hash)).size).toBe(1);
  expect(result.drawnCells).toEqual(
    Array(drag.endCell.x - drag.startCell.x + 1).fill(drag.drawnTile),
  );
});

test("2D bitmap sampling preserves alpha, compositing, translations and dirty clips", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));
  await open2DProject(page, testInfo);
  const results = await page.evaluate(() => {
    const view = new GridView2d();
    view.width = 64;
    view.height = 48;
    const source = document.createElement("canvas");
    source.width = 11;
    source.height = 9;
    const sourceContext = source.getContext("2d");
    sourceContext.fillStyle = "rgba(240,40,90,0.5)";
    sourceContext.fillRect(0, 0, 7, 9);
    sourceContext.fillStyle = "#30bb60";
    sourceContext.fillRect(4, 1, 5, 6);
    const sourcePixels = sourceContext.getImageData(0, 0, 11, 9).data;
    const results = [];
    for (const operation of ["source-over", "multiply", "destination-in", "copy", "source-out"]) {
      for (const offscreen of [false, true]) {
        const scale = 2.25;
        const originX = offscreen ? -100 : -2.25;
        const originY = 3.5;
        const expected = document.createElement("canvas");
        expected.width = view.width;
        expected.height = view.height;
        const expectedContext = expected.getContext("2d");
        const pixels = expectedContext.createImageData(view.width, view.height);
        for (let y = 0; y < view.height; y++) {
          for (let x = 0; x < view.width; x++) {
            const sx = Math.floor(((x + 0.5) * 4 - originX * 4) / 9);
            const sy = Math.floor(((y + 0.5) * 4 - originY * 4) / 9);
            if (sx >= 0 && sx < 11 && sy >= 0 && sy < 9) {
              pixels.data.set(sourcePixels.subarray((sy * 11 + sx) * 4, (sy * 11 + sx + 1) * 4),
                (y * view.width + x) * 4);
            }
          }
        }
        expectedContext.putImageData(pixels, 0, 0);
        const bounds = { x: 5, y: 4, width: 24, height: 24 };
        const outputs = [false, true].map((useSampler) => {
          const canvas = document.createElement("canvas");
          canvas.width = view.width * 2;
          canvas.height = view.height * 2;
          const context = UI.getContextNoSmoothing(canvas);
          context.fillStyle = "#517399";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.scale(2, 2);
          context.beginPath();
          context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
          context.clip();
          context.translate(7, -3); // Same translated path as a moving clipboard.
          context.globalAlpha = 0.4;
          context.globalCompositeOperation = operation;
          if (useSampler) {
            view.drawRasterImage(context, bounds, source, 0, 0, 11, 9,
              originX - 7, originY + 3, 11 * scale, 9 * scale);
          } else {
            context.drawImage(expected, -7, 3);
          }
          return context.getImageData(0, 0, canvas.width, canvas.height).data;
        });
        let differences = 0;
        for (let i = 0; i < outputs[0].length; i++) {
          if (outputs[0][i] !== outputs[1][i]) differences++;
        }
        results.push({ operation, offscreen, differences });
      }
    }
    return results;
  });
  for (const result of results) {
    expect(result.differences, JSON.stringify(result)).toBe(0);
  }
});

test("2D bitmap cursor uses the artwork sampling grid on HiDPI displays", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));
  await open2DProject(page, testInfo);
  const results = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const view = editor.gridView2d;
    const grid = editor.grid.grid2d;
    const layer = editor.layers.getSelectedLayerObject();
    UI.devicePixelRatio = 2;
    view.uiComponent.resize({ force: true });
    editor.setGridVisible(false);
    view.setCursorBoxVisible(false);
    editor.setCursorTileTransparent(false);
    editor.currentTile.setColor(1);
    editor.setSelectedTiles([[1, 2], [3, 4]]);
    grid.setCursor(20, 12, 0, 1, -1);
    grid.setCursorEnabled(true);
    grid.setCursorCells();

    return [0.5, 0.75, 1.25, 2.25, 2.5, 2.75, 3.5].map((zoom) => {
      view.setScale(zoom, false);
      editor.graphic.redraw({ allCells: true });
      const x = Math.floor(view.width / 2 - editor.graphic.getGraphicWidth() * zoom / 2
        - view.camera.position.x * zoom) + 20 * layer.getCellWidth() * zoom;
      const y = Math.floor(view.height / 2 - editor.graphic.getGraphicHeight() * zoom / 2
        + view.camera.position.y * zoom) + 12 * layer.getCellHeight() * zoom;
      const width = layer.getCellWidth() * 2 * zoom;
      const height = layer.getCellHeight() * 2 * zoom;
      // Check the shared CSS sampling lattice, including fractional reductions.
      const artwork = view.context.getImageData(x * 2, y * 2, width * 2, height * 2).data;
      const preview = view.overlayContext.getImageData(x * 2, y * 2, width * 2, height * 2).data;
      let differences = 0;
      for (let index = 0; index < artwork.length; index++) {
        if (artwork[index] !== preview[index]) differences++;
      }
      return { zoom, differences, scratchSize: [view.rasterCanvas.width, view.rasterCanvas.height], expectedSize: [width, height] };
    });
  });
  for (const result of results) {
    expect(result.differences, `cursor at ${result.zoom * 100}%`).toBe(0);
    expect(result.scratchSize).toEqual(result.expectedSize);
  }
});

// Also run with --headed on a GPU-capable host. Do not use test-side canvas
// readback before these screenshots: that hid the original Firefox GPU bug.
for (const { zoom, tileSize = 8, panX = 0, panY = 0, cellX = 20 } of [
  { zoom: 0.75 },
  { zoom: 0.75, panX: 101, panY: 101 / 3, cellX: 21 },
  { zoom: 2.25 },
  { zoom: 2.5 },
  { zoom: 2.75 },
  { zoom: 3.5 },
  { zoom: 2.25, tileSize: 9, cellX: 21 },
  { zoom: 2.5, tileSize: 9, panX: 1, cellX: 21 },
  { zoom: 3.5, tileSize: 9, cellX: 21 },
]) {
  test(`2D keeps repainted glyphs and pencil previews stable at ${zoom * 100}%, ${tileSize}px tiles, pan ${panX}`, async ({ page }, testInfo) => {
    test.skip(!isDesktop2DRendererProject(testInfo));
    await open2DProject(page, testInfo);

    for (const pixelRatio of [1, 2]) {
      const sample = await page.evaluate(({ zoom, pixelRatio, tileSize, panX, panY, cellX }) => {
        const editor = g_app.textModeEditor;
        const gridView = editor.gridView2d;
        const layer = editor.layers.getSelectedLayerObject();
        const grid2d = editor.grid.grid2d;
        layer.getTileSet().setTileDimensions({ width: tileSize, height: tileSize });
        editor.graphic.setCellDimensionsFromTiles();
        UI.devicePixelRatio = pixelRatio;
        gridView.uiComponent.resize({ force: true });
        gridView.setScale(zoom, false);
        gridView.setCameraPosition(panX, panY);
        editor.tools.drawTools.setDrawTool("pen");
        editor.setGridVisible(false);
        gridView.setCursorBoxVisible(false);
        editor.setCursorTileTransparent(false);
        grid2d.setCursorEnabled(false);
        editor.currentTile.setColor(1);
        editor.setSelectedTiles([[2]]);
        for (let x = cellX; x <= cellX + 4; x++) {
          layer.setCell({ x, y: 12, t: 1, fc: 1, bc: -1 });
        }
        editor.graphic.invalidateAllCells();
        editor.graphic.redraw({ allCells: true });
        const cellWidth = layer.getCellWidth() * zoom;
        const cellHeight = layer.getCellHeight() * zoom;
        const originX = Math.floor(gridView.width / 2 - editor.graphic.getGraphicWidth() * zoom / 2 - panX * zoom);
        const originY = Math.floor(gridView.height / 2 - editor.graphic.getGraphicHeight() * zoom / 2 + panY * zoom);
        const rect = gridView.canvas.getBoundingClientRect();
        const left = originX + cellX * cellWidth;
        const top = originY + 12 * cellHeight;
        return {
          // Exclude the cell's outermost pixels: at fractional cell boundaries a
          // screenshot crop could otherwise include part of the next drag cell.
          clip: {
            x: rect.left + Math.ceil(left - 0.5) + 1,
            y: rect.top + Math.ceil(top - 0.5) + 1,
            width: Math.ceil(left + cellWidth - 0.5) - Math.ceil(left - 0.5) - 2,
            height: Math.ceil(top + cellHeight - 0.5) - Math.ceil(top - 0.5) - 2,
          },
          point: { x: rect.left + left + cellWidth / 2, y: rect.top + top + cellHeight / 2 },
          cellWidth,
        };
      }, { zoom, pixelRatio, tileSize, panX, panY, cellX });

      const baseline = await page.screenshot({ clip: sample.clip });
      for (const allCells of [false, true, false]) {
        // Invalidate the source without changing its final pixels. Unlike the
        // old untouched-region test, this samples the cell actually repainted.
        await page.evaluate(({ allCells, cellX }) => {
          const editor = g_app.textModeEditor;
          const layer = editor.layers.getSelectedLayerObject();
          layer.setCell({ x: cellX, y: 12, t: 2, fc: 1, bc: -1 });
          layer.setCell({ x: cellX, y: 12, t: 1, fc: 1, bc: -1 });
          if (allCells) editor.graphic.redraw({ allCells: true });
          else editor.grid.grid2d.redrawUpdatedCells(layer);
        }, { allCells, cellX });
        expect(baseline.equals(await page.screenshot({ clip: sample.clip })),
          `repaint at DPR ${pixelRatio}, allCells=${allCells}`).toBe(true);
      }

      await page.mouse.move(sample.point.x, sample.point.y);
      await expect.poll(() => page.evaluate(() => {
        const editor = g_app.textModeEditor;
        const cursor = editor.grid.grid2d.cursor;
        return {
          enabled: editor.grid.grid2d.getCursorEnabled(),
          x: cursor.position.x,
          y: cursor.position.y,
          painted: !editor.gridView2d.overlayNeedsRedraw,
        };
      })).toEqual({ enabled: true, x: cellX, y: 12, painted: true });
      const preview = await page.screenshot({ clip: sample.clip });
      expect(preview.equals(baseline)).toBe(false);
      await page.mouse.down();
      expect(preview.equals(await page.screenshot({ clip: sample.clip }))).toBe(true);
      for (let step = 1; step <= 4; step++) {
        await page.mouse.move(sample.point.x + step * sample.cellWidth, sample.point.y);
        expect(preview.equals(await page.screenshot({ clip: sample.clip })),
          `committed glyph at DPR ${pixelRatio}, drag step ${step}`).toBe(true);
      }
      await page.mouse.up();
      await page.mouse.move(0, 0);
      expect(preview.equals(await page.screenshot({ clip: sample.clip }))).toBe(true);
      const state = await page.evaluate((cellX) => {
        const editor = g_app.textModeEditor;
        const view = editor.gridView2d;
        return {
          cells: Array.from({ length: 5 }, (_, x) => editor.layers.getSelectedLayerObject().getCell({ x: x + cellX, y: 12 }).t),
          softwareRaster: view.backBufferContext.getContextAttributes().willReadFrequently,
          scratchFitsViewport: view.rasterCanvas.width <= view.width && view.rasterCanvas.height <= view.height,
          mouseIsDown: view.mouseIsDown,
        };
      }, cellX);
      expect(state.cells).toEqual(Array(5).fill(2));
      expect(state.softwareRaster).toBe(false);
      expect(state.scratchFitsViewport).toBe(true);
      expect(state.mouseIsDown).toBe(false);
    }
  });
}

test("2D editor keeps grid contrast stable during pencil redraws", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo);
  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const grid2d = editor.grid.grid2d;
    const gridView = editor.gridView2d;
    const context = gridView.context;

    gridView.setScale(8, false);
    grid2d.setCursorEnabled(false);
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    const sampleWidth = Math.min(256, gridView.canvas.width);
    const sampleHeight = Math.min(256, gridView.canvas.height);
    const captureUntouchedGrid = () =>
      new Uint8ClampedArray(context.getImageData(0, 0, sampleWidth, sampleHeight).data);
    const countChanges = (before, after) => {
      let changed = 0;
      for (let index = 0; index < before.length; index++) {
        if (before[index] !== after[index]) changed++;
      }
      return changed;
    };

    const baseline = captureUntouchedGrid();
    const frameChanges = [];
    const tile = layer.getCell({ x: 20, y: 12 }).t === 1 ? 2 : 1;
    editor.setSelectedTiles([[tile]]);

    for (let x = 20; x < 24; x++) {
      grid2d.setCursor(x, 12, 0, editor.currentTile.color, editor.currentTile.bgColor);
      grid2d.setCursorEnabled(true);
      grid2d.setCursorCells();
      frameChanges.push(countChanges(baseline, captureUntouchedGrid()));
    }

    grid2d.setCursorEnabled(false);
    gridView.render();

    return {
      displayScale: gridView.displayScale,
      frameChanges,
      finalChanges: countChanges(baseline, captureUntouchedGrid()),
    };
  });

  expect(result.displayScale).toBeGreaterThan(6);
  expect(result.frameChanges).toEqual([0, 0, 0, 0]);
  expect(result.finalChanges).toBe(0);
});

test("2D editor keeps vector cursor previews out of the artwork cache", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo, { vector: true });
  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const layerCanvas = layer.getCanvas();
    const layerContext = layerCanvas.getContext("2d");
    const frontCanvas = editor.gridView2d.canvas;
    const frontContext = frontCanvas.getContext("2d");
    const baseCanvas = editor.gridView2d.baseCanvas;
    const baseContext = baseCanvas.getContext("2d");
    const overlayCanvas = editor.gridView2d.overlayCanvas;
    const overlayContext = overlayCanvas.getContext("2d");
    const capture = (context, canvas) =>
      new Uint8ClampedArray(context.getImageData(0, 0, canvas.width, canvas.height).data);
    const countChanges = (before, after) => {
      let changed = 0;
      for (let index = 0; index < before.length; index++) {
        if (before[index] !== after[index]) changed++;
      }
      return changed;
    };

    let tile = 1;
    const tileSet = layer.getTileSet();
    while (tile < tileSet.getTileCount() && !tileSet.getGlyphPath(tile)) tile++;
    editor.setSelectedTiles([[tile]]);
    editor.grid.grid2d.setCursorEnabled(false);
    editor.gridView2d.setScale(3.5, false);
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    const viewScale = editor.gridView2d.displayScale;
    const pixelRatio = editor.gridView2d.uiComponent.getScale();
    const cursorCell = {
      x: Math.floor(layer.getGridWidth() / 2),
      y: Math.floor(layer.getGridHeight() / 2),
    };
    const artworkX = Math.floor(
      editor.gridView2d.width / 2
        - editor.graphic.getGraphicWidth() * viewScale / 2
        - editor.gridView2d.camera.position.x * viewScale,
    );
    const artworkY = Math.floor(
      editor.gridView2d.height / 2
        - editor.graphic.getGraphicHeight() * viewScale / 2
        + editor.gridView2d.camera.position.y * viewScale,
    );
    const cursorRegion = {
      x: Math.max(0, Math.floor((artworkX + cursorCell.x * layer.getCellWidth() * viewScale - 2) * pixelRatio)),
      y: Math.max(0, Math.floor((artworkY + cursorCell.y * layer.getCellHeight() * viewScale - 2) * pixelRatio)),
      width: Math.ceil((layer.getCellWidth() * viewScale + 4) * pixelRatio),
      height: Math.ceil((layer.getCellHeight() * viewScale + 4) * pixelRatio),
    };
    const captureCursorRegion = (context) => new Uint8ClampedArray(
      context.getImageData(
        cursorRegion.x,
        cursorRegion.y,
        cursorRegion.width,
        cursorRegion.height,
      ).data,
    );
    const baseWithGrid = captureCursorRegion(baseContext);
    editor.setGridVisible(false);
    const baseWithoutGrid = captureCursorRegion(baseContext);
    editor.setGridVisible(true);

    const artworkBefore = capture(layerContext, layerCanvas);
    const frontBefore = capture(frontContext, frontCanvas);
    const overlayBefore = capture(overlayContext, overlayCanvas);

    editor.grid.grid2d.setCursorEnabled(true);
    editor.grid.grid2d.setCursorPosition(cursorCell.x, cursorCell.y);
    editor.gridView2d.render();
    const overlayWithCursor = capture(overlayContext, overlayCanvas);
    const overlayCursorRegion = captureCursorRegion(overlayContext);
    let cursorAboveGridPixels = 0;
    for (let index = 0; index < baseWithGrid.length; index += 4) {
      const gridChanged = baseWithGrid[index] !== baseWithoutGrid[index]
        || baseWithGrid[index + 1] !== baseWithoutGrid[index + 1]
        || baseWithGrid[index + 2] !== baseWithoutGrid[index + 2]
        || baseWithGrid[index + 3] !== baseWithoutGrid[index + 3];
      if (gridChanged && overlayCursorRegion[index + 3] !== 0) {
        cursorAboveGridPixels++;
      }
    }

    for (let x = cursorCell.x + 1; x < cursorCell.x + 7; x++) {
      editor.grid.grid2d.setCursorPosition(x, cursorCell.y);
      editor.gridView2d.render();
    }
    editor.grid.grid2d.setCursorEnabled(false);
    editor.gridView2d.render();

    return {
      cursorAboveGridPixels,
      cursorPreviewChanges: countChanges(overlayBefore, overlayWithCursor),
      overlayFollowsFront: Boolean(
        frontCanvas.compareDocumentPosition(overlayCanvas)
          & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      restoredFrontChanges: countChanges(
        frontBefore,
        capture(frontContext, frontCanvas),
      ),
      restoredOverlayChanges: countChanges(
        overlayBefore,
        capture(overlayContext, overlayCanvas),
      ),
      artworkCacheChanges: countChanges(
        artworkBefore,
        capture(layerContext, layerCanvas),
      ),
    };
  });

  expect(result.cursorPreviewChanges).toBeGreaterThan(0);
  expect(result.cursorAboveGridPixels).toBeGreaterThan(0);
  expect(result.overlayFollowsFront).toBe(true);
  expect(result.restoredFrontChanges).toBe(0);
  expect(result.restoredOverlayChanges).toBe(0);
  expect(result.artworkCacheChanges).toBe(0);
});
