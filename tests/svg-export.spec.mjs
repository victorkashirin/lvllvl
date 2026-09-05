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

test("a text-mode project exports parseable SVG geometry", async ({ page }) => {
  await startDefaultProject(page);

  const result = await page.evaluate(async () => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const tileSet = layer.getTileSet();
    let tile = 0;

    while (tile < tileSet.getTileCount() && tileSet.isBlank(tile)) tile++;

    layer.setCell({
      x: 0,
      y: 0,
      t: tile,
      fc: 1,
      bc: editor.colorPaletteManager.noColor,
      fh: 0,
      fv: 0,
      rz: 0,
      update: false,
    });

    const exporter = g_app.services.importExportControllers
      .createExportController("svg", editor);
    const svg = await exporter.getSVGData();
    const parsed = new DOMParser().parseFromString(SafeHTML.createSVG(svg), "image/svg+xml");

    return {
      expectedWidth: layer.getGridWidth() * layer.getCellWidth(),
      expectedHeight: layer.getGridHeight() * layer.getCellHeight(),
      menuEnabled: UI("export-svg").enabled,
      mode: layer.getScreenMode(),
      width: Number(parsed.documentElement.getAttribute("width")),
      height: Number(parsed.documentElement.getAttribute("height")),
      crispEdges: parsed.documentElement.getAttribute("shape-rendering"),
      parserErrors: parsed.querySelectorAll("parsererror").length,
      pathCount: parsed.querySelectorAll("path").length,
      tileFound: tile < tileSet.getTileCount(),
    };
  });

  expect(result).toEqual({
    expectedWidth: 320,
    expectedHeight: 200,
    menuEnabled: true,
    mode: "textmode",
    width: 320,
    height: 200,
    crispEdges: "crispEdges",
    parserErrors: 0,
    pathCount: 1,
    tileFound: true,
  });
});

test("C64 monochrome SVG output matches the production renderer", async ({ page }) => {
  await startDefaultProject(page);

  const result = await page.evaluate(async () => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const tileSet = layer.getTileSet();
    const colorPalette = layer.getColorPalette();
    const noColor = editor.colorPaletteManager.noColor;
    const tileWidth = tileSet.getTileWidth();
    const tileHeight = tileSet.getTileHeight();

    const isVerticallyAsymmetric = (tile) => {
      for (let y = 0; y < tileHeight; y++) {
        for (let x = 0; x < tileWidth; x++) {
          if (
            tileSet.getPixel(tile, x, y, "current") !==
            tileSet.getPixel(tile, x, tileHeight - y - 1, "current")
          ) {
            return true;
          }
        }
      }
      return false;
    };

    let baseTile = 0;
    while (
      baseTile < 64 &&
      (tileSet.isBlank(baseTile) || !isVerticallyAsymmetric(baseTile))
    ) {
      baseTile++;
    }

    if (baseTile >= 64) {
      return { baseTileFound: false };
    }

    layer.setGridDimensions({ width: 4, height: 1 });
    layer.setColorPerMode("cell");
    layer.setHasTileFlip(true);
    layer.setHasTileRotate(true);

    const renderSvg = async (svg, width, height) => {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      });

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(image, 0, 0);
      return canvas.getContext("2d").getImageData(0, 0, width, height).data;
    };

    const rgb = (colorIndex) => {
      const color = colorPalette.getRGBA(colorIndex);
      return `rgb(${color[0]},${color[1]},${color[2]})`;
    };

    const compareMode = async (mode) => {
      await new Promise((resolve) => layer.setScreenMode(mode, resolve));

      if (mode === TextModeEditor.Mode.C64ECM) {
        layer.setC64ECMColor(0, 0, undefined, false);
        layer.setC64ECMColor(1, 2, undefined, false);
        layer.setC64ECMColor(2, 5, undefined, false);
        layer.setC64ECMColor(3, 7, undefined, false);
      }

      const tileIds =
        mode === TextModeEditor.Mode.C64ECM
          ? [baseTile, baseTile + 64, baseTile + 128, baseTile + 192]
          : [baseTile, baseTile, baseTile, baseTile];

      for (let x = 0; x < tileIds.length; x++) {
        layer.setCell({
          x,
          y: 0,
          t: tileIds[x],
          fc: x + 1,
          bc: mode === TextModeEditor.Mode.C64ECM ? noColor : x % 2 ? x + 4 : noColor,
          fh: x === 2 ? 1 : 0,
          fv: x === 1 || x === 3 ? 1 : 0,
          rz: x === 3 ? 1 : 0,
          update: false,
        });
      }

      const width = layer.getGridWidth() * tileWidth;
      const height = layer.getGridHeight() * tileHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      layer.draw({ canvas, allCells: true, drawBackground: true });
      const rendered = canvas.getContext("2d").getImageData(0, 0, width, height).data;

      const exporter = g_app.services.importExportControllers
        .createExportController("svg", editor);
      const svg = await exporter.getSVGData();
      const exported = await renderSvg(svg, width, height);
      const parsed = new DOMParser().parseFromString(SafeHTML.createSVG(svg), "image/svg+xml");
      let mismatchedBytes = 0;

      for (let i = 0; i < rendered.length; i++) {
        if (rendered[i] !== exported[i]) mismatchedBytes++;
      }

      const cellBackgrounds = Array.from(parsed.querySelectorAll("rect[x]"), (rect) =>
        rect.getAttribute("fill"),
      );

      return {
        mode,
        menuEnabled: UI("export-svg").enabled,
        mismatchedBytes,
        parserErrors: parsed.querySelectorAll("parsererror").length,
        pathCount: parsed.querySelectorAll("path").length,
        cellBackgrounds,
        expectedCellBackgrounds:
          mode === TextModeEditor.Mode.C64ECM
            ? [0, 1, 2, 3].map((index) => rgb(layer.getC64ECMColor(index)))
            : cellBackgrounds,
      };
    };

    return {
      baseTileFound: true,
      standard: await compareMode(TextModeEditor.Mode.C64STANDARD),
      ecm: await compareMode(TextModeEditor.Mode.C64ECM),
    };
  });

  expect(result.baseTileFound).toBe(true);
  expect(result.standard).toMatchObject({
    mode: "c64standard",
    menuEnabled: true,
    mismatchedBytes: 0,
    parserErrors: 0,
    pathCount: 4,
  });
  expect(result.ecm).toMatchObject({
    mode: "c64ecm",
    menuEnabled: true,
    mismatchedBytes: 0,
    parserErrors: 0,
    pathCount: 4,
  });
  expect(result.ecm.cellBackgrounds).toEqual(result.ecm.expectedCellBackgrounds);
});
