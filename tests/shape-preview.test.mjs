import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function fixture(width = 40, height = 25) {
  const pending = new Map();
  let request = 0;
  let fill = false;
  const sandbox = vm.createContext({
    requestAnimationFrame: (fn) => { pending.set(++request, fn); return request; },
    cancelAnimationFrame: (id) => pending.delete(id),
    TextModeEditor: { Mode: { VECTOR: "vector" } },
    g_app: { isMobile: () => false },
    $: (selector) => ({ is: () => selector === "#shapeFill" && fill }),
    document: { createElement: () => ({ width: 0, height: 0 }) },
  });
  for (const file of ["tools/shapes.js", "grid2d.js", "gridView2d.js"]) {
    vm.runInContext(readFileSync(new URL(`../src/js/textMode/${file}`, import.meta.url), "utf8"), sandbox);
  }
  const draws = [], commits = [], rasters = [];
  const layer = {
    getType: () => "grid", getMode: () => "bitmap",
    getGridWidth: () => width, getGridHeight: () => height,
    getCellWidth: () => 8, getCellHeight: () => 8,
    getCell: () => ({ t: 3, fc: 2, bc: -1 }),
    getBlockModeEnabled: () => false,
    getTileSet: () => tileSet,
    updatedCellRanges: { minX: width, minY: height, maxX: 0, maxY: 0 },
    setCell(args) {
      commits.push({ ...args });
      this.updatedCellRanges = shapes.unionBounds(this.updatedCellRanges, {
        minX: args.x, minY: args.y, maxX: args.x + 1, maxY: args.y + 1,
      });
    },
    draw: (args) => rasters.push(args), drawVector: (args) => rasters.push({ ...args }),
  };
  const tileSet = {
    getType: () => "petscii", getTileWidth: () => 8, getTileHeight: () => 8,
    getHFlip: (t) => t + 10, getVFlip: (t) => t + 20,
  };
  const editor = {
    layers: { getSelectedLayerObject: () => layer, getSelectedLayerType: () => "grid", updateAllLayerPreviews() {} },
    currentTile: { character: 1, getCharacters: () => [[1]], color: 1, bgColor: -1,
      rotX: 0, rotY: 0, rotZ: 1, flipH: 0, flipV: 1 },
    tileSetManager: { blankCharacter: 0, getCurrentTileSet: () => tileSet },
    colorPaletteManager: { noColor: -1, getCurrentColorPalette: () => ({}) },
    grid: { xyPosition: 0, setCursorEnabled() {} },
    graphic: { getHasTileFlip: () => true, redraw: (args) => draws.push(args),
      invalidateAllCells: () => assert.fail("preview must not invalidate artwork") },
    gridView2d: { draw: (args) => draws.push(args) },
    tools: { drawTools: { drawCharacter: true, drawColor: true, drawBgColor: true } },
    history: { startEntry() {}, endEntry() {} },
  };
  const shapes = new sandbox.Shapes();
  shapes.editor = editor;
  editor.tools.drawTools.shapes = shapes;
  // The 3D mesh hook is inactive in 2D; avoid unrelated palette setup here.
  shapes.addCharacter = () => true;
  editor.grid.grid2d = new sandbox.Grid2d();
  editor.grid.grid2d.editor = editor;
  const tick = () => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach((fn) => fn()); };
  return { shapes, layer, editor, pending, tick, draws, commits, rasters,
    setFill: (value) => { fill = value; },
    release: (cell) => sandbox.GridView2d.prototype.toolEnd.call({ editor, setMouseCursor() {} }, cell, {}),
  };
}

for (const tool of ["rect", "line", "oval"]) {
  test(`${tool}: sparse cells, coalesced bounds and lossless release before RAF`, () => {
    const f = fixture(100000, 100000);
    f.shapes.startShape(tool, 10, 10, 0);
    f.shapes.setShapeTo(14, 13, 0);
    f.shapes.setShapeTo(12, 11, 0);
    assert.equal(f.draws.length, 0);
    assert.equal(f.pending.size, 1);
    assert.ok(f.shapes.touchedCells.length <= 6);
    assert.ok(Object.keys(f.shapes.grid).length <= 2);
    f.tick();
    assert.equal(f.draws.length, 1);
    assert.deepEqual({ ...f.draws[0].dirtyCells }, { minX: 10, minY: 10, maxX: 15, maxY: 14 });
    f.shapes.setShapeTo(13, 12, 0);
    const expected = f.shapes.touchedCells.map(({ x, y }) => ({ x, y, ...f.shapes.grid[y][x] }))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    f.shapes.endShape();
    assert.equal(f.pending.size, 0);
    assert.equal(f.shapes.shape, false);
    assert.equal(f.commits.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
      for (const key of Object.keys(expected[i])) assert.equal(f.commits[i][key], expected[i][key], key);
    }
    f.tick();
    assert.equal(f.draws.length, 2);
  });
}

test("pointer release includes a new final endpoint even before the scheduled preview", () => {
  const f = fixture();
  f.editor.tools.drawTools.tool = "rect";
  f.shapes.startShape("rect", 2, 3, 0);
  f.shapes.setShapeTo(3, 4, 0);
  f.release({ x: 5, y: 6, z: 0 });
  assert.ok(f.commits.some(({ x, y }) => x === 5 && y === 6));
  assert.equal(f.pending.size, 0);
  assert.equal(f.draws.length, 1);
});

for (const tool of ["rect", "oval"]) {
  test(`${tool}: filled shapes retain interior cells without duplicate commits`, () => {
    const f = fixture();
    f.setFill(true);
    f.shapes.startShape(tool, 10, 10, 0);
    f.shapes.setShapeTo(14, 14, 0);
    assert.equal(f.shapes.grid[12][12].t, 1);
    const count = f.shapes.touchedCells.length;
    f.shapes.endShape();
    assert.equal(f.commits.length, count);
    assert.equal(new Set(f.commits.map(({ x, y }) => `${x},${y}`)).size, count);
  });
}

test("cancel erases presented and pending bounds, with no commit or late callback", () => {
  const f = fixture();
  f.shapes.startShape("rect", 2, 3, 0);
  f.shapes.setShapeTo(6, 7, 0);
  f.tick();
  f.shapes.setShapeTo(3, 4, 0);
  f.shapes.cancelShape();
  assert.equal(f.pending.size, 0);
  assert.equal(f.commits.length, 0);
  assert.equal(f.shapes.touchedCells.length, 0);
  assert.deepEqual({ ...f.draws.at(-1).dirtyCells }, { minX: 2, minY: 3, maxX: 7, maxY: 8 });
});

test("single-cell preview honors disabled character/color channels", () => {
  const f = fixture();
  Object.assign(f.editor.tools.drawTools, { drawCharacter: false, drawColor: false, drawBgColor: false });
  f.shapes.startShape("rect", 2, 3, 0);
  assert.deepEqual({ ...f.shapes.grid[3][2] }, { t: 3, fc: 2, bc: -1, rx: 0, ry: 0, rz: 1, fh: 0, fv: 1 });
});

test("mirrors preserve commit order, flip attributes, and dirty all committed cells", () => {
  const f = fixture(20, 20);
  Object.assign(f.editor.tools.drawTools, { mirrorH: true, mirrorV: true, mirrorHX: 10, mirrorVY: 10 });
  f.shapes.startShape("line", 2, 3, 0);
  f.shapes.endShape();
  assert.deepEqual(f.commits.map(({ x, y, fh, fv }) => [x, y, fh, fv]), [
    [2, 3, 0, 1], [17, 3, 1, 1], [17, 16, 1, 0], [2, 16, 0, 0],
  ]);
  assert.deepEqual({ ...f.draws.at(-1).dirtyCells }, { minX: 2, minY: 3, maxX: 18, maxY: 17 });
});

for (const vector of [false, true]) {
  test(`${vector ? "vector" : "bitmap"}: scratch raster is bounded by shape and visible cells`, () => {
    const f = fixture(100000, 100000);
    f.layer.getMode = () => vector ? "vector" : "bitmap";
    f.shapes.startShape("rect", 10, 10, 0);
    f.shapes.setShapeTo(13, 13, 0);
    const args = { srcX: 12 * 8, srcY: 12 * 8, srcWidth: 80, srcHeight: 80, scale: 2.25 };
    const preview = f.shapes.drawPreview(f.layer, args);
    const pixels = (vector ? 3 * 2.25 : 2) * 8;
    assert.equal(preview.width, pixels);
    assert.equal(preview.height, pixels);
    assert.equal(preview.canvas.width, vector ? 80 * 2.25 : pixels);
    assert.equal(preview.canvas.height, vector ? 80 * 2.25 : pixels);
    assert.equal(preview.x, 12 * 8);
    const count = f.rasters.length;
    assert.equal(f.shapes.drawPreview(f.layer, { ...args, srcX: 1000 }), false);
    assert.equal(f.rasters.length, count);
    assert.equal(f.shapes.drawPreview({}, args), false, "do not preview in a different layer");
  });
}

test("offscreen bitmap commits no longer force a full artwork redraw for thumbnails", () => {
  const f = fixture(320, 200);
  Object.assign(f.layer, { viewMinX: 150, viewMinY: 90, viewMaxX: 170, viewMaxY: 110 });
  f.shapes.startShape("rect", 160, 100, 0);
  f.shapes.setShapeTo(180, 115, 0);
  f.tick();
  assert.equal(f.draws[0].allCells, undefined, "preview stays bounded");
  f.shapes.endShape();
  assert.equal(f.draws.at(-1).allCells, undefined, "thumbnail flush owns its offscreen rendering");
  assert.equal(f.draws.at(-1).dirtyCells.maxX, 181);
});

test("switching layers while dragging cancels rather than committing to the new layer", () => {
  const f = fixture();
  f.shapes.startShape("rect", 2, 3, 0);
  f.editor.layers.getSelectedLayerObject = () => ({ getType: () => "grid" });
  f.shapes.endShape();
  assert.equal(f.commits.length, 0);
  assert.equal(f.pending.size, 0);
});
