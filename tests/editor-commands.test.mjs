import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { CommandService } from "../src/js/modules/application/commandService.mjs";
import {
  createLegacyCommandCatalogAdapter as createCatalogBridge,
} from "../src/js/modules/feature-adapters/legacyCommandCatalogAdapter.mjs";
import { editorCommandDefinitions, getEditorCommandDefinition } from "../src/js/modules/domain/editorCommandDefinitions.mjs";
import { createSafeShortcutContext } from "../src/js/modules/domain/shortcutContext.mjs";
import { registerNativeEditorCommands } from "../src/js/modules/feature-adapters/nativeEditorCommands.mjs";
import { createShortcutContextProvider } from "../src/js/modules/feature-adapters/shortcutContextProvider.mjs";
import { createShortcutLabelProjection } from "../src/js/modules/feature-adapters/shortcutLabelProjection.mjs";
import "../src/js/styles.js";

const toolMetadata = globalThis.ShortcutCatalogMetadata;

// Mirror bootstrap composition without allowing one feature adapter to own
// another's registration or presentation responsibilities.
function createLegacyCommandCatalogAdapter(dependencies) {
  return createCatalogBridge({
    ...dependencies,
    registerNativeCommands: () => registerNativeEditorCommands(dependencies),
    labels: createShortcutLabelProjection(dependencies),
  });
}

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

test("Zoom In keeps both built-in aliases in one override lifecycle", async () => {
  const document = {
    getElementById: () => null,
    querySelectorAll: () => [],
  };
  let stored = null;
  const commands = new CommandService({
    clearTimer() {},
    getContext: () => ({
      editorMode: "2d",
      focus: "canvas",
      modal: "none",
      popupOpen: false,
      shortcutsAllowed: true,
    }),
    platform: "other",
    setTimer: () => 1,
    storage: {
      load: () => stored,
      save: (value) => { stored = value },
    },
  });
  const zoomItem = {
    commandId: "view.zoomin",
    enabled: true,
    id: "menu-view-zoomin",
    label: "Renamed Zoom",
    setShortcutText() {},
    shortcut: { cmd: true, key: "Q" },
    type: "item",
    uiID: "view-zoomin",
    visible: true,
  };
  const activations = [];
  const app = {
    menuClick: (id) => activations.push(id),
    textModeEditor: { grid3d: { currentLayer: {} } },
  };
  const menuBar = {
    menus: [{ className: "ui-menu-tilemode", label: "Renamed View", menuItems: [zoomItem] }],
    shortcuts: [],
  };
  const catalog = createLegacyCommandCatalogAdapter({ app, commands, document, toolMetadata });
  catalog.connectMenuBar(menuBar);

  assert.equal(commands.formatBindings("view.zoomin"), "Ctrl+= / Ctrl+Shift+=");
  const summary = commands.getCommands().find(({ id }) => id === "view.zoomin");
  assert.equal(summary.title, "Zoom In");
  assert.equal(summary.category, "View");
  assert.equal(commands.handleKeyDown({
    altKey: false,
    code: "Equal",
    ctrlKey: true,
    getModifierState: () => false,
    isComposing: false,
    key: "+",
    metaKey: false,
    preventDefault() {},
    repeat: false,
    shiftKey: true,
    stopImmediatePropagation() {},
    target: null,
  }).commandId, "view.zoomin");
  assert.deepEqual(activations, ["view-zoomin"]);
  assert.equal(commands.execute("view.zoomin", { source: "test" }, {
    editorMode: "3d",
  }).accepted, true);
  assert.deepEqual(activations, ["view-zoomin", "view-zoomin"]);
  app.textModeEditor.grid3d.currentLayer = null;
  assert.equal(commands.execute("view.zoomin", { source: "test" }, {
    editorMode: "3d",
  }).accepted, false);
  assert.deepEqual(activations, ["view-zoomin", "view-zoomin"]);
  commands.assignBinding("view.zoomin",
    commands.bindingFromLegacyShortcut({ cmd: true, key: "i" }));
  assert.equal(commands.formatBindings("view.zoomin"), "Ctrl+I");
  commands.clearBinding("view.zoomin");
  assert.equal(commands.formatBindings("view.zoomin"), "");
  commands.resetBinding("view.zoomin");
  assert.equal(commands.formatBindings("view.zoomin"), "Ctrl+= / Ctrl+Shift+=");
});

test("equivalent 2D and 3D menu actions share command identity and behavior", () => {
  const context = {
    editorMode: "2d",
    focus: "canvas",
    graphicType: "screen",
    modal: "none",
    popupOpen: false,
    shortcutsAllowed: true,
  };
  const commands = new CommandService({
    clearTimer() {},
    getContext: () => context,
    platform: "other",
    setTimer: () => 1,
    storage: { load: () => null, save() {} },
  });
  const menuItem = (uiID, commandId) => ({
    commandId,
    enabled: true,
    id: `menu-${uiID}`,
    label: uiID,
    setShortcutText() {},
    shortcut: false,
    type: "item",
    uiID,
    visible: true,
  });
  const activations = [];
  const catalog = createLegacyCommandCatalogAdapter({
    app: {
      menuClick: (...args) => activations.push(args),
      textModeEditor: { grid3d: { currentLayer: {} } },
    },
    commands,
    document: { getElementById: () => null, querySelectorAll: () => [] },
    toolMetadata,
  });
  catalog.connectMenuBar({
    menus: [
      {
        className: "ui-menu-tilemode ui-menu-screen",
        menuItems: [
          menuItem("file-dimensions", "project.dimensions"),
          menuItem("mode-textmode", "textMode.mode.textmode"),
          menuItem("mode-c64multicolor", "textMode.mode.c64multicolor"),
          menuItem("mode-nes", "textMode.mode.nes"),
          menuItem("mode-indexed", "textMode.mode.indexed"),
        ],
      },
      {
        className: "ui-menu-tilemode ui-menu-sprite",
        menuItems: [
          menuItem("file-spritedimensions", "project.dimensions"),
          menuItem("mode-spritetextmode", "textMode.mode.textmode"),
          menuItem("mode-spritec64multicolor", "textMode.mode.c64multicolor"),
          menuItem("mode-spritenes", "textMode.mode.nes"),
          menuItem("mode-spriteindexed", "textMode.mode.indexed"),
        ],
      },
      {
        className: "ui-menu-tilemode",
        menuItems: [
          menuItem("edit-showgrid", "view.grid"),
          menuItem("view-perfstats", "view.performanceStats"),
          menuItem("view-zoomin", "view.zoomin"),
          menuItem("view-zoomout", "view.zoomout"),
          menuItem("view-fitonscreen", "view.fitonscreen"),
          menuItem("view-actualpixels", "view.actualpixels"),
          menuItem("edit-undo", "edit.undo"),
        ],
      },
      { className: "ui-menu-3d", menuItems: [menuItem("view-3dgrid", "view.grid"), menuItem("view-3dperfstats", "view.performanceStats")] },
    ],
    shortcuts: [],
  });

  assert.equal(commands.execute("project.dimensions", { source: "test" }, {
    editorMode: "2d",
    graphicType: "sprite",
  }).accepted, true);
  assert.equal(commands.execute("view.grid", { source: "test" }, {
    editorMode: "3d",
  }).accepted, true);
  assert.equal(commands.execute("view.performanceStats", { source: "test" }, {
    editorMode: "3d",
  }).accepted, true);
  for (const commandId of ["view.zoomin", "view.zoomout", "view.fitonscreen"]) {
    assert.equal(commands.execute(commandId, { source: "test" }, {
      editorMode: "3d",
    }).accepted, true);
  }
  assert.equal(commands.execute("view.actualpixels", { source: "test" }, {
    editorMode: "3d",
  }).accepted, false);
  assert.equal(commands.execute("edit.undo", { source: "test" }, {
    modal: "editColorPaletteDialog",
  }).accepted, true);
  for (const commandId of [
    "textMode.mode.textmode",
    "textMode.mode.c64multicolor",
    "textMode.mode.nes",
    "textMode.mode.indexed",
  ]) {
    assert.equal(commands.execute(commandId, { source: "test" }, {
      editorMode: "2d",
      graphicType: "sprite",
    }).accepted, true);
  }
  assert.deepEqual(activations, [
    ["file-dimensions", "test"],
    ["edit-showgrid", "test"],
    ["view-perfstats", "test"],
    ["view-zoomin", "test"],
    ["view-zoomout", "test"],
    ["view-fitonscreen", "test"],
    ["edit-undo", "test"],
    ["mode-textmode", "test"],
    ["mode-c64multicolor", "test"],
    ["mode-nes", "test"],
    ["mode-indexed", "test"],
  ]);
});

test("declared menu IDs dispatch once through real menu and editor handlers; unowned items stay local", async () => {
  const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  const elements = new Map();
  const componentTypes = new Map();
  let nextId = 0;
  const UI = (id) => elements.get(id);
  UI.getID = () => `menu-${nextId++}`;
  UI.registerComponentType = (name, constructor) => componentTypes.set(name, constructor);
  UI.create = (name, args) => {
    const item = new (componentTypes.get(name))();
    item.init(args);
    item.uiID = args.id;
    item.trigger = () => {};
    elements.set(args.id, item);
    return item;
  };
  const jquery = { addClass() {}, removeClass() {}, hide() {}, html() {}, text() {} };
  await loadClassic("js/ui/menuBar.js", "UI", { UI, document, $: () => jquery, setTimeout() {} });
  const menuBar = new UI.MenuBar();
  menuBar.hideMenu = () => {};
  // Execute the actual menu declarations, including conditional entries, not
  // a second alias table that could drift from production construction.
  const source = await readFile(new URL("../src/js/editor.js", import.meta.url), "utf8");
  vm.runInNewContext(source.slice(source.indexOf("      var menu = null;"),
    source.indexOf("      _this.menuBar.on('itemclick'")), {
    _this: { menuBar }, UI, SHOWUNFINISHED: true, g_paramEditor: "", styles: { text: { blockName: "Meta Tile" } },
  });
  const commandItems = menuBar.menus.flatMap((menu) => menu.menuItems).filter((item) => item.commandId !== null);
  assert.equal(commandItems.length, 124);
  assert.deepEqual(new Set(commandItems.map((item) => item.commandId)), new Set(editorCommandDefinitions.map(({ id }) => id)));
  for (const definition of editorCommandDefinitions) {
    assert.equal(getEditorCommandDefinition(definition.id), definition);
    assert.ok(Object.isFrozen(definition));
    assert.ok(Object.isFrozen(definition.defaultShortcuts));
    assert.ok(definition.defaultShortcuts.every(Object.isFrozen));
    assert.equal("aliases" in definition, false);
  }
  for (const [first, second, commandId] of [
    ["edit-showgrid", "view-3dgrid", "view.grid"],
    ["view-perfstats", "view-3dperfstats", "view.performanceStats"],
    ["file-dimensions", "file-spritedimensions", "project.dimensions"],
    ["mode-textmode", "mode-spritetextmode", "textMode.mode.textmode"],
    ["mode-c64multicolor", "mode-spritec64multicolor", "textMode.mode.c64multicolor"],
    ["mode-nes", "mode-spritenes", "textMode.mode.nes"],
    ["mode-indexed", "mode-spriteindexed", "textMode.mode.indexed"],
    ["edit-undo", "colorpaletteedit-undo", "edit.undo"],
  ]) {
    assert.equal(UI(first).commandId, commandId);
    assert.equal(UI(second).commandId, commandId);
  }
  UI("view-3dgrid").uiID = "renamed-grid-surface";
  const context = { editorMode: "2d", graphicType: "screen", focus: "canvas", modal: "none", popupOpen: false, shortcutsAllowed: true };
  let persisted;
  const commands = new CommandService({
    getContext: () => context, platform: "other", clearTimer() {}, setTimer: () => 1,
    storage: { load: () => null, save: (value) => { persisted = JSON.parse(value); } },
  });
  let dispatches = 0;
  const execute = commands.execute.bind(commands);
  commands.execute = (...args) => { dispatches++; return execute(...args); };
  const Editor = await loadClassic("js/editor.js", "Editor", {
    UI, URLSearchParams, window: { location: { search: "" } }, TextModeEditor: { Mode: { TEXTMODE: "textmode" } },
  });
  const effects = [];
  const hostCalls = [];
  let gridVisible = true;
  const app = {
    mode: "2d",
    textModeEditor: {
      getGridVisible: () => gridVisible,
      setGridVisible: (value) => { gridVisible = value; effects.push(["grid", value]); },
      showDimensionsDialog: () => effects.push("dimensions"),
      setScreenMode: (value) => effects.push(["screenMode", value]),
      history: { undo: () => effects.push("editor undo") },
    },
    colorPaletteEditor: { colorPaletteEdit: { undo: () => effects.push("palette undo") } },
    undo: Editor.prototype.undo,
    menuClick(...args) { hostCalls.push(args); return Editor.prototype.menuClick.call(this, ...args); },
  };
  const catalog = createLegacyCommandCatalogAdapter({ app, commands, document, toolMetadata });
  app.services = { commands, shortcutCatalog: catalog };
  const localEvents = [];
  menuBar.trigger = (event, id, source) => { localEvents.push(id); app.menuClick(id, source); };
  catalog.connectMenuBar(menuBar);
  assert.throws(() => catalog.connectMenuBar(menuBar), /already connected/);
  assert.equal(commands.getCommands().filter(({ id }) => id === "view.grid").length, 1);
  commands.assignBinding("view.grid", commands.bindingFromLegacyShortcut({ key: "F2" }));
  assert.deepEqual(Object.keys(persisted.overrides), ["view.grid"]);
  assert.equal(UI("edit-showgrid").shortcutLabel, "F2");
  assert.equal(UI("view-3dgrid").shortcutLabel, "F2");
  UI("edit-showgrid").click();
  app.mode = context.editorMode = "3d";
  UI("view-3dgrid").click();
  app.mode = context.editorMode = "2d";
  context.graphicType = "sprite";
  UI("file-spritedimensions").click();
  UI("mode-spritetextmode").click();
  UI("edit-undo").click();
  app.mode = context.editorMode = "color palette";
  UI("colorpaletteedit-undo").click();
  assert.equal(dispatches, 6);
  assert.equal(hostCalls.length, 6);
  assert.deepEqual(hostCalls.slice(0, 2), [["edit-showgrid", "menu"], ["edit-showgrid", "menu"]]);
  assert.deepEqual(effects, [["grid", false], ["grid", true], "dimensions", ["screenMode", "textmode"], "editor undo", "palette undo"]);
  assert.deepEqual(localEvents, []);

  app.mode = context.editorMode = "3d";
  UI("view-3dgrid").setEnabled(false);
  UI("view-3dgrid").click();
  assert.equal(dispatches, 6);
  assert.equal(commands.execute("view.grid").accepted, false); // 2D alias cannot enable 3D.
  UI("view-3dgrid").enabled = true;
  UI("view-3dgrid").visible = false;
  assert.equal(commands.execute("view.grid").accepted, false);
  assert.equal(hostCalls.length, 6);

  // Project palettes are added dynamically, after catalog connection. Their
  // local click callbacks and default accelerators must not be commandeered.
  const localItem = menuBar.menus[0].addItem({ id: "project-palette-42", label: "Project Palette", shortcut: { key: "F3" } });
  localItem.trigger = () => effects.push("local palette");
  const beforeLocal = dispatches;
  localItem.click();
  assert.equal(localItem.commandId, null);
  assert.equal(dispatches, beforeLocal);
  assert.deepEqual(localEvents, ["project-palette-42"]);
  assert.equal(effects.at(-1), "local palette");
  assert.equal(UI("edit-musicundo").commandId, null);
  assert.ok(menuBar.shortcuts.some(({ menuItem }) => menuItem === UI("edit-musicundo")));
  assert.ok(menuBar.shortcuts.some(({ menuItem }) => menuItem === localItem));
  assert.ok(!menuBar.shortcuts.some(({ menuItem }) => menuItem === UI("edit-showgrid")));
});

test("shortcut context provider validates input state and fails closed with rate-limited diagnostics", () => {
  const document = { body: {}, documentElement: {}, activeElement: null };
  const app = { mode: "2d", textModeEditor: { tools: { drawTools: { isTyping: () => true } } } };
  const UI = { dialogStack: [], popup: null };
  let now = 0;
  const errors = [];
  const context = createShortcutContextProvider({ app, document, UI, isRecording: () => false,
    now: () => now, reportError: (...args) => errors.push(args) });
  assert.equal(context().inputOwner, "canvasTyping");
  assert.equal(context({ tagName: "INPUT", type: "text" }).inputOwner, "editableText");
  UI.dialogStack.push({ uiID: "editColorPaletteDialog" });
  assert.equal(context().modal, "editColorPaletteDialog");
  assert.equal(context().textTyping, false);
  assert.equal(context({}).inputOwner, "unknown");
  assert.equal(context({ matches: (selector) => selector.includes("button") }).inputOwner, "focusableControl");
  UI.popup = {};
  assert.equal(context().popupOpen, true);
  app.mode = { unexpected: "mode" };
  assert.deepEqual(context(), createSafeShortcutContext());
  assert.deepEqual(context(), createSafeShortcutContext());
  assert.equal(errors.length, 1);
  now = 5000;
  assert.deepEqual(context(), createSafeShortcutContext());
  assert.equal(errors.length, 2);
});

test("3D grid view implements shared zoom and fit commands", async () => {
  const GridView3d = await loadClassic("js/textMode/gridView3d.js", "GridView3d");
  const view = new GridView3d();
  const calls = [];
  view.camera = {
    aspect: 2,
    far: 10,
    fov: 30,
    position: { x: 4, y: 4, z: 20 },
    updateProjectionMatrix: () => calls.push("projection"),
  };
  view.cameraControls = {
    dollyIn: (scale) => calls.push(["dollyIn", scale]),
    dollyOut: (scale) => calls.push(["dollyOut", scale]),
    target: { x: 0, y: 0, z: 0 },
    update: () => calls.push("update"),
  };
  view.editor = {
    grid3d: {
      getCellSizeX: () => 2,
      getCellSizeY: () => 4,
      getCellSizeZ: () => 2,
      getGridDepth: () => 2,
      getGridHeight: () => 2,
      getGridWidth: () => 4,
    },
  };

  view.zoom(1);
  view.zoom(-2);
  assert.deepEqual(calls.slice(0, 4), [
    ["dollyOut", 0.95],
    "update",
    ["dollyIn", 0.95 ** 2],
    "update",
  ]);

  view.fitOnScreen();
  assert.deepEqual(view.cameraControls.target, { x: 4, y: 4, z: 2 });
  assert.ok(view.camera.far > 10);
  assert.ok(calls.includes("projection"));
  assert.equal(calls.at(-1), "update");
});

test("2D and 3D grid menu checks keep their independent visibility", async () => {
  const checks = [];
  const UI = (id) => ({
    setChecked: (visible) => checks.push([id, visible]),
  });
  const TextModeEditor = await loadClassic("js/textMode/textModeEditor.js", "TextModeEditor", { UI });
  const editor = {
    currentTile: { setType() {} },
    graphic: { redraw() {} },
    grid3d: {
      getGridVisible: () => true,
      setGridVisible: (visible) => checks.push(["grid3d", visible]),
    },
    gridVisible: true,
    gridView2d: {
      render: () => checks.push(["grid2d", "render"]),
      setGridNeedsRedraw: () => checks.push(["grid2d", "redraw"]),
    },
    layers: { updateAllLayerPreviews() {} },
    type: "2d",
  };

  TextModeEditor.prototype.setGridVisible.call(editor, false);
  assert.deepEqual(checks, [
    ["edit-showgrid", false],
    ["grid2d", "redraw"],
    ["grid2d", "render"],
  ]);

  checks.length = 0;
  editor.type = "3d";
  TextModeEditor.prototype.setGridVisible.call(editor, false);
  assert.deepEqual(checks, [
    ["grid3d", false],
    ["view-3dgrid", false],
  ]);

  checks.length = 0;
  TextModeEditor.prototype.setType.call(editor, "3d");
  TextModeEditor.prototype.setType.call(editor, "2d");
  assert.deepEqual(checks, [
    ["view-3dgrid", true],
    ["edit-showgrid", false],
  ]);

  const Grid3d = await loadClassic("js/textMode/grid3d.js", "Grid3d");
  const emptyGrid = new Grid3d();
  assert.equal(emptyGrid.getGridVisible(), false);
  assert.doesNotThrow(() => emptyGrid.setGridVisible(true));
});

test("Block Editor and palette surfaces use shared native commands", () => {
  const context = {
    editorMode: "2d",
    focus: "canvas",
    inputOwner: "canvasPassive",
    modal: "blockEditor",
    popupOpen: false,
    screenMode: "c64multicolor",
    shortcutsAllowed: true,
    spriteFramesVisible: false,
    textEditorMode: "tile",
    textTool: "pen",
  };
  const commands = new CommandService({
    clearTimer() {},
    getContext: () => context,
    platform: "other",
    setTimer: () => 1,
    storage: { load: () => null, save() {} },
  });
  const events = [];
  let catalog;
  const currentBlockEditTool = { textContent: "" };
  const blockEditor = {
    currentTool: "pen",
    getToolLabel: (tool) => catalog.formatToolLabel("draw", tool),
    rotateCharacter: () => events.push(["rotate"]),
    setTool: (tool) => events.push(["tool", tool]),
    tilePaletteDisplay: {
      moveSelection: (dx, dy) => events.push(["palette", dx, dy]),
    },
    visible: true,
  };
  const app = {
    menuClick() {},
    mode: "2d",
    textModeEditor: {
      blockEditor,
      getEditorMode: () => "tile",
      tools: {
        drawTools: {
          pixelDraw: {
            setC64MultiColorType: (type) => events.push(["multicolour", type]),
          },
          tilePalette: {
            tilePaletteDisplay: { moveSelection() {} },
            rotateCharacter() {},
          },
        },
      },
    },
  };
  catalog = createLegacyCommandCatalogAdapter({
    app,
    commands,
    document: {
      getElementById: (id) => id === "currentBlockEditTool" ? currentBlockEditTool : null,
      querySelectorAll: () => [],
    },
    toolMetadata,
  });
  catalog.connectMenuBar({ menus: [], shortcuts: [] });
  commands.assignBinding("editor.tool.pencil",
    commands.bindingFromLegacyShortcut({ key: "F2" }));

  const keyDown = (key, code = key.length === 1 ? `Key${key.toUpperCase()}` : key) =>
    commands.handleKeyDown({
      altKey: false,
      code,
      ctrlKey: false,
      getModifierState: () => false,
      isComposing: false,
      key,
      metaKey: false,
      preventDefault() {},
      repeat: false,
      shiftKey: false,
      stopImmediatePropagation() {},
      target: null,
    });

  assert.equal(currentBlockEditTool.textContent, "Pencil (F2)");
  assert.equal(keyDown("n").handled, false);
  assert.equal(keyDown("F2").commandId, "editor.tool.pencil");
  assert.equal(keyDown("d").commandId, "textMode.tilePalette.right");
  assert.equal(keyDown("r").commandId, "textMode.tile.rotate");
  assert.equal(keyDown("1", "Digit1").commandId, "textMode.multicolor.background");
  assert.deepEqual(events, [
    ["tool", "pen"],
    ["palette", 1, 0],
    ["rotate"],
    ["multicolour", "background"],
  ]);

  blockEditor.visible = false;
  app.mode = context.editorMode = "color palette";
  context.modal = "none";
  app.colorPaletteEditor = { colorPaletteEdit: {
    setColorPaletteTool: (tool) => events.push(["standalone palette", tool]),
  } };
  assert.equal(keyDown("F2").commandId, "editor.tool.pencil");
  assert.equal(keyDown("l").commandId, "editor.tool.erase");
  app.mode = context.editorMode = "2d";
  context.modal = "editColorPaletteDialog";
  app.textModeEditor.colorPaletteEdit = {
    visible: true,
    setColorPaletteTool: (tool) => events.push(["modal palette", tool]),
  };
  assert.equal(keyDown("F2").commandId, "editor.tool.pencil");
  assert.equal(keyDown("l").commandId, "editor.tool.erase");
  assert.equal(commands.getCommands().filter(({ id }) => id === "editor.tool.pencil").length, 1);
  assert.deepEqual(events.slice(-4), [
    ["standalone palette", "pen"], ["standalone palette", "erase"],
    ["modal palette", "pen"], ["modal palette", "erase"],
  ]);
});

test("menu IDs, labels, classes, and order cannot redefine explicit command identity", () => {
  const context = {
    editorMode: "tile set",
    focus: "canvas",
    modal: "none",
    popupOpen: false,
    shortcutsAllowed: true,
  };
  const commands = new CommandService({
    clearTimer() {},
    getContext: () => context,
    platform: "other",
    setTimer: () => 1,
    storage: { load: () => null, save() {} },
  });
  const menuItem = (uiID) => ({
    commandId: "textMode.tiles.load",
    enabled: true,
    id: `menu-${uiID}`,
    label: `Renamed ${uiID}`,
    setShortcutText() {},
    shortcut: { cmd: true, key: "Q" },
    type: "item",
    uiID,
    visible: true,
  });
  const activations = [];
  const catalog = createLegacyCommandCatalogAdapter({
    app: { menuClick: (...args) => activations.push(args) },
    commands,
    document: { getElementById: () => null, querySelectorAll: () => [] },
    toolMetadata,
  });
  catalog.connectMenuBar({
    menus: [
      { className: "renamed-menu-class", label: "Renamed Tiles", menuItems: [menuItem("unrelated-ui-id")] },
      { className: "ui-menu-tilemode", label: "Other Tiles", menuItems: [menuItem(null)] },
    ],
    shortcuts: [],
  });

  const summary = commands.getCommands().find(({ id }) => id === "textMode.tiles.load");
  assert.equal(summary.title, "Load / Import Tile Set...");
  assert.equal(summary.category, "Tiles");
  assert.equal(commands.formatBindings("textMode.tiles.load"), "");
  assert.equal(commands.execute("textMode.tiles.load", { source: "test" }, context).accepted, true);
  assert.deepEqual(activations, [["charactersets-load", "test"]]);
});

test("every explicit menu commandId is validated before startup registration", () => {
  const commands = new CommandService({
    clearTimer() {},
    getContext: () => ({}),
    platform: "other",
    setTimer: () => 1,
    storage: { load: () => null, save() {} },
  });
  const catalog = createLegacyCommandCatalogAdapter({
    app: { menuClick() {} },
    commands,
    document: { getElementById: () => null, querySelectorAll: () => [] },
    toolMetadata,
  });

  const menuBar = {
    menus: [{
      // Formerly excluded classes must not bypass explicit-ID validation.
      className: "ui-menu-c64-assembler",
      label: "Test",
      menuItems: [{
        commandId: "missing.definition",
        enabled: true,
        id: "menu-unregistered",
        label: "Unregistered",
        shortcut: false,
        type: "item",
        uiID: "unregistered-menu-item",
        visible: true,
      }],
    }],
    shortcuts: [],
  };
  for (const commandId of ["missing.definition", "", false, 42]) {
    menuBar.menus[0].menuItems[0].commandId = commandId;
    assert.throws(() => catalog.connectMenuBar(menuBar), /has no command definition/);
    assert.equal(menuBar.commandService, undefined);
    assert.equal(commands.getCommands().length, 0);
  }
});

test("menu aliases keep one stable command identity, metadata, handler, and preference", () => {
  const stored = JSON.stringify({
    overrides: {
      "edit.undo": [{
        priority: 0,
        repeat: false,
        sequence: [{ alt: false, code: null, ctrl: false, key: "u", meta: false, mod: true, shift: false }],
      }],
    },
    version: 2,
  });
  const context = {
    editorMode: "2d",
    focus: "canvas",
    modal: "none",
    popupOpen: false,
    shortcutsAllowed: true,
  };
  const commands = new CommandService({
    clearTimer() {},
    getContext: () => context,
    platform: "other",
    setTimer: () => 1,
    storage: { load: () => stored, save() {} },
  });
  const menuItem = (id, uiID, label) => ({
    commandId: "edit.undo",
    enabled: true,
    id,
    label,
    setShortcutText(value) { this.shortcutText = value },
    shortcut: { cmd: true, key: "Z" },
    type: "item",
    uiID,
    visible: true,
  });
  const editorUndo = menuItem("menu-edit-undo", "edit-undo", "Renamed Editor Undo");
  const paletteUndo = menuItem("menu-palette-undo", "colorpaletteedit-undo", "Renamed Palette Undo");
  const activations = [];
  const catalog = createLegacyCommandCatalogAdapter({
    app: { menuClick: (...args) => activations.push(args) },
    commands,
    document: { getElementById: () => null, querySelectorAll: () => [] },
    toolMetadata,
  });
  catalog.connectMenuBar({
    menus: [
      { className: "ui-menu-tilemode", label: "Changed Edit", menuItems: [editorUndo] },
      { className: "ui-menu-colorpalette", label: "Changed Palette", menuItems: [paletteUndo] },
    ],
    shortcuts: [],
  });

  assert.deepEqual(catalog.getToolPresentation("draw", "pen"), {
    commandId: "editor.tool.pencil",
    label: "Pencil",
    shortcut: "N",
  });
  assert.deepEqual(catalog.getToolPresentation("pixel", "line"), {
    commandId: "textMode.pixelTool.shape",
    label: "Line",
    shortcut: "Shift+U",
  });
  assert.equal(editorUndo.commandId, "edit.undo");
  assert.equal(paletteUndo.commandId, "edit.undo");
  assert.equal(commands.formatBindings("edit.undo"), "Ctrl+U");
  assert.equal(editorUndo.shortcutText, "Ctrl+U");
  assert.equal(paletteUndo.shortcutText, "Ctrl+U");
  assert.equal(commands.getCommands().find(({ id }) => id === "edit.undo").title, "Undo");

  const result = commands.execute("edit.undo", { source: "menu" }, context);
  assert.equal(result.accepted, true);
  assert.deepEqual(activations, [["edit-undo", "menu"]]);
});

test("classic tools keep catalog labels and default shortcuts without services", async () => {
  const context = vm.createContext({
    g_app: { services: null },
    TextStore: { get: (value) => value },
  });
  for (const relativePath of [
    "js/styles.js",
    "js/textMode/tools/drawTools.js",
    "js/textMode/tools/pixelDrawTools.js",
    "js/textMode/tools/pixelDraw.js",
    "js/textMode/color/colorPaletteEdit.js",
  ]) {
    const source = await readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
    vm.runInContext(source, context);
  }

  assert.equal(vm.runInContext("keys.textMode.toolsPencil.key", context), "N");
  assert.equal(vm.runInContext("new DrawTools().getToolLabel('pen')", context), "Pencil (N)");
  assert.equal(vm.runInContext("new DrawTools().getToolLabel('erase')", context), "Eraser (L)");
  assert.equal(vm.runInContext("new PixelDrawTools().getToolLabel('pen')", context), "Pencil (N)");
  assert.equal(vm.runInContext("new PixelDrawTools().getToolLabel('block')", context), "Block (B)");
  assert.equal(vm.runInContext("new PixelDraw().getToolLabel('draw')", context), "Pencil (Shift+N)");
  assert.equal(vm.runInContext("new PixelDraw().getToolLabel('fill')", context), "Fill Bucket (Shift+K)");
  assert.equal(vm.runInContext("new PixelDraw().getToolLabel('block')", context), "Block (Shift+B)");
  assert.equal(vm.runInContext("new PixelDraw().getToolLabel('move')", context), "Move (Shift+V)");
  assert.equal(vm.runInContext(`
    (function() {
      var editor = new ColorPaletteEdit();
      editor.prefix = 'colorPaletteEditor';
      return editor.getToolLabel('move');
    })()
  `, context), "Move (V)");
});

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

test("classic history releases the abandoned redo branch after a new edit", async () => {
  const History = await loadClassic("js/textMode/history.js", "History", { g_newSystem: false });
  const history = new History();
  const abandonedEntry = { name: "abandoned", actions: [{ name: "old action", params: {} }] };
  history.history = [
    { name: "kept", actions: [{ name: "kept action", params: {} }] },
    { name: "replaced", actions: [{ name: "replaced action", params: {} }] },
    abandonedEntry,
  ];
  history.historyLength = history.history.length;
  history.historyPosition = 1;

  history.startEntry("branch");
  history.addAction("new action", {});
  history.endEntry();

  assert.equal(history.historyPosition, 2);
  assert.equal(history.historyLength, 2);
  assert.equal(history.history.length, 2);
  assert.deepEqual(history.history.map((entry) => entry.name), ["kept", "branch"]);
  assert.equal(history.history.includes(abandonedEntry), false);
});

test("2D canvas context clicks open the tile or color picker at the click", async () => {
  const ui = {
    LEFTMOUSEBUTTON: 1,
    RIGHTMOUSEBUTTON: 2,
    isMobile: { any: () => false },
    os: "Mac OS",
  };
  const GridView2d = await loadClassic("js/textMode/gridView2d.js", "GridView2d", {
    $: () => ({ offset: () => ({ left: 0, top: 0 }) }),
    styles: { ui: { scrollbarWidth: 10 } },
    UI: ui,
  });
  const gridView = new GridView2d();
  const opened = [];
  let prevented = 0;
  gridView.editor = {
    layers: {
      getSelectedLayerObject: () => ({ getType: () => "grid" }),
    },
  };
  gridView.showCharacterPicker = () => opened.push("tile");
  gridView.showColorPicker = () => opened.push("color");

  gridView.contextMenu({
    pageX: 320,
    pageY: 240,
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => { prevented++; },
  });
  assert.deepEqual(opened, ["tile"]);
  assert.deepEqual([gridView.mousePageX, gridView.mousePageY], [320, 240]);

  gridView.contextMenu({
    pageX: 480,
    pageY: 360,
    ctrlKey: false,
    metaKey: true,
    preventDefault: () => { prevented++; },
  });
  assert.deepEqual(opened, ["tile", "color"]);
  assert.deepEqual([gridView.mousePageX, gridView.mousePageY], [480, 360]);
  assert.equal(prevented, 2);

  // macOS uses Ctrl+click as a conventional context click, so it must retain
  // the plain right-click tile behavior.
  gridView.contextMenu({
    pageX: 560,
    pageY: 400,
    ctrlKey: true,
    metaKey: false,
    preventDefault: () => { prevented++; },
  });
  assert.deepEqual(opened, ["tile", "color", "tile"]);

  ui.os = "Linux";
  gridView.contextMenu({
    pageX: 640,
    pageY: 440,
    ctrlKey: true,
    metaKey: false,
    preventDefault: () => { prevented++; },
  });
  assert.deepEqual(opened, ["tile", "color", "tile", "color"]);
  assert.equal(prevented, 4);
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
