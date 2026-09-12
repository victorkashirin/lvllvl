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
  const strokes = [];
  let clips = 0;
  const canvasContext = {
    beginPath() {},
    clearRect() {},
    drawImage() {},
    rect(...rectangle) {
      rectangles.push(rectangle);
    },
    save() {},
    clip() {
      clips++;
    },
    restore() {},
    stroke() {
      strokes.push({ color: this.strokeStyle, width: this.lineWidth });
    },
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

  return { display, rectangles, strokes, getClipCount: () => clips };
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

async function createPaletteRenderFixture({
  colorPerMode = "cell",
  pixelRatio = 1,
  screenMode = "textmode",
  type = "bitmap",
} = {}) {
  const source = await readFile(
    path.join(projectRoot, "src/js/textMode/tileSet/tilePaletteDisplay.js"),
    "utf8",
  );
  const putImageDataCalls = [];
  const drawnCharacters = [];
  const drawCalls = [];
  const displayDrawImageCalls = [];
  const glyphPaths = [];
  const vectorFills = [];
  const vectorClipRectangles = [];
  let imageDataReads = 0;

  const createContext = () => ({
    beginPath() {},
    clip() {},
    clearRect() {},
    drawImage() {},
    fill(path) {
      vectorFills.push(path);
    },
    fillRect() {},
    getImageData(x, y, width, height) {
      imageDataReads += 1;
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData(...args) {
      putImageDataCalls.push(args);
    },
    rect(...rectangle) {
      vectorClipRectangles.push(rectangle);
    },
    restore() {},
    rotate() {},
    save() {},
    scale() {},
    setTransform() {},
    stroke() {},
    translate() {},
  });
  const displayContext = createContext();
  displayContext.drawImage = (...args) => {
    displayDrawImageCalls.push(args);
  };
  const tileContext = createContext();
  const createCanvas = () => {
    const context = createContext();
    return {
      context,
      height: 0,
      style: {},
      width: 0,
      getContext() {
        return context;
      },
    };
  };
  const context = vm.createContext({
    ColorUtils: {
      hexStringToInt(value) {
        return Number.parseInt(value.slice(1), 16);
      },
    },
    TextModeEditor: {
      Mode: {
        C64ECM: "c64ecm",
        C64MULTICOLOR: "c64multicolor",
        TEXTMODE: "textmode",
      },
    },
    UI: {
      devicePixelRatio: pixelRatio,
      getContextNoSmoothing(canvas) {
        return canvas.context;
      },
    },
    document: {
      createElement() {
        return createCanvas();
      },
    },
    styles: {
      textMode: { tilePaletteBg: "#222222", tilePaletteFg: "#d0d0d0" },
      tilePalette: { highlightOutline: "#fff", selectOutline: "#0ff" },
      ui: { scrollbar: "#aaa", scrollbarHolder: "#111", scrollbarWidth: 10 },
    },
  });
  vm.runInContext(source, context, {
    filename: "src/js/textMode/tileSet/tilePaletteDisplay.js",
  });

  const tileCount = 256;
  const colorPalette = {
    getHex(index) {
      return index;
    },
    getHexString(index) {
      return index.toString(16).padStart(6, "0");
    },
  };
  const tileSet = {
    drawCharacter(args) {
      drawnCharacters.push(args.character);
      drawCalls.push({
        bgColorRGB: args.bgColorRGB,
        character: args.character,
        colorRGB: args.colorRGB,
        scale: args.scale,
        x: args.x,
        y: args.y,
      });
    },
    getBlankTile: () => 0,
    getCharacterBGColor: () => -1,
    getFontAscent: () => 1,
    getFontScale: () => 1,
    getGlyphPath(character) {
      glyphPaths.push(character);
      return { character };
    },
    getTileColor: () => 1,
    getTileCount: () => tileCount,
    getTileHeight: () => 8,
    getTileWidth: () => 8,
    getType: () => type,
  };
  const layer = {
    getC64ECMColor: (index) => index,
    getColorPerMode: () => colorPerMode,
    getHasTileFlip: () => false,
    getHasTileRotate: () => false,
    getScreenMode: () => screenMode,
    getTransparentColorIndex: () => 0,
    getType: () => "grid",
  };
  const display = new context.TilePaletteDisplay();
  display.editor = {
    colorPaletteManager: {
      getCurrentColorPalette: () => colorPalette,
      noColor: -1,
    },
    currentTile: {
      flipH: false,
      flipV: false,
      getBGColor: () => -1,
      getColor: () => 1,
      rotZ: 0,
    },
    graphic: { getBackgroundColor: () => 0 },
    layers: { getSelectedLayerObject: () => layer },
    tileSetManager: {
      getCurrentTileSet: () => tileSet,
      noTile: -1,
    },
  };
  display.canvas = {
    context: displayContext,
    height: 300,
    style: {},
    width: 600,
    getContext() {
      return displayContext;
    },
  };
  display.context = displayContext;
  display.tileCanvas = {
    context: tileContext,
    height: 0,
    width: 0,
    getContext() {
      return tileContext;
    },
  };
  display.tileContext = tileContext;
  display.charPaletteMapType = "source";
  display.resizeCanvas = false;

  return {
    display,
    displayDrawImageCalls,
    drawCalls,
    drawnCharacters,
    getImageDataReads: () => imageDataReads,
    glyphPaths,
    putImageDataCalls,
    vectorClipRectangles,
    vectorFills,
  };
}

test("tile palette selection follows non-square tile dimensions", async () => {
  const { display, rectangles, strokes, getClipCount } = await createTilePaletteDisplay({
    tileWidth: 8,
    tileHeight: 14,
  });

  display.draw();

  assert.deepEqual(rectangles, [[69, 30, 16, 28]]);
  assert.deepEqual(strokes.slice(-2), [
    { color: "#0ff", width: 2 },
    { color: "#000000", width: 2 },
  ]);
  assert.equal(getClipCount(), 1);
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

test("blocked keyboard movement preserves the tile selection", async () => {
  const { display } = await createTilePaletteDisplay({
    tileWidth: 8,
    tileHeight: 8,
  });

  display.mode = "grid";
  display.charPaletteMapType = "columns";
  display.charPaletteMap = [[0, 1]];
  display.columnHeight = 1;
  display.selectedCharacters = [0];
  display.selectedCharactersGrid = [[0]];
  display.selectedGridCells = [
    { x: 0, y: 0, selectedGridX: 0, selectedGridY: 0 },
  ];
  display.draw = () => {};

  display.moveSelection(-1, 0);

  assert.deepEqual([...display.selectedCharacters], [0]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(display.selectedCharactersGrid)),
    [[0]],
  );

  display.moveSelection(1, 0);
  assert.deepEqual([...display.selectedCharacters], [1]);
});

test("monochrome tile palettes use fixed off-black and off-white colors", async () => {
  const fixture = await createPaletteRenderFixture({ colorPerMode: "character" });
  fixture.display.setColors("monochrome", false);

  fixture.display.drawTilePalette();

  const drawCall = fixture.drawCalls.find((call) => call.character === 17);
  assert.equal(drawCall.bgColorRGB, 0x222222);
  assert.equal(drawCall.colorRGB, 0xd0d0d0);
});

test("selective bitmap updates reuse the slot map and upload only changed tiles", async () => {
  const fixture = await createPaletteRenderFixture();
  fixture.display.drawTilePalette();
  const locations = fixture.display.tileLocations;
  const readsAfterWarmup = fixture.getImageDataReads();
  fixture.drawnCharacters.length = 0;
  fixture.putImageDataCalls.length = 0;
  let positionLookups = 0;
  const originalGetTilePosition = fixture.display.getTilePosition;
  fixture.display.getTilePosition = function (...args) {
    positionLookups += 1;
    return originalGetTilePosition.apply(this, args);
  };

  fixture.display.drawTilePalette({ tiles: [17, 18, 17] });

  assert.equal(fixture.display.tileLocations, locations);
  assert.equal(positionLookups, 0);
  assert.equal(fixture.getImageDataReads(), readsAfterWarmup);
  assert.deepEqual(fixture.drawnCharacters, [17, 18]);
  assert.equal(fixture.putImageDataCalls.length, 2);
  for (const upload of fixture.putImageDataCalls) {
    assert.equal(upload.length, 7);
    assert.equal(upload[5], 16);
    assert.equal(upload[6], 16);
  }
});

test("tile palette glyphs render directly on the fractional device-pixel lattice", async () => {
  const fixture = await createPaletteRenderFixture({ pixelRatio: 1.25 });
  fixture.display.setScale(2);

  fixture.display.drawTilePalette();

  const dimensions = fixture.display.getContentDimensions(2);
  const location = fixture.display.tileLocations[17][0];
  const drawCall = fixture.drawCalls.find((call) => call.character === 17);
  assert.equal(fixture.display.canvasScale, 1.25);
  assert.equal(fixture.display.tileCanvasWidth, dimensions.width);
  assert.equal(fixture.display.tileCanvasHeight, dimensions.height);
  assert.equal(fixture.display.tileCanvas.width, Math.ceil(dimensions.width * 1.25));
  assert.equal(fixture.display.tileCanvas.height, Math.ceil(dimensions.height * 1.25));
  assert.equal(drawCall.scale, 2.5);
  assert.equal(drawCall.x, Math.round(location.paletteX * 1.25));
  assert.equal(drawCall.y, Math.round(location.paletteY * 1.25));
  assert.equal(location.x, drawCall.x);
  assert.equal(location.y, drawCall.y);

  fixture.display.draw();
  const paletteBlit = fixture.displayDrawImageCalls.find(
    (call) => call[0] === fixture.display.tileCanvas,
  );
  assert.ok(paletteBlit);
  assert.equal(paletteBlit[3], paletteBlit[7]);
  assert.equal(paletteBlit[4], paletteBlit[8]);
});

test("selective updates rebuild the slot map after a layout change", async () => {
  const fixture = await createPaletteRenderFixture();
  fixture.display.drawTilePalette();
  const locations = fixture.display.tileLocations;
  const readsAfterWarmup = fixture.getImageDataReads();
  fixture.putImageDataCalls.length = 0;
  let positionLookups = 0;
  const originalGetTilePosition = fixture.display.getTilePosition;
  fixture.display.getTilePosition = function (...args) {
    positionLookups += 1;
    return originalGetTilePosition.apply(this, args);
  };
  fixture.display.setScale(3);

  fixture.display.drawTilePalette({ tiles: [17] });

  assert.notEqual(fixture.display.tileLocations, locations);
  assert.equal(positionLookups, 256);
  assert.equal(fixture.getImageDataReads(), readsAfterWarmup + 1);
  assert.equal(fixture.putImageDataCalls.length, 1);
  assert.equal(fixture.putImageDataCalls[0].length, 3);
});

test("selective vector updates repaint only changed glyph slots", async () => {
  const fixture = await createPaletteRenderFixture({ pixelRatio: 1.25, type: "vector" });
  fixture.display.drawTilePalette();
  const readsAfterWarmup = fixture.getImageDataReads();
  fixture.glyphPaths.length = 0;
  fixture.vectorClipRectangles.length = 0;
  fixture.vectorFills.length = 0;

  fixture.display.drawTilePalette({ tiles: [42] });

  assert.equal(fixture.getImageDataReads(), readsAfterWarmup);
  assert.deepEqual(fixture.glyphPaths, [42]);
  assert.equal(fixture.vectorClipRectangles.length, 1);
  assert.deepEqual(
    fixture.vectorClipRectangles[0],
    [
      fixture.display.tileLocations[42][0].x,
      fixture.display.tileLocations[42][0].y,
      20,
      20,
    ],
  );
  assert.equal(fixture.vectorFills.length, 1);
  assert.equal(fixture.putImageDataCalls.length, 0);
});

test("selective C64 ECM updates repaint the four slots sharing a glyph", async () => {
  const fixture = await createPaletteRenderFixture({ screenMode: "c64ecm" });
  fixture.display.drawTilePalette();
  fixture.drawnCharacters.length = 0;
  fixture.putImageDataCalls.length = 0;

  fixture.display.drawTilePalette({ tiles: [1] });

  assert.deepEqual(fixture.drawnCharacters, [1, 1, 1, 1]);
  assert.equal(fixture.putImageDataCalls.length, 4);
});
