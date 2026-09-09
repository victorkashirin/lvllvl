import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function previewFixture() {
  const instances = [];
  const UI = {
    devicePixelRatio: 1.25,
    showDialog() {},
    GlyphPreview: function(canvas) {
      this.canvas = canvas;
      this.resizes = [];
      this.tiles = [];
      this.bitmaps = [];
      this.resize = (width, height) => this.resizes.push({ width, height });
      this.drawTile = (args) => this.tiles.push(args);
      this.drawBitmap = (args) => this.bitmaps.push(args);
      this.clear = () => {};
      this.dispose = () => {};
      instances.push(this);
    },
  };
  return { UI, instances };
}

function canvasFixture(width = 0, height = 0) {
  const context = {
    setTransform() {},
    clearRect() {},
    fillRect() {},
  };
  return { width, height, style: {}, getContext: () => context };
}

test("info and replace-character hosts delegate preview sizing and tile state", () => {
  const infoCanvas = canvasFixture();
  const replaceCanvas = canvasFixture();
  const replaceWithCanvas = canvasFixture();
  const tileSet = {
    getTileWidth: () => 8,
    getTileHeight: () => 8,
  };
  const { UI, instances } = previewFixture();
  const html = { html() {}, on() {} };
  const sandbox = vm.createContext({
    UI,
    document: {
      getElementById(id) {
        if(id === "infoCharacterCanvas") return infoCanvas;
        if(id === "replaceCharacterCanvas") return replaceCanvas;
        return replaceWithCanvas;
      },
    },
    $: () => html,
    g_app: { doc: {}, projectGeneration: 1, isCurrentProject: () => true },
  });
  vm.runInContext(readSource("../src/js/textMode/info.js"), sandbox);
  vm.runInContext(readSource("../src/js/textMode/tools/replaceCharacter.js"), sandbox);
  const editor = {
    tileSetManager: { getCurrentTileSet: () => tileSet },
    currentTile: { getCharacters: () => [[4]] },
  };

  const info = new sandbox.Info();
  info.init(editor);
  info.characterCanvas = infoCanvas;
  info.initContent();
  info.setCharacter(5);
  assert.deepEqual(instances[0].resizes, [{ width: 16, height: 16 }]);
  assert.equal(instances[0].tiles[0].tileSet, tileSet);
  assert.equal(instances[0].tiles[0].character, 5);

  const replace = new sandbox.ReplaceCharacterDialog();
  replace.init(editor);
  replace.projectDocument = sandbox.g_app.doc;
  replace.projectGeneration = 1;
  replace.initContent();
  assert.deepEqual(instances[1].resizes, [{ width: 16, height: 16 }]);
  assert.deepEqual(instances[2].resizes, [{ width: 16, height: 16 }]);
  assert.equal(instances[1].tiles.at(-1).character, 4);
  assert.equal(instances[2].tiles.at(-1).character, 4);

  replace.uiComponent = {};
  replace.resetProjectState();
  replace.show();
  assert.equal(instances.length, 5, "reopening after a project reset recreates both previews");
  assert.equal(instances[3].tiles.at(-1).character, 4);
  assert.equal(instances[4].tiles.at(-1).character, 4);
});

test("mobile PNG preview delegates display rendering without resizing its export raster", () => {
  const previewCanvas = canvasFixture();
  const exportCanvas = canvasFixture(13, 11);
  const { UI, instances } = previewFixture();
  const sandbox = vm.createContext({
    UI,
    document: { getElementById: () => previewCanvas },
  });
  vm.runInContext(readSource("../src/js/textMode/export/exportPngMobile.js"), sandbox);
  const exporter = new sandbox.ExportPngMobile();
  exporter.editor = { graphic: { getCurrentFrame: () => 0 } };
  exporter.previewCanvas = previewCanvas;
  exporter.canvas = exportCanvas;
  exporter.previewOffsetX = -6.5;
  exporter.previewOffsetY = -5.5;
  exporter.previewScale = 2;

  exporter.resizePreview();
  assert.deepEqual(instances[0].resizes, [{ width: 320, height: 200 }]);
  assert.equal(instances[0].bitmaps[0].sourceCanvas, exportCanvas);
  assert.deepEqual({ ...instances[0].bitmaps[0].destinationCss }, {
    x: 146,
    y: 88,
    width: 26,
    height: 22,
  });
  assert.equal(exportCanvas.width, 13);
  assert.equal(exportCanvas.height, 11);
});

test("desktop current-tile canvas uses GlyphPreview at its panel CSS size", () => {
  const canvas = canvasFixture();
  canvas.addEventListener = () => {};
  const { UI, instances } = previewFixture();
  const sandbox = vm.createContext({
    UI,
    THREE: { Color: function() {} },
    document: { getElementById: () => null },
    $: () => ({ on() {} }),
  });
  vm.runInContext(readSource("../src/js/textMode/currentTile.js"), sandbox);

  const current = new sandbox.CurrentTile();
  current.canvasPanel = {
    getCanvas: () => canvas,
    getSurfaceMetrics: () => ({ cssWidth: 101, cssHeight: 51 }),
  };
  current.setDeviceType("desktop");

  assert.equal(current.canvasGlyphPreview.canvas, canvas);
  assert.deepEqual(instances[0].resizes, [{ width: 101, height: 51 }]);
});
