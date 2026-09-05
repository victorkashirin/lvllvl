import assert from "node:assert/strict";
import test from "node:test";

import { EditorCommandService } from "../src/js/modules/application/editorCommandService.mjs";
import { EditorStateService } from "../src/js/modules/application/editorStateService.mjs";
import { HistoryService } from "../src/js/modules/application/historyService.mjs";
import { DocumentRevisionState } from "../src/js/modules/domain/documentRevisionState.mjs";
import {
  createLegacyTextModeHistoryCapabilities,
  createTextModeHistoryReplay,
} from "../src/js/modules/feature-adapters/textModeHistoryAdapter.mjs";

test("history preserves grouping, action shapes, replay order, and redo invalidation", () => {
  const replayed = [];
  const history = new HistoryService({
    replay: {
      replay(actions, direction) {
        replayed.push({ actions, direction });
      },
    },
  });

  history.startEntry("draw");
  history.addAction("setCell", {
    frame: 0,
    layerRef: "layer-a",
    x: 2,
    y: 3,
    z: 0,
    oldCharacter: 1,
    newCharacter: 2,
  });
  history.addAction("setCell", {
    frame: 0,
    layerRef: "layer-a",
    x: 2,
    y: 3,
    z: 0,
    oldCharacter: 2,
    newCharacter: 3,
  });
  history.addAction("cursorLocation", { x: 2, y: 3, z: 0 });
  assert.equal(history.endEntry(), true);

  assert.equal(history.historyLength, 1);
  assert.equal(history.history[0].actions.length, 2);
  assert.equal(history.history[0].actions[0].params.oldCharacter, 1);
  assert.equal(history.history[0].actions[0].params.newCharacter, 3);

  assert.equal(history.undo(), true);
  assert.equal(replayed[0].direction, "undo");
  assert.equal(replayed[0].actions, history.history[0].actions);
  assert.equal(history.redo(), true);
  assert.equal(replayed[1].direction, "redo");

  history.undo();
  history.startEntry("replacement");
  history.addAction("setBackgroundColor", { oldColor: 0, newColor: 1 });
  history.endEntry();
  assert.equal(history.historyLength, 1);
  assert.equal(history.redo(), false, "a new command drops the old redo tail");
});

test("history ignores empty entries and restores its position after replay fails", () => {
  let fail = true;
  const history = new HistoryService({
    replay: {
      replay() {
        if (fail) throw new Error("replay failed");
      },
    },
  });

  history.startEntry("empty");
  assert.equal(history.endEntry(), false);
  assert.equal(history.historyLength, 0);

  history.startEntry("change");
  history.addAction("setCharPixel", { c: 1, x: 0, y: 0, oldValue: 0, newValue: 1 });
  history.endEntry();
  assert.throws(() => history.undo(), /replay failed/);
  assert.equal(history.historyPosition, 1);
  assert.equal(history.getEnabled(), true);

  fail = false;
  assert.equal(history.undo(), true);
  assert.equal(history.historyPosition, 0);
});

test("document switching isolates history while frame, layer, tool, and mode changes do not", () => {
  const replayed = [];
  const commands = new EditorCommandService({
    replay: {
      replay(actions, direction) {
        replayed.push([actions[0].params.documentId, direction]);
      },
    },
  });

  commands.activateDocument("document-a");
  commands.setFrame(4);
  commands.setLayer("foreground");
  commands.setTool("pen");
  commands.setMode("2d");
  commands.startEntry("a");
  commands.addAction("example", { documentId: "document-a" });
  commands.endEntry();

  commands.activateDocument("document-b");
  commands.setFrame(1);
  commands.setLayer("background");
  commands.setMode("pixel");
  assert.equal(commands.undo(), false);

  commands.startEntry("b");
  commands.addAction("example", { documentId: "document-b" });
  commands.endEntry();
  assert.equal(commands.undo(), true);

  commands.activateDocument("document-a");
  assert.deepEqual(commands.state.snapshot(), {
    documentId: "document-a",
    selection: null,
    frame: 4,
    layer: "foreground",
    tool: "pen",
    mode: "2d",
  });
  assert.equal(commands.undo(), true);
  assert.deepEqual(replayed, [
    ["document-b", "undo"],
    ["document-a", "undo"],
  ]);
});

test("tile edits share mutation, selection, dirty revision, history, and invalidation behavior", () => {
  let pixel = 0;
  let invalidations = 0;
  const revisions = new DocumentRevisionState();
  const commands = new EditorCommandService({
    replay: {
      replay(actions, direction) {
        const action = actions[0];
        pixel = direction === "undo" ? action.params.oldValue : action.params.newValue;
        revisions.markModified("tiles", "/tile sets/test");
        invalidations++;
      },
    },
  });
  commands.activateDocument("document");

  const invokeRoute = (newValue) => {
    commands.startEntry("draw char pixels");
    const changed = commands.executeTilePixelEdit({
      character: 7,
      x: 2,
      y: 1,
      frame: 0,
      oldValue: pixel,
      newValue,
      apply() {
        pixel = newValue;
      },
      markDirty() {
        revisions.markModified("tiles", "/tile sets/test");
      },
      invalidate() {
        invalidations++;
      },
    });
    commands.endEntry();
    return changed;
  };

  assert.equal(invokeRoute(1), true);
  assert.equal(pixel, 1);
  assert.equal(revisions.modifiedRevision, 1);
  assert.equal(invalidations, 1);
  assert.deepEqual(commands.state.selection, {
    character: 7,
    frame: 0,
    kind: "tile-pixel",
    x: 2,
    y: 1,
  });

  assert.equal(invokeRoute(1), false, "an unchanged tile is an empty command");
  assert.equal(commands.activeHistory.historyLength, 1);
  assert.equal(revisions.modifiedRevision, 1);
  assert.equal(invalidations, 1);

  assert.equal(commands.undo(), true);
  assert.equal(pixel, 0);
  assert.equal(commands.redo(), true);
  assert.equal(pixel, 1);
  assert.equal(revisions.modifiedRevision, 3);
  assert.equal(invalidations, 3);
});

test("editor state snapshots do not expose mutable selection state", () => {
  const state = new EditorStateService();
  state.activateDocument("document");
  const selection = { from: { x: 1 }, to: { x: 2 } };
  state.setSelection(selection);
  selection.from.x = 99;
  const snapshot = state.snapshot();
  snapshot.selection.to.x = 99;
  assert.deepEqual(state.selection, { from: { x: 1 }, to: { x: 2 } });
});

test("the text-mode replay adapter covers every migrated legacy action family", () => {
  const mutations = [];
  const invalidations = [];
  let currentFrame = 3;
  const recordMutation = (name) => (...args) => mutations.push([name, ...args]);
  const recordInvalidation = (name) => (...args) => invalidations.push([name, ...args]);
  const tileSet = {
    setPixel: recordMutation("tile-pixel"),
    updateCharacter: recordInvalidation("tile-update"),
  };
  const editor = {
    blockSetManager: {
      getCurrentBlockSet() {
        return { setCharacterInBlock: recordMutation("block-cell") };
      },
    },
    frames: {
      deleteFrame: recordMutation("frame-delete"),
      gotoFrame(frame) {
        currentFrame = frame;
        mutations.push(["frame-goto", frame]);
      },
      insertFrame: recordMutation("frame-insert"),
    },
    graphic: {
      getCurrentFrame() {
        return currentFrame;
      },
      invalidateAllCells: recordInvalidation("graphic-invalidate"),
      redraw: recordInvalidation("graphic-redraw"),
    },
    grid: {
      setBorderColor: recordMutation("border"),
      update: recordInvalidation("grid-update"),
    },
    grid3d: { setCell: recordMutation("cell-3d") },
    gridView2d: {
      draw: recordInvalidation("grid-draw"),
      setLastCursorLocation: recordMutation("cursor"),
    },
    layers: {
      deleteLayer: recordMutation("layer-delete"),
      getLayerObjectFromRef(layerRef) {
        return { setCell: (args) => mutations.push(["cell-2d", layerRef, args]) };
      },
      newLayer: recordMutation("layer-new"),
      updateAllLayerPreviews: recordInvalidation("layer-previews"),
    },
    setBackgroundColor: recordMutation("background"),
    tileSetManager: {
      getCurrentTileSet() {
        return tileSet;
      },
      tileSetUpdated: recordInvalidation("tile-set-updated"),
    },
    tools: {
      currentBackgroundColor: null,
      currentBorderColor: null,
      drawTools: {
        pixelDraw: { setLastCursorPixelLocation: recordMutation("pixel-cursor") },
        pixelSelect: { setSelection: recordMutation("pixel-selection") },
        select: { setSelection: recordMutation("selection") },
      },
    },
  };
  const capabilities = createLegacyTextModeHistoryCapabilities(editor);
  const replay = createTextModeHistoryReplay(capabilities);

  const cellParams = {
    frame: 3,
    layerRef: "layer-a",
    x: 2,
    y: 4,
    z: 1,
    oldCharacter: 10,
    newCharacter: 11,
    oldColor: 1,
    newColor: 2,
    oldBgColor: 3,
    newBgColor: 4,
    oldRx: 5,
    newRx: 6,
    oldRy: 7,
    newRy: 8,
    oldRz: 9,
    newRz: 10,
    oldFh: 0,
    newFh: 1,
    oldFv: 1,
    newFv: 0,
    oldB: 12,
    newB: 13,
  };
  const oldCell = {
    t: 10, x: 2, y: 4, z: 1, fc: 1, bc: 3,
    rx: 5, ry: 7, rz: 9, fh: 0, fv: 1, update: false, b: 12,
  };
  const newCell = {
    t: 11, x: 2, y: 4, z: 1, fc: 2, bc: 4,
    rx: 6, ry: 8, rz: 10, fh: 1, fv: 0, update: false, b: 13,
  };
  const lastFrom = { x: 1, y: 2, z: 0 };
  const lastTo = { x: 3, y: 4, z: 0 };
  const from = { x: 5, y: 6, z: 0 };
  const to = { x: 7, y: 8, z: 0 };
  const frameData = { duration: 9 };
  const layerFrameData = [{ cells: [] }];
  const layerData = { label: "Recovered" };
  const scenarios = [
    {
      action: { name: "setCell", params: cellParams },
      undo: [["cell-2d", "layer-a", oldCell]],
      redo: [["cell-2d", "layer-a", newCell]],
    },
    {
      action: { name: "setCell3d", params: cellParams },
      undo: [["cell-3d", oldCell]],
      redo: [["cell-3d", newCell]],
    },
    {
      action: {
        name: "setBlockCell",
        params: { b: 5, x: 6, y: 7, oldCharacter: 8, newCharacter: 9 },
      },
      undo: [["block-cell", 5, 6, 7, 8]],
      redo: [["block-cell", 5, 6, 7, 9]],
    },
    {
      action: { name: "cursorLocation", params: { x: 1, y: 2, z: 3 } },
      undo: [["cursor", { x: 1, y: 2, z: 3 }]],
      redo: [],
    },
    {
      action: { name: "cursorPixelLocation", params: { x: 4, y: 5, z: 6 } },
      undo: [["pixel-cursor", { x: 4, y: 5, z: 6 }]],
      redo: [],
    },
    {
      action: {
        name: "setSelection",
        params: { lastFrom, lastTo, lastEnabled: false, from, to, enabled: true },
      },
      undo: [["selection", { from: lastFrom, to: lastTo, enabled: false }]],
      redo: [["selection", { from, to, enabled: true }]],
    },
    {
      action: {
        name: "pixelSetSelection",
        params: { lastFrom, lastTo, lastEnabled: true, from, to, enabled: false },
      },
      undo: [["pixel-selection", { from: lastFrom, to: lastTo, enabled: true }]],
      redo: [["pixel-selection", { from, to, enabled: false }]],
    },
    {
      action: {
        name: "setCharPixel",
        params: { c: 14, x: 2, y: 3, oldValue: 0, newValue: 1 },
      },
      undo: [["tile-pixel", 14, 2, 3, 0, false]],
      redo: [["tile-pixel", 14, 2, 3, 1, false]],
    },
    {
      action: { name: "setBackgroundColor", params: { oldColor: 2, newColor: 4 } },
      undo: [["background", 2]],
      redo: [["background", 4]],
    },
    {
      action: { name: "setBorderColor", params: { oldColor: 6, newColor: 8 } },
      undo: [["border", 6]],
      redo: [["border", 8]],
    },
    {
      action: { name: "insertframe", params: { position: 4 } },
      undo: [["frame-delete", 5]],
      redo: [["frame-insert", 4]],
    },
    {
      action: {
        name: "deleteframe",
        params: { position: 4, frameData, layerFrameData },
      },
      undo: [["frame-insert", 3, false, frameData, layerFrameData]],
      redo: [["frame-delete", 4]],
    },
    {
      action: { name: "createlayer", params: { layerId: "created" } },
      undo: [["layer-delete", { layerId: "created" }]],
      redo: [["layer-new", { layerId: "created" }]],
    },
    {
      action: {
        name: "deletelayer",
        params: { layerId: "deleted", layerPosition: 2, layerData },
      },
      undo: [["layer-new", { layerId: "deleted", layerPosition: 2, layerData }]],
      redo: [["layer-delete", { layerId: "deleted" }]],
    },
  ];

  for (const scenario of scenarios) {
    const history = new HistoryService({ replay });
    history.startEntry(scenario.action.name);
    history.addAction(scenario.action.name, scenario.action.params);
    history.endEntry();

    mutations.length = 0;
    assert.equal(history.undo(), true);
    assert.deepEqual(mutations, scenario.undo, `${scenario.action.name} undo identity`);

    mutations.length = 0;
    assert.equal(history.redo(), true);
    assert.deepEqual(mutations, scenario.redo, `${scenario.action.name} redo identity`);
  }

  assert.ok(invalidations.some(([name]) => name === "graphic-redraw"));
  assert.ok(invalidations.some(([name]) => name === "grid-update"));
  assert.ok(invalidations.some(([name]) => name === "layer-previews"));
  assert.ok(invalidations.some(([name]) => name === "tile-set-updated"));
});
