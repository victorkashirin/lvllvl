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
  shortcutKeyboardEvent,
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
      layoutCode: options.layoutCode,
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
  const timerCallbacks = [];
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
      timerCallbacks.push(callback);
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
    timerCallbacks,
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

test("command definitions are unique while aliases add only contextual activation", () => {
  const { commands, context } = createCommandHarness();
  let firstHandlerCalls = 0;
  let replacementHandlerCalls = 0;
  commands.registerCommand({
    category: "Test",
    contexts: [{ editorMode: "2d" }],
    defaultBindings: [keybinding("x")],
    execute: () => { firstHandlerCalls++ },
    id: "test.sharedCommand",
    title: "Stable command",
  });

  assert.throws(() => commands.registerCommand({
    category: "Changed",
    contexts: [{ editorMode: "3d" }],
    defaultBindings: [keybinding("y")],
    execute: () => { replacementHandlerCalls++ },
    id: "test.sharedCommand",
    title: "Replacement command",
  }), /already defined/);

  commands.addCommandActivation("test.sharedCommand", { contexts: [{ editorMode: "3d" }] });
  context.editorMode = "3d";
  const result = commands.execute("test.sharedCommand", {}, context);
  const summary = commands.getCommands().find(({ id }) => id === "test.sharedCommand");
  assert.equal(result.accepted, true);
  assert.equal(firstHandlerCalls, 1);
  assert.equal(replacementHandlerCalls, 0);
  assert.equal(summary.title, "Stable command");
  assert.equal(commands.formatBindings("test.sharedCommand"), "X");
});

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

  assert.deepEqual(shortcutKeyboardEvent(keyboardEvent("Dead", {
    alt: true,
    code: "KeyE",
    repeat: true,
  })), {
    alt: true,
    altGraph: false,
    code: "KeyE",
    composing: false,
    ctrl: false,
    dead: true,
    key: "Dead",
    kind: "shortcut",
    meta: false,
    modifierOnly: false,
    repeat: true,
    shift: false,
  });

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
  const importedBinding = reloaded.getEffectiveBindings("tool.pencil")[0];
  const uncertainConflict = reloaded.analyzeBinding("tool.pencil", importedBinding)
    .find(({ commandId, type }) => commandId === "color.select.1" && type === "layout-possible");
  assert.ok(uncertainConflict);
  assert.equal(uncertainConflict.layoutDependent, true);
  assert.equal(reloaded.analyzeBinding("tool.pencil", importedBinding)
    .some(({ commandId, type }) => commandId === "color.select.1" && type === "hard"), false);
  assert.equal(reloaded.getCommandConflicts("tool.pencil")
    .some(({ type }) => type === "layout-unknown"), true);

  reloaded.setBinding("tool.pencil", 0, recorded, { takePrecedence: true });
  const rankedBinding = reloaded.getEffectiveBindings("tool.pencil")[0];
  assert.equal(reloaded.analyzeBinding("tool.pencil", rankedBinding)
    .find(({ commandId, type }) => commandId === "color.select.1" && type === "hard")
    ?.precedence, "new");
  assert.equal(reloaded.handleKeyDown(event).commandId, "tool.pencil");
});

test("keeps unknown-layout physical coincidences advisory and non-destructive", () => {
  const { commands } = createCommandHarness({ platform: "mac" });
  const contexts = [{ editorMode: "2d", focus: "canvas" }];
  register(commands, "tool.pencil", keybinding("n"), () => {}, contexts);
  register(commands, "tool.other", keybinding("x", { alt: true }), () => {}, contexts);
  const importedPhysical = keybinding(null, { alt: true, code: "KeyQ" });

  const analysis = commands.analyzeBinding("tool.pencil", importedPhysical);
  assert.equal(analysis.some(({ commandId, type }) =>
    commandId === "tool.other" && type === "layout-possible"), true);
  assert.equal(analysis.some(({ commandId, type }) =>
    commandId === "tool.other" && type === "hard"), false);

  commands.replaceConflicts("tool.pencil", importedPhysical);
  assert.equal(commands.getEffectiveBindings("tool.other")[0].sequence[0].key, "x");

  const stablePhysical = keybinding(null, { alt: true, code: "F1" });
  assert.equal(commands.analyzeBinding("tool.pencil", stablePhysical)
    .some(({ type }) => type === "layout-possible" || type === "layout-unknown"), false);
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

test("keeps an imported modified sequence pending across modifier release and repress", () => {
  const { commands, timers } = createCommandHarness();
  const executed = [];
  register(commands, "key.single", keybinding("k", { ctrl: true }),
    () => executed.push("single"));
  register(commands, "key.sequence", null, () => executed.push("sequence"));
  commands.importConfiguration(JSON.stringify({
    version: 1,
    overrides: {
      "key.sequence": [{
        sequence: ["k", "c"].map((key) => ({
          alt: false,
          code: null,
          ctrl: true,
          key,
          meta: false,
          mod: false,
          shift: false,
        })),
      }],
    },
  }));

  assert.equal(commands.handleKeyDown(keyboardEvent("k", {
    code: "KeyK",
    ctrl: true,
  })).status, "pending");
  assert.equal(commands.handleKeyUp(keyboardEvent("Control", {
    code: "ControlLeft",
  })).handled, false);
  const modifierDown = keyboardEvent("Control", {
    code: "ControlLeft",
    ctrl: true,
  });
  assert.deepEqual(commands.handleKeyDown(modifierDown), {
    handled: false,
    status: "pending",
  });
  assert.deepEqual(modifierDown.state, { prevented: 0, stopped: 0 });
  assert.equal(timers.size, 1);
  assert.equal(commands.handleKeyDown(keyboardEvent("c", {
    code: "KeyC",
    ctrl: true,
  })).commandId, "key.sequence");
  assert.deepEqual(executed, ["sequence"]);
});

test("re-recording a repeatable command changes key identity without changing repeat behavior", () => {
  const first = createCommandHarness();
  const executed = [];
  register(first.commands, "key.repeat", keybinding("r", { repeat: true }),
    () => executed.push("first"));
  const recorded = first.commands.bindingFromEvent(keyboardEvent("x", { code: "KeyX" }));
  assert.ok(recorded);
  assert.equal(recorded.repeat, false);

  first.commands.setBinding("key.repeat", 0, recorded);
  assert.equal(first.commands.getEffectiveBindings("key.repeat")[0].repeat, false);
  assert.equal(first.commands.handleKeyDown(keyboardEvent("x", { code: "KeyX" })).status, "executed");
  assert.equal(first.commands.handleKeyDown(keyboardEvent("x", {
    code: "KeyX",
    repeat: true,
  })).status, "executed");

  const reloaded = createCommandHarness({ storage: createMemoryStorage(first.storage.value) });
  register(reloaded.commands, "key.repeat", keybinding("r", { repeat: true }),
    () => executed.push("reloaded"));
  assert.equal(reloaded.commands.handleKeyDown(keyboardEvent("x", {
    code: "KeyX",
    repeat: true,
  })).status, "executed");
  assert.deepEqual(executed, ["first", "first", "reloaded"]);
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

test("releases a shifted held command by its activating physical key", () => {
  const { commands } = createCommandHarness();
  const events = [];
  register(commands, "view.preview", keybinding("!", { shift: true }),
    () => events.push("start"), [{}], {
      release: () => events.push("end"),
    });

  assert.equal(commands.handleKeyDown(keyboardEvent("!", {
    code: "Digit1",
    shift: true,
  })).status, "executed");
  assert.equal(commands.handleKeyUp(keyboardEvent("Shift", {
    code: "ShiftLeft",
  })).handled, false);
  assert.deepEqual(events, ["start"]);
  assert.equal(commands.handleKeyUp(keyboardEvent("1", {
    code: "Digit1",
  })).status, "released");
  assert.deepEqual(events, ["start", "end"]);
});

test("releases a held fallback whose key went up while a sequence was pending", () => {
  const { commands, fireTimers } = createCommandHarness();
  const events = [];
  const shifted = keybinding("!", { shift: true });
  register(commands, "view.preview", shifted,
    () => events.push("start"), [{}], {
      release: () => events.push("end"),
    });
  register(commands, "view.sequence", normalizeBinding({
    sequence: [shifted.sequence[0], shifted.sequence[0]],
  }), () => events.push("sequence"));

  assert.equal(commands.handleKeyDown(keyboardEvent("!", {
    code: "Digit1",
    shift: true,
  })).status, "pending");
  assert.equal(commands.handleKeyUp(keyboardEvent("Shift", {
    code: "ShiftLeft",
  })).handled, false);
  assert.equal(commands.handleKeyUp(keyboardEvent("1", {
    code: "Digit1",
  })).status, "pending");
  fireTimers();

  assert.deepEqual(events, ["start", "end"]);
  assert.equal(commands.activeCommands.size, 0);
});

test("lifecycle cleanup cancels stale pending work and releases held commands once", () => {
  const { commands, timerCallbacks, timers } = createCommandHarness();
  const events = [];
  register(commands, "key.single", keybinding("g"), () => events.push("single"));
  register(commands, "key.sequence", sequence("g", "g"), () => events.push("sequence"));
  register(commands, "view.preview", keybinding("h"), () => events.push("start"), [{}], {
    release: ({ source } = {}) => events.push(`end:${source}`),
  });

  assert.equal(commands.handleKeyDown(keyboardEvent("g", { code: "KeyG" })).status, "pending");
  const staleTimer = timerCallbacks[0];
  assert.equal(commands.cleanup({ source: "focusout" }), 0);
  assert.equal(timers.size, 0);

  assert.equal(commands.handleKeyDown(keyboardEvent("g", { code: "KeyG" })).status, "pending");
  staleTimer();
  assert.ok(commands.pending, "a stale callback must not clear newer pending state");
  assert.equal(commands.handleKeyDown(keyboardEvent("g", { code: "KeyG" })).commandId,
    "key.sequence");
  assert.deepEqual(events, ["sequence"]);

  assert.equal(commands.handleKeyDown(keyboardEvent("h", { code: "KeyH" })).status, "executed");
  assert.equal(commands.cleanup({ source: "blur" }), 1);
  assert.equal(commands.cleanup({ source: "visibilitychange" }), 0);
  assert.deepEqual(events, ["sequence", "start", "end:blur"]);
  assert.equal(commands.handleKeyUp(keyboardEvent("h", { code: "KeyH" })).handled, false);

  commands.handleKeyDown(keyboardEvent("h", { code: "KeyH" }));
  commands.setBinding("view.preview", 0, keybinding("j"));
  assert.deepEqual(events.slice(-2), ["start", "end:binding-change"]);

  commands.handleKeyDown(keyboardEvent("j", { code: "KeyJ" }));
  assert.equal(commands.dispose(), 1);
  assert.equal(commands.dispose(), 0);
  assert.deepEqual(events.slice(-2), ["start", "end:teardown"]);
});

test("lifecycle cleanup during execution does not register a stale held activation", () => {
  const { commands } = createCommandHarness();
  const events = [];
  register(commands, "view.preview", keybinding("h"), () => {
    events.push("start");
    commands.cleanup({ source: "modal" });
  }, [{}], {
    release: ({ source } = {}) => events.push(`end:${source}`),
  });

  assert.equal(commands.handleKeyDown(keyboardEvent("h", { code: "KeyH" })).status,
    "executed");
  assert.deepEqual(events, ["start", "end:modal"]);
  assert.equal(commands.activeCommands.size, 0);
  assert.equal(commands.handleKeyUp(keyboardEvent("h", { code: "KeyH" })).handled,
    false);
});

test("conflict replacement commits one complete durable edit", () => {
  let stored = null;
  let saveCalls = 0;
  const storage = {
    load: () => null,
    save(value) {
      saveCalls++;
      stored = value;
      return true;
    },
  };
  const { commands } = createCommandHarness({ storage });
  register(commands, "tool.pencil", keybinding("n"), () => {});
  register(commands, "tool.eraser", keybinding("l"), () => {});
  const notifications = [];
  commands.onDidChange((result) => notifications.push({
    eraser: commands.formatBindings("tool.eraser"),
    pencil: commands.formatBindings("tool.pencil"),
    result,
  }));

  const result = commands.replaceConflicts("tool.pencil", keybinding("l"));

  assert.equal(result.status, "durable");
  assert.equal(result.persistence, "saved");
  assert.deepEqual(result.changedCommandIds, ["tool.eraser", "tool.pencil"]);
  assert.equal(saveCalls, 1);
  assert.equal(notifications.length, 1);
  assert.deepEqual({ eraser: notifications[0].eraser, pencil: notifications[0].pencil }, {
    eraser: "",
    pencil: "L",
  });
  assert.equal(notifications[0].result, result);
  assert.deepEqual(Object.keys(notifications[0].result.configuration.overrides).sort(), [
    "tool.eraser",
    "tool.pencil",
  ]);
  assert.deepEqual(JSON.parse(stored).overrides, result.configuration.overrides);
});

test("subscriber failures do not reject a committed preference edit", () => {
  const { commands, errors, storage } = createCommandHarness();
  register(commands, "tool.draw", keybinding("n"), () => {});
  let delivered = null;
  commands.onDidChange(() => {
    throw new Error("subscriber failed");
  });
  commands.onDidChange((result) => {
    delivered = result;
  });

  const result = commands.setBinding("tool.draw", 0, keybinding("p"));

  assert.equal(result.status, "durable");
  assert.equal(result.applied, true);
  assert.equal(delivered, result);
  assert.equal(commands.formatBindings("tool.draw"), "P");
  assert.equal(JSON.parse(storage.value).overrides["tool.draw"][0].sequence[0].key, "p");
  assert.deepEqual(errors.map(({ operation, error }) => ({
    message: error.message,
    operation,
  })), [{
    message: "subscriber failed",
    operation: "notify keyboard shortcut change",
  }]);
});

test("preference edits expose session-only and rejected persistence outcomes", () => {
  const unavailable = createCommandHarness({
    storage: createKeybindingStorageAdapter(null),
  });
  register(unavailable.commands, "tool.draw", keybinding("n"), () => {});
  const unavailableNotifications = [];
  unavailable.commands.onDidChange((result) => unavailableNotifications.push(result));
  const unavailableResult = unavailable.commands.unbindCommand("tool.draw");
  assert.equal(unavailableResult.status, "session-only");
  assert.equal(unavailableResult.persistence, "unavailable");
  assert.equal(unavailableResult.applied, true);
  assert.deepEqual(unavailable.commands.getEffectiveBindings("tool.draw"), []);
  assert.equal(unavailableNotifications[0].status, "session-only");

  let saveCalls = 0;
  const quota = createCommandHarness({
    storage: {
      load: () => null,
      save() {
        saveCalls++;
        throw new Error("quota exceeded");
      },
    },
  });
  register(quota.commands, "tool.draw", keybinding("n"), () => {});
  const quotaResult = quota.commands.setBinding("tool.draw", 0, keybinding("p"));
  assert.equal(quotaResult.status, "session-only");
  assert.equal(quotaResult.persistence, "failed");
  assert.match(quotaResult.error.message, /quota exceeded/);
  assert.equal(quota.commands.formatBindings("tool.draw"), "P");
  assert.equal(saveCalls, 1);
  assert.equal(quota.errors.length, 1);

  const rejectedResult = quota.commands.importConfiguration(JSON.stringify({
    version: 1,
    overrides: { "tool.draw": [{ sequence: [] }] },
  }));
  assert.equal(rejectedResult.status, "rejected");
  assert.equal(rejectedResult.persistence, "not-needed");
  assert.equal(rejectedResult.applied, false);
  assert.equal(quota.commands.formatBindings("tool.draw"), "P");
  assert.equal(saveCalls, 1);

  assert.equal(quota.commands.resetCommand("tool.draw").status, "session-only");
  assert.equal(quota.commands.resetAll().status, "session-only");
});

test("execution separates synchronous acceptance from eventual completion", async () => {
  const { commands, errors } = createCommandHarness();
  register(commands, "action.reject", keybinding("r"), () => false);
  register(commands, "action.fail", keybinding("f"), () => {
    throw new Error("sync failure");
  });
  register(commands, "action.asyncReject", keybinding("a"), async () => false);
  register(commands, "action.asyncFail", keybinding("x"), async () => {
    throw new Error("async failure");
  });

  const rejected = commands.execute("action.reject");
  assert.deepEqual({
    accepted: rejected.accepted,
    asynchronous: rejected.asynchronous,
    status: rejected.status,
  }, {
    accepted: false,
    asynchronous: false,
    status: "rejected",
  });
  assert.equal((await rejected.completion).status, "rejected");

  const failed = commands.execute("action.fail");
  assert.equal(failed.accepted, false);
  assert.equal(failed.status, "failed");
  assert.equal((await failed.completion).status, "failed");

  const event = keyboardEvent("a", { code: "KeyA" });
  const dispatched = commands.handleKeyDown(event);
  assert.equal(dispatched.status, "executed");
  assert.equal(dispatched.execution.accepted, true);
  assert.equal(dispatched.execution.asynchronous, true);
  assert.deepEqual(event.state, { prevented: 1, stopped: 1 });
  assert.equal((await dispatched.execution.completion).status, "rejected");

  const asyncFailure = commands.execute("action.asyncFail");
  assert.equal(asyncFailure.accepted, true);
  assert.equal(asyncFailure.asynchronous, true);
  assert.equal((await asyncFailure.completion).status, "failed");
  assert.deepEqual(errors.map(({ operation }) => operation), [
    "execute action.fail",
    "execute action.asyncFail",
  ]);
});

test("enabled-predicate failures reject execution and report once", () => {
  const { commands, errors } = createCommandHarness();
  let checks = 0;
  register(commands, "action.disabled", keybinding("d"), () => {}, [{}], {
    isEnabled() {
      checks++;
      throw new Error("predicate failure");
    },
  });

  assert.equal(commands.execute("action.disabled").accepted, false);
  assert.equal(commands.execute("action.disabled").accepted, false);
  assert.equal(checks, 2);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].operation, "check whether action.disabled is enabled");
});

test("persists only overrides and supports unbind, reset, import, and corrupt-data quarantine", () => {
  const first = createCommandHarness();
  register(first.commands, "tool.draw", keybinding("n"), () => {});
  assert.equal(first.commands.setBinding("tool.draw", 0,
    keybinding("p", { shift: true })).status, "durable");
  assert.equal(JSON.parse(first.storage.value).version, 1);
  assert.equal(JSON.parse(first.storage.value).overrides["tool.draw"][0].sequence[0].key, "p");

  const reloaded = createCommandHarness({ storage: createMemoryStorage(first.storage.value) });
  register(reloaded.commands, "tool.draw", keybinding("n"), () => {});
  assert.equal(reloaded.commands.formatBindings("tool.draw"), "Shift+P");
  assert.equal(reloaded.commands.unbindCommand("tool.draw").status, "durable");
  assert.deepEqual(reloaded.commands.getEffectiveBindings("tool.draw"), []);
  assert.equal(reloaded.commands.resetCommand("tool.draw").status, "durable");
  assert.equal(reloaded.commands.formatBindings("tool.draw"), "N");

  assert.equal(reloaded.commands.importConfiguration(JSON.stringify({
    version: 1,
    overrides: { "tool.draw": [keybinding("p"), keybinding("q")] },
  })).status, "durable");
  assert.equal(reloaded.commands.formatBindings("tool.draw"), "P");
  assert.equal(reloaded.commands.getEffectiveBindings("tool.draw").length, 1);

  assert.equal(reloaded.commands.importConfiguration(JSON.stringify({
    version: 1,
    overrides: { "tool.draw": [] },
  })).status, "durable");
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
  assert.equal(adapter.save("valid"), true);
  assert.equal(values.get("shortcuts"), "valid");

  const unavailable = createKeybindingStorageAdapter({
    getItem() { throw new Error("denied") },
    removeItem() { throw new Error("denied") },
    setItem() { throw new Error("denied") },
  });
  assert.equal(unavailable.load(), null);
  assert.throws(() => unavailable.save("value"), /denied/);
});
