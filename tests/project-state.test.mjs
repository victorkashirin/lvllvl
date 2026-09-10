import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const documentSource = readFileSync(
  new URL("../src/js/file/document.js", import.meta.url),
  "utf8",
);
const projectNavigatorSource = readFileSync(
  new URL("../src/js/file/projectNavigator.js", import.meta.url),
  "utf8",
);
const newProjectDialogSource = readFileSync(
  new URL("../src/js/file/newProjectDialog.js", import.meta.url),
  "utf8",
);

function createJQueryState() {
  const state = new Map([
    ["#newProjectWidth", { value: "40" }],
    ["#newProjectHeight", { value: "25" }],
    ["#newProjectTileRotate", { checked: true }],
    ["#newProjectTileFlip", { checked: true }],
  ]);

  function $(selector) {
    if(!state.has(selector)) state.set(selector, {});
    const item = state.get(selector);
    return {
      focus() { item.focused = true; return this; },
      hide() { item.visible = false; return this; },
      html(value) {
        if(value !== undefined) { item.text = value; return this; }
        return item.text;
      },
      is(query) { return query === ":checked" ? item.checked === true : false; },
      prop(name, value) { item[name] = value; return this; },
      show() { item.visible = true; return this; },
      text(value) {
        if(value !== undefined) { item.text = value; return this; }
        return item.text;
      },
      val(value) {
        if(value !== undefined) { item.value = value; return this; }
        return item.value;
      },
    };
  }

  return { $, state };
}

function loadProjectState() {
  const jquery = createJQueryState();
  const sandbox = vm.createContext({
    $: jquery.$,
    console,
    TextModeEditor: { Mode: { C64STANDARD: "c64standard" } },
    UI: {},
    g_app: {},
  });
  vm.runInContext(
    `${documentSource}\n${projectNavigatorSource}\n${newProjectDialogSource}\n` +
      "globalThis.TestDocument = Document;" +
      "globalThis.TestProjectNavigator = ProjectNavigator;" +
      "globalThis.TestNewProjectDialog = NewProjectDialog;",
    sandbox,
  );
  return { ...sandbox, jquery };
}

function createDocument(TestDocument) {
  const doc = new TestDocument();
  doc.data = {
    children: [{
      id: "screens-folder",
      name: "screens",
      type: "folder",
      children: [
        { id: "first", name: "First", type: "graphic", data: {}, children: [] },
        { id: "second", name: "Second", type: "graphic", data: {}, children: [] },
      ],
    }],
  };
  return doc;
}

test("deleting the current document closes its id-keyed tab and clears the editor", () => {
  const { TestProjectNavigator, g_app } = loadProjectState();
  const record = { id: "screen-id", name: "Screen", type: "graphic" };
  const tabs = new Set([record.id]);
  const treeRows = new Set([record.id]);
  let closedKey;
  let mode = "2d";
  g_app.doc = {
    deleteDocRecord(path) { record.deleted = path === "/screens/Screen"; return true; },
    getDocRecord(path) { return path === "/screens/Screen" ? record : {}; },
  };
  g_app.tabPanel = {
    closeTab(key) { closedKey = key; tabs.delete(key); },
    getTabs() { return [...tabs]; },
  };
  g_app.setMode = (nextMode) => { mode = nextMode; };

  const navigator = new TestProjectNavigator();
  navigator.currentPath = "/screens/Screen";
  navigator.currentEditor = {};
  navigator.refreshTreeNodeFromPath = () => {
    if(record.deleted) treeRows.delete(record.id);
  };
  navigator.treeRoot = { refreshChildren() {} };

  assert.equal(navigator.deleteRecord("/screens/Screen"), true);
  assert.equal(record.deleted, true);
  assert.equal(treeRows.has(record.id), false);
  assert.equal(tabs.has(record.id), false);
  assert.equal(closedKey, "screen-id");
  assert.equal(navigator.currentPath, false);
  assert.equal(navigator.currentEditor, null);
  assert.equal(mode, "none");
});

test("renaming an open document updates validation, tab, editor, and saved paths", () => {
  const { TestDocument, TestProjectNavigator, g_app, jquery } = loadProjectState();
  const doc = createDocument(TestDocument);
  let updatedTab = null;
  g_app.doc = doc;
  g_app.projectNavigator = { updateModifiedList() {} };
  g_app.tabPanel = {
    getTabIndex(key) { return key === "first" ? 0 : -1; },
    setTabData(index, data) { updatedTab = { index, ...data }; },
  };
  g_app.textModeEditor = {
    colorPaletteManager: { getColorPalette() { return null; } },
    tileSetManager: { getTileSet() { return null; } },
  };

  const navigator = new TestProjectNavigator();
  navigator.currentPath = "/screens/First";
  navigator.currentEditor = { path: "/screens/First" };
  navigator.tree = {
    getNodeFromPath() { return { getParentNode() { return {}; } }; },
  };
  navigator.treeRoot = { refreshChildren() {} };
  navigator.refreshTreeNode = () => {};

  assert.equal(navigator.renameDocRecord("/screens/First", "  Renamed  "), true);
  assert.equal(doc.getDocRecord("/screens/First"), null);
  assert.equal(doc.getDocRecord("/screens/Renamed").id, "first");
  assert.equal(doc.modified.first.path, "/screens/Renamed");
  assert.equal(navigator.currentPath, "/screens/Renamed");
  assert.equal(navigator.currentEditor.path, "/screens/Renamed");
  assert.deepEqual(updatedTab, { index: 0, path: "/screens/Renamed", title: "Renamed" });
  const savedFiles = doc.getFiles();
  assert.equal(savedFiles[0].path, "/screens/Renamed.json");
  const reopened = new TestDocument({
    documentSession: {
      adoptLegacyState() {},
      createId() { return "reopened-id"; },
      get modified() { return {}; },
      get modifiedRevision() { return 0; },
      markModified() {},
    },
  });
  reopened.data = { children: [] };
  reopened.addRecord(savedFiles[0]);
  assert.equal(reopened.getDocRecord("/screens/Renamed").name, "Renamed");
  assert.equal(reopened.getDocRecord("/screens/First"), null);

  assert.equal(navigator.renameDocRecord("/screens/Renamed", "Second"), false);
  assert.equal(doc.getDocRecord("/screens/Renamed").id, "first");
  assert.match(jquery.state.get("#renameDocRecordError").text, /already exists/);
  assert.equal(jquery.state.get("#renameDocRecordError").visible, true);

  assert.equal(navigator.renameDocRecord("/screens/Renamed", "   "), false);
  assert.match(jquery.state.get("#renameDocRecordError").text, /enter a name/);
});

test("switching mode replaces a custom tile set before New Project submits", () => {
  const { TestNewProjectDialog, g_app, jquery } = loadProjectState();
  let chooseCallback;
  let submitted;
  g_app.textModeEditor = {
    tileSetManager: {
      getChoosePresetDialog() {
        return { show(args) { chooseCallback = args.callback; } };
      },
    },
  };
  g_app.newProject = (args) => { submitted = args; };

  const dialog = new TestNewProjectDialog();
  dialog.chooseTileSet();
  chooseCallback({
    colorPalette: { colors: [0xff0000] },
    description: { name: "Imported tiles" },
    mode: "indexed",
    presetId: false,
    tileSet: { tiles: [1, 2, 3] },
    tileSetCreated: true,
    type: "character",
  });
  dialog.setMode("petscii");
  dialog.createNewProject();

  assert.equal(jquery.state.get("#newProjectTileSet").text, "C64 PETSCII");
  assert.equal(submitted.screenMode, "c64standard");
  assert.equal(submitted.tileSetPresetId, "petscii");
  assert.equal(submitted.tileSetCreated, false);
  assert.equal(submitted.tileSet, null);
  assert.equal(submitted.tileSetName, "C64 PETSCII");
});

test("named tile and palette presets submit the names shown in New Project", () => {
  const { TestNewProjectDialog, g_app, jquery } = loadProjectState();
  let tileSetCallback;
  let colorPaletteCallback;
  let submitted;
  g_app.textModeEditor = {
    colorPaletteManager: {
      getChoosePresetDialog() {
        return { show(args) { colorPaletteCallback = args.callback; } };
      },
    },
    tileSetManager: {
      getChoosePresetDialog() {
        return { show(args) { tileSetCallback = args.callback; } };
      },
    },
  };
  g_app.newProject = (args) => { submitted = args; };

  const dialog = new TestNewProjectDialog();
  dialog.chooseTileSet();
  tileSetCallback({
    description: { name: "Teletext" },
    mode: "textmode",
    presetId: "teletext",
    tileSetCreated: false,
    type: "character",
  });
  dialog.chooseColorPalette();
  colorPaletteCallback({
    colorPaletteCreated: false,
    description: { name: "Dawn" },
    presetId: "dawn",
  });
  dialog.createNewProject();

  assert.equal(jquery.state.get("#newProjectTileSet").text, "Teletext");
  assert.equal(jquery.state.get("#newProjectColorPalette").text, "Dawn");
  assert.equal(submitted.tileSetPresetId, "teletext");
  assert.equal(submitted.tileSetName, "Teletext");
  assert.equal(submitted.colorPalettePresetId, "dawn");
  assert.equal(submitted.colorPaletteName, "Dawn");
});
