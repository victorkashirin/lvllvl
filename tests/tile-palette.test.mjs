import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function createTilePalette({
  preferences = {},
  prefix = "",
  tileHeight = 8,
  tileWidth = 8,
  visible = true,
} = {}) {
  const source = await readFile(
    path.join(projectRoot, "src/js/textMode/tools/tilePalette.js"),
    "utf8",
  );
  const controlState = new Map();
  const getControlState = (selector) => {
    if (!controlState.has(selector)) controlState.set(selector, {});
    return controlState.get(selector);
  };
  const jquery = (selector) => {
    const state = getControlState(selector);
    const control = {
      attr(name, value) {
        if (value === undefined) return state[name];
        state[name] = value;
        return control;
      },
      prop(name, value) {
        if (value === undefined) return state[name];
        state[name] = value;
        return control;
      },
      toggleClass(name, enabled) {
        state[name] = enabled;
        return control;
      },
      text(value) {
        if (value === undefined) return state.text;
        state.text = value;
        return control;
      },
      html(value) {
        if (value === undefined) return state.html;
        state.html = value;
        return control;
      },
      val(value) {
        if (value === undefined) return state.value;
        state.value = value;
        return control;
      },
    };
    return control;
  };
  const localStorage = {
    get length() {
      return Object.keys(preferences).length;
    },
    key(index) {
      return Object.keys(preferences)[index] ?? null;
    },
  };
  let paletteVisible = visible;
  const context = vm.createContext({
    $: jquery,
    UI: {
      isMobile: { any: () => false },
      onDevicePixelRatioChange() {
        return () => {};
      },
    },
    TextModeEditor: {
      Mode: {
        C64ECM: "c64ecm",
        C64MULTICOLOR: "c64multicolor",
        C64STANDARD: "c64standard",
        INDEXED: "indexed",
        TEXTMODE: "textmode",
      },
    },
    localStorage,
    g_app: {
      isMobile() {
        return false;
      },
      getPref(key) {
        return Object.hasOwn(preferences, key) ? String(preferences[key]) : null;
      },
      setPref(key, value) {
        preferences[key] = String(value);
      },
    },
  });
  const tileSet = {
    getCharacterBGColor: () => 5,
    getTileColor: () => 4,
    getTileHeight: () => tileHeight,
    getTileWidth: () => tileWidth,
    getType: () => "bitmap",
  };
  vm.runInContext(source, context, {
    filename: "src/js/textMode/tools/tilePalette.js",
  });

  const display = {
    colors: "current",
    drawCalls: [],
    mapTypeCalls: [],
    scale: 2,
    draw(args) {
      this.drawCalls.push(args);
    },
    getScale() {
      return this.scale;
    },
    getScaleToFitWidth() {
      return 3.375;
    },
    getScaleControlStep() {
      return 0.5;
    },
    getMaximumScale() {
      return 10;
    },
    quantizeScale(scale) {
      return Math.round(scale * 8) / 8;
    },
    setColors(colors) {
      this.colors = colors;
    },
    setScale(scale) {
      this.scale = scale;
    },
    setCharPaletteMapType(type, redraw) {
      this.mapTypeCalls.push({ redraw, type });
      if (redraw !== false) this.draw({ redrawTiles: true });
    },
  };
  const palette = new context.TilePalette();
  const editor = {
    getTilePalettePanelVisible() {
      return paletteVisible;
    },
    colorPaletteManager: { noColor: -1 },
    getCursorTileTransparent: () => false,
    graphic: {
      getBackgroundColor: () => 0,
      getType: () => "textmode",
    },
    currentTile: {
      flipH: false,
      flipV: false,
      getBGColor: () => 3,
      getColor: () => 2,
      getTiles: () => [[3]],
      rotZ: 0,
      tileSettingsTileCanvas: { height: 24, width: 24 },
    },
    layers: {
      getSelectedLayerObject() {
        return {
          getHasTileFlip: () => false,
          getHasTileRotate: () => false,
          getColorPerMode: () => "cell",
          getScreenMode: () => "textmode",
          getType: () => "grid",
        };
      },
    },
    tileSetManager: {
      getCurrentTileSet() {
        return tileSet;
      },
    },
  };
  palette.tilePaletteDisplay = display;
  palette.init(editor, { prefix });
  palette.tileHeight = 8;
  palette.tileWidth = 8;

  return {
    controlState,
    display,
    palette,
    preferences,
    setVisible(value) {
      paletteVisible = value;
    },
  };
}

test("manual tile palette scales preserve fractional values", async () => {
  const fixture = await createTilePalette({
    preferences: { "tilepalette.scale_8x8": "2" },
  });

  fixture.palette.setScale(0.5);

  assert.equal(fixture.display.scale, 0.5);
  assert.equal(fixture.preferences["tilepalette.scale_8x8"], "0.5");
  assert.equal(fixture.controlState.get("#tilePaletteScale").value, 50);
});

test("manual tile palette scales snap to pixel-safe steps", async () => {
  const fixture = await createTilePalette({
    preferences: { "tilepalette.scale_8x8": "2" },
  });

  fixture.palette.setScale(1.76);

  assert.equal(fixture.display.scale, 1.75);
  assert.equal(fixture.preferences["tilepalette.scale_8x8"], "1.75");
  assert.equal(fixture.controlState.get("#tilePaletteScale").value, 175);
});

test("new profiles default to Fit without overwriting manual scale", async () => {
  const fixture = await createTilePalette();

  fixture.palette.setScale();

  assert.equal(fixture.palette.fitToWidth, true);
  assert.equal(fixture.preferences["tilepalette.scale_8x8"], undefined);
  assert.equal(fixture.preferences["tilepalette.fitToWidth.bottom"], "yes");
  assert.equal(fixture.controlState.get("#tilePaletteFitWidth")["aria-pressed"], "true");
  assert.equal(fixture.controlState.get("#tilePaletteScale").disabled, true);
  assert.equal(
    fixture.controlState.get("#tilePaletteScaleValue")["tile-palette-scale-value-disabled"],
    true,
  );
});

test("existing manual scale preferences still default to Fit", async () => {
  const fixture = await createTilePalette({
    preferences: { "tilepalette.scale_8x8": "1.5" },
  });

  fixture.palette.setScale();

  assert.equal(fixture.palette.fitToWidth, true);
  assert.equal(fixture.display.scale, 1.5);
  assert.equal(fixture.preferences["tilepalette.fitToWidth.bottom"], "yes");
  assert.equal(fixture.controlState.get("#tilePaletteFitWidth")["aria-pressed"], "true");
  assert.equal(fixture.controlState.get("#tilePaletteScale").disabled, true);
});

test("leaving Fit freezes and saves the computed scale", async () => {
  const fixture = await createTilePalette();
  fixture.palette.setScale();
  fixture.palette.width = 600;
  fixture.palette.height = 100;
  fixture.palette.updateFitToWidthScale();

  fixture.palette.setFitToWidth(false);

  assert.equal(fixture.display.scale, 3.375);
  assert.equal(fixture.preferences["tilepalette.fitToWidth.bottom"], "no");
  assert.equal(fixture.preferences["tilepalette.scale_8x8"], "3.375");
  assert.equal(fixture.controlState.get("#tilePaletteScale").disabled, false);
});

test("side and bottom palettes persist Fit independently", async () => {
  const bottom = await createTilePalette();
  const side = await createTilePalette({ prefix: "side" });

  assert.equal(bottom.palette.getFitToWidthPreferenceName(), "tilepalette.fitToWidth.bottom");
  assert.equal(side.palette.getFitToWidthPreferenceName(), "tilepalette.fitToWidth.side");
});

test("monochrome mode redraws and stays synchronized across tile palettes", async () => {
  const bottom = await createTilePalette();
  const side = await createTilePalette({ prefix: "side" });
  const editor = bottom.palette.editor;
  editor.tools = { drawTools: { tilePalette: bottom.palette } };
  editor.sideTilePalette = side.palette;
  side.palette.editor = editor;

  bottom.palette.setMonochrome(true);

  assert.equal(bottom.palette.monochrome, true);
  assert.equal(side.palette.monochrome, true);
  assert.equal(bottom.display.colors, "monochrome");
  assert.equal(side.display.colors, "monochrome");
  assert.equal(bottom.controlState.get("#tilePaletteMonochrome")["aria-pressed"], "true");
  assert.equal(side.controlState.get("#sidetilePaletteMonochrome")["aria-pressed"], "true");
  assert.equal(bottom.controlState.get("#tilePaletteMonochromeState").text, "Y");
  assert.equal(bottom.controlState.get("#tilePaletteMonochrome")["ui-button-primary"], false);
  assert.equal(bottom.display.drawCalls.length, 1);
  assert.equal(bottom.display.drawCalls[0].redrawTiles, true);
  assert.equal(side.display.drawCalls.length, 1);
  assert.equal(side.display.drawCalls[0].redrawTiles, true);

  side.palette.setMonochrome(false);

  assert.equal(bottom.display.colors, "current");
  assert.equal(side.display.colors, "current");
  assert.equal(bottom.controlState.get("#tilePaletteMonochrome")["aria-pressed"], "false");
  assert.equal(side.controlState.get("#sidetilePaletteMonochrome")["aria-pressed"], "false");
  assert.equal(side.controlState.get("#sidetilePaletteMonochromeState").text, "N");
});

test("tile info preview delegates fitting without inheriting monochrome mode", async () => {
  const fixture = await createTilePalette({ tileHeight: 16, tileWidth: 8 });
  const draws = [];
  fixture.palette.characterGlyphPreview = {
    drawTile(args) {
      draws.push(args);
    },
  };
  fixture.palette.monochrome = true;

  fixture.palette.setCharacterInfo(3);

  assert.equal(draws.length, 1);
  assert.equal(draws[0].tileSet.getTileWidth(), 8);
  assert.equal(draws[0].tileSet.getTileHeight(), 16);
  assert.equal(draws[0].character, 3);
  assert.equal(draws[0].color, 2);
  assert.equal(draws[0].bgColor, 3);
  assert.equal(draws[0].colorRGB, undefined);
  assert.equal(draws[0].bgColorRGB, undefined);
  assert.equal(draws[0].backgroundColor, "#222222");
});

test("tile info preview delegates the selected tile without changing its colors", async () => {
  const fixture = await createTilePalette();
  const draws = [];
  fixture.palette.characterGlyphPreview = {
    drawBitmap(args) {
      draws.push(args);
    },
  };

  fixture.palette.setCharacterInfo(false);

  assert.equal(draws.length, 1);
  assert.equal(draws[0].sourceCanvas, fixture.palette.editor.currentTile.tileSettingsTileCanvas);
  assert.equal(draws[0].backgroundColor, "#222222");
});

test("monochrome mode persists as a shared browser preference", async () => {
  const preferences = {};
  const first = await createTilePalette({ preferences });

  first.palette.setMonochrome(true, false);

  assert.equal(preferences["tilepalette.monochrome"], "yes");
  const restored = await createTilePalette({ preferences, prefix: "side" });
  assert.equal(restored.palette.monochrome, true);
  assert.equal(restored.display.colors, "monochrome");
  assert.equal(
    restored.controlState.get("#sidetilePaletteMonochrome")["aria-pressed"],
    "true",
  );

  restored.palette.setMonochrome(false, false);
  assert.equal(preferences["tilepalette.monochrome"], "no");
});

test("legacy scales for another tile size do not change the Fit default", async () => {
  const fixture = await createTilePalette({
    preferences: { "tilepalette.scale_16x16": "1.5" },
  });

  fixture.palette.setScale();

  assert.equal(fixture.palette.fitToWidth, true);
  assert.equal(fixture.preferences["tilepalette.fitToWidth.bottom"], "yes");
});

test("an explicit disabled Fit preference remains disabled", async () => {
  const fixture = await createTilePalette({
    preferences: {
      "tilepalette.fitToWidth.bottom": "no",
      "tilepalette.scale_8x8": "1.5",
    },
  });

  fixture.palette.setScale();

  assert.equal(fixture.palette.fitToWidth, false);
  assert.equal(fixture.display.scale, 1.5);
  assert.equal(fixture.controlState.get("#tilePaletteScale").disabled, false);
  assert.equal(
    fixture.controlState.get("#tilePaletteScaleValue")["tile-palette-scale-value-disabled"],
    false,
  );
});

test("manual tile palette scale is capped at 1000 percent", async () => {
  const fixture = await createTilePalette({
    preferences: { "tilepalette.scale_8x8": "2" },
  });

  fixture.palette.setScale(100);

  assert.equal(fixture.display.scale, 10);
  assert.equal(fixture.preferences["tilepalette.scale_8x8"], "10");
  assert.equal(fixture.controlState.get("#tilePaletteScale").value, 1000);
});

test("hidden tile palettes defer and merge selective redraws until shown", async () => {
  const fixture = await createTilePalette({ visible: false });
  fixture.palette.tileWidth = 8;
  fixture.palette.tileHeight = 8;

  fixture.palette.drawTilePalette({ redrawTiles: true, tiles: [3] });
  fixture.palette.drawTilePalette({ redrawTiles: true, tiles: [4, 3] });

  assert.equal(fixture.display.drawCalls.length, 0);

  fixture.setVisible(true);
  fixture.palette.drawTilePalette();

  assert.equal(fixture.display.drawCalls.length, 1);
  assert.equal(fixture.display.drawCalls[0].redrawTiles, true);
  assert.deepEqual(Array.from(fixture.display.drawCalls[0].tiles), [3, 4]);
});

test("hidden palette state changes use the deferred redraw boundary", async () => {
  const fixture = await createTilePalette({ visible: false });

  fixture.palette.setCharPaletteMapType("columns");

  assert.deepEqual(fixture.display.mapTypeCalls, [{ redraw: false, type: "columns" }]);
  assert.equal(fixture.display.drawCalls.length, 0);
  assert.equal(fixture.palette.pendingTilePaletteRedraw, true);

  fixture.setVisible(true);
  fixture.palette.drawTilePalette();

  assert.equal(fixture.display.drawCalls.length, 1);
  assert.equal(fixture.display.drawCalls[0].redrawTiles, true);
  assert.equal(fixture.display.drawCalls[0].tiles, undefined);
});
