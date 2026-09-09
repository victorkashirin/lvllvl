import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
function canvasFixture() {
  const canvas = { width: 0, height: 0, style: {}, addEventListener() {} };
  const context = {
    canvas,
    clearRect() {},
    drawImage() {},
    fillRect() {},
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    setTransform() {},
  };
  canvas.getContext = () => context;
  return { canvas, context };
}

function uiFixture(pixelRatio) {
  const listeners = [];
  const glyphPreviews = [];
  const UI = {
    devicePixelRatio: pixelRatio,
    onDevicePixelRatioChange(listener) {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
    getContextNoSmoothing: (canvas) => canvas.getContext("2d"),
    PixelArtBlitter: function() { this.draw = () => {}; },
    CanvasSurface: function(canvas) {
      let metrics = null;
      this.resize = ({ cssWidth, cssHeight, pixelRatio: ratio }) => {
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        canvas.width = Math.round(cssWidth * ratio);
        canvas.height = Math.round(cssHeight * ratio);
        metrics = { cssWidth, cssHeight, pixelRatio: ratio };
        return metrics;
      };
      this.isPixelRatioCurrent = () => metrics?.pixelRatio === UI.devicePixelRatio;
      this.getLogicalContext = (args = {}) => {
        const context = canvas.getContext("2d");
        if(args.noSmoothing) context.imageSmoothingEnabled = false;
        return context;
      };
    },
  };
  UI.GlyphPreview = function(canvas) {
    const surface = new UI.CanvasSurface(canvas);
    let size = null;
    this.canvas = canvas;
    this.resize = (width, height) => {
      size = { width, height };
      return surface.resize({ cssWidth: width, cssHeight: height, pixelRatio: UI.devicePixelRatio });
    };
    this.redraw = () => {};
    UI.onDevicePixelRatioChange(() => {
      if(size) this.resize(size.width, size.height);
      this.redraw();
    });
    glyphPreviews.push(this);
  };
  return { UI, listeners, glyphPreviews };
}

test("Phase 2 surfaces size their real display canvases at each required DPR", () => {
  for (const ratio of [1, 1.25, 1.5, 2, 2.5]) {
    {
      const { canvas } = canvasFixture();
      const { UI } = uiFixture(ratio);
      const holder = { offset: () => ({ left: 0, top: 0 }), width: () => 301, height: () => 117 };
      const sandbox = vm.createContext({ UI, document: { getElementById: () => canvas }, $: () => holder });
      vm.runInContext(readSource("../src/js/textMode/animationPreview.js"), sandbox);
      const preview = new sandbox.AnimationPreview();
      preview.canvasElementId = "preview";
      preview.canvasHolderElementId = "holder";
      assert.equal(preview.sizeCanvas(), true);
      assert.equal(canvas.width, Math.round(301 * ratio));
      assert.equal(canvas.height, Math.round(117 * ratio));
    }

    {
      const { canvas } = canvasFixture();
      const { UI } = uiFixture(ratio);
      const holder = { offset: () => ({ left: 0, top: 0 }), width: () => 321, height: () => 117 };
      const sandbox = vm.createContext({
        UI, styles: { ui: { scrollbarWidth: 12 } },
        document: { getElementById: () => canvas }, $: () => holder,
      });
      vm.runInContext(readSource("../src/js/textMode/frames/spriteFrames.js"), sandbox);
      const frames = new sandbox.SpriteFrames();
      assert.equal(frames.sizeCanvas(), true);
      assert.equal(canvas.width, Math.round(321 * ratio));
      assert.equal(canvas.height, Math.round(117 * ratio));
    }

    {
      const { canvas } = canvasFixture();
      const { UI } = uiFixture(ratio);
      const sandbox = vm.createContext({ UI });
      vm.runInContext(readSource("../src/js/textMode/tileSet/tileEditorGrid.js"), sandbox);
      const grid = new sandbox.TileEditorGrid();
      grid.canvas = canvas;
      grid.canvasSurface = new UI.CanvasSurface(canvas);
      grid.charWidth = 8;
      grid.charHeight = 8;
      grid.draw = () => {};
      assert.equal(grid.setSize(0, -20), false);
      assert.equal(grid.setSize(201, 151), true);
      assert.equal(canvas.width, Math.round(201 * ratio));
      assert.equal(canvas.height, Math.round(151 * ratio));
    }

    {
      const { canvas } = canvasFixture();
      const { canvas: renderCanvas } = canvasFixture();
      const { UI } = uiFixture(ratio);
      const holder = { width: () => 243 };
      const sandbox = vm.createContext({
        UI, $: () => holder,
        document: { createElement: () => renderCanvas, getElementById: () => canvas },
        TextModeEditor: { Mode: { VECTOR: "vector" } },
      });
      vm.runInContext(readSource("../src/js/textMode/tools/blockPalette.js"), sandbox);
      const palette = new sandbox.BlockPalette();
      palette.canvas = canvas;
      palette.editor = {
        blockSetManager: { getCurrentBlockSet: () => ({ getBlocks: () => [{ data: [[{}]] }] }) },
        tileSetManager: { getCurrentTileSet: () => ({ charWidth: 8, charHeight: 8 }) },
      };
      palette.canvasDimensions("text");
      assert.equal(canvas.width, Math.round(243 * ratio));
      assert.equal(canvas.height, Math.round(16 * ratio));
    }

    {
      const { canvas } = canvasFixture();
      const { UI } = uiFixture(ratio);
      const holder = { width: () => 240, height: () => 70 };
      const sandbox = vm.createContext({ UI, $: () => holder });
      vm.runInContext(readSource("../src/js/textMode/tools/tilePaletteMobile.js"), sandbox);
      const palette = new sandbox.TilePaletteMobile();
      palette.canvas = canvas;
      assert.equal(palette.resize(), true);
      assert.equal(canvas.width, Math.round(240 * ratio));
      assert.equal(canvas.height, Math.round(70 * ratio));
    }
  }
});

test("standalone Phase 2 surfaces repair stale DPR revisions", () => {
  const { UI, listeners } = uiFixture(1.25);
  const sandbox = vm.createContext({ UI, styles: { ui: { scrollbarWidth: 12 } } });
  vm.runInContext(readSource("../src/js/textMode/animationPreview.js"), sandbox);
  vm.runInContext(readSource("../src/js/textMode/frames/spriteFrames.js"), sandbox);
  vm.runInContext(readSource("../src/js/textMode/tileSet/tileEditorGrid.js"), sandbox);
  vm.runInContext(readSource("../src/js/textMode/tools/blockPalette.js"), sandbox);

  let animationResizes = 0;
  const animation = new sandbox.AnimationPreview();
  animation.init({});
  animation.canvasSurface = { isPixelRatioCurrent: () => false };
  animation.resize = () => animationResizes++;

  let frameResizes = 0;
  const frames = new sandbox.SpriteFrames();
  frames.init({}, "test");
  frames.canvasSurface = { isPixelRatioCurrent: () => false };
  frames.resize = () => frameResizes++;

  let gridResizes = 0;
  const grid = new sandbox.TileEditorGrid();
  grid.init({}, { canvasElementId: "grid" });
  grid.canvasSurface = { isPixelRatioCurrent: () => false };
  grid.canvasWidth = 201;
  grid.canvasHeight = 151;
  grid.setSize = () => gridResizes++;

  let paletteDraws = 0;
  const palette = new sandbox.BlockPalette();
  palette.init({}, {});
  palette.canvasSurface = { isPixelRatioCurrent: () => false };
  palette.drawBlockPalette = () => paletteDraws++;

  for(const listener of listeners) listener();
  assert.deepEqual(
    { animationResizes, frameResizes, gridResizes, paletteDraws },
    { animationResizes: 1, frameResizes: 1, gridResizes: 1, paletteDraws: 1 },
  );
});

test("current-tile bitmap preview uses the shared physical-pixel sampler", () => {
  const { canvas: mainCanvas } = canvasFixture();
  const { canvas: paletteCanvas, context: paletteContext } = canvasFixture();
  const { canvas: cursorCanvas } = canvasFixture();
  mainCanvas.width = mainCanvas.height = 48;
  paletteCanvas.width = paletteCanvas.height = 120;
  cursorCanvas.width = cursorCanvas.height = 8;

  const calls = [];
  const UI = {
    getContextNoSmoothing: (canvas) => canvas.getContext("2d"),
    PixelArtBlitter: function() {
      this.draw = (...args) => calls.push(args);
    },
  };
  const sandbox = vm.createContext({
    UI,
    THREE: { Color: function() {} },
    TextModeEditor: { Mode: { VECTOR: "vector" } },
    g_app: { isMobile: () => true },
  });
  vm.runInContext(readSource("../src/js/textMode/currentTile.js"), sandbox);

  const current = new sandbox.CurrentTile();
  current.type = "2d";
  current.characters = [[0]];
  current.canvas = mainCanvas;
  current.tilePaletteCanvas = paletteCanvas;
  current.cursorCanvas = cursorCanvas;
  current.drawCursor = () => {};
  current.editor = {
    tileSetManager: { getCurrentTileSet: () => ({ getTileWidth: () => 8, getTileHeight: () => 8 }) },
    layers: { getSelectedLayerObject: () => ({ getMode: () => "text" }) },
  };

  current.canvasDrawCharacters();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], paletteContext);
  assert.equal(calls[0][2], cursorCanvas);
  assert.deepEqual(calls[0].slice(3, 7), [0, 0, 8, 8]);
  assert.deepEqual(calls[0].slice(7), [0, 0, 120, 120]);
});

test("mobile palette and current-tile preview redraw on DPR revisions", () => {
  const main = canvasFixture().canvas;
  const current = canvasFixture().canvas;
  const { UI, listeners, glyphPreviews } = uiFixture(1);
  const sandbox = vm.createContext({
    UI,
    TouchVelocity: function() {},
    document: { getElementById: (id) => id === "tilePaletteMobileCurrentTile" ? current : main },
    $: () => ({ on() {} }),
  });
  vm.runInContext(readSource("../src/js/textMode/tools/tilePaletteMobile.js"), sandbox);
  const palette = new sandbox.TilePaletteMobile();
  let paletteDraws = 0;
  let previewDraws = 0;
  const currentTile = {
    canvasDrawCharacters: () => previewDraws++,
    chooseCharacterMobile() {},
    getCharacters: () => [],
    setTilePaletteGlyphPreviewCanvas(canvas, width, height) {
      this.tilePaletteGlyphPreview = new UI.GlyphPreview(canvas);
      this.tilePaletteGlyphPreview.resize(width, height);
    },
  };
  palette.init({ currentTile, showTileEditor() {} });
  palette.initCurrentTileContent();
  palette.canvas = main;
  palette.draw = () => paletteDraws++;
  glyphPreviews[0].redraw = () => previewDraws++;

  UI.devicePixelRatio = 2.5;
  for (const listener of listeners) listener();
  assert.equal(current.width, 120);
  assert.equal(current.height, 120);
  assert.equal(currentTile.tilePaletteGlyphPreview.canvas, current);
  assert.equal(paletteDraws, 1);
  assert.equal(previewDraws, 1);
});

test("mobile palette hit testing and reveal scrolling stay in CSS pixels", () => {
  const sandbox = vm.createContext({});
  vm.runInContext(readSource("../src/js/textMode/tools/tilePaletteMobile.js"), sandbox);
  const results = [];

  for (const ratio of [1, 1.25, 1.5, 2, 2.5]) {
    const palette = new sandbox.TilePaletteMobile();
    palette.width = 240;
    palette.canvas = { width: Math.round(240 * ratio) };
    palette.tileWidth = 8;
    palette.blockWidth = 1;
    palette.tileHPadding = 1;
    palette.scale = 3;
    palette.tileCount = 100;
    palette.xScrollMax = 2460;
    palette.draw = () => {};

    const stride = (palette.tileWidth * palette.blockWidth + palette.tileHPadding) * palette.scale;
    assert.equal(palette.tileFromXY(palette.tileHPadding * palette.scale + 7 * stride + 1, 10), 7);
    assert.equal(palette.revealTile(20), true);
    results.push(palette.xScroll);
  }

  assert.ok(results.every((value) => value === results[0]));
});

test("sprite timeline sizing is safe before event initialization", () => {
  const canvas = { width: 0, height: 0, style: {} };
  const holder = {
    offset: () => ({ left: 12, top: 34 }),
    width: () => 321,
    height: () => 117,
  };
  const context = { imageSmoothingEnabled: true };
  const sandbox = vm.createContext({
    styles: { ui: { scrollbarWidth: 12 } },
    document: { getElementById: () => canvas },
    $: () => holder,
    UI: {
      devicePixelRatio: 2.5,
      CanvasSurface: function(surfaceCanvas) {
        this.resize = ({ cssWidth, cssHeight, pixelRatio }) => {
          surfaceCanvas.width = Math.round(cssWidth * pixelRatio);
          surfaceCanvas.height = Math.round(cssHeight * pixelRatio);
          return { cssWidth, cssHeight, pixelRatio };
        };
        this.getLogicalContext = (args = {}) => {
          if(args.noSmoothing) context.imageSmoothingEnabled = false;
          return context;
        };
      },
      PixelArtBlitter: function() {},
    },
  });
  vm.runInContext(readSource("../src/js/textMode/frames/spriteFrames.js"), sandbox);

  const frames = new sandbox.SpriteFrames();
  assert.equal(frames.sizeCanvas(), true);
  assert.equal(frames.width, 321);
  assert.equal(frames.height, 117);
  assert.equal(canvas.width, 803);
  assert.equal(canvas.height, 293);
  assert.equal(frames.canvasScale, 2.5);
  assert.equal(context.imageSmoothingEnabled, false);
});
