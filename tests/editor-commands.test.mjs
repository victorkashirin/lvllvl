import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadClassic(relativePath, exportName, globals = {}) {
  const source = await readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
  const context = vm.createContext({ ...globals });
  vm.runInContext(`${source}\n;globalThis.__exported = ${exportName};`, context);
  return context.__exported;
}

function replayEditor(error) {
  return {
    tileSetManager: {
      getCurrentTileSet() {
        return { setPixel() { throw error; } };
      },
    },
  };
}

test("classic undo restores position and enabled state after replay fails", async () => {
  const History = await loadClassic("js/textMode/history.js", "History", { g_newSystem: false });
  const history = new History();
  history.init(replayEditor(new Error("undo failed")));
  history.history = [{ actions: [{ name: "setCharPixel", params: { c: 0, x: 0, y: 0 } }] }];
  history.historyLength = 1;
  history.historyPosition = 1;
  history.enabled = false;

  assert.throws(() => history.undo(), /undo failed/);
  assert.equal(history.historyPosition, 1);
  assert.equal(history.enabled, false);
});

test("classic redo restores position and enabled state after replay fails", async () => {
  const History = await loadClassic("js/textMode/history.js", "History", { g_newSystem: false });
  const history = new History();
  history.init(replayEditor(new Error("redo failed")));
  history.history = [{ actions: [{ name: "setCharPixel", params: { c: 0, x: 0, y: 0 } }] }];
  history.historyLength = 1;
  history.historyPosition = 0;

  assert.throws(() => history.redo(), /redo failed/);
  assert.equal(history.historyPosition, 0);
  assert.equal(history.enabled, true);
});

test("classic undo compensates actions applied before replay fails", async () => {
  const History = await loadClassic("js/textMode/history.js", "History", { g_newSystem: false });
  const failure = new Error("undo failed after mutation");
  let backgroundColor = 7;
  const editor = {
    setBackgroundColor(color) {
      backgroundColor = color;
    },
    tileSetManager: {
      getCurrentTileSet() {
        return { setPixel() { throw failure; } };
      },
    },
    tools: { currentBackgroundColor: 7 },
  };
  const history = new History();
  history.init(editor);
  history.history = [{ actions: [
    { name: "setCharPixel", params: { c: 0, x: 0, y: 0, oldValue: 0, newValue: 1 } },
    { name: "setBackgroundColor", params: { oldColor: 2, newColor: 7 } },
  ] }];
  history.historyLength = 1;
  history.historyPosition = 1;

  assert.throws(() => history.undo(), /undo failed after mutation/);
  assert.equal(history.historyPosition, 1);
  assert.equal(history.enabled, true);
  assert.equal(backgroundColor, 7);
  assert.equal(editor.tools.currentBackgroundColor, 7);
});

test("classic redo compensates actions applied before replay fails", async () => {
  const History = await loadClassic("js/textMode/history.js", "History", { g_newSystem: false });
  const failure = new Error("redo failed after mutation");
  let backgroundColor = 2;
  const editor = {
    setBackgroundColor(color) {
      backgroundColor = color;
    },
    tileSetManager: {
      getCurrentTileSet() {
        return { setPixel() { throw failure; } };
      },
    },
    tools: { currentBackgroundColor: 2 },
  };
  const history = new History();
  history.init(editor);
  history.history = [{ actions: [
    { name: "setBackgroundColor", params: { oldColor: 2, newColor: 7 } },
    { name: "setCharPixel", params: { c: 0, x: 0, y: 0, oldValue: 0, newValue: 1 } },
  ] }];
  history.historyLength = 1;
  history.historyPosition = 0;

  assert.throws(() => history.redo(), /redo failed after mutation/);
  assert.equal(history.historyPosition, 0);
  assert.equal(history.enabled, true);
  assert.equal(backgroundColor, 2);
  assert.equal(editor.tools.currentBackgroundColor, 2);
});

test("unchanged character pixels do not mutate, dirty, redraw, or enter history", async () => {
  class HTMLCanvasElement {}
  HTMLCanvasElement.prototype.toBlob = () => {};
  const TileSet = await loadClassic("js/textMode/tileSet/tileSet.js", "TileSet", {
    Blob,
    HTMLCanvasElement,
    TextModeEditor: { Mode: { C64ECM: "c64ecm" } },
    Uint8Array,
  });
  const tileSet = new TileSet();
  let actions = 0;
  let dirty = 0;
  let redraws = 0;
  tileSet.charWidth = 1;
  tileSet.tileData = [{ data: [[1]], props: { animated: false } }];
  tileSet.editor = {
    history: { addAction() { actions++; } },
    layers: { getSelectedLayerObject: () => ({ getType: () => "other" }) },
  };
  tileSet.getPixel = () => 1;
  tileSet.modified = () => { dirty++; };
  tileSet.updateCharacter = () => { redraws++; };
  tileSet.updateCharacterCurrentData = () => { redraws++; };

  assert.equal(tileSet.setPixel(0, 0, 0, 1), false);
  assert.deepEqual({ actions, dirty, redraws, value: tileSet.tileData[0].data[0][0] }, {
    actions: 0,
    dirty: 0,
    redraws: 0,
    value: 1,
  });
});
