import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function canvasFixture() {
  const fillRects = [];
  const context = {
    setTransform() {},
    clearRect() {},
    beginPath() {},
    fill() {},
    fillRect(...args) { fillRects.push(args); },
    fillText() {},
    lineTo() {},
    measureText: () => ({ width: 8 }),
    moveTo() {},
    rect() {},
    stroke() {},
    getImageData(x, y, width, height) {
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => context,
    addEventListener() {},
  };
  context.canvas = canvas;
  return { canvas, context, fillRects };
}

function uiFixture(pixelRatio) {
  const listeners = [];
  const UI = {
    devicePixelRatio: pixelRatio,
    onDevicePixelRatioChange(listener) {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
    getContextNoSmoothing: (canvas) => canvas.getContext("2d"),
    CanvasSurface: function(canvas) {
      let metrics = null;
      this.resize = ({ cssWidth, cssHeight }) => {
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        canvas.width = Math.round(cssWidth * UI.devicePixelRatio);
        canvas.height = Math.round(cssHeight * UI.devicePixelRatio);
        metrics = { cssWidth, cssHeight, pixelRatio: UI.devicePixelRatio,
          backingWidth: canvas.width, backingHeight: canvas.height };
        return metrics;
      };
      this.getMetrics = () => metrics;
      this.getBackingContext = () => canvas.getContext("2d");
      this.getLogicalContext = () => canvas.getContext("2d");
      this.setCanvas = () => {};
    },
  };
  UI.pixelRatioListeners = listeners;
  return UI;
}

test("C64 debugger hit testing remains in CSS space at fractional DPR", () => {
  for(const fixture of [
    { path: "../src/js/debugger/dbgC64CharEditor.js", name: "DbgC64CharEditor", prefix: "Char", height: 150 },
    { path: "../src/js/debugger/dbgC64SpriteEditor.js", name: "DbgC64SpriteEditor", prefix: "Sprite", height: 142 },
  ]) {
    const { canvas } = canvasFixture();
    const UI = uiFixture(1.25);
    const element = { offset: () => ({ left: 0, top: 0 }), width: () => 100, height: () => fixture.height };
    const sandbox = vm.createContext({ UI, $: () => element });
    vm.runInContext(readSource(fixture.path), sandbox);
    const editor = new sandbox[fixture.name]();
    editor.prefix = "test";
    editor.canvas = canvas;
    editor.draw = () => {};
    editor.resize();

    assert.equal(canvas.width, 125);
    assert.equal(editor.canvasScale, 1.25);
    assert.equal(editor.cssScaleX, editor.scale * 100 / canvas.width);
    editor.mouseMove({ pageX: 10, pageY: 10 });
    assert.equal(editor.cursorPixelX, Math.floor(10 / editor.cssScaleX),
      `${fixture.prefix} editor maps CSS x independently of floored DPR`);
  }
});

test("palette and parameter graph displays use exact-DPR shared sizing", () => {
  for(const ratio of [1, 1.25, 1.5, 2, 2.5]) {
    {
      const { canvas } = canvasFixture();
      const UI = uiFixture(ratio);
      const sandbox = vm.createContext({ UI });
      vm.runInContext(readSource("../src/js/textMode/color/colorPaletteDisplay.js"), sandbox);
      const palette = new sandbox.ColorPaletteDisplay();
      palette.canvas = canvas;
      palette.colorMap = [[0, 1, 2]];
      palette.setup();
      assert.equal(canvas.width, Math.round(64 * ratio));
      assert.equal(canvas.height, Math.round(22 * ratio));
      assert.equal(palette.getWidth(), 64);
      assert.equal(palette.fitToWidth(0), false,
        "hidden palette layouts retain their last valid surface");
      assert.equal(canvas.width, Math.round(64 * ratio));
      assert.equal(palette.colorWidth, 20);
    }

    {
      const { canvas } = canvasFixture();
      const UI = uiFixture(ratio);
      const sandbox = vm.createContext({ UI });
      vm.runInContext(readSource("../src/js/utils/paramGraph.js"), sandbox);
      const graph = new sandbox.ParamGraph();
      graph.canvas = canvas;
      graph.setup();
      assert.equal(canvas.width, Math.round(300 * ratio));
      assert.equal(canvas.height, Math.round(300 * ratio));
    }
  }
});

test("debugger charset and tile materials resize in logical pixels after DPR changes", () => {
  {
    const main = canvasFixture();
    const palette = canvasFixture();
    const UI = uiFixture(1.5);
    const sandbox = vm.createContext({
      UI,
      DbgC64CharEditor: function() { this.init = () => {}; },
    });
    vm.runInContext(readSource("../src/js/debugger/dbgCharset.js"), sandbox);
    const charset = new sandbox.DbgCharset();
    charset.init({ debugger: {}, machine: {}, prefix: "" });
    charset.canvas = main.canvas;
    charset.colorPaletteCanvas = palette.canvas;
    charset.visible = false;
    charset.resizeCanvas();
    assert.equal(main.canvas.width, 384);
    assert.equal(palette.canvas.width, 384);

    UI.devicePixelRatio = 1.25;
    UI.pixelRatioListeners[0]();
    assert.equal(main.canvas.width, 320);
    assert.equal(palette.canvas.width, 320);
  }

  {
    const { canvas, fillRects } = canvasFixture();
    const UI = uiFixture(1.5);
    const tileSet = { getTileMaterial: () => -1 };
    const editor = {
      currentTile: { getTiles: () => [[]], useCells: false },
      tileSetManager: { getCurrentTileSet: () => tileSet, noTile: -1 },
    };
    const sandbox = vm.createContext({ UI });
    vm.runInContext(readSource("../src/js/textMode/tileSet/tileMaterials.js"), sandbox);
    const materials = new sandbox.TileMaterials();
    materials.init(editor, "");
    materials.tileMaterialsCanvas = canvas;
    materials.drawTileMaterials();
    assert.equal(canvas.width, 206);
    assert.equal(canvas.height, 53);
    assert.deepEqual(fillRects[0], [0, 0, 137, 35]);
    assert.deepEqual(fillRects[1], [1, 1, 16, 16]);

    UI.devicePixelRatio = 1.25;
    UI.pixelRatioListeners[0]();
    assert.equal(canvas.width, 171);
    assert.equal(canvas.height, 44);
  }
});

test("color-edit image sampling maps CSS points onto the rounded backing store", () => {
  const { canvas } = canvasFixture();
  const UI = uiFixture(1.25);
  const sandbox = vm.createContext({ UI });
  vm.runInContext(readSource("../src/js/textMode/color/colorPaletteEdit.js"), sandbox);
  const edit = new sandbox.ColorPaletteEdit();
  edit.imageSurface = new UI.CanvasSurface(canvas);
  edit.imageSurface.resize({ cssWidth: 2, cssHeight: 1 });
  edit.imageData = { width: 3, data: new Uint8ClampedArray(12) };
  edit.imageData.data.set([18, 52, 86, 255], 8);
  assert.equal(edit.xyToImageColor(1.9, 0.5), 0x123456);
  assert.equal(edit.xyToImageColor(2, 0.5), false);
});

test("GIF previews resize and repaint only while their dialogs are active", () => {
  for(const fixture of [
    { path: "../src/js/textMode/export/exportGif.js", name: "ExportGif", hasEffects: true },
    { path: "../src/js/textMode/export3d/export3dGif.js", name: "Export3dGif", hasEffects: false },
  ]) {
    let ratioListener = null;
    const previewContext = {};
    const UI = {
      CanvasPreview: function(_canvas, _holder, onRatioChange) {
        ratioListener = onRatioChange;
        this.resize = () => ({
          left: 0,
          top: 0,
          width: 100,
          height: 80,
          metrics: { pixelRatio: 1.25 },
        });
        this.getBackingContext = () => previewContext;
      },
    };
    const sandbox = vm.createContext({
      UI,
      ImageShaderEffects: function() { this.init = () => {}; },
      document: { getElementById: () => ({}) },
      $: () => ({ on() {} }),
    });
    vm.runInContext(readSource(fixture.path), sandbox);
    const exporter = new sandbox[fixture.name]();
    exporter.init({});
    exporter.visible = true;
    exporter.resizePreview();

    let resizeCount = 0;
    let drawArgs = null;
    exporter.resizePreview = () => { resizeCount++; };
    exporter.drawFrame = (args) => { drawArgs = args; };

    ratioListener();
    assert.equal(resizeCount, 0, `${fixture.name} ignores DPR changes while closed`);
    assert.equal(drawArgs, null);

    exporter.exportGifActive = true;
    ratioListener();
    assert.equal(resizeCount, 1, `${fixture.name} resizes its active preview`);
    assert.equal(drawArgs.redrawLayers, false, `${fixture.name} reuses its rendered frame`);
    if(fixture.hasEffects) {
      assert.equal(drawArgs.applyEffects, false, `${fixture.name} avoids reapplying preview effects`);
    }
  }
});

test("palette wrappers measure logical content rather than canvas backing dimensions", () => {
  for(const path of [
    "../src/js/textMode/tileSet/tilePickerPopup.js",
    "../src/js/textMode/tileSet/chooseCharactersDialog.js",
  ]) {
    const source = readSource(path);
    assert.match(source, /tilePaletteDisplay\.getContentDimensions\(\)/,
      `${path} sizes its container from logical palette content`);
    assert.doesNotMatch(source, /tilePaletteDisplay\.get(?:Width|Height)\(\)/,
      `${path} does not size its container from the shared canvas backing store`);
  }
});

test("Phase 4 display hosts delegate sizing and leave no floored pointer scaling", () => {
  const hosts = [
    "../src/js/textMode/color/colorPaletteEdit.js",
    "../src/js/debugger/dbgCharset.js",
    "../src/js/textMode/frames/frameTimeline.js",
    "../src/js/textMode/tileSet/tilePaletteDisplay.js",
    "../src/js/textMode/tileSet/tilePaletteEditor.js",
    "../src/js/textMode/tileSet/tileMaterials.js",
    "../src/js/textMode/tileSet/tilePickerPopup.js",
    "../src/js/textMode/tileSet/chooseCharactersDialog.js",
    "../src/js/textMode/tools/tilePalette.js",
    "../src/js/textMode/currentTile.js",
    "../src/js/textMode/blockSet/blockEditor.js",
    "../src/js/textMode/export/exportPng.js",
    "../src/js/textMode/export/exportGif.js",
    "../src/js/textMode/export/exportImage.js",
    "../src/js/textMode/export/exportSpritePng.js",
    "../src/js/textMode/export3d/export3dGif.js",
  ];
  for(const path of hosts) {
    assert.match(readSource(path), /new UI\.(?:CanvasPreview|CanvasSurface|GlyphPreview)\(/,
      `${path} uses shared display sizing`);
  }

  const debuggerSource = readSource("../src/js/debugger/dbgC64CharEditor.js")
    + readSource("../src/js/debugger/dbgC64SpriteEditor.js");
  assert.doesNotMatch(debuggerSource, /Math\.floor\(UI\.devicePixelRatio\)/);
  assert.doesNotMatch(debuggerSource, /[xy]\s*=\s*[xy]\s*\*\s*this\.canvasScale/);
  const tilePaletteSource = readSource("../src/js/textMode/tools/tilePalette.js");
  assert.doesNotMatch(tilePaletteSource, /this\.canvas\.(?:width|height)\s*=/,
    "the main palette leaves its display canvas backing size to CanvasSurface");
  assert.doesNotMatch(readSource("../src/js/textMode/tools/clearHiddenTiles.js"), /devicePixelRatio/);
});
