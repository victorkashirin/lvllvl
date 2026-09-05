import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function fixture({ vector = false } = {}) {
  const context = {
    clearRect() {}, fillRect() {}, drawImage() {}, setTransform() {}, fill() {},
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    getImageData: (x, y, width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData(data) { this.pixels = data.data.slice(); },
  };
  const makeCanvas = () => ({ width: 0, height: 0, getContext: () => context });
  const sandbox = vm.createContext({
    document: { createElement: makeCanvas },
    HTMLCanvasElement: { prototype: { toBlob() {} } },
    TextModeEditor: { Mode: { VECTOR: "vector", TEXTMODE: "textmode", NES: "nes", C64ECM: "ecm", C64MULTICOLOR: "multi" } },
    g_app: { openingProject: true },
    Colour: { RGBA: "rgba", HSVA: "hsva", LABA: "laba", converters: { rgba: { hsva: (c) => c, laba: (c) => c } } },
  });
  for (const path of ["layers/layerGrid.js", "tileSet/tileSet.js", "color/colorPalette.js", "blockSet/blockSet.js", "graphic.js"]) {
    vm.runInContext(readFileSync(new URL(`../src/js/textMode/${path}`, import.meta.url), "utf8"), sandbox);
  }
  const tileSet = new sandbox.TileSet();
  tileSet.charWidth = tileSet.charHeight = 2;
  tileSet.tileData = [{ data: [[1, 0, 0, 1]], props: { animated: false } }];
  tileSet.updateCharacterCurrentData(0);
  tileSet.getFontScale = () => 1;
  tileSet.getFontAscent = () => 1;
  tileSet.getGlyphPath = () => null;
  const palette = new sandbox.ColorPalette();
  palette.noDocColors = [0xff000000, 0xffffffff, 0xff00ff00];
  palette.noDocColors.forEach((_, i) => palette.createColorMeta(i));
  const blockSet = new sandbox.BlockSet();
  const blockDoc = { data: { blocks: [{ data: [[{ t: 0 }]], fc: 1, bc: -1 }] } };
  blockSet.getDocRecord = () => blockDoc;
  const select = {
    isActive: () => false, isInPasteMove: () => false, isMovingSelectionContents: () => false,
    inSelection: () => true,
    selection: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, selectionOffsetX: 0, selectionOffsetY: 0,
  };
  const editor = {
    modified() {}, history: { addAction() {} },
    currentTile: { color: 1, bgColor: -1, rotX: 0, rotY: 0, rotZ: 0 },
    layers: { isBackgroundVisible: () => true, getSelectedLayerId: () => "a" },
    colorPaletteManager: { noColor: -1, colorSubPalettes: { subPalettes: [[0, 1, 2, 0]] } },
    tools: { drawTools: { tool: "pen", select, pixelSelect: { isActive: () => false, isInPasteMove: () => false }, shapes: { getGrid: () => [] }, tilePalette: { drawTilePalette() {} } } },
    sideTilePalette: { drawTilePalette() {} },
    grid: { border: { visible: false } }, frames: { getShowPrevFrame: () => true },
  };
  const graphic = new sandbox.Graphic();
  editor.graphic = graphic;
  graphic.editor = editor;
  graphic.currentFrame = 1;
  graphic.frames = [{}, {}];
  graphic.frameCount = 2;
  graphic.getGraphicWidth = graphic.getGraphicHeight = () => 4;
  const layer = new sandbox.LayerGrid();
  layer.editor = editor;
  layer.layerId = "a";
  layer.mode = vector ? "vector" : "textmode";
  layer.doc = { gridWidth: 2, gridHeight: 2, cellWidth: 2, cellHeight: 2, blockWidth: 1, blockHeight: 1, blockMode: false };
  layer.frames = Array.from({ length: 2 }, () => ({ bgColor: -1, data: Array.from({ length: 2 }, () => Array.from({ length: 2 }, () => ({ t: 0, fc: 1, bc: -1, rz: 0, fh: 0, fv: 0 }))) }));
  layer.currentFrame = 1;
  layer.frameCount = 2;
  layer.getTileSet = () => tileSet;
  layer.getColorPalette = () => palette;
  layer.getBlockSet = () => blockSet;
  layer.setViewBounds(0, 0, 2, 2);
  editor.layers.layers = [{ layerId: "a", type: "grid", visible: true }];
  editor.layers.getLayerObject = () => layer;
  editor.layers.getSelectedLayerObject = () => layer;
  tileSet.editor = blockSet.editor = palette.editor = editor;
  const calls = [];
  for (const method of ["draw", "drawVector"]) {
    const original = layer[method];
    layer[method] = function(args) {
      if (args.draw === "prevgrid") calls.push({ method, ...args });
      return original.call(this, args);
    };
  }
  const args = { frame: 0, canvas: layer.getPrevFrameCanvas(), scale: 1, drawFromX: 0, drawFromY: 0, drawToX: 4, drawToY: 4, drawBackground: false };
  const draw = () => layer.drawPrevFrame(args);
  return { layer, tileSet, palette, blockSet, graphic, editor, args, draw, calls, context, makeCanvas };
}

for (const vector of [false, true]) {
  test(`${vector ? "vector" : "bitmap"}: temporary renders neither borrow nor consume viewport dirty state`, () => {
    for (const frame of [0, 1]) for (const pending of [false, true]) {
      const f = fixture({ vector });
      const main = f.layer.getCanvas();
      Object.assign(f.layer.drawnBounds, { fromX: 0, fromY: 0, toX: 2, toY: 2 });
      Object.assign(f.layer.updatedCellRanges, pending
        ? { minX: 0, minY: 0, maxX: 2, maxY: 2 }
        : { minX: 2, minY: 2, maxX: 0, maxY: 0 });
      f.layer.lastDrawScale = 3.5;
      f.graphic.setOnlyViewBoundsDrawn(true);
      const state = () => JSON.stringify([
        f.layer.updatedCellRanges, f.layer.drawnBounds, f.graphic.getOnlyViewBoundsDrawn(),
        f.layer.lastDrawScale, f.layer.lastDrawFromGridX, f.layer.lastDrawFromGridY,
        f.layer.lastDrawToGridX, f.layer.lastDrawToGridY,
      ]);
      const before = state();
      let glyphs = 0;
      f.tileSet.getGlyphPath = () => { glyphs++; return {}; };
      const args = { canvas: f.makeCanvas(), frame, scale: 1,
        drawFromX: 0, drawFromY: 0, drawToX: 4, drawToY: 4 };
      f.layer.draw(args);
      assert.equal(state(), before, `frame=${frame}, pending=${pending}`);
      if (vector) assert.equal(glyphs, 4, "scratch drawing must ignore empty main dirty ranges");
      else {
        assert.equal(f.context.pixels.length, 4 * 4 * 4, "scratch drawing must ignore main view bounds");
        assert.equal(f.context.pixels[3], 255, "scratch drawing must ignore main drawn bounds");
        assert.equal(f.context.pixels.at(-1), 255);
        f.layer.draw({ ...args, fromX: 1, fromY: 1, toX: 2, toY: 2 });
        assert.equal(f.context.pixels.length, 2 * 2 * 4, "explicit scratch bounds still apply");
        assert.equal(state(), before);
      }
      // The current frame's owned raster still satisfies pending invalidation.
      f.layer.draw({ ...args, canvas: main, frame: 1, allCells: true });
      assert.equal(f.layer.updatedCellRanges.minX, 2);
      assert.equal(f.layer.updatedCellRanges.maxX, 0);
      if (vector) assert.equal(f.layer.lastDrawScale, 1);
    }
  });

  test(`${vector ? "vector" : "bitmap"}: failed temporary renders leave viewport state intact`, () => {
    const f = fixture({ vector });
    const before = JSON.stringify([f.layer.updatedCellRanges, f.layer.drawnBounds, f.layer.lastDrawScale]);
    const fail = () => { throw new Error("raster failed"); };
    f.context.getImageData = fail;
    f.tileSet.getGlyphPath = fail;
    assert.throws(() => f.layer.draw({ ...f.args, draw: "grid", canvas: f.makeCanvas() }), /raster failed/);
    assert.equal(JSON.stringify([f.layer.updatedCellRanges, f.layer.drawnBounds, f.layer.lastDrawScale]), before);
  });

  test(`${vector ? "vector" : "bitmap"}: current-frame edits reuse the cache through Graphic.drawFrame`, () => {
    const f = fixture({ vector });
    const args = { canvas: f.makeCanvas(), context: f.context, scale: 1 };
    args.canvas.width = args.canvas.height = 4;
    f.graphic.drawFrame(args);
    assert.equal(f.calls.length, 1);
    for (let i = 0; i < 10; i++) {
      f.layer.setCell({ frame: 1, x: 0, y: 0, t: 0, fc: i % 2 });
      f.graphic.drawFrame(args);
    }
    assert.equal(f.calls.length, 1);
    f.layer.setCell({ frame: 0, x: 0, y: 0, t: 0, fc: 2 });
    f.graphic.drawFrame(args);
    assert.equal(f.calls.length, 2);
  });
}

test("full vector redraws clear complete touched pixels at fractional document edges", () => {
  const f = fixture({ vector: true });
  const clears = [];
  f.context.clearRect = (...args) => clears.push(args);
  for (const background of [-1, 1]) {
    f.layer.frames[0].bgColor = background;
    f.layer.drawVector({ ...f.args, draw: "grid", scale: 0.3, drawBackground: true, allCells: true });
    assert.deepEqual(clears.at(-1), [0, 0, 2, 2], "1.2 × 1.2 raster coverage must clear 2 × 2 whole pixels");
  }
});

test("frame identity, content, shared dependencies, dimensions and render options invalidate", () => {
  const f = fixture();
  const changes = [
    () => f.layer.setCell({ frame: 0, x: 0, y: 0, t: 0, fc: 2 }),
    () => f.tileSet.setPixel(0, 0, 0, 0, false),
    () => f.tileSet.invertPixels(0, true),
    () => f.tileSet.setCharacterFrame(0, 0),
    () => { f.palette.noDocColors[1] = 0xffff0000; f.palette.createColorMeta(1); },
    () => f.layer.setBackgroundColor(1, 0),
    () => { f.layer.frames[0].c64ECMColor1 = 2; },
    () => { f.layer.frames[0] = structuredClone(f.layer.frames[0]); },
    () => { f.layer.frames[0].data = structuredClone(f.layer.frames[0].data); },
    () => { f.args.drawBackground = true; },
    () => { f.layer.doc.hasTileFlip = true; },
    () => { f.layer.doc.cellWidth = 3; f.layer.getPrevFrameCanvas(); },
    () => { f.layer.doc.refImageData = "new image"; },
    () => f.layer.setToBlank(),
    () => f.layer.invalidateAllCells(),
  ];
  f.draw();
  let count = 1;
  for (const change of changes) {
    change();
    f.draw();
    assert.equal(f.calls.length, ++count, change.toString());
    f.draw();
    assert.equal(f.calls.length, count, "warm cache");
  }
});

test("ECM onion skin uses previous-frame colors, not current-frame background registers", () => {
  const f = fixture();
  f.layer.mode = "ecm";
  // Tile 64 selects ECM background register 1 but uses tile 0's pixels.
  while (f.tileSet.currentTileData.length <= 64) f.tileSet.currentTileData.push([0, 0, 0, 0]);
  f.layer.frames[0].data[0][0].t = 64;
  f.layer.frames[0].c64ECMColor1 = 2;
  f.layer.frames[1].c64ECMColor1 = 0;
  f.draw();
  assert.deepEqual(Array.from(f.context.pixels.slice(4, 8)), [0, 255, 0, 255]);
  f.layer.frames[1].c64ECMColor1 = 1;
  f.draw();
  assert.equal(f.calls.length, 1);
  f.layer.frames[0].c64ECMColor1 = 1;
  f.draw();
  assert.equal(f.calls.length, 2);
  assert.deepEqual(Array.from(f.context.pixels.slice(4, 8)), [255, 255, 255, 255]);
});

test("block edits and NES subpalette edits invalidate shared previous-frame dependencies", () => {
  const f = fixture();
  f.layer.doc.blockMode = true;
  f.editor.blockSetManager = { getCurrentBlockSet: () => f.blockSet };
  for (const frame of f.layer.frames) for (const row of frame.data) for (const cell of row) cell.b = 0;
  f.draw();
  f.blockSet.setBlockColor(0, 2);
  f.draw();
  f.blockSet.setCharacterInBlock(0, 0, 0, 0);
  f.draw();
  assert.equal(f.calls.length, 3);
  // Only test the NES dependency key here; the browser covers real compositing.
  f.layer.mode = "nes";
  f.layer.draw = (args) => f.calls.push(args);
  f.draw();
  f.editor.colorPaletteManager.colorSubPalettes.subPalettes[0][1] = 2;
  f.draw();
  assert.equal(f.calls.length, 5);
});

test("vector cache keys exact viewport/scale and preserves main dirty ranges and viewport state", () => {
  const f = fixture({ vector: true });
  const ranges = { ...f.layer.updatedCellRanges };
  const offset = f.draw();
  assert.equal(f.layer.lastDrawScale, false);
  assert.deepEqual({ ...f.layer.updatedCellRanges }, ranges);
  assert.equal(f.draw(), offset);
  for (const [key, value] of [["drawFromX", 0.25], ["drawFromY", 0.5], ["drawToX", 3.5], ["drawToY", 3.5], ["scale", 2]]) {
    f.args[key] = value;
    f.draw();
  }
  assert.equal(f.calls.length, 6);
  assert.deepEqual({ ...f.layer.updatedCellRanges }, ranges);
});

test("bitmap cache is viewport-independent, per-layer, and detects canvas replacement/reset", () => {
  const a = fixture(), b = fixture();
  a.draw();
  b.draw();
  a.args.scale = 3;
  a.args.drawFromX = 1;
  a.draw();
  assert.equal(a.calls.length, 1);
  assert.equal(b.calls.length, 1);
  a.args.canvas = a.makeCanvas();
  a.draw();
  a.args.canvas.width++;
  a.draw();
  assert.equal(a.calls.length, 3);
  b.draw();
  assert.equal(b.calls.length, 1);
});

test("switching selected layers keeps independent caches at the same frame number", () => {
  const a = fixture(), b = fixture();
  b.layer.layerId = "b";
  b.layer.editor = a.editor;
  a.editor.layers.layers.push({ layerId: "b", type: "grid", visible: true });
  a.editor.layers.getLayerObject = (id) => id === "a" ? a.layer : b.layer;
  const args = { canvas: a.makeCanvas(), context: a.context, allCells: true };
  a.graphic.drawFrame(args);
  a.editor.layers.getSelectedLayerId = () => "b";
  a.graphic.drawFrame(args);
  a.editor.layers.getSelectedLayerId = () => "a";
  a.graphic.drawFrame(args);
  assert.equal(a.calls.length, 1);
  assert.equal(b.calls.length, 1);
});

test("frame wraparound, replacement, onion toggle and one-frame documents", () => {
  const f = fixture();
  const args = { canvas: f.makeCanvas(), context: f.context, allCells: true };
  f.graphic.drawFrame(args);
  args.frame = 0;
  f.graphic.drawFrame(args);
  assert.equal(f.calls.at(-1).frame, 1);
  f.layer.frames[1] = structuredClone(f.layer.frames[1]);
  f.graphic.drawFrame(args);
  assert.equal(f.calls.length, 3);
  args.drawPreviousFrame = false;
  f.graphic.drawFrame(args);
  args.drawPreviousFrame = true;
  f.graphic.drawFrame(args);
  assert.equal(f.calls.length, 3);
  f.graphic.frameCount = 1;
  f.graphic.frames.length = 1;
  f.graphic.drawFrame(args);
  assert.equal(f.calls.length, 3, "a single frame has no onion skin");
});

test("moving a current-frame selection does not erase the previous-frame raster", () => {
  const f = fixture();
  f.draw();
  const pixels = f.context.pixels.slice();
  assert.ok(pixels.some(Boolean));
  f.editor.tools.drawTools.select.isActive = () => true;
  f.editor.tools.drawTools.select.isMovingSelectionContents = () => true;
  f.layer.invalidatePrevFrame();
  f.draw();
  assert.deepEqual(f.context.pixels, pixels);
});
