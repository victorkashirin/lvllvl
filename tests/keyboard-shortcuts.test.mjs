import assert from "node:assert/strict";
import test from "node:test";

import { CommandService } from "../src/js/modules/application/commandService.mjs";
import {
  chordFromKeyboardEvent,
  contextClausesOverlap,
  contextMatches,
  eventMatchesChord,
  formatAriaBinding,
  formatBinding,
  isRiskyBinding,
  normalizeBinding,
  normalizeKey,
} from "../src/js/modules/domain/keybindings.mjs";
import { createKeybindingStorageAdapter } from
  "../src/js/modules/infrastructure/keybindingStorageAdapter.mjs";

function keybinding(key, options = {}) {
  return normalizeBinding({
    sequence: [{
      alt: options.alt === true,
      code: options.code || null,
      ctrl: options.ctrl === true,
      key: options.code ? null : key,
      layoutKey: options.layoutKey,
      meta: options.meta === true,
      mod: options.mod === true,
      shift: options.shift === true,
    }],
    repeat: options.repeat === true,
    when: options.when,
  });
}

function sequence(...keys) {
  return normalizeBinding({
    sequence: keys.map((key) => ({
      alt: false,
      code: null,
      ctrl: false,
      key,
      meta: false,
      mod: false,
      shift: false,
    })),
  });
}

function keyboardEvent(key, options = {}) {
  const state = { prevented: 0, stopped: 0 };
  return {
    altKey: options.alt === true,
    code: options.code,
    ctrlKey: options.ctrl === true,
    getModifierState: (name) => name === "AltGraph" && options.altGraph === true,
    isComposing: options.composing === true,
    key,
    metaKey: options.meta === true,
    preventDefault() { state.prevented++ },
    repeat: options.repeat === true,
    shiftKey: options.shift === true,
    state,
    stopImmediatePropagation() { state.stopped++ },
    target: options.target || null,
  };
}

function createMemoryStorage(initialValue = null) {
  let value = initialValue;
  const quarantined = [];
  return {
    get value() { return value },
    load: () => value,
    quarantine(raw, reason) {
      quarantined.push({ raw, reason });
      value = null;
    },
    quarantined,
    save(next) { value = next },
  };
}

function createCommandHarness(options = {}) {
  const context = {
    browserEditOperations: false,
    editorMode: "2d",
    focus: "canvas",
    modal: "none",
    popupOpen: false,
    shortcutsAllowed: true,
    ...options.context,
  };
  const storage = options.storage || createMemoryStorage();
  const timers = new Map();
  let nextTimer = 0;
  const errors = [];
  const commands = new CommandService({
    clearTimer(timer) { timers.delete(timer) },
    getContext: () => ({ ...context }),
    platform: options.platform || "other",
    reportError(operation, error) { errors.push({ operation, error }) },
    setTimer(callback) {
      const timer = ++nextTimer;
      timers.set(timer, callback);
      return timer;
    },
    storage,
  });
  return {
    commands,
    context,
    errors,
    fireTimers() {
      const callbacks = Array.from(timers.values());
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
    storage,
    timers,
  };
}

function register(commands, id, binding, execute, contexts = [{}], extras = {}) {
  commands.registerCommand({
    category: "Test",
    contexts,
    defaultBindings: binding ? [binding] : [],
    execute,
    id,
    title: id,
    ...extras,
  });
}

test("normalizes portable, special, physical, and composition-sensitive keys", () => {
  assert.equal(normalizeKey("Del"), "Delete");
  assert.equal(normalizeKey("Esc"), "Escape");
  assert.equal(normalizeKey("A"), "a");
  assert.equal(normalizeKey("Unidentified"), null);

  const portable = chordFromKeyboardEvent(keyboardEvent("s", { meta: true }), {
    platform: "mac",
    portable: true,
  });
  assert.deepEqual(portable, {
    alt: false,
    code: null,
    ctrl: false,
    key: "s",
    meta: false,
    mod: true,
    shift: false,
  });

  const physical = chordFromKeyboardEvent(keyboardEvent("a", { code: "KeyQ" }), {
    physical: true,
    platform: "other",
    portable: true,
  });
  assert.equal(physical.code, "KeyQ");
  assert.equal(physical.layoutKey, "a");
  assert.equal(formatBinding(normalizeBinding({ sequence: [physical] }), "other"), "[Q]");
  assert.equal(formatAriaBinding(keybinding("Delete", { mod: true }), "other"), "Control+Delete");

  assert.equal(chordFromKeyboardEvent(keyboardEvent("Dead"), { platform: "other" }), null);
  assert.equal(chordFromKeyboardEvent(keyboardEvent("a", { altGraph: true }), { platform: "other" }), null);
  assert.equal(chordFromKeyboardEvent(keyboardEvent("a", { composing: true }), { platform: "other" }), null);

  // TanStack's layout fallback matches Option/Alt shortcuts by physical code
  // when the modifier changes the semantic character produced by the key.
  assert.equal(eventMatchesChord(
    keybinding("a", { alt: true }).sequence[0],
    keyboardEvent("å", { alt: true, code: "KeyA" }),
    "mac",
  ), true);
});

test("detects a conflict when a recorded semantic key shares a layout fallback", () => {
  const { commands, storage } = createCommandHarness({ platform: "mac" });
  const contexts = [{ editorMode: "2d", focus: "canvas" }];
  register(commands, "tool.pencil", keybinding("n"), () => {}, contexts);
  register(commands, "color.select.1", keybinding("1", { alt: true }), () => {}, contexts);

  const event = keyboardEvent("¡", { alt: true, code: "Digit1" });
  const recorded = commands.bindingFromEvent(event);
  assert.ok(recorded);
  assert.equal(recorded.sequence[0].layoutCode, "Digit1");
  assert.equal(eventMatchesChord(recorded.sequence[0], event, "mac"), true);
  assert.equal(eventMatchesChord(keybinding("1", { alt: true }).sequence[0], event, "mac"), true);

  const conflict = commands.analyzeBinding("tool.pencil", recorded)
    .find(({ commandId, type }) => commandId === "color.select.1" && type === "hard");
  assert.ok(conflict);
  assert.equal(conflict.layoutDependent, true);
  assert.equal(conflict.precedence, "unresolved");

  commands.setBinding("tool.pencil", 0, recorded);
  assert.equal(JSON.parse(storage.value).overrides["tool.pencil"][0]
    .sequence[0].layoutCode, "Digit1");

  const reloaded = createCommandHarness({
    platform: "mac",
    storage: createMemoryStorage(storage.value),
  }).commands;
  register(reloaded, "tool.pencil", keybinding("n"), () => {}, contexts);
  register(reloaded, "color.select.1", keybinding("1", { alt: true }), () => {}, contexts);
  const reloadedBinding = reloaded.getEffectiveBindings("tool.pencil")[0];
  assert.equal(reloadedBinding.sequence[0].layoutCode, "Digit1");
  assert.equal(reloaded.analyzeBinding("tool.pencil", reloadedBinding)
    .some(({ commandId, type }) => commandId === "color.select.1" && type === "hard"), true);
  assert.equal(reloaded.getCommandConflicts("tool.pencil")
    .some(({ type }) => type === "layout-unknown"), false);

  reloaded.importConfiguration(JSON.stringify({
    version: 1,
    overrides: { "tool.pencil": [keybinding("¡", { alt: true })] },
  }));
  assert.equal(reloaded.getCommandConflicts("tool.pencil")
    .some(({ type }) => type === "layout-unknown"), true);
});

test("matches structured contexts and identifies risky bindings", () => {
  assert.equal(contextMatches({ editorMode: ["2d", "3d"], modal: "none" }, {
    editorMode: "2d",
    modal: "none",
  }), true);
  assert.equal(contextMatches({ focus: { not: "textInput" } }, { focus: "canvas" }), true);
  assert.equal(contextClausesOverlap({ editorMode: "2d" }, { editorMode: "color palette" }), false);
  assert.equal(contextClausesOverlap(
    { editorMode: ["2d", "3d"] },
    { editorMode: { not: "tile set" } },
  ), true);
  assert.equal(isRiskyBinding(keybinding("w", { mod: true }), "mac"), true);
  assert.equal(isRiskyBinding(keybinding("n"), "other"), false);
});

test("dispatches by active context and refuses unresolved ties", () => {
  const { commands, context } = createCommandHarness();
  const executed = [];
  register(commands, "tool.draw", keybinding("n"), () => executed.push("draw"), [{ editorMode: "2d" }]);
  register(commands, "palette.sample", keybinding("n"), () => executed.push("sample"), [{ editorMode: "color palette" }]);

  assert.equal(commands.getCommands().find(({ id }) => id === "tool.draw").availableInCurrentMode, true);
  assert.equal(commands.getCommands().find(({ id }) => id === "palette.sample").availableInCurrentMode, false);

  assert.equal(commands.handleKeyDown(keyboardEvent("n")).status, "executed");
  context.editorMode = "color palette";
  assert.equal(commands.getCommands().find(({ id }) => id === "palette.sample").availableInCurrentMode, true);
  assert.equal(commands.handleKeyDown(keyboardEvent("n")).status, "executed");
  assert.deepEqual(executed, ["draw", "sample"]);
  assert.equal(commands.analyzeBinding("tool.draw", keybinding("n"))
    .some(({ type }) => type === "context-separated"), true);

  context.editorMode = "2d";
  register(commands, "tool.other", keybinding("n"), () => executed.push("other"), [{ editorMode: "2d" }]);
  assert.equal(commands.handleKeyDown(keyboardEvent("n")).status, "conflict");
  assert.deepEqual(executed, ["draw", "sample"]);
});

test("leaves keyboard handling on focusable controls", () => {
  const { commands } = createCommandHarness();
  let executed = 0;
  register(commands, "view.preview", keybinding("Tab"), () => executed++);
  const event = keyboardEvent("Tab", {
    target: {
      closest: (selector) => selector.includes("[tabindex]") ? {} : null,
      tagName: "DIV",
    },
  });

  assert.equal(commands.handleKeyDown(event).status, "ignored");
  assert.deepEqual(event.state, { prevented: 0, stopped: 0 });
  assert.equal(executed, 0);
});

test("allows only input-safe global bindings across editable focus", () => {
  const { commands } = createCommandHarness({
    context: { focus: "codeEditor", shortcutsAllowed: false },
  });
  const executed = [];
  const target = { closest: () => null, tagName: "TEXTAREA" };
  register(commands, "project.save", keybinding("F2"), () => executed.push("save"), [{}], {
    keyboardPolicy: "global",
  });

  assert.equal(commands.handleKeyDown(keyboardEvent("F2", { target })).status, "executed");
  commands.setBinding("project.save", 0, keybinding("Delete", { ctrl: true }));
  assert.equal(commands.handleKeyDown(keyboardEvent("Delete", { ctrl: true, target })).status, "ignored");
  commands.setBinding("project.save", 0, keybinding("q"));
  assert.equal(commands.handleKeyDown(keyboardEvent("q", { target })).status, "ignored");
  assert.deepEqual(executed, ["save"]);
});

test("uses context specificity and explicit binding priority deterministically", () => {
  const { commands } = createCommandHarness({ context: { textTool: "select" } });
  const executed = [];
  register(commands, "tool.global", keybinding("f"), () => executed.push("global"), [{ editorMode: "2d" }]);
  register(commands, "tool.selection", keybinding("f"), () => executed.push("selection"), [{
    editorMode: "2d",
    textTool: "select",
  }]);

  assert.equal(commands.handleKeyDown(keyboardEvent("f")).commandId, "tool.selection");
  commands.setBinding("tool.global", 0, keybinding("f"), { takePrecedence: true });
  assert.equal(commands.handleKeyDown(keyboardEvent("f")).commandId, "tool.selection");
  assert.deepEqual(executed, ["selection", "selection"]);
});

test("handles sequences, timeout fallback, cancellation, repeat, and recording suppression", () => {
  const { commands, fireTimers, timers } = createCommandHarness();
  const executed = [];
  register(commands, "key.single", keybinding("g"), () => executed.push("single"));
  register(commands, "key.sequence", sequence("g", "g"), () => executed.push("sequence"));
  register(commands, "key.repeat", keybinding("r", { repeat: true }), () => executed.push("repeat"));

  assert.equal(commands.handleKeyDown(keyboardEvent("g")).status, "pending");
  assert.equal(timers.size, 1);
  assert.equal(commands.handleKeyDown(keyboardEvent("g")).commandId, "key.sequence");
  assert.deepEqual(executed, ["sequence"]);

  commands.handleKeyDown(keyboardEvent("g"));
  fireTimers();
  assert.deepEqual(executed, ["sequence", "single"]);

  commands.handleKeyDown(keyboardEvent("g"));
  assert.equal(commands.handleKeyDown(keyboardEvent("Escape")).status, "cancelled");
  fireTimers();
  assert.deepEqual(executed, ["sequence", "single"]);

  assert.equal(commands.handleKeyDown(keyboardEvent("r", { repeat: true })).commandId, "key.repeat");
  commands.setRecording(true);
  const captured = keyboardEvent("r");
  assert.equal(commands.handleKeyDown(captured).status, "recording");
  assert.deepEqual(captured.state, { prevented: 1, stopped: 1 });
  assert.deepEqual(executed, ["sequence", "single", "repeat"]);
});

test("releases held commands when their main key is released", () => {
  const { commands } = createCommandHarness();
  const events = [];
  register(commands, "view.preview", keybinding("h", { ctrl: true }),
    () => events.push("start"), [{}], {
      release: () => events.push("end"),
    });

  assert.equal(commands.handleKeyDown(keyboardEvent("h", { ctrl: true })).status, "executed");
  const unrelated = keyboardEvent("x");
  assert.equal(commands.handleKeyUp(unrelated).handled, false);
  assert.deepEqual(unrelated.state, { prevented: 0, stopped: 0 });

  // Releasing the main key ends a held command even if its modifier went up first.
  const released = keyboardEvent("h");
  assert.equal(commands.handleKeyUp(released).status, "released");
  assert.deepEqual(released.state, { prevented: 1, stopped: 1 });
  assert.deepEqual(events, ["start", "end"]);
  assert.equal(commands.handleKeyUp(keyboardEvent("h")).handled, false);
});

test("releases a held fallback whose key went up while a sequence was pending", () => {
  const { commands, fireTimers } = createCommandHarness();
  const events = [];
  register(commands, "view.preview", keybinding("g"),
    () => events.push("start"), [{}], {
      release: () => events.push("end"),
    });
  register(commands, "view.sequence", sequence("g", "g"), () => events.push("sequence"));

  assert.equal(commands.handleKeyDown(keyboardEvent("g")).status, "pending");
  assert.equal(commands.handleKeyUp(keyboardEvent("g")).status, "pending");
  fireTimers();

  assert.deepEqual(events, ["start", "end"]);
  assert.equal(commands.activeCommands.size, 0);
});

test("persists only overrides and supports unbind, reset, import, and corrupt-data quarantine", () => {
  const first = createCommandHarness();
  register(first.commands, "tool.draw", keybinding("n"), () => {});
  first.commands.setBinding("tool.draw", 0, keybinding("p", { shift: true }));
  assert.equal(JSON.parse(first.storage.value).version, 1);
  assert.equal(JSON.parse(first.storage.value).overrides["tool.draw"][0].sequence[0].key, "p");

  const reloaded = createCommandHarness({ storage: createMemoryStorage(first.storage.value) });
  register(reloaded.commands, "tool.draw", keybinding("n"), () => {});
  assert.equal(reloaded.commands.formatBindings("tool.draw"), "Shift+P");
  reloaded.commands.unbindCommand("tool.draw");
  assert.deepEqual(reloaded.commands.getEffectiveBindings("tool.draw"), []);
  reloaded.commands.resetCommand("tool.draw");
  assert.equal(reloaded.commands.formatBindings("tool.draw"), "N");

  reloaded.commands.importConfiguration(JSON.stringify({
    version: 1,
    overrides: { "tool.draw": [keybinding("p"), keybinding("q")] },
  }));
  assert.equal(reloaded.commands.formatBindings("tool.draw"), "P");
  assert.equal(reloaded.commands.getEffectiveBindings("tool.draw").length, 1);

  reloaded.commands.importConfiguration(JSON.stringify({
    version: 1,
    overrides: { "tool.draw": [] },
  }));
  assert.deepEqual(reloaded.commands.getEffectiveBindings("tool.draw"), []);

  const corruptStorage = createMemoryStorage("{not json");
  const corrupt = createCommandHarness({ storage: corruptStorage });
  register(corrupt.commands, "tool.draw", keybinding("n"), () => {});
  assert.equal(corruptStorage.quarantined.length, 1);
  assert.equal(corrupt.commands.formatBindings("tool.draw"), "N");
  assert.equal(corrupt.errors.length, 1);
});

test("browser storage adapter isolates failures and quarantines invalid documents", () => {
  const values = new Map([["shortcuts", "invalid"]]);
  const storage = {
    getItem: (key) => values.get(key) || null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
  const adapter = createKeybindingStorageAdapter(storage, { key: "shortcuts", now: () => 42 });
  assert.equal(adapter.load(), "invalid");
  adapter.quarantine("invalid", "bad format");
  assert.equal(values.has("shortcuts"), false);
  assert.deepEqual(JSON.parse(values.get("shortcuts.invalid.42")), {
    raw: "invalid",
    reason: "bad format",
  });

  const unavailable = createKeybindingStorageAdapter({
    getItem() { throw new Error("denied") },
    removeItem() { throw new Error("denied") },
    setItem() { throw new Error("denied") },
  });
  assert.equal(unavailable.load(), null);
  assert.throws(() => unavailable.save("value"), /denied/);
});
