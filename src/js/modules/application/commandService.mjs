import {
  bindingCoincidence,
  bindingFromLegacyShortcut,
  bindingHasUnknownLayout,
  bindingPrefixCoincidence,
  bindingSignature,
  bindingsCanCoincide as domainBindingsCanCoincide,
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
import {
  inputOwnerFromShortcutContext,
  normalizeShortcutContextClause,
} from "../domain/shortcutContext.mjs";

const persistenceVersion = 2;
const inputOwnedKeys = new Set([
  "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "Backspace", "Delete",
  "End", "Enter", "Escape", "Home", "Insert", "PageDown", "PageUp", "Space", "Tab",
]);
const keyboardActivationContextKeys = new Set([
  "browserEditOperations", "focus", "inputOwner", "modal", "pointerCanvas",
  "popupOpen", "recorderActive", "shortcutsAllowed", "textTyping",
]);
const alwaysEnabled = () => true;

/** @typedef {import("../domain/keybindings.mjs").Keybinding} Keybinding */
/** @typedef {import("../domain/shortcutContext.mjs").ShortcutContextClause} ShortcutContextClause */

/**
 * @typedef {object} CommandDescriptor
 * @property {string} id
 * @property {string} title
 * @property {string} category
 * @property {(details?: {source?: string}) => unknown} execute
 * @property {((details?: {source?: string}) => unknown) | null} release
 * @property {readonly ShortcutContextClause[]} contexts
 * @property {Array<{when: ShortcutContextClause, isEnabled: () => boolean}>} activations
 * @property {Array<{when: ShortcutContextClause, isEnabled: () => boolean}>} actionActivations
 * @property {readonly Keybinding[]} defaultBindings
 * @property {"global" | "local"} keyboardPolicy
 * @property {number} priority
 * @property {boolean} repeatable
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
 * @property {readonly Keybinding[]} bindings
 * @property {string} category
 * @property {readonly BindingConflict[]} conflicts
 * @property {readonly ShortcutContextClause[]} contexts
 * @property {string} contextLabel
 * @property {string} id
 * @property {boolean} modified
 * @property {string} source
 * @property {string} title
 */

/**
 * @typedef {object} EffectiveCommandBindings
 * @property {readonly Keybinding[]} bindings
 * @property {readonly (readonly string[])[]} signatures
 */

/**
 * @typedef {object} EffectiveBindingCache
 * @property {number} catalogRevision
 * @property {number} overrideRevision
 * @property {"mac" | "other"} platform
 * @property {Map<string, Readonly<EffectiveCommandBindings>>} byCommand
 */

/**
 * @typedef {object} CommandSummaryCache
 * @property {EffectiveBindingCache} bindingCache
 * @property {Map<string, readonly BindingConflict[]>} conflictsByCommand
 * @property {readonly CommandSummary[]} summaries
 */

/**
 * @typedef {object} CommandDerivedData
 * @property {number} catalogRevision
 * @property {number} overrideRevision
 * @property {EffectiveBindingCache | null} bindings
 * @property {CommandSummaryCache | null} summaries
 */

/**
 * @typedef {object} ShortcutImportIssue
 * @property {string | null} commandId
 * @property {"invalid-binding" | "invalid-command-id" | "invalid-collection"} reason
 */

/**
 * @typedef {object} ShortcutImportDiagnostics
 * @property {readonly ShortcutImportIssue[]} skipped
 * @property {readonly string[]} truncatedCommandIds
 * @property {readonly string[]} unknownCommandIds
 */

/**
 * @typedef {object} KeybindingStorage
 * @property {string} [key]
 * @property {() => string | null} load
 * @property {() => string | null} [loadFresh]
 * @property {(value: string) => boolean | void} save
 * @property {(value: string, reason: string) => void} [quarantine]
 */

/**
 * @typedef {object} ShortcutConfiguration
 * @property {number} version
 * @property {Readonly<Record<string, readonly Keybinding[]>>} overrides
 */

/**
 * @typedef {object} ShortcutEditResult
 * @property {boolean} applied
 * @property {readonly string[]} changedCommandIds
 * @property {Readonly<ShortcutConfiguration>} configuration
 * @property {Error | null} error
 * @property {string} operation
 * @property {"failed" | "not-needed" | "saved" | "unavailable"} persistence
 * @property {"durable" | "rejected" | "session-only"} status
 * @property {string | null} reason
 * @property {ShortcutImportDiagnostics | null} diagnostics
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

/** @typedef {Map<string, Keybinding | null>} ShortcutOverrides */

/** @param {ShortcutOverrides} overrides @returns {Readonly<ShortcutConfiguration>} */
function configurationSnapshot(overrides) {
  /** @type {Record<string, readonly Keybinding[]>} */
  const snapshot = {};
  for (const [commandId, binding] of overrides) {
    snapshot[commandId] = Object.freeze(binding ? [binding] : []);
  }
  return Object.freeze({
    overrides: Object.freeze(snapshot),
    version: persistenceVersion,
  });
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

/**
 * Version 2 stores override values as arrays, while the application model owns
 * one custom binding (or an explicit clear) per command. This remains the
 * migration boundary for future persistence versions.
 *
 * @param {unknown} value
 * @returns {{diagnostics: ShortcutImportDiagnostics, overrides: ShortcutOverrides}}
 */
function readShortcutConfiguration(value) {
  if (!value || typeof value !== "object") throw new TypeError("Shortcut preferences must be an object");
  const documentValue = /** @type {{version?: unknown, overrides?: unknown}} */ (value);
  if (documentValue.version !== persistenceVersion || !documentValue.overrides ||
      typeof documentValue.overrides !== "object" || Array.isArray(documentValue.overrides)) {
    throw new TypeError("Shortcut preferences have an unsupported format");
  }
  /** @type {ShortcutOverrides} */
  const overrides = new Map();
  /** @type {ShortcutImportIssue[]} */
  const skipped = [];
  /** @type {string[]} */
  const truncatedCommandIds = [];
  for (const [commandId, rawBindings] of Object.entries(
    /** @type {Record<string, unknown>} */ (documentValue.overrides),
  )) {
    if (!/^[a-z][a-zA-Z0-9.-]+$/.test(commandId)) {
      skipped.push({ commandId, reason: "invalid-command-id" });
      continue;
    }
    if (!Array.isArray(rawBindings)) {
      skipped.push({ commandId, reason: "invalid-collection" });
      continue;
    }
    if (!rawBindings.length) {
      overrides.set(commandId, null);
      continue;
    }
    if (rawBindings.length > 1) truncatedCommandIds.push(commandId);
    const binding = normalizeBinding(rawBindings[0]);
    if (!binding) {
      skipped.push({ commandId, reason: "invalid-binding" });
      continue;
    }
    overrides.set(commandId, binding);
  }
  return {
    diagnostics: Object.freeze({
      skipped: Object.freeze(skipped.map((issue) => Object.freeze(issue))),
      truncatedCommandIds: Object.freeze(truncatedCommandIds),
      unknownCommandIds: Object.freeze([]),
    }),
    overrides,
  };
}

/** @param {readonly ShortcutContextClause[]} contexts */
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
 * @param {ShortcutContextClause} context
 */
function actionContextFromKeyboardContext(context) {
  return /** @type {ShortcutContextClause} */ (Object.freeze(Object.fromEntries(
    Object.entries(context).filter(([key]) => !keyboardActivationContextKeys.has(key)),
  )));
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

/** @type {WeakMap<object, Map<string, CommandDescriptor>>} */
const commandStores = new WeakMap();
/** @type {WeakMap<object, ShortcutOverrides>} */
const overrideStores = new WeakMap();
/** @type {WeakMap<object, Set<(result: ShortcutEditResult) => void>>} */
const listenerStores = new WeakMap();
/** @type {WeakMap<object, CommandDispatcherState>} */
const dispatcherStores = new WeakMap();
/** @type {WeakMap<object, KeybindingStorage>} */
const storageStores = new WeakMap();
/** @type {WeakMap<object, Set<string>>} */
const pendingPersistenceStores = new WeakMap();
/** @type {WeakMap<object, CommandDerivedData>} */
const derivedDataStores = new WeakMap();

/** @type {readonly Keybinding[]} */
const emptyBindings = Object.freeze([]);
/** @type {readonly (readonly string[])[]} */
const emptyBindingSignatures = Object.freeze([]);
/** @type {readonly BindingConflict[]} */
const emptyConflicts = Object.freeze([]);
/** @type {Readonly<EffectiveCommandBindings>} */
const emptyEffectiveBindings = Object.freeze({
  bindings: emptyBindings,
  signatures: emptyBindingSignatures,
});

/** @param {object} service */
function commandsFor(service) {
  const commands = commandStores.get(service);
  if (!commands) throw new Error("Command storage is not initialized");
  return commands;
}

/** @param {object} service */
function overridesFor(service) {
  const overrides = overrideStores.get(service);
  if (!overrides) throw new Error("Shortcut override storage is not initialized");
  return overrides;
}

/** @param {object} service */
function listenersFor(service) {
  const listeners = listenerStores.get(service);
  if (!listeners) throw new Error("Shortcut listener storage is not initialized");
  return listeners;
}

/** @param {object} service */
function dispatcherFor(service) {
  const dispatcher = dispatcherStores.get(service);
  if (!dispatcher) throw new Error("Command dispatcher storage is not initialized");
  return dispatcher;
}

/** @param {object} service */
function storageFor(service) {
  const storage = storageStores.get(service);
  if (!storage) throw new Error("Shortcut persistence is not initialized");
  return storage;
}

/** @param {object} service */
function pendingPersistenceFor(service) {
  const pending = pendingPersistenceStores.get(service);
  if (!pending) throw new Error("Shortcut pending-persistence storage is not initialized");
  return pending;
}

/** @param {object} service */
function derivedDataFor(service) {
  const derived = derivedDataStores.get(service);
  if (!derived) throw new Error("Command derived-data storage is not initialized");
  return derived;
}

/** @param {object} service */
function invalidateCatalogData(service) {
  const derived = derivedDataFor(service);
  derived.catalogRevision++;
  derived.bindings = null;
  derived.summaries = null;
}

/** @param {object} service */
function invalidateOverrideData(service) {
  const derived = derivedDataFor(service);
  derived.overrideRevision++;
  derived.bindings = null;
  derived.summaries = null;
}

/**
 * Effective bindings are normalized and frozen when they cross the catalog or
 * preference boundary. Cache their arrays and platform-resolved signatures so
 * dispatch and presentation do not rebuild them for every event or search.
 * Captured layout metadata lives inside each binding, so catalog/override
 * revisions also cover the layout inputs used by conflict analysis.
 *
 * @param {CommandService} service
 * @returns {EffectiveBindingCache}
 */
function effectiveBindingCacheFor(service) {
  const derived = derivedDataFor(service);
  const cached = derived.bindings;
  if (cached && cached.catalogRevision === derived.catalogRevision &&
      cached.overrideRevision === derived.overrideRevision &&
      cached.platform === service.platform) return cached;

  /** @type {Map<string, Readonly<EffectiveCommandBindings>>} */
  const byCommand = new Map();
  const overrides = overridesFor(service);
  for (const command of commandsFor(service).values()) {
    let bindings = command.defaultBindings;
    if (overrides.has(command.id)) {
      const override = overrides.get(command.id) || null;
      bindings = override ? Object.freeze([override]) : emptyBindings;
    }
    const signatures = Object.freeze(bindings.map((binding) =>
      Object.freeze(bindingSignature(binding, service.platform))));
    byCommand.set(command.id, Object.freeze({ bindings, signatures }));
  }
  const next = {
    byCommand,
    catalogRevision: derived.catalogRevision,
    overrideRevision: derived.overrideRevision,
    platform: service.platform,
  };
  derived.bindings = next;
  derived.summaries = null;
  return next;
}

/** @param {CommandService} service @param {string} commandId */
function effectiveCommandBindingsFor(service, commandId) {
  return effectiveBindingCacheFor(service).byCommand.get(commandId) || emptyEffectiveBindings;
}

/** @param {readonly string[]} left @param {readonly string[]} right */
function bindingSignaturesEqual(left, right) {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

/** @param {readonly string[]} prefix @param {readonly string[]} value */
function bindingSignatureIsPrefix(prefix, value) {
  return prefix.length < value.length && prefix.every((part, index) => part === value[index]);
}

/** @param {CommandService} service */
function loadShortcutOverrides(service) {
  let raw = null;
  try {
    raw = storageFor(service).load();
    if (!raw) return;
    const recovered = readShortcutConfiguration(JSON.parse(raw));
    overrideStores.set(service, recovered.overrides);
    if (recovered.diagnostics.skipped.length || recovered.diagnostics.truncatedCommandIds.length) {
      service.reportError("recover keyboard shortcuts", new Error(
        `Recovered shortcut preferences with ${recovered.diagnostics.skipped.length} invalid ` +
        `entr${recovered.diagnostics.skipped.length === 1 ? "y" : "ies"} skipped and ` +
        `${recovered.diagnostics.truncatedCommandIds.length} truncated.`,
      ));
    }
  } catch (error) {
    overrideStores.set(service, new Map());
    if (raw) {
      try {
        storageFor(service).quarantine?.(raw, error instanceof Error ? error.message : String(error));
      } catch (quarantineError) {
        service.reportError("quarantine keyboard shortcuts", quarantineError);
      }
    }
    service.reportError("load keyboard shortcuts", error);
  }
}

/**
 * Merge an edit into the latest durable snapshot before writing it. Storage
 * events are asynchronous, so another tab may have committed unrelated
 * commands that are not present in this service's in-memory snapshot yet.
 *
 * @param {CommandService} service
 * @param {ShortcutOverrides} overrides
 * @param {readonly string[]} changedCommandIds
 * @param {boolean} replaceConfiguration
 */
function persistShortcutOverrides(
  service,
  overrides,
  changedCommandIds,
  replaceConfiguration,
) {
  /** @type {ShortcutOverrides} */
  let durableCandidate = new Map(overrides);
  if (!replaceConfiguration) {
    try {
      const storage = storageFor(service);
      const raw = storage.loadFresh ? storage.loadFresh() : storage.load();
      const latest = raw
        ? readShortcutConfiguration(JSON.parse(raw)).overrides
        : new Map();
      durableCandidate = new Map(latest);
      for (const commandId of changedCommandIds) {
        if (overrides.has(commandId)) {
          durableCandidate.set(commandId, overrides.get(commandId) ?? null);
        } else {
          durableCandidate.delete(commandId);
        }
      }
    } catch (error) {
      service.reportError("read latest keyboard shortcuts", error);
      return {
        error: errorValue(error, "Could not read the latest keyboard shortcuts."),
        overrides: new Map(overrides),
        persistence: /** @type {const} */ ("failed"),
      };
    }
  }
  try {
    const saved = storageFor(service).save(JSON.stringify(configurationSnapshot(durableCandidate)));
    if (saved === false) {
      return {
        error: new Error("Keyboard shortcut storage is unavailable."),
        overrides: new Map(overrides),
        persistence: /** @type {const} */ ("unavailable"),
      };
    }
    return {
      error: null,
      overrides: durableCandidate,
      persistence: /** @type {const} */ ("saved"),
    };
  } catch (error) {
    service.reportError("save keyboard shortcuts", error);
    return {
      error: errorValue(error, "Could not save keyboard shortcuts."),
      overrides: new Map(overrides),
      persistence: /** @type {const} */ ("failed"),
    };
  }
}

/** @param {CommandService} service @param {ShortcutEditResult} result */
function notifyShortcutChange(service, result) {
  service.cleanup({ source: "binding-change" });
  for (const listener of listenersFor(service)) {
    try {
      listener(result);
    } catch (error) {
      service.reportError("notify keyboard shortcut change", error);
    }
  }
}

/**
 * @param {CommandService} service
 * @param {string} operation
 * @param {string | null} reason
 * @param {unknown} error
 * @param {ShortcutImportDiagnostics | null} [diagnostics]
 * @returns {ShortcutEditResult}
 */
function rejectedEdit(service, operation, reason, error, diagnostics = null) {
  return Object.freeze({
    applied: false,
    changedCommandIds: Object.freeze([]),
    configuration: configurationSnapshot(overridesFor(service)),
    diagnostics,
    error: errorValue(error, "The shortcut change was rejected."),
    operation,
    persistence: "not-needed",
    reason,
    status: "rejected",
  });
}

/**
 * @param {CommandService} service
 * @param {string} operation
 * @param {ShortcutImportDiagnostics | null} [diagnostics]
 * @returns {ShortcutEditResult}
 */
function unchangedEdit(service, operation, diagnostics = null) {
  return Object.freeze({
    applied: false,
    changedCommandIds: Object.freeze([]),
    configuration: configurationSnapshot(overridesFor(service)),
    diagnostics,
    error: service.lastPersistenceError,
    operation,
    persistence: "not-needed",
    reason: null,
    status: service.sessionOnlyEdits ? "session-only" : "durable",
  });
}

/**
 * @param {Readonly<ShortcutConfiguration>} previous
 * @param {Readonly<ShortcutConfiguration>} next
 */
function changedConfigurationCommandIds(previous, next) {
  const commandIds = new Set([
    ...Object.keys(previous.overrides),
    ...Object.keys(next.overrides),
  ]);
  return Array.from(commandIds).filter((commandId) =>
    JSON.stringify(previous.overrides[commandId]) !==
      JSON.stringify(next.overrides[commandId])).sort();
}

/**
 * @param {CommandService} service
 * @param {string} operation
 * @param {ShortcutOverrides} next
 * @param {ShortcutImportDiagnostics | null} [diagnostics]
 * @returns {ShortcutEditResult}
 */
function commitEdit(service, operation, next, diagnostics = null) {
  const previousConfiguration = configurationSnapshot(overridesFor(service));
  const requestedConfiguration = configurationSnapshot(next);
  const requestedChangedCommandIds = changedConfigurationCommandIds(
    previousConfiguration,
    requestedConfiguration,
  );
  if (!requestedChangedCommandIds.length) return unchangedEdit(service, operation, diagnostics);
  const persistenceCommandIds = Array.from(new Set([
    ...pendingPersistenceFor(service),
    ...requestedChangedCommandIds,
  ])).sort();

  // Persistence failure deliberately does not roll back a usable in-memory
  // edit. Subscribers see the complete committed configuration and whether
  // it is durable in the same single notification.
  const persistence = persistShortcutOverrides(
    service,
    next,
    persistenceCommandIds,
    operation === "import" || operation === "reset-all",
  );
  const committedOverrides = persistence.overrides;
  const nextConfiguration = configurationSnapshot(committedOverrides);
  const changedCommandIds = changedConfigurationCommandIds(
    previousConfiguration,
    nextConfiguration,
  );
  overrideStores.set(service, new Map(committedOverrides));
  invalidateOverrideData(service);
  service.sessionOnlyEdits = persistence.persistence !== "saved";
  service.lastPersistenceError = persistence.error;
  if (persistence.persistence === "saved") {
    pendingPersistenceFor(service).clear();
  } else {
    for (const commandId of requestedChangedCommandIds) {
      pendingPersistenceFor(service).add(commandId);
    }
  }
  const result = Object.freeze({
    applied: true,
    changedCommandIds: Object.freeze(changedCommandIds),
    configuration: nextConfiguration,
    diagnostics,
    error: persistence.error,
    operation,
    persistence: persistence.persistence,
    reason: null,
    status: /** @type {"durable" | "session-only"} */ (
      persistence.persistence === "saved" ? "durable" : "session-only"
    ),
  });
  notifyShortcutChange(service, result);
  return result;
}

/**
 * Adopt a complete configuration already made durable by another browser
 * context. This must not write it back and start a storage-event echo.
 *
 * @param {CommandService} service
 * @param {ShortcutOverrides} next
 * @param {ShortcutImportDiagnostics | null} diagnostics
 */
function commitSynchronizedConfiguration(service, next, diagnostics) {
  const previousConfiguration = configurationSnapshot(overridesFor(service));
  const nextConfiguration = configurationSnapshot(next);
  const changedCommandIds = changedConfigurationCommandIds(
    previousConfiguration,
    nextConfiguration,
  );
  service.sessionOnlyEdits = false;
  service.lastPersistenceError = null;
  pendingPersistenceFor(service).clear();
  if (!changedCommandIds.length) {
    return Object.freeze({
      applied: false,
      changedCommandIds: Object.freeze([]),
      configuration: previousConfiguration,
      diagnostics,
      error: null,
      operation: "synchronize",
      persistence: "not-needed",
      reason: null,
      status: /** @type {const} */ ("durable"),
    });
  }
  overrideStores.set(service, new Map(next));
  invalidateOverrideData(service);
  const result = Object.freeze({
    applied: true,
    changedCommandIds: Object.freeze(changedCommandIds),
    configuration: nextConfiguration,
    diagnostics,
    error: null,
    operation: "synchronize",
    persistence: "not-needed",
    reason: null,
    status: /** @type {const} */ ("durable"),
  });
  notifyShortcutChange(service, result);
  return result;
}

/**
 * @param {CommandService} service
 * @param {string} commandId
 * @returns {readonly BindingConflict[]}
 */
function buildCommandConflictSummary(service, commandId) {
  /** @type {BindingConflict[]} */
  const results = [];
  /** @type {Set<string>} */
  const seen = new Set();
  const customized = service.isModified(commandId);
  for (const binding of service.getEffectiveBindings(commandId)) {
    for (const conflict of service.analyzeBinding(commandId, binding)) {
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
  return Object.freeze(results.map((conflict) => Object.freeze(conflict)));
}

/**
 * Build conflict and presentation data once for a catalog/override/platform
 * revision.
 *
 * @param {CommandService} service
 * @returns {CommandSummaryCache}
 */
function commandSummaryCacheFor(service) {
  const derived = derivedDataFor(service);
  const bindingCache = effectiveBindingCacheFor(service);
  if (derived.summaries?.bindingCache === bindingCache) return derived.summaries;

  /** @type {Map<string, readonly BindingConflict[]>} */
  const conflictsByCommand = new Map();
  for (const commandId of commandsFor(service).keys()) {
    conflictsByCommand.set(commandId, buildCommandConflictSummary(service, commandId));
  }
  const summaries = Object.freeze(Array.from(commandsFor(service).values())
    .map((command) => {
      const bindings = effectiveCommandBindingsFor(service, command.id).bindings;
      const bindingContexts = bindings
        .filter((binding) => binding.when && Object.keys(binding.when).length)
        .map((binding) => `binding: ${describeContext(binding.when || {})}`);
      const modified = service.isModified(command.id);
      return /** @type {CommandSummary} */ (Object.freeze({
        bindings,
        category: command.category,
        conflicts: conflictsByCommand.get(command.id) || emptyConflicts,
        contexts: Object.freeze([...command.contexts]),
        contextLabel: command.contexts.map(describeContext).concat(bindingContexts).join("; "),
        id: command.id,
        modified,
        source: modified ? "User" : "Default",
        title: command.title,
      }));
    })
    .sort((left, right) => left.category.localeCompare(right.category) ||
      left.title.localeCompare(right.title)));
  const next = {
    bindingCache,
    conflictsByCommand,
    summaries,
  };
  derived.summaries = next;
  return next;
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
    this.getContext = getContext;
    this.setTimer = setTimer;
    this.reportError = reportError;
    commandStores.set(this, new Map());
    overrideStores.set(this, new Map());
    listenerStores.set(this, new Set());
    storageStores.set(this, storage);
    pendingPersistenceStores.set(this, new Set());
    derivedDataStores.set(this, {
      bindings: null,
      catalogRevision: 0,
      overrideRevision: 0,
      summaries: null,
    });
    /** @type {WeakSet<Function>} */
    this.reportedEnabledPredicateFailures = new WeakSet();
    this.sessionOnlyEdits = false;
    /** @type {Error | null} */
    this.lastPersistenceError = null;
    dispatcherStores.set(this, new CommandDispatcherState(clearTimer));
    loadShortcutOverrides(this);
  }

  /** @param {(result: ShortcutEditResult) => void} listener */
  onDidChange(listener) {
    listenersFor(this).add(listener);
    return () => listenersFor(this).delete(listener);
  }

  /**
   * Define immutable command metadata and behavior. Contextual activations are
   * attached separately so a second UI alias cannot replace a handler or
   * quietly change a persisted command's defaults.
   *
   * @param {{id: string, title: string, category?: string, execute: (details?: {source?: string}) => unknown, release?: (details?: {source?: string}) => unknown, defaultBindings?: unknown[], keyboardPolicy?: "global" | "local", allowDuringCanvasTyping?: boolean, priority?: number, repeatable?: boolean}} definition
   */
  defineCommand(definition) {
    const registration = definition;
    if (!registration || !/^[a-z][a-zA-Z0-9.-]+$/.test(registration.id) ||
        typeof registration.title !== "string" || typeof registration.execute !== "function") {
      throw new TypeError("Commands require a stable id, title, and handler");
    }
    if (commandsFor(this).has(registration.id)) {
      throw new Error(`Command ${registration.id} is already defined`);
    }
    const normalizedBindings = (registration.defaultBindings || []).map(normalizeBinding);
    if (normalizedBindings.some((binding) => binding === null)) {
      throw new TypeError(`Command ${registration.id} has an invalid default shortcut`);
    }
    commandsFor(this).set(registration.id, {
      actionActivations: [],
      activations: [],
      allowDuringCanvasTyping: registration.allowDuringCanvasTyping === true,
      category: registration.category || "Application",
      contexts: Object.freeze([]),
      defaultBindings: Object.freeze(uniqueBindings(
        /** @type {Keybinding[]} */ (normalizedBindings),
        this.platform,
      )),
      execute: registration.execute,
      id: registration.id,
      keyboardPolicy: registration.keyboardPolicy === "global" ? "global" : "local",
      priority: Number.isFinite(registration.priority) ? Number(registration.priority) : 0,
      release: typeof registration.release === "function" ? registration.release : null,
      repeatable: registration.repeatable === true || normalizedBindings.some((binding) => binding?.repeat),
      title: registration.title,
    });
    invalidateCatalogData(this);
    return registration.id;
  }

  /**
   * Add one contextual activation for a previously defined command. UI aliases
   * may contribute availability without owning command metadata or behavior.
   *
   * @param {string} commandId
   * @param {{isEnabled?: () => boolean, contexts?: ShortcutContextClause[], actionContexts?: ShortcutContextClause[]}} [activation]
   */
  addCommandActivation(commandId, activation = {}) {
    const command = commandsFor(this).get(commandId);
    if (!command) throw new Error(`Cannot activate unknown command ${commandId}`);
    if (activation.contexts !== undefined && !Array.isArray(activation.contexts)) {
      throw new TypeError(`Command ${commandId} keyboard contexts must be an array`);
    }
    if (activation.actionContexts !== undefined && !Array.isArray(activation.actionContexts)) {
      throw new TypeError(`Command ${commandId} action contexts must be an array`);
    }
    const rawContexts = activation.contexts?.length ? activation.contexts : [{}];
    const contexts = Array.from(rawContexts, normalizeShortcutContextClause);
    if (contexts.some((context) => context === null)) {
      throw new TypeError(`Command ${commandId} has an unsupported keyboard context`);
    }
    const keyboardContexts = /** @type {ShortcutContextClause[]} */ (contexts);
    const rawActionContexts = activation.actionContexts?.length
      ? activation.actionContexts
      : keyboardContexts.map(actionContextFromKeyboardContext);
    const normalizedActionContexts = Array.from(rawActionContexts, normalizeShortcutContextClause);
    if (normalizedActionContexts.some((context) => context === null)) {
      throw new TypeError(`Command ${commandId} has an unsupported action context`);
    }
    const actionContexts = /** @type {ShortcutContextClause[]} */ (normalizedActionContexts);
    if (activation.isEnabled !== undefined && typeof activation.isEnabled !== "function") {
      throw new TypeError(`Command ${commandId} has an invalid enabled predicate`);
    }
    const predicate = activation.isEnabled || alwaysEnabled;
    let changed = false;
    /**
     * @param {Array<{when: ShortcutContextClause, isEnabled: () => boolean}>} collection
     * @param {ShortcutContextClause[]} values
     */
    const addUnique = (collection, values) => {
      for (const when of values) {
        const signature = contextSignature(when);
        if (collection.some((candidate) =>
          candidate.isEnabled === predicate && contextSignature(candidate.when) === signature)) continue;
        collection.push({ isEnabled: predicate, when });
        changed = true;
      }
    };
    addUnique(command.activations, keyboardContexts);
    addUnique(command.actionActivations, actionContexts);
    const contextsWithActivation = uniqueContexts(command.contexts.concat(keyboardContexts));
    if (contextsWithActivation.length !== command.contexts.length) {
      command.contexts = Object.freeze(contextsWithActivation);
      changed = true;
    }
    if (changed) invalidateCatalogData(this);
    return commandId;
  }

  /**
   * Convenience registration for commands with one activation. Duplicate
   * definitions are rejected; use addCommandActivation for aliases.
   *
   * @param {{id: string, title: string, category?: string, execute: (details?: {source?: string}) => unknown, release?: (details?: {source?: string}) => unknown, isEnabled?: () => boolean, contexts?: ShortcutContextClause[], actionContexts?: ShortcutContextClause[], defaultBindings?: unknown[], keyboardPolicy?: "global" | "local", allowDuringCanvasTyping?: boolean, priority?: number, repeatable?: boolean}} registration
   */
  registerCommand(registration) {
    this.defineCommand(registration);
    try {
      this.addCommandActivation(registration.id, registration);
    } catch (error) {
      commandsFor(this).delete(registration.id);
      invalidateCatalogData(this);
      throw error;
    }
    return registration.id;
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

  /** @param {Keybinding} left @param {Keybinding} right */
  bindingsCanCoincide(left, right) {
    return domainBindingsCanCoincide(left, right, this.platform);
  }

  /** @param {string} commandId */
  formatBindings(commandId) {
    return this.getEffectiveBindings(commandId).map((binding) => this.formatBinding(binding)).join(" / ");
  }

  /** @param {string} commandId @returns {readonly Keybinding[]} */
  getEffectiveBindings(commandId) {
    return effectiveCommandBindingsFor(this, commandId).bindings;
  }

  /** @param {string} commandId */
  hasCommand(commandId) { return commandsFor(this).has(commandId); }

  /** @param {string} commandId */
  isModified(commandId) {
    return overridesFor(this).has(commandId);
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
    const command = commandsFor(this).get(commandId);
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
    if (next && !dispatcherFor(this).recording) this.cleanup({ source: "recording" });
    dispatcherFor(this).setRecording(next);
  }

  isRecording() { return dispatcherFor(this).recording; }

  hasPendingSequence() { return dispatcherFor(this).pending !== null; }

  getActiveCommandCount() { return dispatcherFor(this).heldCommands.size; }

  cancelPending() { return dispatcherFor(this).cancelPending(); }

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
    const stillBound = this.getEffectiveBindings(candidate.command.id).includes(candidate.binding);
    const lifecycleRevision = dispatcherFor(this).lifecycleRevision;
    const execution = stillBound
      ? this.execute(candidate.command.id, { source: "keyboard" }, context)
      : null;
    if (execution?.accepted && candidate.command.release) {
      const cleanupDetails = dispatcherFor(this).cleanupAfter(lifecycleRevision);
      if (cleanupDetails) this.releaseCommand(candidate.command, cleanupDetails);
      else dispatcherFor(this).hold(candidate.command, activationKey);
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
      const held = dispatcherFor(this).takeHeld(pending.fallback.command.id, pending.fallbackKey);
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
    const active = dispatcherFor(this).takeAllHeld();
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
    dispatcherFor(this).markCleanup(details);
    dispatcherFor(this).cancelPending();
    return this.releaseActiveCommands(details);
  }

  /** @param {{source?: string}} [details] */
  dispose(details = { source: "teardown" }) {
    dispatcherFor(this).setRecording(false);
    return this.cleanup(details);
  }

  /** @param {unknown} eventValue */
  handleKeyUp(eventValue) {
    if (!eventValue || typeof eventValue !== "object") return { handled: false, status: "ignored" };
    const event = /** @type {{preventDefault?: () => void, stopImmediatePropagation?: () => void, stopPropagation?: () => void}} */ (eventValue);
    const shortcutEvent = shortcutKeyboardEvent(eventValue);
    const releasedKey = shortcutEvent ? physicalKeyIdentity(shortcutEvent) : null;
    const matches = dispatcherFor(this).takeHeldForKey(releasedKey);
    if (!matches.length) {
      const pending = dispatcherFor(this).pending;
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
   * @param {{command: CommandDescriptor, binding: Keybinding, specificity: number}[]} candidates
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
    /** @type {{command: CommandDescriptor, binding: Keybinding, exact: boolean, path: string[], specificity: number}[]} */
    const candidates = [];
    for (const command of commandsFor(this).values()) {
      const activeContext = this.activeContext(command, context);
      if (!activeContext) continue;
      const effective = effectiveCommandBindingsFor(this, command.id);
      for (let bindingIndex = 0; bindingIndex < effective.bindings.length; bindingIndex++) {
        const binding = effective.bindings[bindingIndex];
        if (binding.when && !contextMatches(binding.when, context)) continue;
        const signature = effective.signatures[bindingIndex];
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
            exact: nextPath.length === signature.length,
            path: nextPath,
            specificity: contextSpecificity(activeContext, binding.when || {}),
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
    if (this.isRecording()) {
      this.consumeEvent(event);
      return { handled: true, status: "recording" };
    }
    if (shortcutEvent.composing || (shortcutEvent.altGraph && this.platform !== "mac")) {
      this.cancelPending();
      return { handled: false, status: "ignored" };
    }
    if (dispatcherFor(this).pending && shortcutEvent.key === "Escape" &&
        !shortcutEvent.alt && !shortcutEvent.ctrl && !shortcutEvent.meta && !shortcutEvent.shift) {
      this.consumeEvent(event);
      this.cancelPending();
      return { handled: true, status: "cancelled" };
    }
    if (dispatcherFor(this).pending && shortcutEvent.repeat) {
      this.consumeEvent(event);
      return { handled: true, status: "pending" };
    }
    if (dispatcherFor(this).pending && shortcutEvent.modifierOnly) {
      return { handled: false, status: "pending" };
    }
    const context = this.getContext(event.target);
    const inputOwner = resolvedInputOwner(context, event.target);
    if (context.browserEditOperations === true && (shortcutEvent.meta || shortcutEvent.ctrl) &&
        ["a", "c", "v", "x", "y", "z"].includes(String(shortcutEvent.key))) {
      this.cancelPending();
      return { handled: false, status: "ignored" };
    }
    const pendingBeforeMatch = dispatcherFor(this).pending;
    let paths = pendingBeforeMatch ? pendingBeforeMatch.paths : [[]];
    let candidates = this.matchingCandidatesForEvent(paths, shortcutEvent, context, event.target);
    const pendingAfterMatch = dispatcherFor(this).pending;
    if (!candidates.length && pendingAfterMatch) {
      const pending = pendingAfterMatch;
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
        const current = dispatcherFor(this).takePending(pending);
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
      dispatcherFor(this).setPending(pending);
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
          specificity: contextSpecificity(leftContext, leftBinding.when || {}),
        }, {
          binding: rightBinding,
          command: right,
          specificity: contextSpecificity(rightContext, rightBinding.when || {}),
        });
        outcomes.add(precedence > 0 ? "new" : precedence < 0 ? "existing" : "unresolved");
      }
    }
    return outcomes.size === 1
      ? /** @type {"new" | "existing" | "unresolved"} */ (Array.from(outcomes)[0])
      : "unresolved";
  }

  /** @param {string} commandId @param {Keybinding} binding @returns {readonly BindingConflict[]} */
  analyzeBinding(commandId, binding) {
    const command = commandsFor(this).get(commandId);
    if (!command) return [];
    const proposedSignature = Object.freeze(bindingSignature(binding, this.platform));
    /** @type {BindingConflict[]} */
    const results = [];
    for (const other of commandsFor(this).values()) {
      const effective = effectiveCommandBindingsFor(this, other.id);
      effective.bindings.forEach((candidate, bindingIndex) => {
        const candidateSignature = effective.signatures[bindingIndex];
        const bindingContext = candidate.when && Object.keys(candidate.when).length
          ? [`binding: ${describeContext(candidate.when)}`]
          : [];
        const contextLabel = other.contexts.map(describeContext).concat(bindingContext).join("; ");
        const overlaps = this.bindingContextsOverlap(command, binding, other, candidate);
        const equivalent = bindingSignaturesEqual(proposedSignature, candidateSignature);
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
          const exactPrefix = bindingSignatureIsPrefix(proposedSignature, candidateSignature) ||
            bindingSignatureIsPrefix(candidateSignature, proposedSignature);
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
    return Object.freeze(results.map((conflict) => Object.freeze(conflict)));
  }

  /** @param {string} commandId @returns {readonly BindingConflict[]} */
  getCommandConflicts(commandId) {
    if (!commandsFor(this).has(commandId)) return emptyConflicts;
    return commandSummaryCacheFor(this).conflictsByCommand.get(commandId) || emptyConflicts;
  }

  /** @returns {readonly CommandSummary[]} */
  getCommands() {
    return commandSummaryCacheFor(this).summaries;
  }

  /**
   * Assign the command's one custom shortcut. Built-in aliases remain an
   * internal default set and are replaced together. Conflict replacement and
   * assignment share one draft, persistence attempt, and notification.
   *
   * @param {string} commandId
   * @param {Keybinding} binding
   * @param {{conflicts?: "keep" | "replace" | "take-precedence"}} [options]
   * @returns {ShortcutEditResult}
   */
  assignBinding(commandId, binding, options = {}) {
    const conflictResolution = options.conflicts || "keep";
    const operation = conflictResolution === "replace" ? "assign-replacing-conflicts" : "assign";
    try {
      if (!commandsFor(this).has(commandId)) throw new Error(`Unknown command: ${commandId}`);
      if (!["keep", "replace", "take-precedence"].includes(conflictResolution)) {
        throw new TypeError(`Unknown conflict resolution: ${conflictResolution}`);
      }
      let normalized = normalizeBinding(binding);
      if (!normalized) throw new TypeError("Invalid keybinding");
      const next = new Map(overridesFor(this));
      if (conflictResolution === "take-precedence") {
        const priorities = this.analyzeBinding(commandId, normalized)
          .filter((conflict) => conflict.type === "hard")
          .map((conflict) => this.getEffectiveBindings(String(conflict.commandId))[
            Number(conflict.bindingIndex)
          ]?.priority || 0);
        normalized = /** @type {Keybinding} */ (normalizeBinding({
          ...normalized,
          priority: Math.max(0, ...priorities) + 1,
        }));
      }
      if (conflictResolution === "replace") {
        const removals = new Set(this.analyzeBinding(commandId, normalized)
          .filter((value) => value.type === "hard" && value.commandId !== commandId)
          .map((value) => String(value.commandId)));
        for (const conflictId of removals) next.set(conflictId, null);
      }
      next.set(commandId, normalized);
      return commitEdit(this, operation, next);
    } catch (error) {
      return rejectedEdit(this, operation, "invalid-edit", error);
    }
  }

  /** @param {string} commandId */
  clearBinding(commandId) {
    if (!commandsFor(this).has(commandId)) {
      return rejectedEdit(this, "clear", "invalid-edit", new Error(`Unknown command: ${commandId}`));
    }
    const next = new Map(overridesFor(this));
    next.set(commandId, null);
    return commitEdit(this, "clear", next);
  }

  /** @param {string} commandId */
  resetBinding(commandId) {
    if (!commandsFor(this).has(commandId)) {
      return rejectedEdit(this, "reset", "invalid-edit", new Error(`Unknown command: ${commandId}`));
    }
    const next = new Map(overridesFor(this));
    next.delete(commandId);
    return commitEdit(this, "reset", next);
  }

  resetAllBindings() {
    return commitEdit(this, "reset-all", new Map());
  }

  exportConfiguration() {
    return JSON.stringify(configurationSnapshot(overridesFor(this)), null, 2);
  }

  /**
   * Apply a preference snapshot written by another browser context. Invalid
   * external data follows startup recovery: quarantine it, fail closed to
   * defaults, and report the failure.
   *
   * @param {string | null} raw
   * @returns {ShortcutEditResult}
   */
  synchronizeConfiguration(raw) {
    /** @type {ShortcutOverrides} */
    let synchronizedOverrides;
    /** @type {ShortcutImportDiagnostics | null} */
    let diagnostics = null;
    if (raw === null) {
      synchronizedOverrides = new Map();
    } else {
      try {
        const synchronized = readShortcutConfiguration(JSON.parse(raw));
        synchronizedOverrides = synchronized.overrides;
        diagnostics = Object.freeze({
          ...synchronized.diagnostics,
          unknownCommandIds: Object.freeze(Array.from(synchronizedOverrides.keys())
            .filter((commandId) => !commandsFor(this).has(commandId)).sort()),
        });
        if (diagnostics.skipped.length || diagnostics.truncatedCommandIds.length) {
          this.reportError("recover synchronized keyboard shortcuts", new Error(
            `Recovered synchronized shortcut preferences with ${diagnostics.skipped.length} invalid ` +
            `entr${diagnostics.skipped.length === 1 ? "y" : "ies"} skipped and ` +
            `${diagnostics.truncatedCommandIds.length} truncated.`,
          ));
        }
      } catch (error) {
        synchronizedOverrides = new Map();
        try {
          storageFor(this).quarantine?.(
            raw,
            error instanceof Error ? error.message : String(error),
          );
        } catch (quarantineError) {
          this.reportError("quarantine synchronized keyboard shortcuts", quarantineError);
        }
        this.reportError("synchronize keyboard shortcuts", error);
      }
    }
    return commitSynchronizedConfiguration(this, synchronizedOverrides, diagnostics);
  }

  /** @param {string} text */
  importConfiguration(text) {
    try {
      const imported = readShortcutConfiguration(JSON.parse(String(text)));
      const diagnostics = Object.freeze({
        ...imported.diagnostics,
        unknownCommandIds: Object.freeze(Array.from(imported.overrides.keys())
          .filter((commandId) => !commandsFor(this).has(commandId)).sort()),
      });
      if (!imported.overrides.size && diagnostics.skipped.length) {
        return rejectedEdit(
          this,
          "import",
          "invalid-import",
          new TypeError("The shortcut import contains no valid entries."),
          diagnostics,
        );
      }
      return commitEdit(this, "import", imported.overrides, diagnostics);
    } catch (error) {
      return rejectedEdit(this, "import", "invalid-import", error);
    }
  }
}
