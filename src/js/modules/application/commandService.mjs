import {
  bindingCoincidence,
  bindingFromLegacyShortcut,
  bindingHasUnknownLayout,
  bindingIsPrefix,
  bindingPrefixCoincidence,
  bindingSignature,
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
  normalizeBinding,
  resolvePrimaryModifier,
  shortcutKeyboardEvent,
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
 * @property {boolean} repeatable
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
 * @property {"context-separated" | "duplicate" | "hard" | "layout-possible" | "layout-unknown" | "prefix" | "reserved"} type
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
 * @property {(value: string) => boolean | void} save
 * @property {(value: string, reason: string) => void} [quarantine]
 */

/**
 * @typedef {object} ShortcutConfiguration
 * @property {number} version
 * @property {Record<string, Keybinding[]>} overrides
 */

/**
 * @typedef {object} ShortcutEditResult
 * @property {boolean} applied
 * @property {string[]} changedCommandIds
 * @property {ShortcutConfiguration} configuration
 * @property {Error | null} error
 * @property {string} operation
 * @property {"failed" | "not-needed" | "saved" | "unavailable"} persistence
 * @property {"durable" | "rejected" | "session-only"} status
 * @property {string | null} reason
 */

/**
 * @typedef {object} CommandCompletion
 * @property {Error | null} error
 * @property {"completed" | "failed" | "rejected"} status
 * @property {unknown} value
 */

/**
 * `accepted` is the synchronous dispatch decision. `completion` reports the
 * eventual handler outcome without making keyboard event consumption await it.
 *
 * @typedef {object} CommandExecutionResult
 * @property {boolean} accepted
 * @property {boolean} asynchronous
 * @property {string} commandId
 * @property {Promise<CommandCompletion>} completion
 * @property {Error | null} error
 * @property {"accepted" | "failed" | "rejected"} status
 * @property {string | null} reason
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

/** @param {Record<string, Keybinding[]>} overrides @returns {ShortcutConfiguration} */
function configurationSnapshot(overrides) {
  /** @type {Record<string, Keybinding[]>} */
  const snapshot = {};
  for (const [commandId, bindings] of Object.entries(overrides)) {
    snapshot[commandId] = bindings.map((binding) => /** @type {Keybinding} */ (cloneBinding(binding)));
  }
  return { version: persistenceVersion, overrides: snapshot };
}

/** @param {unknown} error @param {string} fallback */
function errorValue(error, fallback) {
  return error instanceof Error ? error : new Error(error == null ? fallback : String(error));
}

/**
 * @param {string} commandId
 * @param {boolean} accepted
 * @param {"accepted" | "failed" | "rejected"} status
 * @param {boolean} asynchronous
 * @param {CommandCompletion | Promise<CommandCompletion>} completion
 * @param {string | null} [reason]
 * @param {Error | null} [error]
 * @returns {CommandExecutionResult}
 */
function commandExecutionResult(
  commandId,
  accepted,
  status,
  asynchronous,
  completion,
  reason = null,
  error = null,
) {
  return Object.freeze({
    accepted,
    asynchronous,
    commandId,
    completion: Promise.resolve(completion),
    error,
    reason,
    status,
  });
}

/** @param {unknown} value @param {{strict?: boolean}} [options] @returns {Record<string, Keybinding[]>} */
function readOverrides(value, options = {}) {
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
    if (!/^[a-z][a-zA-Z0-9.-]+$/.test(commandId) || !Array.isArray(rawBindings)) {
      if (options.strict) throw new TypeError(`Invalid shortcut override: ${commandId}`);
      continue;
    }
    const bindings = rawBindings.map(normalizeBinding);
    if (bindings.some((binding) => binding === null)) {
      if (options.strict) throw new TypeError(`Invalid shortcut binding: ${commandId}`);
      continue;
    }
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

/**
 * Positive means `left` wins, negative means `right` wins, and zero preserves
 * an explicit unresolved tie. Dispatch and conflict explanations both use
 * this comparator so they cannot disagree about which command takes priority.
 *
 * @param {{command: CommandDescriptor, binding: Keybinding, specificity: number}} left
 * @param {{command: CommandDescriptor, binding: Keybinding, specificity: number}} right
 */
function compareCandidatePrecedence(left, right) {
  const specificity = left.specificity - right.specificity;
  if (specificity) return specificity;
  const bindingPriority = (left.binding.priority || 0) - (right.binding.priority || 0);
  if (bindingPriority) return bindingPriority;
  return left.command.priority - right.command.priority;
}

/**
 * @typedef {object} PhysicalKeyIdentity
 * @property {"code" | "key"} kind
 * @property {string} value
 */

/**
 * Key releases must follow the key that actually activated a command. In
 * particular, a shifted printable key can have a different `key` value by the
 * time its keyup arrives, while its physical `code` remains stable.
 *
 * @param {import("../domain/keybindings.mjs").ShortcutKeyboardEvent} event
 * @returns {PhysicalKeyIdentity | null}
 */
function physicalKeyIdentity(event) {
  if (event.modifierOnly) return null;
  if (event.code) return Object.freeze({ kind: "code", value: event.code });
  if (event.key) return Object.freeze({ kind: "key", value: event.key });
  return null;
}

/** @param {PhysicalKeyIdentity | null} left @param {PhysicalKeyIdentity | null} right */
function physicalKeysEqual(left, right) {
  return Boolean(left && right && left.kind === right.kind && left.value === right.value);
}

/** @param {string} commandId @param {PhysicalKeyIdentity} key */
function heldActivationId(commandId, key) {
  return `${commandId}\u0000${key.kind}:${key.value}`;
}

/**
 * Own the mutable dispatcher lifecycle in one place. Pending sequences and
 * held commands may coexist, while recording excludes both. Taking pending or
 * held work removes it before callbacks run, making cleanup re-entrant and
 * repeated cleanup harmless.
 */
class CommandDispatcherState {
  /** @param {(timer: unknown) => void} clearTimer */
  constructor(clearTimer) {
    this.clearTimer = clearTimer;
    this.recording = false;
    this.lifecycleRevision = 0;
    /** @type {{source?: string}} */
    this.lastCleanupDetails = {};
    /** @type {Map<string, {command: CommandDescriptor, key: PhysicalKeyIdentity}>} */
    this.heldCommands = new Map();
    /** @type {{paths: string[][], fallback: {command: CommandDescriptor, binding: Keybinding} | null, fallbackKey: PhysicalKeyIdentity | null, fallbackReleased: boolean, timer: unknown} | null} */
    this.pending = null;
  }

  /** @param {boolean} recording */
  setRecording(recording) { this.recording = recording === true; }

  /** @param {{source?: string}} details */
  markCleanup(details) {
    this.lifecycleRevision++;
    this.lastCleanupDetails = { ...details };
  }

  /** @param {number} revision @returns {{source?: string} | null} */
  cleanupAfter(revision) {
    return this.lifecycleRevision === revision ? null : this.lastCleanupDetails;
  }

  /** @param {{paths: string[][], fallback: {command: CommandDescriptor, binding: Keybinding} | null, fallbackKey: PhysicalKeyIdentity | null, fallbackReleased: boolean, timer: unknown}} pending */
  setPending(pending) {
    this.cancelPending();
    this.pending = pending;
  }

  /** @param {object | null} [expected] */
  takePending(expected = null) {
    if (!this.pending || (expected && this.pending !== expected)) return null;
    const pending = this.pending;
    this.pending = null;
    if (pending.timer !== null && pending.timer !== undefined) this.clearTimer(pending.timer);
    return pending;
  }

  cancelPending() { return Boolean(this.takePending()); }

  /** @param {CommandDescriptor} command @param {PhysicalKeyIdentity | null} key */
  hold(command, key) {
    if (!key) return false;
    const id = heldActivationId(command.id, key);
    if (this.heldCommands.has(id)) return false;
    this.heldCommands.set(id, { command, key });
    return true;
  }

  /** @param {string} commandId @param {PhysicalKeyIdentity | null} key */
  takeHeld(commandId, key) {
    if (!key) return null;
    const id = heldActivationId(commandId, key);
    const held = this.heldCommands.get(id) || null;
    if (held) this.heldCommands.delete(id);
    return held;
  }

  /** @param {PhysicalKeyIdentity | null} key */
  takeHeldForKey(key) {
    if (!key) return [];
    const matches = Array.from(this.heldCommands.entries())
      .filter(([, held]) => physicalKeysEqual(held.key, key));
    for (const [id] of matches) this.heldCommands.delete(id);
    return matches.map(([, held]) => held);
  }

  takeAllHeld() {
    const held = Array.from(this.heldCommands.values());
    this.heldCommands.clear();
    return held;
  }
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
    /** @type {Set<(result: ShortcutEditResult) => void>} */
    this.listeners = new Set();
    /** @type {WeakSet<Function>} */
    this.reportedEnabledPredicateFailures = new WeakSet();
    this.sessionOnlyEdits = false;
    /** @type {Error | null} */
    this.lastPersistenceError = null;
    this.dispatcher = new CommandDispatcherState(clearTimer);
    this.load();
  }

  get recording() { return this.dispatcher.recording; }
  get pending() { return this.dispatcher.pending; }
  get activeCommands() { return this.dispatcher.heldCommands; }

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

  /** @param {Record<string, Keybinding[]>} overrides */
  persist(overrides) {
    try {
      const saved = this.storage.save(JSON.stringify(configurationSnapshot(overrides)));
      if (saved === false) {
        return {
          error: new Error("Keyboard shortcut storage is unavailable."),
          persistence: /** @type {const} */ ("unavailable"),
        };
      }
      return { error: null, persistence: /** @type {const} */ ("saved") };
    } catch (error) {
      this.reportError("save keyboard shortcuts", error);
      return {
        error: errorValue(error, "Could not save keyboard shortcuts."),
        persistence: /** @type {const} */ ("failed"),
      };
    }
  }

  /** @param {(result: ShortcutEditResult) => void} listener */
  onDidChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** @param {ShortcutEditResult} result */
  notify(result) {
    this.cleanup({ source: "binding-change" });
    for (const listener of this.listeners) {
      try {
        listener(result);
      } catch (error) {
        this.reportError("notify keyboard shortcut change", error);
      }
    }
  }

  /**
   * @param {{id: string, title: string, category?: string, execute: (details?: {source?: string}) => unknown, release?: (details?: {source?: string}) => unknown, isEnabled?: () => boolean, contexts?: Record<string, unknown>[], actionContexts?: Record<string, unknown>[], defaultBindings?: unknown[], keyboardPolicy?: "global" | "local", allowDuringCanvasTyping?: boolean, priority?: number, repeatable?: boolean}} registration
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
      if (registration.repeatable === true || normalizedBindings.some((binding) => binding?.repeat)) {
        existing.repeatable = true;
      }
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
      repeatable: registration.repeatable === true || normalizedBindings.some((binding) => binding?.repeat),
      title: registration.title,
    });
    return registration.id;
  }

  finalizeRegistration() {
    const next = configurationSnapshot(this.overrides).overrides;
    for (const commandId of Object.keys(next)) {
      if (!this.commands.has(commandId)) {
        delete next[commandId];
      }
    }
    return this.commitEdit("prune", next);
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
        return this.enabledPredicate(command.id, activation.isEnabled);
      })())
      .sort((left, right) => contextSpecificity(right.when) - contextSpecificity(left.when))[0]?.when || null;
  }

  /** @param {string} commandId @param {() => boolean} predicate */
  enabledPredicate(commandId, predicate) {
    try {
      return predicate() !== false;
    } catch (error) {
      if (!this.reportedEnabledPredicateFailures.has(predicate)) {
        this.reportedEnabledPredicateFailures.add(predicate);
        this.reportError(`check whether ${commandId} is enabled`, error);
      }
      return false;
    }
  }

  /** @param {CommandDescriptor} command @param {Record<string, unknown>} [context] */
  commandEnabled(command, context = this.getContext()) {
    return command.actionActivations.some((activation) => {
      if (!contextMatches(activation.when, context)) return false;
      return this.enabledPredicate(command.id, activation.isEnabled);
    });
  }

  /**
   * A synchronous `false` from a legacy handler rejects activation. Promises
   * are accepted immediately, then normalized into an observable completion.
   * This keeps DOM event consumption synchronous while exposing async failure.
   *
   * @param {string} commandId
   * @param {{source?: string}} [details]
   * @param {Record<string, unknown>} [context]
   * @returns {CommandExecutionResult}
   */
  execute(commandId, details = {}, context = this.getContext()) {
    const command = this.commands.get(commandId);
    if (!command) {
      const completion = { error: null, status: /** @type {const} */ ("rejected"), value: false };
      return commandExecutionResult(commandId, false, "rejected", false, completion, "unknown-command");
    }
    if (!this.commandEnabled(command, context)) {
      const completion = { error: null, status: /** @type {const} */ ("rejected"), value: false };
      return commandExecutionResult(commandId, false, "rejected", false, completion, "disabled");
    }
    try {
      const result = command.execute(details);
      if (result && typeof /** @type {{then?: unknown}} */ (result).then === "function") {
        const completion = Promise.resolve(result).then((value) => value === false
          ? { error: null, status: /** @type {const} */ ("rejected"), value }
          : { error: null, status: /** @type {const} */ ("completed"), value }, (error) => {
          const failure = errorValue(error, `Command ${commandId} failed.`);
          this.reportError(`execute ${commandId}`, failure);
          return { error: failure, status: /** @type {const} */ ("failed"), value: undefined };
        });
        return commandExecutionResult(commandId, true, "accepted", true, completion);
      }
      if (result === false) {
        const completion = { error: null, status: /** @type {const} */ ("rejected"), value: result };
        return commandExecutionResult(commandId, false, "rejected", false, completion, "handler-rejected");
      }
      const completion = { error: null, status: /** @type {const} */ ("completed"), value: result };
      return commandExecutionResult(commandId, true, "accepted", false, completion);
    } catch (error) {
      const failure = errorValue(error, `Command ${commandId} failed.`);
      this.reportError(`execute ${commandId}`, failure);
      const completion = { error: failure, status: /** @type {const} */ ("failed"), value: undefined };
      return commandExecutionResult(commandId, false, "failed", false, completion, "handler-failed", failure);
    }
  }

  /** @param {boolean} recording */
  setRecording(recording) {
    const next = recording === true;
    if (next && !this.dispatcher.recording) this.cleanup({ source: "recording" });
    this.dispatcher.setRecording(next);
  }

  isRecording() { return this.dispatcher.recording; }

  cancelPending() { return this.dispatcher.cancelPending(); }

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

  /**
   * @param {{command: CommandDescriptor, binding: Keybinding} | null} candidate
   * @param {unknown} target
   * @param {PhysicalKeyIdentity | null} activationKey
   */
  executeKeyboardCandidate(candidate, target, activationKey) {
    if (!candidate) return null;
    const context = this.getContext(target);
    if (!this.commandEnabled(candidate.command, context) || !this.keyboardPolicyAllows(
      candidate.command,
      candidate.binding,
      candidate.binding.sequence.length - 1,
      context,
      target,
    ) || !this.activeContext(candidate.command, context) ||
        (candidate.binding.when && !contextMatches(candidate.binding.when, context))) return null;
    const stillBound = this.getEffectiveBindings(candidate.command.id)
      .some((binding) => bindingsEqual(binding, candidate.binding, this.platform) &&
        contextSignature(binding.when || {}) === contextSignature(candidate.binding.when || {}));
    const lifecycleRevision = this.dispatcher.lifecycleRevision;
    const execution = stillBound
      ? this.execute(candidate.command.id, { source: "keyboard" }, context)
      : null;
    if (execution?.accepted && candidate.command.release) {
      const cleanupDetails = this.dispatcher.cleanupAfter(lifecycleRevision);
      if (cleanupDetails) this.releaseCommand(candidate.command, cleanupDetails);
      else this.dispatcher.hold(candidate.command, activationKey);
    }
    return execution;
  }

  /**
   * Execute the single-chord fallback of a pending sequence. If its physical
   * key was released while the dispatcher waited for a longer sequence, pair
   * the delayed press with an immediate release.
   *
   * @param {{fallback: {command: CommandDescriptor, binding: Keybinding} | null, fallbackKey: PhysicalKeyIdentity | null, fallbackReleased: boolean} | null} pending
   * @param {unknown} [target]
   */
  executePendingFallback(pending, target) {
    const execution = this.executeKeyboardCandidate(
      pending?.fallback || null,
      target,
      pending?.fallbackKey || null,
    );
    if (execution?.accepted && pending?.fallbackReleased && pending.fallback?.command.release) {
      const held = this.dispatcher.takeHeld(pending.fallback.command.id, pending.fallbackKey);
      if (held) this.releaseCommand(held.command, { source: "keyboard" });
    }
    return execution?.accepted === true;
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
    const active = this.dispatcher.takeAllHeld();
    let released = 0;
    for (const { command } of active) {
      if (this.releaseCommand(command, details)) released++;
    }
    return released;
  }

  /**
   * Cancel delayed work and release held activations. Pending fallbacks are
   * deliberately discarded rather than executed during lifecycle changes.
   *
   * @param {{source?: string}} [details]
   */
  cleanup(details = {}) {
    this.dispatcher.markCleanup(details);
    this.dispatcher.cancelPending();
    return this.releaseActiveCommands(details);
  }

  /** @param {{source?: string}} [details] */
  dispose(details = { source: "teardown" }) {
    this.dispatcher.setRecording(false);
    return this.cleanup(details);
  }

  /** @param {unknown} eventValue */
  handleKeyUp(eventValue) {
    if (!eventValue || typeof eventValue !== "object") return { handled: false, status: "ignored" };
    const event = /** @type {{preventDefault?: () => void, stopImmediatePropagation?: () => void, stopPropagation?: () => void}} */ (eventValue);
    const shortcutEvent = shortcutKeyboardEvent(eventValue);
    const releasedKey = shortcutEvent ? physicalKeyIdentity(shortcutEvent) : null;
    const matches = this.dispatcher.takeHeldForKey(releasedKey);
    if (!matches.length) {
      const pending = this.pending;
      const fallback = pending?.fallback;
      if (pending && fallback?.command.release &&
          physicalKeysEqual(pending.fallbackKey, releasedKey)) {
        pending.fallbackReleased = true;
        this.consumeEvent(event);
        return { handled: true, status: "pending" };
      }
      return { handled: false, status: "unmatched" };
    }
    this.consumeEvent(event);
    const commandIds = [];
    for (const { command } of matches) {
      this.releaseCommand(command, { source: "keyboard" });
      commandIds.push(command.id);
    }
    return { commandIds, handled: true, status: "released" };
  }

  /**
   * @param {{command: CommandDescriptor, binding: Keybinding, context: Record<string, unknown>, specificity: number}[]} candidates
   */
  chooseCandidate(candidates) {
    const ranked = candidates.slice().sort((left, right) =>
      compareCandidatePrecedence(right, left));
    if (!ranked.length) return null;
    const first = ranked[0];
    const topCommandIds = new Set(ranked
      .filter((candidate) => compareCandidatePrecedence(candidate, first) === 0)
      .map((candidate) => candidate.command.id));
    if (topCommandIds.size > 1) return null;
    return { command: first.command, binding: first.binding };
  }

  /**
   * @param {string[][]} paths
   * @param {import("../domain/keybindings.mjs").ShortcutKeyboardEvent} event
   * @param {Record<string, unknown>} context
   * @param {unknown} [target]
   */
  matchingCandidatesForEvent(paths, event, context, target) {
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
                target) ||
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
    const shortcutEvent = shortcutKeyboardEvent(eventValue);
    if (!shortcutEvent) return { handled: false, status: "ignored" };
    if (this.recording) {
      this.consumeEvent(event);
      return { handled: true, status: "recording" };
    }
    if (shortcutEvent.composing || shortcutEvent.altGraph) {
      this.cancelPending();
      return { handled: false, status: "ignored" };
    }
    if (this.pending && shortcutEvent.key === "Escape" &&
        !shortcutEvent.alt && !shortcutEvent.ctrl && !shortcutEvent.meta && !shortcutEvent.shift) {
      this.consumeEvent(event);
      this.cancelPending();
      return { handled: true, status: "cancelled" };
    }
    if (this.pending && shortcutEvent.repeat) {
      this.consumeEvent(event);
      return { handled: true, status: "pending" };
    }
    if (this.pending && shortcutEvent.modifierOnly) {
      return { handled: false, status: "pending" };
    }
    const context = this.getContext(event.target);
    const inputOwner = resolvedInputOwner(context, event.target);
    if (context.browserEditOperations === true && (shortcutEvent.meta || shortcutEvent.ctrl) &&
        ["a", "c", "v", "x", "y", "z"].includes(String(shortcutEvent.key))) {
      this.cancelPending();
      return { handled: false, status: "ignored" };
    }
    let paths = this.pending ? this.pending.paths : [[]];
    let candidates = this.matchingCandidatesForEvent(paths, shortcutEvent, context, event.target);
    if (!candidates.length && this.pending) {
      const pending = this.pending;
      this.cancelPending();
      this.executePendingFallback(pending, event.target);
      paths = [[]];
      candidates = this.matchingCandidatesForEvent(paths, shortcutEvent, context, event.target);
    }
    if (!candidates.length) {
      return { handled: false, status: inputOwner === "canvasPassive" ? "unmatched" : "ignored" };
    }

    const exact = candidates.filter((candidate) => candidate.exact &&
      (!shortcutEvent.repeat || candidate.command.repeatable || candidate.binding.repeat));
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
      const fallbackKey = selected ? physicalKeyIdentity(shortcutEvent) : null;
      /** @type {{paths: string[][], fallback: {command: CommandDescriptor, binding: Keybinding} | null, fallbackKey: PhysicalKeyIdentity | null, fallbackReleased: boolean, timer: unknown} | null} */
      let pending = null;
      const timer = this.setTimer(() => {
        const current = this.dispatcher.takePending(pending);
        if (!current) return;
        this.executePendingFallback(current);
      }, 1000);
      pending = {
        paths: pendingPaths,
        fallback: selected,
        fallbackKey,
        fallbackReleased: false,
        timer,
      };
      this.dispatcher.setPending(pending);
      return { handled: true, status: "pending" };
    }
    if (!selected) return { handled: true, status: "conflict" };
    const execution = this.executeKeyboardCandidate(
      selected,
      event.target,
      physicalKeyIdentity(shortcutEvent),
    );
    return execution?.accepted
      ? { commandId: selected.command.id, execution, handled: true, status: "executed" }
      : { execution, handled: true, status: execution?.status === "failed" ? "failed" : "rejected" };
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
        const precedence = compareCandidatePrecedence({
          binding: leftBinding,
          command: left,
          specificity: contextSpecificity(leftContext) + contextSpecificity(leftBinding.when || {}),
        }, {
          binding: rightBinding,
          command: right,
          specificity: contextSpecificity(rightContext) + contextSpecificity(rightBinding.when || {}),
        });
        outcomes.add(precedence > 0 ? "new" : precedence < 0 ? "existing" : "unresolved");
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
        const coincidence = equivalent
          ? "certain"
          : bindingCoincidence(binding, candidate, this.platform);
        if (coincidence !== "none") {
          if (other.id === commandId) {
            if (equivalent) {
              results.push({ bindingIndex, commandId: other.id, contextLabel, title: other.title, type: "duplicate" });
            }
          } else if (overlaps) {
            if (coincidence === "possible") {
              results.push({
                bindingIndex,
                commandId: other.id,
                contextLabel,
                layoutDependent: true,
                title: other.title,
                type: "layout-possible",
              });
            } else {
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
            }
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
          const leftPrefix = bindingPrefixCoincidence(binding, candidate, this.platform);
          const rightPrefix = bindingPrefixCoincidence(candidate, binding, this.platform);
          const possiblePrefix = leftPrefix !== "none" || rightPrefix !== "none";
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
        if (["layout-possible", "layout-unknown"].includes(conflict.type) && !customized) continue;
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

  /** @param {string} operation @param {string | null} reason @param {unknown} error */
  rejectedEdit(operation, reason, error) {
    return Object.freeze({
      applied: false,
      changedCommandIds: [],
      configuration: configurationSnapshot(this.overrides),
      error: errorValue(error, "The shortcut change was rejected."),
      operation,
      persistence: /** @type {const} */ ("not-needed"),
      reason,
      status: /** @type {const} */ ("rejected"),
    });
  }

  /** @param {string} operation */
  unchangedEdit(operation) {
    return Object.freeze({
      applied: false,
      changedCommandIds: [],
      configuration: configurationSnapshot(this.overrides),
      error: this.lastPersistenceError,
      operation,
      persistence: /** @type {const} */ ("not-needed"),
      reason: null,
      status: /** @type {"durable" | "session-only"} */ (
        this.sessionOnlyEdits ? "session-only" : "durable"
      ),
    });
  }

  /** @param {Record<string, Keybinding[]>} overrides */
  validateOverrides(overrides) {
    /** @type {Record<string, Keybinding[]>} */
    const validated = {};
    for (const [commandId, bindings] of Object.entries(overrides)) {
      if (!this.commands.has(commandId)) throw new Error(`Unknown command: ${commandId}`);
      if (!Array.isArray(bindings)) throw new TypeError("Invalid keybinding collection");
      const normalized = bindings.map(normalizeBinding);
      if (normalized.some((binding) => binding === null)) throw new TypeError("Invalid keybinding");
      validated[commandId] = uniqueBindings(
        /** @type {Keybinding[]} */ (normalized),
        this.platform,
      ).slice(0, 1);
    }
    return validated;
  }

  /** @param {string} operation @param {Record<string, Keybinding[]>} next */
  commitEdit(operation, next) {
    let validated;
    try {
      validated = this.validateOverrides(next);
    } catch (error) {
      return this.rejectedEdit(operation, "invalid-configuration", error);
    }
    const previousConfiguration = configurationSnapshot(this.overrides);
    const nextConfiguration = configurationSnapshot(validated);
    const commandIds = new Set([
      ...Object.keys(previousConfiguration.overrides),
      ...Object.keys(nextConfiguration.overrides),
    ]);
    const changedCommandIds = Array.from(commandIds).filter((commandId) =>
      JSON.stringify(previousConfiguration.overrides[commandId]) !==
        JSON.stringify(nextConfiguration.overrides[commandId])).sort();
    if (!changedCommandIds.length) return this.unchangedEdit(operation);

    // Persistence failure deliberately does not roll back a usable in-memory
    // edit. Subscribers see the complete committed configuration and whether
    // it is durable in the same single notification.
    this.overrides = validated;
    const persistence = this.persist(validated);
    this.sessionOnlyEdits = persistence.persistence !== "saved";
    this.lastPersistenceError = persistence.error;
    const result = Object.freeze({
      applied: true,
      changedCommandIds,
      configuration: nextConfiguration,
      error: persistence.error,
      operation,
      persistence: persistence.persistence,
      reason: null,
      status: /** @type {"durable" | "session-only"} */ (
        persistence.persistence === "saved" ? "durable" : "session-only"
      ),
    });
    this.notify(result);
    return result;
  }

  /**
   * Apply one complete preference edit. Conflict removal and assignment share
   * the same draft, validation, persistence attempt, and notification.
   *
   * @param {{type: string, commandId?: string, binding?: Keybinding, bindings?: Keybinding[], index?: number, replaceConflicts?: boolean, takePrecedence?: boolean, text?: string}} edit
   * @returns {ShortcutEditResult}
   */
  editBindings(edit) {
    const operation = typeof edit?.type === "string" ? edit.type : "unknown";
    try {
      const next = configurationSnapshot(this.overrides).overrides;
      if (operation === "import") {
        const imported = readOverrides(JSON.parse(String(edit.text ?? "")), { strict: true });
        /** @type {Record<string, Keybinding[]>} */
        const known = {};
        for (const [commandId, bindings] of Object.entries(imported)) {
          if (this.commands.has(commandId)) known[commandId] = bindings;
        }
        return this.commitEdit(operation, known);
      }
      if (operation === "reset-all") return this.commitEdit(operation, {});

      const commandId = String(edit.commandId || "");
      if (!this.commands.has(commandId)) throw new Error(`Unknown command: ${commandId}`);
      if (operation === "clear") {
        next[commandId] = [];
      } else if (operation === "reset") {
        delete next[commandId];
      } else if (operation === "remove") {
        const bindings = this.getEffectiveBindings(commandId);
        const index = Number(edit.index);
        if (!Number.isInteger(index) || index < 0 || index >= bindings.length) {
          return this.rejectedEdit(operation, "binding-not-found", new Error("Shortcut binding not found."));
        }
        bindings.splice(index, 1);
        next[commandId] = bindings;
      } else if (operation === "assign") {
        const requested = edit.bindings || (edit.binding ? [edit.binding] : []);
        const normalized = requested.map(normalizeBinding);
        if (normalized.some((binding) => binding === null) || normalized.length === 0) {
          throw new TypeError("Invalid keybinding");
        }
        let bindings = /** @type {Keybinding[]} */ (normalized);
        const binding = bindings[0];
        if (binding && edit.takePrecedence) {
          const priorities = this.analyzeBinding(commandId, binding)
            .filter((conflict) => conflict.type === "hard")
            .map((conflict) => this.getEffectiveBindings(String(conflict.commandId))[
              Number(conflict.bindingIndex)
            ]?.priority || 0);
          bindings = [/** @type {Keybinding} */ (normalizeBinding({
            ...binding,
            priority: Math.max(0, ...priorities) + 1,
          }))];
        }
        if (binding && edit.replaceConflicts) {
          /** @type {Map<string, number[]>} */
          const removals = new Map();
          for (const conflict of this.analyzeBinding(commandId, binding)
            .filter((value) => value.type === "hard" && value.commandId !== commandId)) {
            const conflictId = String(conflict.commandId);
            if (!removals.has(conflictId)) removals.set(conflictId, []);
            removals.get(conflictId)?.push(Number(conflict.bindingIndex));
          }
          for (const [conflictId, indexes] of removals) {
            const conflictBindings = this.getEffectiveBindings(conflictId);
            for (const index of indexes.sort((left, right) => right - left)) {
              conflictBindings.splice(index, 1);
            }
            next[conflictId] = conflictBindings;
          }
        }
        next[commandId] = bindings;
      } else {
        throw new TypeError(`Unknown shortcut edit: ${operation}`);
      }
      return this.commitEdit(operation, next);
    } catch (error) {
      return this.rejectedEdit(operation, "invalid-edit", error);
    }
  }

  /** @param {string} commandId @param {Keybinding[]} bindings */
  setBindings(commandId, bindings) {
    return bindings.length
      ? this.editBindings({ bindings, commandId, type: "assign" })
      : this.editBindings({ commandId, type: "clear" });
  }

  /** @param {string} commandId @param {number} _index @param {Keybinding} binding @param {{replaceConflicts?: boolean, takePrecedence?: boolean}} [options] */
  setBinding(commandId, _index, binding, options = {}) {
    return this.editBindings({
      binding,
      commandId,
      replaceConflicts: options.replaceConflicts === true,
      takePrecedence: options.takePrecedence === true,
      type: "assign",
    });
  }

  /** @param {string} commandId @param {number} index */
  removeBinding(commandId, index) {
    return this.editBindings({ commandId, index, type: "remove" });
  }

  /** @param {string} commandId */
  unbindCommand(commandId) { return this.editBindings({ commandId, type: "clear" }); }

  /** @param {string} commandId */
  resetCommand(commandId) {
    return this.editBindings({ commandId, type: "reset" });
  }

  resetAll() {
    return this.editBindings({ type: "reset-all" });
  }

  /** @param {string} commandId @param {Keybinding} binding */
  replaceConflicts(commandId, binding) {
    return this.setBinding(commandId, 0, binding, { replaceConflicts: true });
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
    return this.editBindings({ text, type: "import" });
  }
}
