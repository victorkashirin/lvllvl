import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function createTilePalette({ preferences = {}, prefix = "" } = {}) {
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
  const context = vm.createContext({
    $: jquery,
    UI: { isMobile: { any: () => false } },
    localStorage,
    g_app: {
      getPref(key) {
        return Object.hasOwn(preferences, key) ? String(preferences[key]) : null;
      },
      setPref(key, value) {
        preferences[key] = String(value);
      },
    },
  });
  vm.runInContext(source, context, {
    filename: "src/js/textMode/tools/tilePalette.js",
  });

  const display = {
    drawCalls: [],
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
    setScale(scale) {
      this.scale = scale;
    },
  };
  const palette = new context.TilePalette();
  palette.prefix = prefix;
  palette.editor = {
    tileSetManager: {
      getCurrentTileSet() {
        return {
          getTileHeight: () => 8,
          getTileWidth: () => 8,
        };
      },
    },
  };
  palette.tilePaletteDisplay = display;

  return { controlState, display, palette, preferences };
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
