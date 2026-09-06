import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const sandbox = vm.createContext({
  HTMLCanvasElement: { prototype: { toBlob() {} } },
  TextModeEditor: { Mode: {
    VECTOR: "vector", TEXTMODE: "textmode", C64ECM: "c64ecm",
    C64MULTICOLOR: "c64multicolor", NES: "nes"
  } },
  g_app: { openingProject: true, getMode: () => "2d" },
});
for (const file of [
  "layers/layerGrid.js", "graphic.js", "tileSet/tileSet.js", "tools/pixelDraw.js", "api/graphicApi.js",
]) {
  vm.runInContext(
    readFileSync(new URL(`../src/js/textMode/${file}`, import.meta.url), "utf8"),
    sandbox
  );
}

function makeTileSet() {
  return {
    renderRevision: 0, tileData: [], currentTileData: [], vectorData: [],
    getTileWidth: () => 8, getTileHeight: () => 8,
  };
}

function makeLayer(editor, id, tileSet, rows, { mode = "textmode", frames } = {}) {
  const layer = new sandbox.LayerGrid();
  layer.editor = editor;
  layer.layerId = id;
  layer.mode = mode;
  layer.currentFrame = frames ? frames.length - 1 : 0;
  layer.frames = frames || [{ data: rows }];
  layer.frameCount = layer.frames.length;
  layer.doc = {
    gridWidth: rows[0].length, gridHeight: rows.length,
    cellWidth: 8, cellHeight: 8, blockMode: false,
    blockWidth: 1, blockHeight: 1, screenMode: mode,
    hasTileFlip: false, hasTileRotate: false, transparentColorIndex: 0,
  };
  const palette = { renderRevision: 0, colors: [] };
  layer.getTileSet = () => tileSet;
  layer.getColorPalette = () => palette;
  layer.getBlockSet = () => null;
  layer.updatedCellRanges = {
    minX: layer.doc.gridWidth, minY: layer.doc.gridHeight, maxX: 0, maxY: 0,
  };
  return layer;
}

function fixture() {
  const tileSet = makeTileSet();
  const otherTileSet = makeTileSet();
  const editor = {
    frames: { getShowPrevFrame: () => false },
    currentTile: { color: 1 },
    colorPaletteManager: { noColor: -1, colorSubPalettes: { subPalettes: [] } },
    layers: { layers: [], isBackgroundVisible: () => true, requestLayerPreviewUpdate() {} },
  };
  const graphic = new sandbox.Graphic();
  graphic.editor = editor;
  graphic.type = "screen";
  editor.graphic = graphic;
  const layers = {
    a: makeLayer(editor, "a", tileSet, [
      [{ t: 1 }, { t: 1 }, { t: 1 }],
      [{ t: 1 }, { t: 5 }, { t: 1 }],
    ]),
    b: makeLayer(editor, "b", tileSet, [
      [{ t: 1 }, { t: 1 }, { t: 1 }],
      [{ t: 1 }, { t: 6 }, { t: 1 }],
    ]),
    c: makeLayer(editor, "c", otherTileSet, [
      [{ t: 5 }, { t: 5 }, { t: 5 }],
      [{ t: 5 }, { t: 5 }, { t: 5 }],
    ]),
  };
  editor.layers.layers = Object.keys(layers).map((id) => ({ layerId: id, type: "grid", visible: true }));
  editor.layers.getLayerObject = (id) => layers[id];
  editor.layers.getSelectedLayerId = () => "a";
  return { editor, graphic, tileSet, otherTileSet, layers };
}

test("unused tiles leave artwork, previews, and unrelated layers clean", () => {
  const f = fixture();
  const revisions = Object.values(f.layers).map((layer) => layer.previewRevision);
  assert.equal(f.graphic.invalidateTiles([99], f.tileSet), false);
  for (const [index, layer] of Object.values(f.layers).entries()) {
    assert.deepEqual({ ...layer.updatedCellRanges }, {
      minX: 3, minY: 2, maxX: 0, maxY: 0,
    });
    assert.equal(layer.previewRevision, revisions[index]);
  }
});

test("a used tile invalidates only its layer and returns artwork pixel bounds", () => {
  const f = fixture();
  const damage = f.graphic.invalidateTiles([5], f.tileSet);
  assert.deepEqual(
    { minX: damage.minX, minY: damage.minY, maxX: damage.maxX, maxY: damage.maxY },
    { minX: 8, minY: 8, maxX: 16, maxY: 16 });
  assert.deepEqual(Array.from(damage.regions, (region) => ({ ...region })), [
    { minX: 8, minY: 8, maxX: 16, maxY: 16 },
  ]);
  assert.deepEqual({ ...f.layers.a.updatedCellRanges }, {
    minX: 3, minY: 2, maxX: 0, maxY: 0,
  });
  assert.deepEqual(Array.from(f.layers.a.getTileDirtyRegions(), (region) => ({ ...region })), [
    { minX: 1, minY: 1, maxX: 2, maxY: 2 },
  ]);
  assert.deepEqual({ ...f.layers.b.updatedCellRanges }, {
    minX: 3, minY: 2, maxX: 0, maxY: 0,
  });
  assert.deepEqual({ ...f.layers.c.updatedCellRanges }, {
    minX: 3, minY: 2, maxX: 0, maxY: 0,
  });
  assert.equal(f.layers.a.previewRevision, 1);
  assert.equal(f.layers.b.previewRevision, 0);
  assert.equal(f.layers.c.previewRevision, 0);
});

test("tile usage is cached per frame and rebuilt after cell data invalidation", () => {
  const f = fixture();
  let reads = 0;
  let tile = 5;
  Object.defineProperty(f.layers.a.frames[0].data[1][1], "t", {
    configurable: true,
    get: () => { reads++; return tile; },
    set: (value) => { tile = value; },
  });
  f.layers.a.getTileUsageBounds(0, [5]);
  const firstReads = reads;
  f.layers.a.getTileUsageBounds(0, [5]);
  assert.equal(reads, firstReads, "warm animation ticks must reuse the usage index");
  tile = 7;
  f.layers.a.invalidateTileUsage(0);
  assert.equal(f.layers.a.getTileUsageBounds(0, [5]), false);
  assert.deepEqual({ ...f.layers.a.getTileUsageBounds(0, [7]) }, {
    minX: 1, minY: 1, maxX: 2, maxY: 2,
  });
  assert.ok(reads > firstReads);
});

test("previous-frame tile use invalidates onion skin without dirtying the current raster", () => {
  const f = fixture();
  const layer = f.layers.a;
  layer.frames = [
    { data: [[{ t: 1 }, { t: 9 }, { t: 1 }], [{ t: 1 }, { t: 1 }, { t: 1 }]] },
    { data: [[{ t: 1 }, { t: 1 }, { t: 1 }], [{ t: 1 }, { t: 5 }, { t: 1 }]] },
  ];
  layer.frameCount = 2;
  layer.currentFrame = 1;
  f.editor.frames.getShowPrevFrame = () => true;
  const canvas = { width: 24, height: 16 };
  layer.prevFrameCache = {
    frame: layer.frames[0], canvas, width: 24, height: 16,
    state: layer.getFrameRenderState(0, true), offset: { offsetX: 0, offsetY: 0 },
  };
  const damage = f.graphic.invalidateTiles([9], f.tileSet);
  assert.deepEqual({ minX: damage.minX, minY: damage.minY, maxX: damage.maxX, maxY: damage.maxY }, {
    minX: 8, minY: 0, maxX: 16, maxY: 8,
  });
  assert.ok(layer.prevFrameCache, "the existing onion raster remains patchable");
  const patches = [];
  layer.draw = (args) => { patches.push(args); return { offsetX: 0, offsetY: 0 }; };
  layer.drawPrevFrame({ canvas, frame: 0, drawBackground: true });
  assert.equal(patches.length, 1);
  assert.deepEqual({
    allCells: patches[0].allCells,
    fromX: patches[0].fromX, fromY: patches[0].fromY,
    toX: patches[0].toX, toY: patches[0].toY,
  }, { allCells: false, fromX: 1, fromY: 0, toX: 2, toY: 1 });
  assert.equal(layer.prevFrameDirtyRegions.length, 0);
  assert.deepEqual({ ...layer.updatedCellRanges }, {
    minX: 3, minY: 2, maxX: 0, maxY: 0,
  });
  assert.equal(layer.previewRevision, 0, "the current-frame thumbnail is unrelated");
});

test("usage resolves C64 ECM glyph banks and block characters", () => {
  const f = fixture();
  const ecm = f.layers.a;
  ecm.mode = sandbox.TextModeEditor.Mode.C64ECM;
  ecm.frames[0].data = [[{ t: 0 }, { t: 64 }, { t: 1 }], [{ t: 256 }, { t: 320 }, { t: 2 }]];
  ecm.invalidateTileUsage();
  assert.deepEqual({ ...ecm.getTileUsageBounds(0, [0]) }, {
    minX: 0, minY: 0, maxX: 2, maxY: 1,
  });
  assert.deepEqual({ ...ecm.getTileUsageBounds(0, [256]) }, {
    minX: 0, minY: 1, maxX: 2, maxY: 2,
  });

  const blockSet = {
    renderRevision: 0,
    getCharacterInBlock: (block, x) => block * 10 + x,
  };
  ecm.mode = "textmode";
  ecm.doc.blockMode = true;
  ecm.frames[0].data = [[{ b: 2 }, { b: 2 }, { b: 3 }], [{ b: 4 }, { b: 4 }, { b: 4 }]];
  ecm.getBlockSet = () => blockSet;
  ecm.getXOffsetInBlock = (x) => x % 2;
  ecm.getYOffsetInBlock = () => 0;
  ecm.invalidateTileUsage();
  assert.deepEqual({ ...ecm.getTileUsageBounds(0, [21]) }, {
    minX: 1, minY: 0, maxX: 2, maxY: 1,
  });
  blockSet.getCharacterInBlock = () => 7;
  blockSet.renderRevision++;
  assert.equal(ecm.getTileUsageBounds(0, [21]), false, "block revisions rebuild the index");

  blockSet.getCharacterInBlock = (block, x) => x === 0 ? false : 9;
  ecm.blankTileId = 4;
  ecm.doc.blockWidth = 2;
  assert.deepEqual({ ...ecm.getTileUsageBounds(0, [9]) }, {
    minX: 1, minY: 0, maxX: 2, maxY: 2,
  });
  ecm.doc.blockWidth = 3;
  ecm.getXOffsetInBlock = (x) => x % ecm.doc.blockWidth;
  assert.deepEqual({ ...ecm.getTileUsageBounds(0, [9]) }, {
    minX: 1, minY: 0, maxX: 3, maxY: 2,
  }, "block dimensions participate in the usage cache key");
  ecm.setBlankTileId(6, false);
  assert.deepEqual({ ...ecm.getTileUsageBounds(0, [6]) }, {
    minX: 0, minY: 0, maxX: 1, maxY: 2,
  }, "blank-tile changes rebuild block fallbacks");

  blockSet.getCharacterInBlock = (block, x) => block * 10 + x;
  delete ecm.frames[0].data[0][0].b;
  ecm.invalidateTileUsage();
  assert.equal(ecm.getTileUsageBounds(0, [50]), false);
  ecm.initFrameBlocks(5);
  assert.deepEqual({ ...ecm.getTileUsageBounds(0, [50]) }, {
    minX: 0, minY: 0, maxX: 1, maxY: 1,
  }, "initializing missing block IDs invalidates a warm usage index");
});

test("disconnected tile uses remain separate dirty regions", () => {
  const f = fixture();
  f.layers.a.frames[0].data = [
    [{ t: 5 }, { t: 1 }, { t: 1 }],
    [{ t: 1 }, { t: 1 }, { t: 5 }],
  ];
  f.layers.a.invalidateTileUsage();
  const damage = f.graphic.invalidateTiles([5], f.tileSet);
  assert.deepEqual(Array.from(damage.regions, (region) => ({ ...region })), [
    { minX: 0, minY: 0, maxX: 8, maxY: 8 },
    { minX: 16, minY: 8, maxX: 24, maxY: 16 },
  ]);
  assert.deepEqual(Array.from(damage.layerRegions.a, (region) => ({ ...region })), [
    { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    { minX: 2, minY: 1, maxX: 3, maxY: 2 },
  ]);
});

test("overlapping layer damage is returned as one non-overlapping pixel union", () => {
  const f = fixture();
  f.layers.b.frames[0].data[1][1].t = 5;
  f.layers.b.invalidateTileUsage();
  const damage = f.graphic.invalidateTiles([5], f.tileSet);
  assert.deepEqual(Array.from(damage.regions, (region) => ({ ...region })), [
    { minX: 8, minY: 8, maxX: 16, maxY: 16 },
  ]);
  assert.deepEqual(Object.keys(damage.layerRegions).sort(), ["a", "b"]);
});

test("vector damage includes the same half-cell overhang as the layer raster", () => {
  const f = fixture();
  f.layers.a.mode = sandbox.TextModeEditor.Mode.VECTOR;
  const damage = f.graphic.invalidateTiles([5], f.tileSet);
  assert.deepEqual(Array.from(damage.regions, (region) => ({ ...region })), [
    { minX: 4, minY: 4, maxX: 20, maxY: 16 },
  ]);
});

test("hidden tile users schedule thumbnails without returning canvas damage", () => {
  const f = fixture();
  let previewRequests = 0;
  f.editor.layers.layers[0].visible = false;
  f.editor.layers.requestLayerPreviewUpdate = () => previewRequests++;
  assert.equal(f.graphic.invalidateTiles([5], f.tileSet), false);
  assert.equal(previewRequests, 1);
  assert.equal(f.layers.a.previewRevision, 1);
});

test("offscreen tile regions remain pending until their cells become visible", () => {
  const f = fixture();
  const layer = f.layers.a;
  layer.tileDirtyRegions = [{ minX: 0, minY: 0, maxX: 1, maxY: 1 }];
  Object.assign(layer, { viewMinX: 1, viewMinY: 0, viewMaxX: 3, viewMaxY: 2 });
  const draws = [];
  layer.draw = (args) => { draws.push(args); return { offsetX: 0, offsetY: 0 }; };
  layer.drawTileRegions({}, undefined, true);
  assert.equal(draws.length, 0);
  assert.equal(layer.tileDirtyRegions.length, 1);

  Object.assign(layer, { viewMinX: 0, viewMinY: 0, viewMaxX: 3, viewMaxY: 2 });
  layer.drawTileRegions({}, undefined, true);
  assert.equal(draws.length, 1);
  assert.equal(draws[0].partial, true);
  assert.equal(layer.tileDirtyRegions.length, 0);
});

test("pixel shape replacement publishes restored and new tiles in one selective batch", () => {
  const pixelDraw = new sandbox.PixelDraw();
  const publications = [];
  const tileSet = {
    restoreCharacterDataFor: (_copy, tiles) => assert.deepEqual([...tiles], [1, 2]),
    updateCharacterCurrentData() {},
    updateCharacters(tiles, selective) {
      publications.push({ tiles: [...tiles], selective });
      return false;
    },
  };
  pixelDraw.editor = {
    tileSetManager: { getCurrentTileSet: () => tileSet },
    graphic: { invalidateTiles() {}, redraw() {} },
  };
  pixelDraw.characterDataCopy = [];
  pixelDraw.alteredCharacters = [1, 2];
  pixelDraw.pendingCharacters = [];
  pixelDraw.restoredCharacters = [];
  pixelDraw.toolType = "line";
  pixelDraw.mouseDownAtX = pixelDraw.mouseDownAtY = 0;
  pixelDraw.drawLine = () => {
    pixelDraw.addToAlteredCharacters(3);
    pixelDraw.redrawAlteredTiles(tileSet);
  };
  pixelDraw.updateShape({}, { x: 1, y: 1 });
  assert.deepEqual(publications, [{ tiles: [3, 1, 2], selective: true }]);
  assert.deepEqual([...pixelDraw.pendingCharacters], []);
  assert.deepEqual([...pixelDraw.restoredCharacters], []);
  assert.deepEqual([...pixelDraw.alteredCharacters], [3]);
});

test("collapsing a provisional shape still publishes its restored tiles", () => {
  const pixelDraw = new sandbox.PixelDraw();
  const publications = [];
  const tileSet = {
    restoreCharacterDataFor: (_copy, tiles) => assert.deepEqual([...tiles], [1, 2]),
    updateCharacterCurrentData() {},
    updateCharacters(tiles, selective) {
      publications.push({ tiles: [...tiles], selective });
      return false;
    },
  };
  pixelDraw.editor = {
    tileSetManager: { getCurrentTileSet: () => tileSet },
    graphic: { invalidateTiles() {}, redraw() {} },
  };
  pixelDraw.characterDataCopy = [];
  pixelDraw.alteredCharacters = [1, 2];
  pixelDraw.pendingCharacters = [];
  pixelDraw.restoredCharacters = [];
  pixelDraw.toolType = "line";
  pixelDraw.mouseDownAtX = pixelDraw.mouseDownAtY = 0;
  pixelDraw.drawLine = () => {};
  pixelDraw.updateShape({}, { x: 0, y: 0 });
  assert.deepEqual(publications, [{ tiles: [1, 2], selective: true }]);
  assert.deepEqual([...pixelDraw.restoredCharacters], []);
});

test("pixel batches restore and publish canonical C64 ECM glyph IDs", () => {
  const pixelDraw = new sandbox.PixelDraw();
  const publications = [];
  const tileSet = {
    restoreCharacterDataFor: (_copy, tiles) => assert.deepEqual([...tiles], [1, 256]),
    updateCharacterCurrentData() {},
    updateCharacters(tiles, selective) {
      publications.push({ tiles: [...tiles], selective });
      return false;
    },
  };
  const layer = {
    getType: () => "grid",
    getScreenMode: () => sandbox.TextModeEditor.Mode.C64ECM,
  };
  pixelDraw.editor = {
    layers: { getSelectedLayerObject: () => layer },
    tileSetManager: { getCurrentTileSet: () => tileSet },
    graphic: { invalidateTiles() {}, redraw() {} },
  };
  pixelDraw.characterDataCopy = [];
  pixelDraw.addToAlteredCharacters(65);
  pixelDraw.addToAlteredCharacters(1);
  pixelDraw.addToAlteredCharacters(320);
  pixelDraw.pendingCharacters = [];
  pixelDraw.toolType = "line";
  pixelDraw.mouseDownAtX = pixelDraw.mouseDownAtY = 0;
  pixelDraw.drawLine = () => {};

  pixelDraw.updateShape({}, { x: 0, y: 0 });

  assert.deepEqual(publications, [{ tiles: [1, 256], selective: true }]);
  assert.deepEqual([...pixelDraw.alteredCharacters], []);
});

test("script frame completion invalidates tile usage after in-place cell edits", () => {
  const f = fixture();
  assert.deepEqual({ ...f.layers.a.getTileUsageBounds(0, [5]) }, {
    minX: 1, minY: 1, maxX: 2, maxY: 2,
  });
  f.layers.a.frames[0].data[1][1].t = 7;
  const redraws = [];
  f.editor.tileSetManager = { getCurrentTileSet: () => f.tileSet };
  f.editor.tools = { drawTools: { tilePalette: { drawTilePalette() {} } } };
  f.editor.sideTilePalette = { drawTilePalette() {} };
  f.graphic.redraw = (args) => redraws.push(args);
  const previousEditor = sandbox.g_app.textModeEditor;
  sandbox.g_app.textModeEditor = f.editor;
  sandbox.GraphicAPI.alteredTiles = [];
  try {
    sandbox.GraphicAPI.frameDone();
  } finally {
    sandbox.g_app.textModeEditor = previousEditor;
  }

  assert.equal(f.layers.a.getTileUsageBounds(0, [5]), false);
  assert.deepEqual({ ...f.layers.a.getTileUsageBounds(0, [7]) }, {
    minX: 1, minY: 1, maxX: 2, maxY: 2,
  });
  assert.deepEqual(redraws.map((args) => ({ ...args })), [{ allCells: true }]);
});

test("batched setPixel mutations do not advance the global render revision", () => {
  const tileSet = new sandbox.TileSet();
  tileSet.charWidth = tileSet.charHeight = 1;
  tileSet.tileData = [{ data: [[0]], props: { animated: false } }];
  tileSet.currentTileData = [[0]];
  tileSet.characterGeometries = [];
  tileSet.editor = {
    history: { addAction() {} },
    layers: { getSelectedLayerObject: () => ({
      getType: () => "grid", getScreenMode: () => "textmode",
    }) },
    tools: { drawTools: { tilePalette: { drawTilePalette() {} } } },
    sideTilePalette: { drawTilePalette() {} },
    graphic: { invalidateTiles: () => false },
  };
  assert.equal(tileSet.setPixel(0, 0, 0, 1, false), true);
  assert.equal(tileSet.renderRevision, 0);
  tileSet.updateCharacters([0], true);
  assert.equal(tileSet.renderRevision, 0);
  assert.equal(tileSet.tileRenderRevisions[0], 1,
    "selective consumers still receive a per-tile dependency revision");
});

test("tile publication deduplicates a multi-glyph batch before palette work", () => {
  const tileSet = new sandbox.TileSet();
  tileSet.characterGeometries = [];
  const paletteCalls = [];
  const invalidations = [];
  tileSet.editor = {
    tools: { drawTools: { tilePalette: {
      drawTilePalette: (args) => paletteCalls.push([...args.tiles]),
    } } },
    sideTilePalette: {
      drawTilePalette: (args) => paletteCalls.push([...args.tiles]),
    },
    graphic: {
      invalidateTiles(tiles) {
        invalidations.push([...tiles]);
        return false;
      },
    },
  };

  tileSet.updateCharacters([1, 2, 1, 2], true);

  assert.deepEqual(paletteCalls, [[1, 2], [1, 2]]);
  assert.deepEqual(invalidations, [[1, 2]]);
  assert.equal(tileSet.tileRenderRevisions[1], 1);
  assert.equal(tileSet.tileRenderRevisions[2], 1);
});

test("selective tile dependency revisions change only layers that use the tile", () => {
  const f = fixture();
  const beforeA = f.layers.a.getFrameRenderState(0, true);
  const beforeB = f.layers.b.getFrameRenderState(0, true);
  f.graphic.invalidateTiles([5], f.tileSet);
  const afterA = f.layers.a.getFrameRenderState(0, true);
  const afterB = f.layers.b.getFrameRenderState(0, true);
  assert.ok(beforeA.some((value, index) => value !== afterA[index]));
  assert.ok(beforeB.every((value, index) => value === afterB[index]));
});

test("animation batches changed tiles and skips artwork redraw when none are used", () => {
  const tileSet = new sandbox.TileSet();
  tileSet.tileData = [0, 1].map(() => ({
    data: [[0]], props: { animated: "blink", frame: 0, ticksPerFrame: 1 },
  }));
  tileSet.currentTileData = [[0], [0]];
  tileSet.charWidth = tileSet.charHeight = 1;
  tileSet.characterGeometries = [];
  const paletteCalls = [];
  const redraws = [];
  let brushDraws = 0;
  let invalidations = 0;
  let returnedDamage = false;
  tileSet.editor = {
    type: "2d",
    tools: { drawTools: { tilePalette: { drawTilePalette: (args) => paletteCalls.push(["bottom", args]) } } },
    sideTilePalette: { drawTilePalette: (args) => paletteCalls.push(["side", args]) },
    currentTile: { canvasDrawCharacters: () => brushDraws++ },
    graphic: {
      invalidateTiles(ids, source) {
        invalidations++;
        assert.equal(source, tileSet);
        assert.deepEqual([...ids], [0, 1]);
        return returnedDamage;
      },
      redraw: (args) => redraws.push(args),
    },
  };
  tileSet.invertPixels = (character, frame, publish) => {
    assert.equal(publish, false);
    tileSet.currentTileData[character][0] = frame;
  };

  assert.equal(tileSet.update(1), true);
  assert.equal(invalidations, 1);
  assert.equal(tileSet.renderRevision, 0, "selective ticks must preserve unrelated frame caches");
  assert.equal(brushDraws, 1);
  assert.equal(redraws.length, 0, "an unused animation must not redraw artwork");
  assert.equal(paletteCalls.length, 2);
  assert.deepEqual([...paletteCalls[0][1].tiles], [0, 1]);
  assert.deepEqual([...paletteCalls[1][1].tiles], [0, 1]);

  for (const tile of tileSet.tileData) tile.props.frame = 0;
  returnedDamage = { minX: 8, minY: 8, maxX: 16, maxY: 16 };
  assert.equal(tileSet.update(1), true);
  assert.equal(redraws.length, 1);
  assert.deepEqual({ ...redraws[0].dirtyPixels }, returnedDamage);
});
