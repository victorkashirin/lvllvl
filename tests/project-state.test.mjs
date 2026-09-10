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
const projectNavigatorMobileSource = readFileSync(
  new URL("../src/js/file/projectNavigatorMobile.js", import.meta.url),
  "utf8",
);
const textModeEditorSource = readFileSync(
  new URL("../src/js/textMode/textModeEditor.js", import.meta.url),
  "utf8",
);
const grid3dSource = readFileSync(
  new URL("../src/js/textMode/grid3d.js", import.meta.url),
  "utf8",
);
const editorProjectLifecycleSource = readFileSync(
  new URL("../src/js/editor/editorProjectLifecycle.js", import.meta.url),
  "utf8",
);

function createJQueryState() {
  const state = new Map([
    ["#newProjectWidth", { value: "40" }],
    ["#newProjectHeight", { value: "25" }],
    ["#newProjectTileRotate", { checked: true }],
    ["#newProjectTileFlip", { checked: true }],
    ["#newProjectDimensionsError", {}],
    ["#newProjectFileNameMobile", { value: "Untitled" }],
    ["#newDocRecordGridWidthMobile", { value: "40" }],
    ["#newDocRecordGridHeightMobile", { value: "25" }],
    ["#newDocRecordGridDepthMobile", { value: "25" }],
    ["#newDocRecordMobileError", {}],
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
      attr(name, value) { item[name] = value; return this; },
      prop(name, value) { item[name] = value; return this; },
      removeAttr(name) { delete item[name]; return this; },
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
    Editor: function Editor() {},
    TextModeEditor: { Mode: { C64STANDARD: "c64standard" } },
    UI: {},
    g_app: {},
  });
  vm.runInContext(
    `${documentSource}\n${projectNavigatorSource}\n${newProjectDialogSource}\n` +
      `${projectNavigatorMobileSource}\n${textModeEditorSource}\n${grid3dSource}\n` +
      `${editorProjectLifecycleSource}\n` +
      "globalThis.TestDocument = Document;" +
      "globalThis.TestEditor = Editor;" +
      "globalThis.TestProjectNavigator = ProjectNavigator;" +
      "globalThis.TestNewProjectDialog = NewProjectDialog;" +
      "globalThis.TestProjectNavigatorMobile = ProjectNavigatorMobile;" +
      "globalThis.TestTextModeEditor = TextModeEditor;" +
      "globalThis.TestGrid3d = Grid3d;",
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

test("New Project rejects invalid dimensions before starting a project transition", () => {
  const { TestEditor, TestNewProjectDialog, g_app, jquery } = loadProjectState();
  let submitted;
  g_app.newProject = (args) => { submitted = args; };

  const dialog = new TestNewProjectDialog();
  jquery.state.get("#newProjectWidth").value = "201";
  assert.equal(dialog.createNewProject(), false);
  assert.equal(submitted, undefined);
  assert.match(jquery.state.get("#newProjectDimensionsError").text, /200 or less/);
  assert.equal(jquery.state.get("#newProjectDimensionsError").visible, true);
  assert.equal(jquery.state.get("#newProjectWidth")["aria-invalid"], "true");
  assert.equal(jquery.state.get("#newProjectWidth").focused, true);

  const editor = new TestEditor();
  let transitions = 0;
  editor.beginProjectTransition = () => { transitions++; return 1; };
  editor.fileManager = { setIsNew() {} };
  assert.equal(editor.newProject({ width: 201, height: 25 }), false);
  assert.equal(transitions, 0);

  jquery.state.get("#newProjectWidth").value = "40";
  jquery.state.get("#newProjectHeight").value = "25";
  assert.equal(dialog.createNewProject(), true);
  assert.equal(submitted.width, 40);
  assert.equal(submitted.height, 25);
});

test("mobile document creation rejects invalid names and bounded dimensions", () => {
  const {
    TestGrid3d,
    TestProjectNavigatorMobile,
    TestTextModeEditor,
    UI,
    g_app,
    jquery,
  } = loadProjectState();
  const closedDialogs = [];
  UI.closeDialog = (dialog) => { closedDialogs.push(dialog); };
  g_app.doc = {
    getDocRecord() { return null; },
  };

  let createCalls = 0;
  g_app.textModeEditor = {
    createDoc() { createCalls++; },
    grid3d: { createDoc() { createCalls++; } },
  };
  const navigator = new TestProjectNavigatorMobile();
  navigator.uiComponent = { id: "project-navigator" };

  const invalid = [
    { args: { type: "screen", name: "   ", width: "40", height: "25" }, field: "name" },
    { args: { type: "screen", name: "Screen", width: "text", height: "25" }, field: "gridWidth" },
    { args: { type: "screen", name: "Screen", width: "40", height: "0" }, field: "gridHeight" },
    { args: { type: "3d scene", name: "Scene", width: "40", height: "25", depth: "-1" }, field: "gridDepth" },
    { args: { type: "screen", name: "Screen", width: "201", height: "25" }, field: "gridWidth" },
  ];
  const fieldSelectors = {
    name: "#newProjectFileNameMobile",
    gridWidth: "#newDocRecordGridWidthMobile",
    gridHeight: "#newDocRecordGridHeightMobile",
    gridDepth: "#newDocRecordGridDepthMobile",
  };
  for(const fixture of invalid) {
    assert.equal(navigator.newRecord(fixture.args), false);
    const selector = fieldSelectors[fixture.field];
    assert.equal(jquery.state.get(selector)["aria-invalid"], "true");
    assert.equal(jquery.state.get(selector).focused, true);
    assert.equal(jquery.state.get("#newDocRecordMobileError").visible, true);
  }
  assert.equal(createCalls, 0);
  assert.deepEqual(closedDialogs, []);

  const normalized = TestTextModeEditor.validateDocCreation(
    { name: "  Valid  ", gridWidth: "40", gridHeight: "25" },
    ["gridWidth", "gridHeight"],
  );
  assert.equal(normalized.success, true);
  assert.equal(normalized.name, "Valid");
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalized.values)),
    { gridWidth: 40, gridHeight: 25 },
  );

  const editor = new TestTextModeEditor();
  editor.colorPaletteManager = { addColorPaletteToDoc() { createCalls++; } };
  assert.equal(editor.createDoc({ name: "Screen", gridWidth: 0, gridHeight: 25 }), false);

  const grid3d = new TestGrid3d();
  assert.equal(grid3d.createDoc({
    name: "Scene", gridWidth: 40, gridHeight: 25, gridDepth: Infinity,
  }), false);
  assert.equal(createCalls, 0);
});

test("mobile document completion closes its owner without closing a newer dialog", () => {
  const { TestProjectNavigatorMobile, UI, g_app } = loadProjectState();
  const projectDialog = { id: "project-navigator", isOpen: true };
  const newDocumentDialog = { id: "new-document", isOpen: true };
  const newerDialog = { id: "newer-dialog", isOpen: true };
  UI.dialogStack = [projectDialog, newDocumentDialog];
  UI.closeDialog = (dialog) => {
    const index = UI.dialogStack.indexOf(dialog);
    if(index === -1) return false;
    UI.dialogStack.splice(index, 1);
    dialog.isOpen = false;
    return true;
  };
  g_app.doc = { getDocRecord() { return null; } };

  let createArgs;
  let finishCreation;
  g_app.textModeEditor = {
    createDoc(args, callback) {
      createArgs = args;
      finishCreation = callback;
    },
  };
  const navigator = new TestProjectNavigatorMobile();
  navigator.uiComponent = projectDialog;
  navigator.updateProjectList = () => {};
  navigator.selectDoc = () => {};
  navigator.openSelected = () => true;

  assert.equal(navigator.newRecord({
    type: "screen", name: " Screen ", width: "40", height: "25",
  }), true);
  assert.equal(createArgs.name, "Screen");
  assert.equal(createArgs.gridWidth, 40);
  assert.equal(createArgs.gridHeight, 25);

  UI.closeDialog(newDocumentDialog);
  UI.dialogStack.push(newerDialog);
  finishCreation({ id: "created-screen" });

  assert.deepEqual(UI.dialogStack, [newerDialog]);
  assert.equal(projectDialog.isOpen, false);
  assert.equal(newerDialog.isOpen, true);
});
