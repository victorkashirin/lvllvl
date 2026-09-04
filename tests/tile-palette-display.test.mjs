import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function createTilePaletteDisplay({ tileWidth, tileHeight }) {
  const source = await readFile(
    path.join(projectRoot, "src/js/textMode/tileSet/tilePaletteDisplay.js"),
    "utf8",
  );
  const context = vm.createContext({
    styles: {
      tilePalette: { highlightOutline: "#fff", selectOutline: "#0ff" },
      ui: { scrollbar: "#aaa", scrollbarHolder: "#111", scrollbarWidth: 10 },
    },
    UI: {
      devicePixelRatio: 1,
      getContextNoSmoothing(canvas) {
        return canvas.context;
      },
    },
  });
  vm.runInContext(source, context, {
    filename: "src/js/textMode/tileSet/tilePaletteDisplay.js",
  });

  const rectangles = [];
  const canvasContext = {
    beginPath() {},
    clearRect() {},
    drawImage() {},
    rect(...rectangle) {
      rectangles.push(rectangle);
    },
    stroke() {},
  };
  const display = new context.TilePaletteDisplay();
  display.editor = {
    tileSetManager: {
      getCurrentTileSet() {
        return {
          getTileHeight: () => tileHeight,
          getTileWidth: () => tileWidth,
        };
      },
    },
  };
  display.canvas = { context: canvasContext, height: 100, width: 100 };
  display.tileCanvas = {};
  display.tilePaletteScale = 2;
  display.canvasScale = 1;
  display.viewHeight = 100;
  display.viewWidth = 100;
  display.vScrollBarWidth = 0;
  display.hScrollBarHeight = 0;
  display.columnHeight = 8;
  display.columnWidth = 16;
  display.selectedGridCells = [{ x: 4, y: 1 }];
  display.calculateScroll = function () {};

  return { display, rectangles };
}

async function createTestTileSet() {
  const source = await readFile(
    path.join(projectRoot, "src/js/textMode/tileSet/tileSet.js"),
    "utf8",
  );
  class HTMLCanvasElement {}
  const context = vm.createContext({
    HTMLCanvasElement,
    TextModeEditor: {
      Mode: {
        C64MULTICOLOR: "c64multicolor",
        C64STANDARD: "c64standard",
        C64ECM: "c64ecm",
        INDEXED: "indexed",
        NES: "nes",
        RGB: "rgb",
        TEXTMODE: "textmode",
      },
    },
  });
  vm.runInContext(source, context, {
    filename: "src/js/textMode/tileSet/tileSet.js",
  });

  const tileSet = new context.TileSet();
  const colorPalette = {
    getColor(index) {
      return { r: index / 10, g: index / 10, b: index / 10 };
    },
    getHex() {
      return 0xffffff;
    },
  };
  tileSet.editor = {
    colorPaletteManager: {
      getCurrentColorPalette: () => colorPalette,
      noColor: -1,
    },
    currentTile: { color: 8 },
    graphic: { getType: () => "textmode" },
  };
  tileSet.charWidth = 8;
  tileSet.charHeight = 1;
  tileSet.tileData = [{}];
  tileSet.currentTileData = [[1, 0, 0, 0, 0, 0, 0, 0]];

  return tileSet;
}

test("tile palette selection follows non-square tile dimensions", async () => {
  const { display, rectangles } = await createTilePaletteDisplay({
    tileWidth: 8,
    tileHeight: 14,
  });

  display.draw();

  assert.deepEqual(rectangles, [[69, 30, 16, 28]]);
});

test("horizontal tile palettes fit the available width", async () => {
  const { display } = await createTilePaletteDisplay({
    tileWidth: 8,
    tileHeight: 8,
  });

  display.blockStacking = "horizontal";
  display.columns = 2;
  display.columnWidth = 16;
  display.columnHeight = 8;
  display.charMargin = 1;

  const scale = display.getScaleToFitWidth(600, 500);
  const dimensions = display.getContentDimensions(scale);

  assert.equal(scale, 2.125);
  assert.ok(dimensions.width <= 600);
  assert.ok(display.getContentDimensions(scale + display.getScaleStep()).width > 600);
  assert.equal(Number.isInteger(8 * scale), true);
});

test("fit-to-width can scale beyond the manual 1000 percent limit", async () => {
  const { display } = await createTilePaletteDisplay({
    tileWidth: 8,
    tileHeight: 8,
  });

  display.blockStacking = "horizontal";
  display.columns = 1;
  display.columnWidth = 16;
  display.columnHeight = 8;
  display.charMargin = 1;

  const scale = display.getScaleToFitWidth(1600, 500);

  assert.ok(scale > display.getMaximumScale());
  assert.ok(display.getContentDimensions(scale).width <= 1600);
});

test("fit-to-width reserves room for a vertical scrollbar", async () => {
  const { display } = await createTilePaletteDisplay({
    tileWidth: 8,
    tileHeight: 8,
  });

  display.blockStacking = "horizontal";
  display.columns = 2;
  display.columnWidth = 16;
  display.columnHeight = 8;
  display.charMargin = 1;

  const scale = display.getScaleToFitWidth(600, 100);
  const dimensions = display.getContentDimensions(scale);

  assert.equal(scale, 2.125);
  assert.ok(dimensions.width <= 590);
  assert.ok(dimensions.height > 100);
  assert.ok(display.getContentDimensions(scale + display.getScaleStep()).width > 590);
});

test("vertical tile palettes fit independently", async () => {
  const { display } = await createTilePaletteDisplay({
    tileWidth: 8,
    tileHeight: 8,
  });

  display.blockStacking = "vertical";
  display.columns = 2;
  display.columnWidth = 16;
  display.columnHeight = 8;
  display.charMargin = 1;

  const scale = display.getScaleToFitWidth(300, 200);
  const dimensions = display.getContentDimensions(scale);

  assert.equal(scale, 2.125);
  assert.ok(dimensions.width <= 290);
  assert.ok(dimensions.height > 200);
  assert.equal(Number.isInteger(8 * scale), true);
});

test("scale quantization keeps rectangular tile dimensions pixel-aligned", async () => {
  const { display } = await createTilePaletteDisplay({
    tileWidth: 12,
    tileHeight: 8,
  });

  assert.equal(display.getScaleStep(), 0.25);
  assert.equal(display.getScaleControlStep(), 0.5);
  assert.equal(display.quantizeScale(1.87), 1.75);
  assert.equal(12 * display.quantizeScale(1.87) % 1, 0);
  assert.equal(8 * display.quantizeScale(1.87) % 1, 0);
});

test("scale quantization keeps raster sizes exact for repeating-decimal steps", async () => {
  for (const [tileWidth, tileHeight] of [[18, 18], [24, 24], [33, 33], [128, 128], [3, 27]]) {
    const { display } = await createTilePaletteDisplay({
      tileWidth,
      tileHeight,
    });

    const scale = tileWidth === 3 ? display.quantizeScale(7 / 3) : display.quantizeScale(2.26);
    const dimensions = display.getScaledTileDimensions(scale);
    const divisor = display.getScaleDivisor();
    const stepCount = Math.round(scale * divisor);

    assert.equal(dimensions.width, tileWidth * stepCount / divisor, `${tileWidth}px width`);
    assert.equal(dimensions.height, tileHeight * stepCount / divisor, `${tileHeight}px height`);
  }
});

test("fit-to-width falls back safely for coprime tile dimensions", async () => {
  const { display } = await createTilePaletteDisplay({
    tileWidth: 7,
    tileHeight: 9,
  });

  display.blockStacking = "horizontal";
  display.columns = 1;
  display.columnWidth = 16;
  display.columnHeight = 8;
  display.charMargin = 1;

  const scale = display.getScaleToFitWidth(80, 500);
  const dimensions = display.getContentDimensions(scale);
  const scaledTileDimensions = display.getScaledTileDimensions(scale);
  const first = display.getTilePosition(0, 0, 0, scale);
  const second = display.getTilePosition(1, 0, 0, scale);
  const nextRow = display.getTilePosition(0, 1, 0, scale);

  assert.equal(scale, 3 / 7);
  assert.equal(scaledTileDimensions.width, 3);
  assert.equal(scaledTileDimensions.height, 4);
  assert.equal(second.x - first.x, scaledTileDimensions.width + display.charMargin);
  assert.equal(nextRow.y - first.y, scaledTileDimensions.height + display.charMargin);
  assert.ok(dimensions.width <= 80);
});

test("fit-to-width can shrink below 25 percent without overflowing", async () => {
  const { display } = await createTilePaletteDisplay({
    tileWidth: 128,
    tileHeight: 128,
  });

  display.blockStacking = "horizontal";
  display.columns = 1;
  display.columnWidth = 16;
  display.columnHeight = 8;
  display.charMargin = 1;

  const scale = display.getScaleToFitWidth(80, 500);
  const dimensions = display.getContentDimensions(scale);

  assert.equal(scale, 3 / 128);
  assert.ok(scale < 0.25);
  assert.ok(dimensions.width <= 80);
});

test("fractional C64 multicolor rendering does not write into the tile margin", async () => {
  const tileSet = await createTestTileSet();
  const imageData = { data: new Uint8ClampedArray(6 * 4), width: 6 };

  tileSet.drawCharacter({
    backgroundColor: 0,
    bgColor: 0,
    c64Multi1Color: 1,
    c64Multi2Color: 2,
    character: 0,
    color: 8,
    imageData,
    scale: 0.625,
    screenMode: "c64multicolor",
    x: 0,
    y: 0,
  });

  assert.notEqual(imageData.data[3], 0);
  assert.equal(imageData.data[5 * 4 + 3], 0);
});

test("repeating-decimal scales do not draw an extra raster row", async () => {
  const tileSet = await createTestTileSet();
  tileSet.charWidth = 3;
  tileSet.charHeight = 27;
  tileSet.currentTileData = [new Array(3 * 27).fill(1)];
  const imageData = { data: new Uint8ClampedArray(8 * 64 * 4), width: 8 };

  tileSet.drawCharacter({
    character: 0,
    color: 1,
    imageData,
    scale: 7 / 3,
    screenMode: "textmode",
    x: 0,
    y: 0,
  });

  assert.notEqual(imageData.data[(62 * imageData.width) * 4 + 3], 0);
  assert.equal(imageData.data[(63 * imageData.width) * 4 + 3], 0);
  assert.equal(imageData.data[7 * 4 + 3], 0);
});

test("fit-to-width remains pixel-aligned across panel sizes", async () => {
  const { display } = await createTilePaletteDisplay({
    tileWidth: 8,
    tileHeight: 8,
  });

  display.blockStacking = "horizontal";
  display.columns = 2;
  display.columnWidth = 16;
  display.columnHeight = 8;
  display.charMargin = 1;

  for (let availableWidth = 400; availableWidth <= 800; availableWidth += 7) {
    const scale = display.getScaleToFitWidth(availableWidth, 500);
    const dimensions = display.getContentDimensions(scale);

    assert.ok(dimensions.width <= availableWidth, `overflow at ${availableWidth}px`);
    assert.equal(Number.isInteger(8 * scale), true, `fractional tile at ${availableWidth}px`);
  }
});
