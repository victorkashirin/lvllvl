import {
  bindingCanBePrefix,
  bindingFromLegacyShortcut,
  bindingHasUnknownLayout,
  bindingIsPrefix,
  bindingSignature,
  bindingsCanCoincide,
  bindingsEqual,
  chordFromKeyboardEvent,
  contextClausesOverlap,
  contextMatches,
  contextSignature,
  contextSpecificity,
  describeContext,
  eventMatchesChord,
  formatActiveModifiers,
  formatAriaBinding,
  formatBinding,
  isRiskyBinding,
  normalizeKey,
  normalizeBinding,
  resolvePrimaryModifier,
} from "../domain/keybindings.mjs";
import { inputOwnerFromShortcutContext } from "../domain/shortcutContext.mjs";

const persistenceVersion = 1;
const inputOwnedKeys = new Set([
  "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "Backspace", "Delete",
  "End", "Enter", "Escape", "Home", "Insert", "PageDown", "PageUp", "Space", "Tab",
]);
const keyboardActivationContextKeys = new Set([
  "browserEditOperations", "focus", "inputOwner", "modal", "pointerCanvas",
  "popupOpen", "recorderActive", "shortcutsAllowed", "textTyping",
]);

/** @typedef {import("../domain/keybindings.mjs").Keybinding} Keybinding */

/**
 * @typedef {object} CommandDescriptor
 * @property {string} id
 * @property {string} title
 * @property {string} category
 * @property {() => boolean} isEnabled
 * @property {(details?: {source?: string}) => unknown} execute
 * @property {((details?: {source?: string}) => unknown) | null} release
 * @property {Record<string, unknown>[]} contexts
 * @property {Array<{when: Record<string, unknown>, isEnabled: () => boolean}>} activations
 * @property {Array<{when: Record<string, unknown>, isEnabled: () => boolean}>} actionActivations
 * @property {Keybinding[]} defaultBindings
 * @property {"global" | "local"} keyboardPolicy
 * @property {number} priority
 * @property {Array<() => boolean>} enabledPredicates
 * @property {boolean} allowDuringCanvasTyping
 */

/**
 * @typedef {object} BindingConflict
 * @property {number} [bindingIndex]
 * @property {string} commandId
 * @property {string} contextLabel
 * @property {boolean} [layoutDependent]
 * @property {"new" | "existing" | "unresolved"} [precedence]
 * @property {string | null} [shadowed]
 * @property {string} title
 * @property {"context-separated" | "duplicate" | "hard" | "layout-unknown" | "prefix" | "reserved"} type
 */

/**
 * @typedef {object} CommandSummary
 * @property {Keybinding[]} bindings
 * @property {string} category
 * @property {BindingConflict[]} conflicts
 * @property {Record<string, unknown>[]} contexts
 * @property {string} contextLabel
 * @property {string} id
 * @property {boolean} availableInCurrentMode
 * @property {boolean} modified
 * @property {string} source
 * @property {string} title
 */

/**
 * @typedef {object} KeybindingStorage
 * @property {() => string | null} load
 * @property {(value: string) => void} save
 * @property {(value: string, reason: string) => void} [quarantine]
 */

/**
 * @typedef {object} CommandServiceDependencies
 * @property {"mac" | "other"} platform
 * @property {KeybindingStorage} storage
 * @property {(target?: unknown) => Record<string, unknown>} getContext
 * @property {(callback: () => void, delay: number) => unknown} setTimer
 * @property {(timer: unknown) => void} clearTimer
 * @property {(operation: string, error: unknown) => void} [reportError]
 */

/** @param {unknown} value */
function cloneBinding(value) {
  const binding = normalizeBinding(value);
  if (!binding) return null;
  return {
    sequence: binding.sequence.map((chord) => ({ ...chord })),
    priority: binding.priority || 0,
    repeat: binding.repeat === true,
    ...(binding.when ? { when: { ...binding.when } } : {}),
  };
}

/** @param {unknown} value @returns {Record<string, Keybinding[]>} */
function readOverrides(value) {
  if (!value || typeof value !== "object") throw new TypeError("Shortcut preferences must be an object");
  const documentValue = /** @type {{version?: unknown, overrides?: unknown}} */ (value);
  if (documentValue.version !== persistenceVersion || !documentValue.overrides ||
      typeof documentValue.overrides !== "object" || Array.isArray(documentValue.overrides)) {
    throw new TypeError("Shortcut preferences have an unsupported format");
  }
  /** @type {Record<string, Keybinding[]>} */
  const overrides = {};
  for (const [commandId, rawBindings] of Object.entries(
    /** @type {Record<string, unknown>} */ (documentValue.overrides),
  )) {
    if (!/^[a-z][a-zA-Z0-9.-]+$/.test(commandId) || !Array.isArray(rawBindings)) continue;
    const bindings = rawBindings.map(normalizeBinding);
    if (bindings.some((binding) => binding === null)) continue;
    // A user customization is one shortcut (or an empty array when cleared).
    // Commands may still declare multiple built-in compatibility aliases.
    overrides[commandId] = /** @type {Keybinding[]} */ (bindings.slice(0, 1));
  }
  return overrides;
}

/** @param {Record<string, unknown>[]} contexts */
function uniqueContexts(contexts) {
  /** @type {Set<string>} */
  const seen = new Set();
  return contexts.filter((context) => {
    const signature = contextSignature(context);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

/**
 * Contexts describe both whether an action makes sense and whether a keyboard
 * event may activate it. Menu and other direct invocations keep the former,
 * but must not inherit focus, typing, popup, or pointer restrictions.
 *
 * @param {Record<string, unknown>} context
 */
function actionContextFromKeyboardContext(context) {
  return Object.fromEntries(Object.entries(context)
    .filter(([key]) => !keyboardActivationContextKeys.has(key)));
}

/** @param {Keybinding[]} bindings @param {"mac" | "other"} platform */
function uniqueBindings(bindings, platform) {
  /** @type {Keybinding[]} */
  const result = [];
  for (const binding of bindings) {
    if (!result.some((candidate) => bindingsEqual(candidate, binding, platform) &&
      contextSignature(candidate.when || {}) === contextSignature(binding.when || {}))) {
      result.push(binding);
    }
  }
  return result;
}

/**
 * Global application commands may cross an active input boundary only when
 * their current chord cannot type, delete, or navigate within that input.
 * Ctrl/Cmd chords preserve conventional application shortcuts such as Save;
 * function keys provide a safe modifier-free customization path.
 *
 * @param {import("../domain/keybindings.mjs").KeyChord} chord
 * @param {"mac" | "other"} platform
 */
function globalChordCanCrossInputBoundary(chord, platform) {
  const resolved = resolvePrimaryModifier(chord, platform);
  const key = resolved.key || resolved.layoutKey || resolved.code;
  if (!key || inputOwnedKeys.has(key)) return false;
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(key)) return true;
  return resolved.ctrl || resolved.meta;
}

/**
 * Only the Commodore-style Alt+1…8 colour aliases may interrupt canvas
 * typing. A user reassignment to a printable key remains typing-owned.
 *
 * @param {import("../domain/keybindings.mjs").KeyChord} chord
 * @param {"mac" | "other"} platform
 */
function colorChordCanCrossCanvasTyping(chord, platform) {
  const resolved = resolvePrimaryModifier(chord, platform);
  if (!resolved.alt || resolved.ctrl || resolved.meta) return false;
  return /^[1-8]$/.test(String(resolved.key || "")) ||
    /^Digit[1-8]$/.test(String(resolved.code || ""));
}

/**
 * Production contexts always classify the event target. Older injected
 * contexts may omit inputOwner; keep their focus fallback only when no target
 * was supplied, otherwise fail closed rather than reinterpret DOM here.
 *
 * @param {Record<string, unknown>} context
 * @param {unknown} [target]
 */
function resolvedInputOwner(context, target) {
  return Object.prototype.hasOwnProperty.call(context, "inputOwner") || target == null
    ? inputOwnerFromShortcutContext(context)
    : "unknown";
}

export class CommandService {
  /** @param {CommandServiceDependencies} dependencies */
  constructor({ platform, storage, getContext, setTimer, clearTimer, reportError = () => {} }) {
    if (platform !== "mac" && platform !== "other") throw new TypeError("A supported shortcut platform is required");
    if (!storage || typeof storage.load !== "function" || typeof storage.save !== "function") {
      throw new TypeError("CommandService requires shortcut persistence");
    }
    if (typeof getContext !== "function" || typeof setTimer !== "function" || typeof clearTimer !== "function") {
      throw new TypeError("CommandService requires context and timer ports");
    }
    this.platform = platform;
    this.storage = storage;
    this.getContext = getContext;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.reportError = reportError;
    /** @type {Map<string, CommandDescriptor>} */
    this.commands = new Map();
    /** @type {Record<string, Keybinding[]>} */
    this.overrides = {};
    /** @type {Set<() => void>} */
    this.listeners = new Set();
    this.recording = false;
    /** @type {Map<string, {command: CommandDescriptor, binding: Keybinding}>} */
    this.activeCommands = new Map();
    /** @type {{paths: string[][], fallback: {command: CommandDescriptor, binding: Keybinding} | null, fallbackReleased: boolean, timer: unknown} | null} */
    this.pending = null;
    this.load();
  }

  load() {
    const raw = this.storage.load();
    if (!raw) return;
    try {
      this.overrides = readOverrides(JSON.parse(raw));
    } catch (error) {
      this.overrides = {};
      try { this.storage.quarantine?.(raw, error instanceof Error ? error.message : String(error)); } catch {}
      this.reportError("load keyboard shortcuts", error);
    }
  }

  save() {
    /** @type {Record<string, Keybinding[]>} */
    const overrides = {};
    for (const [commandId, bindings] of Object.entries(this.overrides)) {
      overrides[commandId] = bindings.map((binding) => /** @type {Keybinding} */ (cloneBinding(binding)));
    }
    try {
      this.storage.save(JSON.stringify({ version: persistenceVersion, overrides }));
    } catch (error) {
      this.reportError("save keyboard shortcuts", error);
    }
  }

  /** @param {() => void} listener */
  onDidChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.cancelPending();
    for (const listener of this.listeners) listener();
  }

  /**
   * @param {{id: string, title: string, category?: string, execute: (details?: {source?: string}) => unknown, release?: (details?: {source?: string}) => unknown, isEnabled?: () => boolean, contexts?: Record<string, unknown>[], actionContexts?: Record<string, unknown>[], defaultBindings?: unknown[], keyboardPolicy?: "global" | "local", allowDuringCanvasTyping?: boolean, priority?: number}} registration
   */
  registerCommand(registration) {
    if (!registration || !/^[a-z][a-zA-Z0-9.-]+$/.test(registration.id) ||
        typeof registration.title !== "string" || typeof registration.execute !== "function") {
      throw new TypeError("Commands require a stable id, title, and handler");
    }
    const normalizedBindings = (registration.defaultBindings || [])
      .map(normalizeBinding)
      .filter((binding) => binding !== null);
    const contexts = registration.contexts?.length ? registration.contexts : [{}];
    const actionContexts = registration.actionContexts?.length
      ? registration.actionContexts
      : contexts.map(actionContextFromKeyboardContext);
    const predicate = registration.isEnabled || (() => true);
    const existing = this.commands.get(registration.id);
    if (existing) {
      existing.contexts = uniqueContexts(existing.contexts.concat(contexts));
      existing.activations.push(...contexts.map((when) => ({ isEnabled: predicate, when: { ...when } })));
      existing.actionActivations.push(...actionContexts.map((when) => ({
        isEnabled: predicate,
        when: { ...when },
      })));
      existing.defaultBindings = uniqueBindings(
        existing.defaultBindings.concat(/** @type {Keybinding[]} */ (normalizedBindings)),
        this.platform,
      );
      existing.enabledPredicates.push(predicate);
      if (registration.keyboardPolicy === "global") existing.keyboardPolicy = "global";
      if (registration.allowDuringCanvasTyping === true) existing.allowDuringCanvasTyping = true;
      if (!existing.release && typeof registration.release === "function") {
        existing.release = registration.release;
      }
      return registration.id;
    }
    this.commands.set(registration.id, {
      actionActivations: actionContexts.map((when) => ({
        isEnabled: predicate,
        when: { ...when },
      })),
      activations: contexts.map((when) => ({ isEnabled: predicate, when: { ...when } })),
      allowDuringCanvasTyping: registration.allowDuringCanvasTyping === true,
      category: registration.category || "Application",
      contexts: uniqueContexts(contexts.map((context) => ({ ...context }))),
      defaultBindings: uniqueBindings(/** @type {Keybinding[]} */ (normalizedBindings), this.platform),
      enabledPredicates: [predicate],
      execute: registration.execute,
      id: registration.id,
      isEnabled: predicate,
      keyboardPolicy: registration.keyboardPolicy === "global" ? "global" : "local",
      priority: Number.isFinite(registration.priority) ? Number(registration.priority) : 0,
      release: typeof registration.release === "function" ? registration.release : null,
      title: registration.title,
    });
    return registration.id;
  }

  finalizeRegistration() {
    let changed = false;
    for (const commandId of Object.keys(this.overrides)) {
      if (!this.commands.has(commandId)) {
        delete this.overrides[commandId];
        changed = true;
      }
    }
    if (changed) this.save();
  }

  /** @param {Record<string, unknown>} shortcut */
  bindingFromLegacyShortcut(shortcut) {
    return bindingFromLegacyShortcut(shortcut);
  }

  /** @param {unknown} event @param {{physical?: boolean}} [options] */
  bindingFromEvent(event, options = {}) {
    const chord = chordFromKeyboardEvent(event, {
      physical: options.physical === true,
      platform: this.platform,
      portable: true,
    });
    return chord ? normalizeBinding({ sequence: [chord] }) : null;
  }

  /** @param {{altKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean}} event */
  formatActiveModifiers(event) {
    return formatActiveModifiers(event, this.platform);
  }

  /** @param {Keybinding} binding */
  formatBinding(binding) { return formatBinding(binding, this.platform); }

  /** @param {Keybinding} binding */
  formatAriaBinding(binding) { return formatAriaBinding(binding, this.platform); }

  /** @param {Keybinding} binding */
  bindingIdentifier(binding) { return JSON.stringify(bindingSignature(binding, this.platform)); }

  /** @param {string} commandId */
  formatBindings(commandId) {
    return this.getEffectiveBindings(commandId).map((binding) => this.formatBinding(binding)).join(" / ");
  }

  /** @param {string} commandId @returns {Keybinding[]} */
  getEffectiveBindings(commandId) {
    const command = this.commands.get(commandId);
    if (!command) return [];
    const bindings = Object.prototype.hasOwnProperty.call(this.overrides, commandId)
      ? this.overrides[commandId]
      : command.defaultBindings;
    return bindings.map((binding) => /** @type {Keybinding} */ (cloneBinding(binding)));
  }

  /** @param {string} commandId */
  hasCommand(commandId) { return this.commands.has(commandId); }

  /** @param {string} commandId */
  isModified(commandId) {
    return Object.prototype.hasOwnProperty.call(this.overrides, commandId);
  }

  /** @param {CommandDescriptor} command @param {Record<string, unknown>} context */
  activeContext(command, context) {
    return command.activations
      .filter((activation) => contextMatches(activation.when, context) && (() => {
        try { return activation.isEnabled(); } catch { return false; }
      })())
      .sort((left, right) => contextSpecificity(right.when) - contextSpecificity(left.when))[0]?.when || null;
  }

  /** @param {CommandDescriptor} command @param {Record<string, unknown>} [context] */
  commandEnabled(command, context = this.getContext()) {
    return command.actionActivations.some((activation) => {
      if (!contextMatches(activation.when, context)) return false;
      try { return activation.isEnabled(); } catch { return false; }
    });
  }

  /** @param {string} commandId @param {{source?: string}} [details] @param {Record<string, unknown>} [context] */
  execute(commandId, details = {}, context = this.getContext()) {
    const command = this.commands.get(commandId);
    if (!command || !this.commandEnabled(command, context)) return false;
    try {
      const result = command.execute(details);
      if (result && typeof /** @type {{then?: unknown}} */ (result).then === "function") {
        Promise.resolve(result).catch((error) => this.reportError(`execute ${commandId}`, error));
      }
      return true;
    } catch (error) {
      this.reportError(`execute ${commandId}`, error);
      return false;
    }
  }

  /** @param {boolean} recording */
  setRecording(recording) {
    this.recording = recording === true;
    if (this.recording) {
      this.cancelPending();
      this.releaseActiveCommands({ source: "recording" });
    }
  }

  isRecording() { return this.recording; }

  cancelPending() {
    if (this.pending?.timer) this.clearTimer(this.pending.timer);
    this.pending = null;
  }

  /**
   * Only explicitly global commands with an input-safe chord may cross an
   * editable or active canvas-typing boundary. This preserves application
   * shortcuts such as Save without turning printable, destructive, or
   * navigation bindings into text input.
   *
   * @param {CommandDescriptor} command
   * @param {Keybinding} binding
   * @param {number} chordIndex
   * @param {Record<string, unknown>} context
   * @param {unknown} [target]
   */
  keyboardPolicyAllows(command, binding, chordIndex, context, target) {
    const chord = binding.sequence[chordIndex];
    if (!chord) return false;
    const inputOwner = resolvedInputOwner(context, target);
    if (inputOwner === "canvasPassive") return true;
    if (inputOwner === "canvasTyping" && command.allowDuringCanvasTyping &&
        colorChordCanCrossCanvasTyping(chord, this.platform)) return true;
    if (command.keyboardPolicy !== "global") return false;
    return globalChordCanCrossInputBoundary(chord, this.platform);
  }

  /** @param {{command: CommandDescriptor, binding: Keybinding} | null} candidate @param {unknown} [target] */
  executeKeyboardCandidate(candidate, target) {
    if (!candidate) return false;
    const context = this.getContext(target);
    if (!this.commandEnabled(candidate.command, context) || !this.keyboardPolicyAllows(
      candidate.command,
      candidate.binding,
      candidate.binding.sequence.length - 1,
      context,
      target,
    ) || !this.activeContext(candidate.command, context) ||
        (candidate.binding.when && !contextMatches(candidate.binding.when, context))) return false;
    const stillBound = this.getEffectiveBindings(candidate.command.id)
      .some((binding) => bindingsEqual(binding, candidate.binding, this.platform) &&
        contextSignature(binding.when || {}) === contextSignature(candidate.binding.when || {}));
    const executed = stillBound && this.execute(candidate.command.id, { source: "keyboard" }, context);
    if (executed && candidate.command.release) {
      this.activeCommands.set(candidate.command.id, {
        binding: /** @type {Keybinding} */ (cloneBinding(candidate.binding)),
        command: candidate.command,
      });
    }
    return executed;
  }

  /**
   * Execute the single-chord fallback of a pending sequence. If its physical
   * key was released while the dispatcher waited for a longer sequence, pair
   * the delayed press with an immediate release.
   *
   * @param {{fallback: {command: CommandDescriptor, binding: Keybinding} | null, fallbackReleased: boolean} | null} pending
   * @param {unknown} [target]
   */
  executePendingFallback(pending, target) {
    const executed = this.executeKeyboardCandidate(pending?.fallback || null, target);
    if (executed && pending?.fallbackReleased && pending.fallback?.command.release) {
      this.activeCommands.delete(pending.fallback.command.id);
      this.releaseCommand(pending.fallback.command, { source: "keyboard" });
    }
    return executed;
  }

  /** @param {CommandDescriptor} command @param {{source?: string}} details */
  releaseCommand(command, details) {
    if (!command.release) return false;
    try {
      const result = command.release(details);
      if (result && typeof /** @type {{then?: unknown}} */ (result).then === "function") {
        Promise.resolve(result).catch((error) => this.reportError(`release ${command.id}`, error));
      }
      return true;
    } catch (error) {
      this.reportError(`release ${command.id}`, error);
      return false;
    }
  }

  /** @param {{source?: string}} [details] */
  releaseActiveCommands(details = {}) {
    const active = Array.from(this.activeCommands.values());
    this.activeCommands.clear();
    let released = 0;
    for (const { command } of active) {
      if (this.releaseCommand(command, details)) released++;
    }
    return released;
  }

  /** @param {import("../domain/keybindings.mjs").KeyChord} chord @param {unknown} eventValue */
  chordMatchesKeyUp(chord, eventValue) {
    const event = /** @type {{code?: string, key?: string}} */ (eventValue);
    return chord.code
      ? chord.code === event.code
      : chord.key === normalizeKey(event.key);
  }

  /** @param {unknown} eventValue */
  handleKeyUp(eventValue) {
    if (!eventValue || typeof eventValue !== "object") return { handled: false, status: "ignored" };
    const event = /** @type {{preventDefault?: () => void, stopImmediatePropagation?: () => void, stopPropagation?: () => void}} */ (eventValue);
    const matches = Array.from(this.activeCommands.entries()).filter(([, { binding }]) => {
      const chord = binding.sequence[binding.sequence.length - 1];
      return Boolean(chord && this.chordMatchesKeyUp(chord, eventValue));
    });
    if (!matches.length) {
      const pending = this.pending;
      const fallback = pending?.fallback;
      const fallbackChord = fallback?.binding.sequence[fallback.binding.sequence.length - 1];
      if (pending && fallback?.command.release && fallbackChord &&
          this.chordMatchesKeyUp(fallbackChord, eventValue)) {
        pending.fallbackReleased = true;
        this.consumeEvent(event);
        return { handled: true, status: "pending" };
      }
      return { handled: false, status: "unmatched" };
    }
    this.consumeEvent(event);
    const commandIds = [];
    for (const [commandId, { command }] of matches) {
      this.activeCommands.delete(commandId);
      this.releaseCommand(command, { source: "keyboard" });
      commandIds.push(commandId);
    }
    return { commandIds, handled: true, status: "released" };
  }

  /**
   * @param {{command: CommandDescriptor, binding: Keybinding, context: Record<string, unknown>, specificity: number}[]} candidates
   */
  chooseCandidate(candidates) {
    const ranked = candidates.slice().sort((left, right) => {
      const specificity = right.specificity - left.specificity;
      if (specificity) return specificity;
      const bindingPriority = (right.binding.priority || 0) - (left.binding.priority || 0);
      if (bindingPriority) return bindingPriority;
      return right.command.priority - left.command.priority;
    });
    if (!ranked.length) return null;
    const first = ranked[0];
    const topCommandIds = new Set(ranked
      .filter((candidate) => candidate.specificity === first.specificity &&
        (candidate.binding.priority || 0) === (first.binding.priority || 0) &&
        candidate.command.priority === first.command.priority)
      .map((candidate) => candidate.command.id));
    if (topCommandIds.size > 1) return null;
    return { command: first.command, binding: first.binding };
  }

  /**
   * @param {string[][]} paths
   * @param {unknown} event
   * @param {Record<string, unknown>} context
   */
  matchingCandidatesForEvent(paths, event, context) {
    /** @type {{command: CommandDescriptor, binding: Keybinding, context: Record<string, unknown>, exact: boolean, path: string[], specificity: number}[]} */
    const candidates = [];
    for (const command of this.commands.values()) {
      const activeContext = this.activeContext(command, context);
      if (!activeContext) continue;
      for (const binding of this.getEffectiveBindings(command.id)) {
        if (binding.when && !contextMatches(binding.when, context)) continue;
        const signature = bindingSignature(binding, this.platform);
        for (const path of paths) {
          if (path.length >= signature.length ||
              !path.every((part, index) => part === signature[index]) ||
              !this.keyboardPolicyAllows(command, binding, path.length, context,
                /** @type {{target?: unknown}} */ (event).target) ||
              !eventMatchesChord(binding.sequence[path.length], event, this.platform)) continue;
          const nextPath = path.concat(signature[path.length]);
          candidates.push({
            command,
            binding,
            context: { ...activeContext, ...(binding.when || {}) },
            exact: nextPath.length === signature.length,
            path: nextPath,
            specificity: contextSpecificity(activeContext) + contextSpecificity(binding.when || {}),
          });
        }
      }
    }
    return candidates;
  }

  /** @param {{preventDefault?: () => void, stopImmediatePropagation?: () => void, stopPropagation?: () => void}} event */
  consumeEvent(event) {
    event.preventDefault?.();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    else event.stopPropagation?.();
  }

  /** @param {unknown} eventValue */
  handleKeyDown(eventValue) {
    if (!eventValue || typeof eventValue !== "object") return { handled: false, status: "ignored" };
    const event = /** @type {{altKey?: boolean, ctrlKey?: boolean, getModifierState?: (name: string) => boolean, isComposing?: boolean, key?: string, metaKey?: boolean, repeat?: boolean, shiftKey?: boolean, target?: unknown, preventDefault?: () => void, stopImmediatePropagation?: () => void, stopPropagation?: () => void}} */ (eventValue);
    if (this.recording) {
      this.consumeEvent(event);
      return { handled: true, status: "recording" };
    }
    if (event.isComposing || event.getModifierState?.("AltGraph")) {
      this.cancelPending();
      return { handled: false, status: "ignored" };
    }
    if (this.pending && event.key === "Escape" &&
        !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      this.consumeEvent(event);
      this.cancelPending();
      return { handled: true, status: "cancelled" };
    }
    if (this.pending && event.repeat) {
      this.consumeEvent(event);
      return { handled: true, status: "pending" };
    }
    const context = this.getContext(event.target);
    const inputOwner = resolvedInputOwner(context, event.target);
    if (context.browserEditOperations === true && (event.metaKey || event.ctrlKey) &&
        ["a", "c", "v", "x", "y", "z"].includes(String(normalizeKey(event.key)))) {
      this.cancelPending();
      return { handled: false, status: "ignored" };
    }
    let paths = this.pending ? this.pending.paths : [[]];
    let candidates = this.matchingCandidatesForEvent(paths, eventValue, context);
    if (!candidates.length && this.pending) {
      const pending = this.pending;
      this.cancelPending();
      this.executePendingFallback(pending, event.target);
      paths = [[]];
      candidates = this.matchingCandidatesForEvent(paths, eventValue, context);
    }
    if (!candidates.length) {
      return { handled: false, status: inputOwner === "canvasPassive" ? "unmatched" : "ignored" };
    }

    const exact = candidates.filter((candidate) => candidate.exact && (!event.repeat || candidate.binding.repeat));
    const longer = candidates.some((candidate) => !candidate.exact);
    const selected = this.chooseCandidate(exact);
    this.consumeEvent(event);
    this.cancelPending();

    if (longer) {
      /** @type {string[][]} */
      const pendingPaths = [];
      const seenPaths = new Set();
      for (const candidate of candidates.filter((value) => !value.exact)) {
        const signature = candidate.path.join("\u0000");
        if (seenPaths.has(signature)) continue;
        seenPaths.add(signature);
        pendingPaths.push(candidate.path);
      }
      /** @type {{paths: string[][], fallback: {command: CommandDescriptor, binding: Keybinding} | null, fallbackReleased: boolean, timer: unknown} | null} */
      let pending = null;
      const timer = this.setTimer(() => {
        if (this.pending !== pending) return;
        this.pending = null;
        this.executePendingFallback(pending);
      }, 1000);
      pending = { paths: pendingPaths, fallback: selected, fallbackReleased: false, timer };
      this.pending = pending;
      return { handled: true, status: "pending" };
    }
    if (!selected) return { handled: true, status: "conflict" };
    const executed = this.executeKeyboardCandidate(selected, event.target);
    return executed
      ? { commandId: selected.command.id, handled: true, status: "executed" }
      : { handled: true, status: "disabled" };
  }

  /**
   * @param {CommandDescriptor} left
   * @param {Keybinding} leftBinding
   * @param {CommandDescriptor} right
   * @param {Keybinding} rightBinding
   */
  bindingContextsOverlap(left, leftBinding, right, rightBinding) {
    return left.contexts.some((leftContext) =>
      right.contexts.some((rightContext) => contextClausesOverlap(
        leftContext,
        leftBinding.when || {},
        rightContext,
        rightBinding.when || {},
      ))
    );
  }

  /**
   * Compare the same rules used by runtime dispatch across every context where
   * two bindings can coexist. A single winner is reported only when it wins in
   * every overlap; mixed or tied outcomes remain explicitly unresolved.
   *
   * @param {CommandDescriptor} left
   * @param {Keybinding} leftBinding
   * @param {CommandDescriptor} right
   * @param {Keybinding} rightBinding
   * @returns {"new" | "existing" | "unresolved"}
   */
  bindingPrecedence(left, leftBinding, right, rightBinding) {
    /** @type {Set<"new" | "existing" | "unresolved">} */
    const outcomes = new Set();
    for (const leftContext of left.contexts) {
      for (const rightContext of right.contexts) {
        if (!contextClausesOverlap(
          leftContext,
          leftBinding.when || {},
          rightContext,
          rightBinding.when || {},
        )) continue;
        const leftSpecificity = contextSpecificity(leftContext) + contextSpecificity(leftBinding.when || {});
        const rightSpecificity = contextSpecificity(rightContext) + contextSpecificity(rightBinding.when || {});
        if (leftSpecificity !== rightSpecificity) {
          outcomes.add(leftSpecificity > rightSpecificity ? "new" : "existing");
          continue;
        }
        const leftPriority = leftBinding.priority || 0;
        const rightPriority = rightBinding.priority || 0;
        if (leftPriority !== rightPriority) {
          outcomes.add(leftPriority > rightPriority ? "new" : "existing");
          continue;
        }
        if (left.priority !== right.priority) {
          outcomes.add(left.priority > right.priority ? "new" : "existing");
          continue;
        }
        outcomes.add("unresolved");
      }
    }
    return outcomes.size === 1
      ? /** @type {"new" | "existing" | "unresolved"} */ (Array.from(outcomes)[0])
      : "unresolved";
  }

  /** @param {string} commandId @param {Keybinding} binding @returns {BindingConflict[]} */
  analyzeBinding(commandId, binding) {
    const command = this.commands.get(commandId);
    if (!command) return [];
    /** @type {BindingConflict[]} */
    const results = [];
    for (const other of this.commands.values()) {
      this.getEffectiveBindings(other.id).forEach((candidate, bindingIndex) => {
        const bindingContext = candidate.when && Object.keys(candidate.when).length
          ? [`binding: ${describeContext(candidate.when)}`]
          : [];
        const contextLabel = other.contexts.map(describeContext).concat(bindingContext).join("; ");
        const overlaps = this.bindingContextsOverlap(command, binding, other, candidate);
        const equivalent = bindingsEqual(binding, candidate, this.platform);
        const coincides = equivalent || bindingsCanCoincide(binding, candidate, this.platform);
        if (coincides) {
          if (other.id === commandId) {
            if (equivalent) {
              results.push({ bindingIndex, commandId: other.id, contextLabel, title: other.title, type: "duplicate" });
            }
          } else if (overlaps) {
            const precedence = this.bindingPrecedence(command, binding, other, candidate);
            results.push({
              bindingIndex,
              commandId: other.id,
              contextLabel,
              layoutDependent: !equivalent,
              precedence,
              shadowed: precedence === "unresolved" ? null :
                precedence === "new" ? other.id : command.id,
              title: other.title,
              type: "hard",
            });
          } else {
            results.push({
              bindingIndex,
              commandId: other.id,
              contextLabel,
              layoutDependent: !equivalent,
              title: other.title,
              type: "context-separated",
            });
          }
        } else {
          const exactPrefix = bindingIsPrefix(binding, candidate, this.platform) ||
            bindingIsPrefix(candidate, binding, this.platform);
          const possiblePrefix = bindingCanBePrefix(binding, candidate, this.platform) ||
            bindingCanBePrefix(candidate, binding, this.platform);
          if (!overlaps || (!exactPrefix && !possiblePrefix)) return;
          results.push({
            bindingIndex,
            commandId: other.id,
            contextLabel,
            layoutDependent: !exactPrefix,
            title: other.title,
            type: "prefix",
          });
        }
      });
    }
    if (isRiskyBinding(binding, this.platform)) {
      results.push({
        commandId,
        contextLabel: command.contexts.map(describeContext).join("; "),
        title: command.title,
        type: "reserved",
      });
    }
    if (bindingHasUnknownLayout(binding)) {
      results.push({
        commandId,
        contextLabel: command.contexts.map(describeContext).join("; "),
        title: command.title,
        type: "layout-unknown",
      });
    }
    return results;
  }

  /** @param {string} commandId @returns {BindingConflict[]} */
  getCommandConflicts(commandId) {
    /** @type {BindingConflict[]} */
    const results = [];
    /** @type {Set<string>} */
    const seen = new Set();
    const customized = this.isModified(commandId);
    for (const binding of this.getEffectiveBindings(commandId)) {
      for (const conflict of this.analyzeBinding(commandId, binding)) {
        if (conflict.type === "duplicate" && conflict.commandId === commandId) continue;
        // Built-in bindings predate recorded layout metadata. Only surface the
        // uncertainty for user overrides that can be fixed by re-recording.
        if (conflict.type === "layout-unknown" && !customized) continue;
        const signature = `${conflict.type}:${conflict.commandId}:${conflict.bindingIndex ?? ""}`;
        if (!seen.has(signature)) {
          seen.add(signature);
          results.push(conflict);
        }
      }
    }
    return results;
  }

  /** @returns {CommandSummary[]} */
  getCommands() {
    const currentMode = this.getContext().editorMode;
    return Array.from(this.commands.values())
      .map((command) => {
        const bindings = this.getEffectiveBindings(command.id);
        const bindingContexts = bindings
          .filter((binding) => binding.when && Object.keys(binding.when).length)
          .map((binding) => `binding: ${describeContext(binding.when || {})}`);
        return {
          availableInCurrentMode: command.contexts.some((context) => {
            if (!Object.prototype.hasOwnProperty.call(context, "editorMode")) return true;
            return contextMatches({ editorMode: context.editorMode }, { editorMode: currentMode });
          }),
          bindings,
          category: command.category,
          conflicts: this.getCommandConflicts(command.id),
          contexts: command.contexts.map((context) => ({ ...context })),
          contextLabel: command.contexts.map(describeContext).concat(bindingContexts).join("; "),
          id: command.id,
          modified: this.isModified(command.id),
          source: this.isModified(command.id) ? "User" : "Default",
          title: command.title,
        };
      })
      .sort((left, right) => left.category.localeCompare(right.category) || left.title.localeCompare(right.title));
  }

  /** @param {string} commandId @param {Keybinding[]} bindings */
  setBindings(commandId, bindings) {
    if (!this.commands.has(commandId)) throw new Error(`Unknown command: ${commandId}`);
    const normalized = bindings.map(normalizeBinding);
    if (normalized.some((binding) => binding === null)) throw new TypeError("Invalid keybinding");
    this.overrides[commandId] = uniqueBindings(
      /** @type {Keybinding[]} */ (normalized),
      this.platform,
    ).slice(0, 1);
    this.save();
    this.notify();
  }

  /** @param {string} commandId @param {number} _index @param {Keybinding} binding @param {{takePrecedence?: boolean}} [options] */
  setBinding(commandId, _index, binding, options = {}) {
    const normalized = normalizeBinding(binding);
    if (!normalized) throw new TypeError("Invalid keybinding");
    let nextBinding = normalized;
    if (options.takePrecedence) {
      const priorities = this.analyzeBinding(commandId, normalized)
        .filter((conflict) => conflict.type === "hard")
        .map((conflict) => {
          const conflictBindings = this.getEffectiveBindings(String(conflict.commandId));
          return conflictBindings[Number(conflict.bindingIndex)]?.priority || 0;
        });
      nextBinding = /** @type {Keybinding} */ (normalizeBinding({
        ...normalized,
        priority: Math.max(0, ...priorities) + 1,
      }));
    }
    this.setBindings(commandId, [nextBinding]);
  }

  /** @param {string} commandId @param {number} index */
  removeBinding(commandId, index) {
    const bindings = this.getEffectiveBindings(commandId);
    if (index < 0 || index >= bindings.length) return;
    bindings.splice(index, 1);
    this.setBindings(commandId, bindings);
  }

  /** @param {string} commandId */
  unbindCommand(commandId) { this.setBindings(commandId, []); }

  /** @param {string} commandId */
  resetCommand(commandId) {
    if (!Object.prototype.hasOwnProperty.call(this.overrides, commandId)) return;
    delete this.overrides[commandId];
    this.save();
    this.notify();
  }

  resetAll() {
    this.overrides = {};
    this.save();
    this.notify();
  }

  /** @param {string} commandId @param {Keybinding} binding */
  replaceConflicts(commandId, binding) {
    const conflicts = this.analyzeBinding(commandId, binding)
      .filter((conflict) => conflict.type === "hard" && conflict.commandId !== commandId);
    /** @type {Map<string, number[]>} */
    const removals = new Map();
    for (const conflict of conflicts) {
      const id = String(conflict.commandId);
      if (!removals.has(id)) removals.set(id, []);
      removals.get(id)?.push(Number(conflict.bindingIndex));
    }
    for (const [id, indexes] of removals) {
      const bindings = this.getEffectiveBindings(id);
      for (const index of indexes.sort((left, right) => right - left)) bindings.splice(index, 1);
      this.overrides[id] = bindings.slice(0, 1);
    }
    this.save();
    this.notify();
  }

  exportConfiguration() {
    const overrides = {};
    for (const [id, bindings] of Object.entries(this.overrides)) {
      Object.assign(overrides, { [id]: bindings.map(cloneBinding) });
    }
    return JSON.stringify({ version: persistenceVersion, overrides }, null, 2);
  }

  /** @param {string} text */
  importConfiguration(text) {
    const imported = readOverrides(JSON.parse(text));
    /** @type {Record<string, Keybinding[]>} */
    const known = {};
    for (const [id, bindings] of Object.entries(imported)) {
      if (this.commands.has(id)) known[id] = bindings;
    }
    this.overrides = known;
    this.save();
    this.notify();
  }
}
