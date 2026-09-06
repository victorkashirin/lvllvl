import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const typingSource = readFileSync(
  new URL("../src/js/textMode/tools/typing.js", import.meta.url),
  "utf8",
);
const drawToolsSource = readFileSync(
  new URL("../src/js/textMode/tools/drawTools.js", import.meta.url),
  "utf8",
);
const editorSource = readFileSync(
  new URL("../src/js/textMode/textModeEditor.js", import.meta.url),
  "utf8",
);

function event(key, keyCode) {
  return {
    altKey: false,
    ctrlKey: false,
    key,
    keyCode,
    metaKey: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    shiftKey: false,
  };
}

test("typing sessions stop without changing tools and can be restarted", () => {
  const status = { textContent: "" };
  const cursorStates = [];
  const sandbox = vm.createContext({
    document: {
      getElementById: (id) => id === "typeKeyboardStatus" ? status : null,
    },
    g_app: { mode: "2d" },
  });
  vm.runInContext(typingSource, sandbox);

  const typing = new sandbox.Typing();
  typing.editor = {
    currentTile: { bgColor: -1, color: 2 },
    grid: {
      grid2d: {
        setTypingCursor: (x, y, color, visible) => {
          cursorStates.push({ color, visible, x, y });
        },
      },
    },
  };
  typing.setCursorPosition({ x: 4, y: 7 });

  typing.start();
  assert.equal(typing.isActive(), true);
  assert.equal(status.textContent, "Press Esc to finish typing and use shortcuts");
  assert.deepEqual(cursorStates.at(-1), { color: 2, visible: true, x: 4, y: 7 });

  assert.equal(typing.stop(), true);
  assert.equal(typing.isActive(), false);
  assert.equal(status.textContent, "Typing finished. Click the canvas or press T to type again");
  assert.deepEqual(cursorStates.at(-1), { color: -1, visible: false, x: 4, y: 7 });

  typing.start();
  assert.equal(typing.isActive(), true);
  assert.deepEqual(cursorStates.at(-1), { color: 2, visible: true, x: 4, y: 7 });
});

test("Escape releases Type-tool keyboard capture before the next shortcut", () => {
  const sandbox = vm.createContext({
    g_app: { mode: "2d" },
    TextModeEditor: { Mode: { C64MULTICOLOR: "c64multicolor" } },
    keys: {
      textMode: {
        toolsBucket: { key: "K" },
        toolsCharPixel: { key: "O" },
        toolsErase: { key: "L" },
        toolsEyedropper: { key: "I" },
        toolsMarquee: { key: "M" },
        toolsShape: { key: "U" },
        toolsZoom: { key: "Z" },
        toolsHand: { key: "H" },
        toolsMove: { key: "V" },
        toolsBlock: { key: "B" },
        toolsPencil: { key: "N" },
        toolsPixel: { key: "P" },
        toolsType: { key: "T" },
        showColorPicker: { key: "?" },
        showTilePicker: { key: "/" },
        switchColors: { key: "x" },
      },
    },
  });
  vm.runInContext(drawToolsSource, sandbox);

  const drawTools = new sandbox.DrawTools();
  let active = true;
  let typed = 0;
  let selectedTool = null;
  let typingPosition = null;
  let switchedColors = 0;
  drawTools.tool = "type";
  drawTools.typing = {
    isActive: () => active,
    keyDown: () => { typed++; },
    setCursorPosition: (position) => { typingPosition = { ...position }; },
    stop: () => { active = false; },
  };
  drawTools.editor = {
    colorPalettePanel: { keyDown() {} },
    currentTile: { switchColors: () => { switchedColors++; } },
    getEditorMode: () => "tile",
    getScreenMode: () => "textmode",
    grid: { grid2d: { getCursorPosition: () => ({ x: 6, y: 9 }) } },
    gridView2d: {
      pointerCell: { x: 11, y: 4, z: 0 },
      setMouseCursor() {},
      showCharacterPicker() {},
      showColorPicker() {},
    },
    layers: { getSelectedLayerObject: () => null },
    spriteFrames: { getVisible: () => false },
  };
  drawTools.select = { isActive: () => false };
  drawTools.setDrawTool = (tool) => {
    selectedTool = tool;
    drawTools.tool = tool;
  };

  const escape = event("Escape", 27);
  drawTools.keyDown(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(active, false);
  assert.equal(drawTools.tool, "type");
  assert.equal(typed, 0);

  drawTools.keyDown(event("x", 88));
  assert.equal(switchedColors, 1);

  drawTools.keyDown(event("n", 78));
  assert.equal(selectedTool, "pen");

  drawTools.tool = "select";
  drawTools.keyDown(event("t", 84));
  assert.equal(selectedTool, "type");
  assert.deepEqual(typingPosition, { x: 11, y: 4, z: 0 });
});

test("the T shortcut uses the current 3D cursor position", () => {
  const sandbox = vm.createContext({
    g_app: { mode: "3d" },
  });
  vm.runInContext(drawToolsSource, sandbox);

  const drawTools = new sandbox.DrawTools();
  let typingPosition = null;
  drawTools.typing = {
    setCursorPosition: (position) => { typingPosition = { ...position }; },
  };
  drawTools.editor = {
    grid3d: {
      getCursorX: () => 3,
      getCursorY: () => 5,
      getCursorZ: () => 7,
    },
  };

  drawTools.setTypingCursorToCurrentCursor();
  assert.deepEqual(typingPosition, { x: 3, y: 5, z: 7 });
});

test("the Escape that stops typing is not also sent to frame shortcuts", () => {
  const sandbox = vm.createContext({
    keys: { textMode: { play: { keyCode: 32 } } },
  });
  vm.runInContext(editorSource, sandbox);

  let active = true;
  let frameKeys = 0;
  const editor = {
    frames: {
      keyDown: () => { frameKeys++; },
      play: () => assert.fail("Escape must not toggle playback"),
    },
    setAlterKeys() {},
    tools: {
      drawTools: { isTyping: () => active },
      keyDown: () => { active = false; },
    },
  };

  sandbox.TextModeEditor.prototype.keyDown.call(editor, event("Escape", 27));
  assert.equal(frameKeys, 0);
});
