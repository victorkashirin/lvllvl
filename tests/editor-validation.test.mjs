import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadConstructor(relativePath, constructorName, globals = {}) {
  const source = await readFile(path.join(projectRoot, relativePath), "utf8");
  const context = vm.createContext(globals);
  vm.runInContext(`${source}\n;globalThis.__exported = ${constructorName};`, context, {
    filename: relativePath,
  });
  return context.__exported;
}

function createJQueryState(initialValues = {}) {
  const values = { ...initialValues };
  const state = {};
  const handlers = {};
  const $ = (selector) => {
    state[selector] ||= { attrs: {}, classes: new Set(), text: "", visible: true };
    const element = state[selector];
    return {
      val(value) {
        if(arguments.length) {
          values[selector] = value;
          return this;
        }
        return values[selector];
      },
      is(query) {
        return query === ":checked" && Boolean(values[selector]);
      },
      attr(name, value) {
        element.attrs[name] = value;
        return this;
      },
      removeAttr(name) {
        delete element.attrs[name];
        return this;
      },
      toggle(show) {
        element.visible = Boolean(show);
        return this;
      },
      show() {
        element.visible = true;
        return this;
      },
      hide() {
        element.visible = false;
        return this;
      },
      text(value) {
        if(arguments.length) {
          element.text = value;
          return this;
        }
        return element.text;
      },
      html(value) {
        if(arguments.length) {
          element.text = value;
          return this;
        }
        return element.text;
      },
      toggleClass(name, enabled) {
        if(enabled) element.classes.add(name);
        else element.classes.delete(name);
        return this;
      },
      on(events, handler) {
        for(const target of selector.split(",").map((value) => value.trim())) {
          handlers[target] ||= {};
          for(const event of events.split(/\s+/)) {
            handlers[target][event] ||= [];
            handlers[target][event].push(handler);
          }
        }
        return this;
      },
      focus() { return this; },
      select() { return this; },
      setSelectionRange() { return this; },
    };
  };
  $.values = values;
  $.state = state;
  $.trigger = (selector, event) => {
    for(const handler of handlers[selector]?.[event] || []) handler();
  };
  $.isNumeric = () => false;
  return $;
}

test("palette column input rejects blank, zero, negative, and over-maximum values", async () => {
  const ColorPaletteSave = await loadConstructor(
    "src/js/textMode/color/colorPaletteSave.js",
    "ColorPaletteSave",
  );
  const dialog = new ColorPaletteSave();
  let displayAcross = 2;
  dialog.colorsAcross = 2;
  dialog.colorPalette = { getColorCount: () => 5, getColorMap: () => [[0, 1]] };
  dialog.colorPaletteDisplay = {
    setColorsAcross(value) { displayAcross = value; },
    setColorMap() {},
    setColorSize() {},
    draw() {},
  };

  for(const value of [Number(""), 0, -1, 6, 1.5, Number.NaN]) {
    assert.equal(dialog.setColorsAcross(value), false);
    assert.equal(dialog.colorsAcross, 2);
    assert.equal(displayAcross, 2);
  }
  assert.equal(dialog.setColorsAcross(3), true);
  assert.equal(dialog.colorsAcross, 3);
  assert.equal(displayAcross, 3);
});

test("returning to palette PNG format uses the visible valid column count", async () => {
  const $ = createJQueryState({
    "#saveColorPaletteColorsAcross": "4",
    "#saveColorPaletteCellWidth": "8",
    "#saveColorPaletteCellHeight": "8",
  });
  const ColorPaletteSave = await loadConstructor(
    "src/js/textMode/color/colorPaletteSave.js",
    "ColorPaletteSave",
    { $ },
  );
  const dialog = new ColorPaletteSave();
  let mappedAcross = null;
  dialog.colorsAcross = 8;
  dialog.sortOrder = "source";
  dialog.colorPalette = {
    getColorCount: () => 8,
    getColorsAcross: () => 8,
    getColorMap(sortOrder, across) {
      mappedAcross = across;
      return [[0]];
    },
  };
  dialog.colorPaletteDisplay = {
    setColorsAcross() {},
    setColorMap() {},
    setColorSize() {},
    draw() {},
  };

  dialog.setSaveFormat("png");
  assert.equal(dialog.colorsAcross, 4);
  assert.equal(mappedAcross, 4);
  assert.equal($.values["#saveColorPaletteColorsAcross"], "4");
});

test("palette map and tile PNG layout enforce safe column counts", async () => {
  const jquery = () => ({});
  jquery.isNumeric = () => false;
  const ColorPalette = await loadConstructor(
    "src/js/textMode/color/colorPalette.js",
    "ColorPalette",
    { $: jquery, g_app: {} },
  );
  const palette = new ColorPalette();
  palette.noDocColors = [0, 1, 2, 3, 4];
  palette.colorMap = [[0, 1]];
  palette.editor = {
    colorPaletteManager: {
      noColor: -1,
      sortColors(colors) { return colors.slice(); },
    },
  };
  for(const value of [0, -1, 6, Number.NaN, Number.POSITIVE_INFINITY]) {
    const map = palette.getColorMap("source", value);
    assert.equal(map.length, 3);
    assert.equal(map[0].length, 2);
  }
  assert.equal(palette.getColorMap("source", 3).length, 2);

  class HTMLCanvasElement {}
  const TileSet = await loadConstructor(
    "src/js/textMode/tileSet/tileSet.js",
    "TileSet",
    { HTMLCanvasElement, Blob, Uint8Array, atob: () => "", setTimeout },
  );
  const tileSet = new TileSet();
  tileSet.charWidth = 2;
  tileSet.charHeight = 3;
  tileSet.getTileCount = () => 256;
  const context = {
    clearRect() {},
    getImageData() { return {}; },
    putImageData() {},
  };
  tileSet.importCanvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => "data:image/png;base64,",
  };
  tileSet.drawCharacter = () => {};

  for(const [across, rows] of [[8, 32], [16, 16], [32, 8], [30, 9]]) {
    assert.notEqual(tileSet.exportPng({ tilesAcross: across }), false);
    assert.equal(tileSet.importCanvas.width, across * 2);
    assert.equal(tileSet.importCanvas.height, rows * 3);
  }
  tileSet.getTileCount = () => 8;
  assert.notEqual(tileSet.exportPng(), false);
  assert.equal(tileSet.importCanvas.height, 3);
  assert.equal(tileSet.exportPng({ tilesAcross: 0 }), false);
  assert.equal(tileSet.exportPng({ tilesAcross: 257 }), false);
});

test("tile-set serialization is side-effect free and preserves existing MetaTiles", async () => {
  const TileSet = await loadConstructor(
    "src/js/textMode/tileSet/tileSet.js",
    "TileSet",
    { HTMLCanvasElement: class {}, Blob, Uint8Array, atob: () => "", setTimeout },
  );
  const blockSetPath = "/tile sets/Test Tiles/block sets/block set";
  let storedBlockSet = null;
  let blockSetLookups = 0;
  const document = {
    getDocRecord(path) {
      return path === blockSetPath ? storedBlockSet : null;
    },
  };
  const blockSet = {
    getBlockCount: () => 1,
    getBlocks: () => [{
      colorMode: "percell",
      data: [[
        { bc: 3, fc: 2, t: 7 },
        { bc: 5, fc: 4, t: 8 },
      ]],
    }],
  };
  const tileSet = new TileSet();
  tileSet.name = "Test Tiles";
  tileSet.document = document;
  tileSet.docRecord = {
    id: "test-tiles",
    name: "Test Tiles",
    data: {
      height: 8,
      sortMethods: [],
      tileData: [{ data: [[0]], props: {} }],
      width: 8,
    },
  };
  tileSet.editor = {
    blockSetManager: {
      getBlockSet(path, ownerDocument) {
        blockSetLookups++;
        assert.equal(path, blockSetPath);
        assert.equal(ownerDocument, document);
        return blockSet;
      },
    },
    getColorPerMode: () => "cell",
  };

  const withoutMetaTiles = tileSet.getJSON();
  assert.equal(withoutMetaTiles.blockSet, undefined);
  assert.equal(blockSetLookups, 0);

  storedBlockSet = { id: "stored-block-set" };
  const withMetaTiles = tileSet.getJSON();
  assert.equal(blockSetLookups, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(withMetaTiles.blockSet)), [{
    colorMode: "percell",
    tileData: [[
      { bc: 3, fc: 2, t: 7 },
      { bc: 5, fc: 4, t: 8 },
    ]],
  }]);
});

test("document, tile, and MetaTile model boundaries reject malformed dimensions", async () => {
  const [Graphic, TileSet, LayerGrid, BlockSetManager] = await Promise.all([
    loadConstructor("src/js/textMode/graphic.js", "Graphic"),
    loadConstructor("src/js/textMode/tileSet/tileSet.js", "TileSet", {
      HTMLCanvasElement: class {}, Blob, Uint8Array, atob: () => "", setTimeout,
    }),
    loadConstructor("src/js/textMode/layers/layerGrid.js", "LayerGrid", { g_app: {} }),
    loadConstructor("src/js/textMode/blockSet/blockSetManager.js", "BlockSetManager", {
      confirm: () => false,
    }),
  ]);

  const graphic = new Graphic();
  graphic.doc = { data: { width: 320, height: 200 } };
  graphic.editor = { layers: { layers: [] } };
  graphic.invalidateAllCells = () => {};
  graphic.redraw = () => {};
  for(const width of ["", 0, -1, 201, Number.NaN]) {
    assert.equal(graphic.setGridDimensions({ width, height: 25 }), false);
    assert.equal(graphic.gridWidth, 40);
  }
  assert.equal(graphic.setGridDimensions({ width: 40, height: 25, offsetX: "" }), false);

  const tileSet = new TileSet();
  tileSet.docRecord = { data: { width: 8, height: 8 } };
  for(const width of ["", 0, -1, 129, Number.NaN]) {
    assert.equal(tileSet.setTileDimensions({ width, height: 8 }), false);
    assert.equal(tileSet.charWidth, 8);
  }
  assert.equal(tileSet.setTileDimensions({ width: 128, height: 8 }), true);
  assert.equal(tileSet.charWidth, 128);
  assert.equal(tileSet.setTileDimensions({ width: 8, height: 8, offsetY: "" }), false);

  const layer = new LayerGrid();
  layer.doc = { blockWidth: 2, blockHeight: 2 };
  layer.editor = { modified() {} };
  layer.invalidateTileUsage = () => {};
  assert.equal(layer.setBlockDimensions(0, 2), false);
  assert.deepEqual(
    { width: layer.doc.blockWidth, height: layer.doc.blockHeight },
    { width: 2, height: 2 },
  );
  layer.doc.gridWidth = 40;
  layer.doc.gridHeight = 25;
  layer.getTileSet = () => ({ getTileWidth: () => 8, getTileHeight: () => 8 });
  layer.getCellWidth = () => 8;
  layer.getCellHeight = () => 8;
  assert.equal(layer.setGridDimensions({ width: 0, height: 25 }), false);
  assert.equal(layer.doc.gridWidth, 40);

  const newLayer = new LayerGrid();
  newLayer.doc = { frames: [] };
  newLayer.frames = [];
  newLayer.frameCount = 0;
  newLayer.editor = { modified() {} };
  newLayer.getTileSet = () => ({ getTileWidth: () => 8, getTileHeight: () => 8 });
  newLayer.invalidateAllCells = () => {};
  assert.notEqual(newLayer.setGridDimensions({ width: 40, height: 25 }), false);
  assert.deepEqual(
    {
      cellHeight: newLayer.doc.cellHeight,
      cellWidth: newLayer.doc.cellWidth,
      gridHeight: newLayer.doc.gridHeight,
      gridWidth: newLayer.doc.gridWidth,
    },
    { cellHeight: 8, cellWidth: 8, gridHeight: 25, gridWidth: 40 },
  );

  const manager = new BlockSetManager();
  for(const dimensions of [["", 2], [0, 2], [-1, 2], [65, 2], [2, "x"]]) {
    assert.equal(manager.validateBlockDimensions(...dimensions).valid, false);
  }
  assert.equal(manager.validateBlockDimensions(3, 4).valid, true);
  let resizedBlocks = 0;
  manager.getCurrentBlockSet = () => ({
    getBlockCount: () => 1,
    getBlocks: () => [{ data: [[{ t: 0 }]] }],
    setBlockDimensions() { resizedBlocks++; },
  });
  assert.equal(manager.checkBlockMode(1, 1), true);
  assert.equal(manager.checkBlockMode(2, 1), false);
  assert.equal(resizedBlocks, 0);

  const $ = createJQueryState({
    "#settingsDimensionsWidth": "40",
    "#settingsDimensionsHeight": "25",
    "#settingsDimensionsOffsetX": "0",
    "#settingsDimensionsOffsetY": "0",
    "#settingsDimensionsTileWidth": "128",
    "#settingsDimensionsTileHeight": "128",
  });
  const GridDimensionsDialog = await loadConstructor(
    "src/js/textMode/tools/gridDimensionsDialog.js",
    "GridDimensionsDialog",
    { $, TileSet },
  );
  const dimensionsDialog = new GridDimensionsDialog();
  dimensionsDialog.editor = { graphic: { getType: () => "sprite" } };
  dimensionsDialog.canvas = {
    width: 320,
    height: 200,
    addEventListener() {},
    getContext: () => ({ clearRect() {} }),
  };
  assert.equal(dimensionsDialog.getValidatedDimensions(true).valid, true);
  dimensionsDialog.initEvents();
  $.values["#settingsDimensionsTileWidth"] = "129";
  $.trigger(".dimensionsNumber", "input");
  assert.equal($.state["#settingsDimensionsTileWidth"].attrs["aria-invalid"], "true");
});

test("template links regenerate from valid dimensions and cannot copy invalid state", async () => {
  const $ = createJQueryState({
    "#templateLinkEditorList": "screen",
    "#templateLinkTileSetList": "petscii",
    "#templateLinkColorPaletteList": "c64_colodore",
    "#templateLinkWidth": "40",
    "#templateLinkHeight": "25",
    "#templateLinkScreenMode": "textmode",
  });
  let copies = 0;
  const copyElement = { select() {}, setSelectionRange() {} };
  const CreateTemplateLink = await loadConstructor(
    "src/js/file/createTemplateLink.js",
    "CreateTemplateLink",
    { $, document: { getElementById: () => copyElement, execCommand: () => { copies++; } } },
  );
  const dialog = new CreateTemplateLink();
  assert.equal(dialog.generateLink(), true);
  assert.match($.values["#templateLink"], /width=40&height=25/);
  $.values["#templateLinkWidth"] = "64";
  assert.equal(dialog.copyLink(), true);
  assert.match($.values["#templateLink"], /width=64&height=25/);
  assert.equal(copies, 1);
  $.values["#templateLinkHeight"] = "";
  assert.equal(dialog.copyLink(), false);
  assert.equal(copies, 1);
  assert.equal($.values["#templateLink"], "");
});

test("C64 sprite output is cleared and disabled when its exact range becomes invalid", async () => {
  const $ = createJQueryState({
    "#exportSpriteDataFrom": "2000",
    "#exportSpriteDataTo": "2008",
    "#exportSpriteLineNumber": "10",
    "#exportSpriteDataAs": "sprites.bas",
  });
  const ExportC64SpriteData = await loadConstructor(
    "src/js/debugger/exportC64SpriteData.js",
    "ExportC64SpriteData",
    { $, c64_vicReadAbsolute: (address) => address & 0xff, download() {}, document: {} },
  );
  const exporter = new ExportC64SpriteData();
  let content = "";
  let buttonEnabled = null;
  exporter.textEditor = { setValue(value) { content = value; }, getValue: () => content };
  exporter.displayButton = { setEnabled(value) { buttonEnabled = value; } };

  assert.equal(exporter.exportData(), true);
  assert.match(content, /^10 DATA /);
  assert.equal(buttonEnabled, true);
  assert.equal(exporter.isOutputFresh(), true);

  $.values["#exportSpriteDataTo"] = "1fff";
  exporter.initEvents();
  $.trigger("#exportSpriteDataTo", "input");
  assert.equal(content, "");
  assert.equal(buttonEnabled, false);
  assert.equal(exporter.download(), false);

  $.values["#exportSpriteDataFrom"] = "0000";
  $.values["#exportSpriteDataTo"] = "10000";
  $.values["#exportSpriteLineNumber"] = "10";
  assert.equal(exporter.exportData(), false);
  assert.equal(content, "");
  assert.equal(buttonEnabled, false);
  assert.match($.state["#exportSpriteDataError"].text, /line number 63999/i);
});

test("background image model rejects empty input and preserves only applied state", async () => {
  const $ = createJQueryState({
    "#bgImageX": "19",
    "#bgImageY": "7",
    "#bgImageScale": "50",
  });
  let draws = 0;
  class Object3D {
    constructor() {
      this.visible = true;
      this.children = [];
      this.position = { x: 0, y: 0, z: 0 };
    }
    add(child) { this.children.push(child); }
  }
  class Mesh extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }
  let backingImage = null;
  const backgroundContext = {
    clearRect() { backingImage = null; },
    drawImage(image) {
      if(image.failToDraw) throw new Error("decode failed");
      backingImage = image;
      draws++;
    },
  };
  const Grid = await loadConstructor("src/js/textMode/grid.js", "Grid", {
    THREE: {
      Object3D,
      Texture: class { constructor(canvas) { this.image = canvas; } },
      MeshBasicMaterial: class { constructor(args) { Object.assign(this, args); } },
      PlaneGeometry: class { constructor(width, height) { this.width = width; this.height = height; } },
      Mesh,
      DoubleSide: "double",
      NearestFilter: "nearest",
    },
    document: {
      createElement: () => ({ width: 0, height: 0, getContext: () => backgroundContext }),
    },
    scene: { add() {}, remove() {} },
  });
  const grid = new Grid();
  let invalidations = 0;
  grid.editor = {
    gridView2d: { setBackBufferNeedsRedraw() { invalidations++; } },
    graphic: {
      getGraphicWidth: () => 320,
      getGraphicHeight: () => 200,
      redraw() { invalidations++; },
    },
  };

  assert.equal(grid.setBackgroundImage(null, 0, 0, 10, 10), false);
  assert.equal(draws, 0);
  const image = { naturalWidth: 64, naturalHeight: 32 };
  assert.equal(grid.setBackgroundImage(image, 2, 3, 64, 32), true);
  assert.equal(grid.backgroundImageCanvas.width, 320);
  assert.equal(grid.backgroundImageCanvas.height, 200);
  assert.equal(draws, 1);
  assert.equal(invalidations, 2);
  assert.deepEqual(
    { ...grid.getBackgroundImage() },
    { image, x: 2, y: 3, drawWidth: 64, drawHeight: 32 },
  );
  assert.equal(grid.setBackgroundImage(image, Number.NaN, 3, 64, 32), false);
  assert.equal(grid.getBackgroundImage().x, 2);
  assert.equal(grid.setBackgroundImage({
    naturalWidth: 64,
    naturalHeight: 32,
    failToDraw: true,
  }, 0, 0, 64, 32), false);
  assert.equal(grid.getBackgroundImage().image, image);
  assert.equal(backingImage, image);

  let displayDraw = null;
  assert.equal(grid.drawBackgroundImage({
    drawImage(...args) { displayDraw = args; },
  }, {
    srcX: 1, srcY: 2, srcWidth: 30, srcHeight: 20,
    dstX: 4, dstY: 5, dstWidth: 60, dstHeight: 40,
  }), true);
  assert.deepEqual(displayDraw.slice(1), [1, 2, 30, 20, 4, 5, 60, 40]);
  assert.equal(displayDraw[0], grid.backgroundImageCanvas);
  assert.equal(grid.toggleBackgroundImage(), true);
  assert.equal(grid.drawBackgroundImage({ drawImage() {} }, {
    srcX: 0, srcY: 0, srcWidth: 1, srcHeight: 1,
    dstX: 0, dstY: 0, dstWidth: 1, dstHeight: 1,
  }), false);
  grid.toggleBackgroundImage();

  const BackgroundImage = await loadConstructor(
    "src/js/textMode/backgroundImage.js",
    "BackgroundImage",
    { $, window: { URL: { revokeObjectURL() {} } }, g_app: {} },
  );
  const dialog = new BackgroundImage();
  dialog.editor = { grid };
  dialog.isCurrentProject = () => true;
  dialog.canvas = { width: 320, height: 200 };
  dialog.context = { clearRect() {}, drawImage() {} };
  dialog.okButton = { setEnabled() {} };
  dialog.initializeDraft();
  assert.equal(dialog.bgImage, image);
  assert.equal(dialog.setBackgroundImage(), true);
  assert.deepEqual(
    { ...grid.getBackgroundImage() },
    { image, x: 19, y: 7, drawWidth: 32, drawHeight: 16 },
  );
  $.values["#bgImageScale"] = "";
  assert.equal(dialog.setBackgroundImage(), false);
  assert.equal(grid.getBackgroundImage().drawWidth, 32);
  dialog.bgImage = { naturalWidth: 10, naturalHeight: 10 };
  dialog.x = 99;
  dialog.discardDraft();
  dialog.initializeDraft();
  assert.equal(dialog.bgImage, image);
  assert.equal(dialog.x, 19);
});

test("first-open palette and tile-set imports preserve their ready callbacks", async () => {
  const [ColorPaletteChoosePreset, TileSetChoosePreset] = await Promise.all([
    loadConstructor(
      "src/js/textMode/color/colorPaletteChoosePreset.js",
      "ColorPaletteChoosePreset",
    ),
    loadConstructor(
      "src/js/textMode/tileSet/tileSetChoosePreset.js",
      "TileSetChoosePreset",
    ),
  ]);

  const ready = () => {};
  const palette = new ColorPaletteChoosePreset();
  palette.colorPaletteDisplay = {};
  palette.showSystemColorPalettes = () => {};
  palette.colorPaletteChoosePanel = { showOnly() {} };
  const paletteStarts = [];
  palette.startLoadColorPalette = (args) => paletteStarts.push(args);
  palette.tabPanel = {
    showTab() {
      if(!palette.suppressLoadTabStart) palette.startLoadColorPalette({});
    },
  };
  palette.initContent({ tab: "load", dialogReadyCallback: ready });
  assert.equal(paletteStarts.length, 1);
  assert.equal(paletteStarts[0].dialogReadyCallback, ready);

  const tileSet = new TileSetChoosePreset();
  tileSet.tileSetChoosePanel = { showOnly() {} };
  const tileSetStarts = [];
  tileSet.startLoadTileset = (args) => tileSetStarts.push(args);
  tileSet.tabPanel = {
    showTab() {
      if(!tileSet.suppressLoadTabStart) tileSet.startLoadTileset({});
    },
  };
  tileSet.initContent({ showImport: true, dialogReadyCallback: ready });
  assert.equal(tileSetStarts.length, 1);
  assert.equal(tileSetStarts[0].dialogReadyCallback, ready);
});

test("tile-set preview requests reset safely and report load failures", async () => {
  const $ = createJQueryState();
  const images = [];
  class FakeImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.src = "";
      images.push(this);
    }
  }

  let projectDocument = { id: "first" };
  let projectGeneration = 1;
  const g_app = {
    get doc() { return projectDocument; },
    get projectGeneration() { return projectGeneration; },
    isCurrentProject(document, generation) {
      return document === projectDocument && generation === projectGeneration;
    },
  };
  const TileSetChoosePreset = await loadConstructor(
    "src/js/textMode/tileSet/tileSetChoosePreset.js",
    "TileSetChoosePreset",
    { $, g_app, Image: FakeImage },
  );
  const chooser = new TileSetChoosePreset();
  const rendered = [];
  const readyStates = [];
  chooser.activeTab = "character";
  chooser.okButton = {
    setEnabled(ready) { readyStates.push(ready); },
  };
  chooser.type = "character";
  chooser.getCharacterSetDescription = (id) => ({ id, name: id });
  chooser.setPreviewFromImg = ({ img }) => {
    rendered.push(img);
    chooser.tileSet = {};
  };
  chooser.captureProjectContext();

  chooser.setPreviewCharacterset("petscii");
  const firstImage = images[0];
  assert.equal(readyStates.at(-1), false);
  assert.equal($.state["#chooseCharacterSetPreview"].visible, false);
  assert.equal($.state["#chooseCharacterSetPreviewStatus"].visible, true);
  assert.match($.state["#chooseCharacterSetPreviewStatus"].text, /Loading preview/);
  firstImage.onload();
  assert.deepEqual(rendered, [firstImage]);
  assert.equal(readyStates.at(-1), true);
  assert.equal($.state["#chooseCharacterSetPreview"].visible, true);
  assert.equal($.state["#chooseCharacterSetPreviewStatus"].visible, false);

  chooser.resetProjectState();
  assert.equal(chooser.img, null);
  assert.equal(chooser.type, false);
  assert.equal(firstImage.onload, null);
  assert.equal(firstImage.onerror, null);

  projectDocument = { id: "second" };
  projectGeneration++;
  chooser.captureProjectContext();
  chooser.showCharacterSetPresets = () => chooser.setPreviewCharacterset("atascii");
  chooser.setTilePresetType("character");
  const secondImage = images[1];
  assert.notEqual(secondImage, firstImage);
  assert.equal(typeof secondImage.onload, "function");
  secondImage.onload();
  assert.deepEqual(rendered, [firstImage, secondImage]);

  chooser.setPreviewCharacterset("apple2");
  const failedImage = images[2];
  assert.equal(readyStates.at(-1), false);
  failedImage.onerror();
  assert.equal(chooser.tileSet, null);
  assert.equal(readyStates.at(-1), false);
  assert.equal($.state["#chooseCharacterSetPreview"].visible, false);
  assert.equal($.state["#chooseCharacterSetPreviewStatus"].visible, true);
  assert.equal(
    $.state["#chooseCharacterSetPreviewStatus"].attrs["data-state"],
    "error",
  );
  assert.match(
    $.state["#chooseCharacterSetPreviewStatus"].text,
    /Could not load this tile-set preview/,
  );
  assert.equal(
    $.state["#chooseCharacterSetPreviewHolder"].attrs["aria-busy"],
    "false",
  );
});

test("embedded importers defer ready callbacks until their HTML is initialized", async () => {
  const $ = createJQueryState();
  const projectDocument = {};
  const g_app = {
    doc: projectDocument,
    projectGeneration: 1,
    isCurrentProject(document, generation) {
      return document === projectDocument && generation === 1;
    },
  };
  const loadCallbacks = [];
  const UI = {
    create(type) {
      assert.equal(type, "UI.HTMLPanel");
      return { load(path, callback) { loadCallbacks.push(callback); } };
    },
  };
  const parent = { add() {} };
  const [ColorPaletteLoad, TileSetImport] = await Promise.all([
    loadConstructor("src/js/textMode/color/colorPaletteLoad.js", "ColorPaletteLoad", {
      $, UI, g_app,
    }),
    loadConstructor("src/js/textMode/tileSet/tileSetImport.js", "TileSetImport", {
      $, UI, g_app, ImageLib: class {},
    }),
  ]);

  let firstPaletteReady = 0;
  let latestPaletteReady = 0;
  const paletteLoader = new ColorPaletteLoad();
  paletteLoader.init({}, parent);
  paletteLoader.htmlComponentLoaded = () => {};
  paletteLoader.initContent = () => {};
  paletteLoader.initEvents = () => {};
  paletteLoader.show({ dialogReadyCallback() { firstPaletteReady++; } });
  paletteLoader.show({ dialogReadyCallback() { latestPaletteReady++; } });
  assert.equal(firstPaletteReady + latestPaletteReady, 0);
  loadCallbacks.shift()();
  assert.equal(firstPaletteReady, 0);
  assert.equal(latestPaletteReady, 1);

  let firstTileSetReady = 0;
  let latestTileSetReady = 0;
  const tileSetLoader = new TileSetImport();
  tileSetLoader.init({}, parent);
  tileSetLoader.initContent = () => {};
  tileSetLoader.initEvents = () => {};
  tileSetLoader.start({ dialogReadyCallback() { firstTileSetReady++; } });
  tileSetLoader.start({ dialogReadyCallback() { latestTileSetReady++; } });
  assert.equal(firstTileSetReady + latestTileSetReady, 0);
  loadCallbacks.shift()();
  assert.equal(firstTileSetReady, 0);
  assert.equal(latestTileSetReady, 1);
});

test("image and video imports require decoded media before document mutation", async () => {
  const $ = createJQueryState();
  const revokedURLs = [];
  const [ImportImage, ImportImageMobile] = await Promise.all([
    loadConstructor("src/js/textMode/import2d/importImage.js", "ImportImage", {
      $,
      window: { URL: { revokeObjectURL(value) { revokedURLs.push(value); } } },
    }),
    loadConstructor("src/js/textMode/import2d/importImageMobile.js", "ImportImageMobile"),
  ]);
  const importer = new ImportImage();
  importer.isCurrentProject = () => true;
  let desktopEnabled = null;
  let mobileEnabled = null;
  importer.okButton = { setEnabled(value) { desktopEnabled = value; } };
  importer.importImageMobile = {
    setImportEnabled(value) { mobileEnabled = value; },
  };

  assert.equal(importer.startImport(), false);
  assert.equal(desktopEnabled, false);
  assert.equal(mobileEnabled, false);

  importer.importSource = "image";
  importer.importImage = { naturalWidth: 0, naturalHeight: 0 };
  assert.equal(importer.setMediaReady(true), false);
  importer.importImage = { naturalWidth: 64, naturalHeight: 32 };
  assert.equal(importer.setMediaReady(true), true);
  assert.equal(desktopEnabled, true);
  assert.equal(mobileEnabled, true);

  importer.importSource = "video";
  importer.importVideo = { videoWidth: 0, videoHeight: 0 };
  assert.equal(importer.setMediaReady(true), false);
  importer.importVideo = { videoWidth: 320, videoHeight: 200 };
  assert.equal(importer.setMediaReady(true), true);

  let pauses = 0;
  let sourceRemovals = 0;
  let reloads = 0;
  importer.importImage = { onload() {}, onerror() {} };
  importer.importVideo = {
    videoWidth: 320,
    videoHeight: 200,
    pause() { pauses++; },
    removeAttribute(name) { if(name === "src") sourceRemovals++; },
    load() { reloads++; },
  };
  importer.mediaObjectURL = "blob:old-media";
  assert.equal(importer.resetMediaSelection(), false);
  assert.equal(importer.importImage, null);
  assert.equal(importer.importVideo, null);
  assert.equal(importer.mediaReady, false);
  assert.equal(pauses, 1);
  assert.equal(sourceRemovals, 1);
  assert.equal(reloads, 1);
  assert.deepEqual(revokedURLs, ["blob:old-media"]);

  let importStarts = 0;
  const mobile = new ImportImageMobile();
  mobile.isCurrentProject = () => true;
  mobile.importer = {
    hasLoadedMedia: () => false,
    updateImportButtonState() {},
    startImport() { importStarts++; },
  };
  assert.equal(mobile.startImport(), false);
  assert.equal(importStarts, 0);
});

test("source-dependent importers reject empty state before document mutation", async () => {
  const $ = createJQueryState();
  $.parseJSON = JSON.parse;
  let alerts = 0;
  const textModeEditor = {
    Mode: { TEXTMODE: "textmode", C64MULTICOLOR: "c64multicolor" },
  };
  const [ImportSpriteImage, ImportC64Formats, ImportC64SpriteFormats,
    ReferenceImageDialog, TileSetImport, ColorPaletteLoad] = await Promise.all([
    loadConstructor("src/js/textMode/import/importSpriteImage.js", "ImportSpriteImage"),
    loadConstructor("src/js/textMode/import/importC64Formats.js", "ImportC64Formats", {
      TextModeEditor: textModeEditor,
    }),
    loadConstructor("src/js/textMode/import/importC64SpriteFormats.js", "ImportC64SpriteFormats"),
    loadConstructor("src/js/textMode/layers/referenceImageDialog.js", "ReferenceImageDialog"),
    loadConstructor("src/js/textMode/tileSet/tileSetImport.js", "TileSetImport", {
      $, ImageLib: class {}, alert() { alerts++; },
    }),
    loadConstructor("src/js/textMode/color/colorPaletteLoad.js", "ColorPaletteLoad", {
      $, g_app: { getMode: () => "" },
    }),
  ]);

  const spriteImage = new ImportSpriteImage();
  spriteImage.isCurrentProject = () => true;
  assert.equal(spriteImage.doImport(), false);

  const c64 = new ImportC64Formats();
  c64.isCurrentProject = () => true;
  assert.equal(c64.doImport(), false);

  const c64Sprites = new ImportC64SpriteFormats();
  c64Sprites.isCurrentProject = () => true;
  assert.equal(c64Sprites.doImport(), false);

  const referenceImage = new ReferenceImageDialog();
  referenceImage.isCurrentProject = () => true;
  assert.equal(referenceImage.setLayerRefImage(), false);

  let tileSetLookups = 0;
  const tileSetImport = new TileSetImport();
  tileSetImport.isCurrentProject = () => true;
  tileSetImport.editor = {
    tileSetManager: { getCurrentTileSet() { tileSetLookups++; return null; } },
  };
  assert.equal(tileSetImport.importTileSet(), false);
  assert.equal(tileSetLookups, 0);

  tileSetImport.setLoadParameters = () => {};
  assert.equal(tileSetImport.readJson(JSON.stringify({
    width: 2,
    height: 2,
    tiles: [{ data: [[0, 1, 2, 3]] }],
  })), true);
  assert.equal(tileSetImport.importReady, true);
  assert.equal(tileSetImport.importArgs.jsonData.width, 2);
  assert.equal(tileSetImport.readJson(JSON.stringify({
    width: 2,
    height: 2,
    tiles: [{ data: [[0, 1, 2]] }],
  })), false);
  assert.equal(tileSetImport.importReady, false);
  assert.equal(tileSetImport.importArgs.jsonData, null);
  assert.equal(tileSetImport.readJson(JSON.stringify({
    width: 129,
    height: 1,
    tiles: [{ data: [[0]] }],
  })), false);
  assert.equal(tileSetImport.readJson(JSON.stringify({
    width: 1,
    height: 1,
    tiles: [null],
  })), false);
  assert.equal(tileSetImport.readJson(JSON.stringify({
    width: 1,
    height: 1,
    tiles: [{ data: [[0]] }],
    blockSet: [{ tileData: [[{}]] }],
  })), false);
  assert.equal(alerts, 4);

  let paletteLookups = 0;
  const paletteLoad = new ColorPaletteLoad();
  paletteLoad.isCurrentProject = () => true;
  paletteLoad.editor = {
    colorPaletteManager: { getCurrentColorPalette() { paletteLookups++; return null; } },
  };
  assert.equal(paletteLoad.setPalette(), false);
  assert.equal(paletteLookups, 0);

  let setColorsCalls = 0;
  paletteLoad.colors = [0xff000000];
  paletteLoad.colorsAcross = 1;
  paletteLoad.importReady = true;
  paletteLoad.editor.colorPaletteManager.getCurrentColorPalette = () => ({
    setColors() { setColorsCalls++; },
    clearPaletteMaps() {},
    paletteChanged() {},
  });
  assert.equal(paletteLoad.setPalette(), true);
  assert.equal(setColorsCalls, 1);
  assert.equal(paletteLoad.setColorsAcross(0), false);
  assert.equal(paletteLoad.createColorMap(), false);
  assert.equal(paletteLoad.setPalette(), false);
  assert.equal(setColorsCalls, 1);
});

test("canceling an incompatible MetaTile resize does not enable block mode", async () => {
  const TextModeEditor = await loadConstructor(
    "src/js/textMode/textModeEditor.js",
    "TextModeEditor",
  );
  const editor = new TextModeEditor();
  let mutations = 0;
  const layer = {
    getType: () => "grid",
    setBlockModeEnabled() { mutations++; },
    setBlockDimensions() { mutations++; },
    setColorPerMode() { mutations++; },
  };
  editor.layers = { getSelectedLayerObject: () => layer };
  editor.blockSetManager = {
    showBlockSizeDialog(callback) { callback(2, 2, "block"); },
    checkBlockMode: () => false,
  };
  editor.graphic = { redraw() { mutations++; } };

  editor.setBlockModeEnabled(true);
  editor.showBlockSizeDialog();
  assert.equal(mutations, 0);
});

test("new binary documents stay open until at least one file is selected", async () => {
  const $ = createJQueryState({ "#newProjectFileName": "Untitled" });
  let alerts = 0;
  let closes = 0;
  const fileInput = { files: [] };
  const ProjectNavigator = await loadConstructor(
    "src/js/file/projectNavigator.js",
    "ProjectNavigator",
    {
      $,
      alert() { alerts++; },
      document: {
        getElementById(id) {
          return id === "newDocRecordBinaryFile" ? fileInput : null;
        },
      },
      UI: { closeDialog() { closes++; } },
    },
  );
  const navigator = new ProjectNavigator();
  navigator.newDocRecordType = "binary";
  assert.equal(navigator.submitNewDocRecordDialog(), false);
  assert.equal(alerts, 1);
  assert.equal(closes, 0);
});
