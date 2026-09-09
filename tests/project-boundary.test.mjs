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

test("C64 machine reset preserves project-owned debugger state", async () => {
  let cartridgeRemovals = 0;
  let machineResets = 0;
  let projectResets = 0;
  const C64Debugger = await loadConstructor("src/js/c64/c64Debugger.js", "C64Debugger", {
    $: () => ({ html() {} }),
    c64_removeCartridge: () => { cartridgeRemovals++; },
    c64_reset: () => { machineResets++; },
    debugger_isRunning: () => false,
    getTimestamp: () => 0,
  });

  const debuggerInstance = new C64Debugger();
  debuggerInstance.crtData = { bytes: [1] };
  debuggerInstance.assemblerEditor = { resetProjectState() { projectResets++; } };
  debuggerInstance.machineReset();

  assert.equal(cartridgeRemovals, 1);
  assert.equal(machineResets, 1);
  assert.equal(projectResets, 0);
  assert.equal(debuggerInstance.crtData, null);
});

test("project navigator returns an empty path while no editor is selected", async () => {
  const ProjectNavigator = await loadConstructor(
    "src/js/file/projectNavigator.js",
    "ProjectNavigator",
    { g_app: { tabPanel: null } },
  );
  const navigator = new ProjectNavigator();

  assert.equal(navigator.getCurrentPath(), false);
  navigator.currentEditor = { doc: null };
  assert.equal(navigator.getCurrentPath(), false);
});

test("layers resolve palettes and tile sets through their owning project", async () => {
  const [LayerGrid, Grid3dLayer] = await Promise.all([
    loadConstructor("src/js/textMode/layers/layerGrid.js", "LayerGrid", {
      g_app: { doc: null, projectGeneration: 0 },
    }),
    loadConstructor("src/js/textMode/grid3dLayer.js", "Grid3dLayer", {
      g_app: { doc: null, projectGeneration: 0 },
    }),
  ]);
  const owner = { id: "old-project" };
  const calls = [];
  const editor = {
    colorPaletteManager: {
      getColorPalette(id, document) {
        calls.push(["palette", id, document]);
        return {};
      },
      getCurrentColorPalette() { return null; },
    },
    tileSetManager: {
      getTileSet(id, document) {
        calls.push(["tileset", id, document]);
        return {};
      },
      getCurrentTileSet() { return null; },
    },
  };

  const layer = new LayerGrid();
  layer.editor = editor;
  layer.projectDocument = owner;
  layer.doc = { colorPaletteId: "palette-old", tileSetId: "tileset-old" };
  layer.getColorPalette();
  layer.getTileSet();

  const layer3d = new Grid3dLayer();
  layer3d.editor = editor;
  layer3d.projectDocument = owner;
  layer3d.doc = { colorPaletteId: "palette-old", tileSetId: "tileset-old" };
  layer3d.getColorPalette();
  layer3d.getTileSet();

  assert.deepEqual(calls, [
    ["palette", "palette-old", owner],
    ["tileset", "tileset-old", owner],
    ["palette", "palette-old", owner],
    ["tileset", "tileset-old", owner],
  ]);
});
