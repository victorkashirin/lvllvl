import {
  isSingleLetterKey,
  matchesKeyboardEvent,
  normalizeKeyName,
  parseKeyboardEvent,
  PUNCTUATION_CODE_MAP,
} from "@tanstack/hotkeys";

/** @type {Readonly<Record<string, string>>} */
const keyAliases = Object.freeze({
  " ": "Space",
  Del: "Delete",
  Esc: "Escape",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Up: "ArrowUp",
  Down: "ArrowDown",
  OS: "Meta",
  Spacebar: "Space",
});

const modifierKeys = new Set([
  "Alt", "AltGraph", "CapsLock", "Control", "Fn", "FnLock", "Hyper", "Meta",
  "NumLock", "ScrollLock", "Shift", "Super", "Symbol", "SymbolLock",
]);

/** @type {Readonly<Record<string, string>>} */
const displayKeys = Object.freeze({
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  Backspace: "Backspace",
  Delete: "Delete",
  Enter: "Enter",
  Escape: "Escape",
  PageDown: "Page Down",
  PageUp: "Page Up",
  Space: "Space",
  Tab: "Tab",
});

/** @param {unknown} value @returns {string | null} */
export function normalizeKey(value) {
  if (typeof value !== "string" || value === "" || value === "Unidentified") return null;
  const normalized = normalizeKeyName(keyAliases[value] || value);
  if (normalized === "" || normalized === "Unidentified") return null;
  // TanStack uses uppercase printable keys. Keep lvllvl's persisted format
  // lowercase so existing user overrides remain stable across this migration.
  if (normalized.length === 1) return normalized.toLowerCase();
  return normalized;
}

/** @param {unknown} value @returns {string | null} */
function normalizeCode(value) {
  return typeof value === "string" && value !== "Unidentified" &&
    /^[A-Za-z][A-Za-z0-9]*$/.test(value)
    ? value
    : null;
}

/**
 * @typedef {object} KeyChord
 * @property {boolean} alt
 * @property {string | null} code
 * @property {boolean} ctrl
 * @property {string | null} key
 * @property {boolean} meta
 * @property {boolean} mod
 * @property {boolean} shift
 * @property {string | null} [layoutCode]
 * @property {string | null} [layoutKey]
 */

/**
 * @typedef {object} Keybinding
 * @property {KeyChord[]} sequence
 * @property {number} [priority]
 * @property {boolean} [repeat]
 * @property {Record<string, unknown>} [when]
 */

/** @param {unknown} value @returns {KeyChord | null} */
export function normalizeChord(value) {
  if (!value || typeof value !== "object") return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const key = normalizeKey(raw.key);
  const code = normalizeCode(raw.code);
  const layoutCode = key ? normalizeCode(raw.layoutCode) : null;
  const layoutKey = code ? normalizeKey(raw.layoutKey) : null;
  const modifierCode = code && (modifierKeys.has(code) ||
    /^(?:Alt|Control|Meta|Shift)(?:Left|Right)$/.test(code));
  const layoutModifierCode = layoutCode && (modifierKeys.has(layoutCode) ||
    /^(?:Alt|Control|Meta|Shift)(?:Left|Right)$/.test(layoutCode));
  if ((!key && !code) || (key && code) || (key && modifierKeys.has(key)) ||
      modifierCode || layoutModifierCode) return null;
  return Object.freeze({
    alt: raw.alt === true,
    code,
    ctrl: raw.ctrl === true,
    key,
    ...(layoutCode ? { layoutCode } : {}),
    ...(layoutKey && !modifierKeys.has(layoutKey) ? { layoutKey } : {}),
    meta: raw.meta === true,
    mod: raw.mod === true,
    shift: raw.shift === true,
  });
}

/** @param {unknown} value @returns {Keybinding | null} */
export function normalizeBinding(value) {
  if (!value || typeof value !== "object") return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  if (!Array.isArray(raw.sequence) || raw.sequence.length === 0 || raw.sequence.length > 4) {
    return null;
  }
  const sequence = raw.sequence.map(normalizeChord);
  if (sequence.some((chord) => chord === null)) return null;
  /** @type {Keybinding} */
  const binding = {
    sequence: /** @type {KeyChord[]} */ (sequence),
    priority: Number.isSafeInteger(raw.priority) ? Number(raw.priority) : 0,
    repeat: raw.repeat === true,
  };
  if (raw.when && typeof raw.when === "object" && !Array.isArray(raw.when)) {
    binding.when = { .../** @type {Record<string, unknown>} */ (raw.when) };
  }
  return Object.freeze(binding);
}

/** @param {Record<string, unknown>} shortcut @returns {Keybinding | null} */
export function bindingFromLegacyShortcut(shortcut) {
  if (!shortcut || typeof shortcut !== "object") return null;
  const chord = normalizeChord({
    alt: shortcut.alt === true,
    ctrl: shortcut.ctrl === true,
    key: shortcut.key,
    meta: shortcut.meta === true,
    mod: shortcut.cmd === true,
    shift: shortcut.shift === true,
  });
  return chord ? normalizeBinding({ sequence: [chord] }) : null;
}

/** @param {KeyChord} chord @param {"mac" | "other"} platform @returns {KeyChord} */
export function resolvePrimaryModifier(chord, platform) {
  return {
    ...chord,
    ctrl: chord.ctrl || (chord.mod && platform !== "mac"),
    meta: chord.meta || (chord.mod && platform === "mac"),
    mod: false,
  };
}

/** @param {KeyChord} chord @param {"mac" | "other"} platform @returns {string} */
export function chordSignature(chord, platform) {
  const resolved = resolvePrimaryModifier(chord, platform);
  const identity = resolved.code ? `code:${resolved.code}` : `key:${resolved.key}`;
  return [resolved.ctrl ? "c" : "-", resolved.alt ? "a" : "-",
    resolved.shift ? "s" : "-", resolved.meta ? "m" : "-", identity].join(":");
}

/** @param {Keybinding} binding @param {"mac" | "other"} platform @returns {string[]} */
export function bindingSignature(binding, platform) {
  return binding.sequence.map((chord) => chordSignature(chord, platform));
}

/** @param {Keybinding} left @param {Keybinding} right @param {"mac" | "other"} platform */
export function bindingsEqual(left, right, platform) {
  const leftSignature = bindingSignature(left, platform);
  const rightSignature = bindingSignature(right, platform);
  return leftSignature.length === rightSignature.length &&
    leftSignature.every((part, index) => part === rightSignature[index]);
}

/** @param {Keybinding} prefix @param {Keybinding} value @param {"mac" | "other"} platform */
export function bindingIsPrefix(prefix, value, platform) {
  const left = bindingSignature(prefix, platform);
  const right = bindingSignature(value, platform);
  return left.length < right.length && left.every((part, index) => part === right[index]);
}

/** @param {string | null | undefined} code @returns {string | null} */
function fallbackKeyForCode(code) {
  if (!code) return null;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return normalizeKey(PUNCTUATION_CODE_MAP[code]) || null;
}

/**
 * TanStack reaches its physical-code fallback only for dead keys or printable
 * mismatches that are not ordinary layout-produced letters. Dead keys cannot
 * be recorded, so conflict analysis needs the latter rule here.
 *
 * @param {KeyChord} recorded
 */
function recordedEventAllowsCodeFallback(recorded) {
  const eventKey = normalizeKeyName(String(recorded.key || recorded.layoutKey || ""));
  if (eventKey.length !== 1) return false;
  return !isSingleLetterKey(eventKey) || (recorded.alt && !/^[A-Za-z]$/.test(eventKey));
}

/** @param {KeyChord} recorded @param {KeyChord} semantic */
function recordedSemanticEventMatches(recorded, semantic) {
  return Boolean(recorded.layoutCode && semantic.key &&
    recordedEventAllowsCodeFallback(recorded) &&
    fallbackKeyForCode(recorded.layoutCode) === semantic.key);
}

/** @param {KeyChord} physical @param {KeyChord} semantic */
function physicalCanCoincideWithSemantic(physical, semantic) {
  if (!physical.code || !semantic.key) return false;
  if (physical.layoutKey === semantic.key || semantic.layoutCode === physical.code) return true;
  if (!physical.layoutKey) return fallbackKeyForCode(physical.code) === semantic.key;
  return recordedEventAllowsCodeFallback(physical) &&
    fallbackKeyForCode(physical.code) === semantic.key;
}

/** @param {KeyChord} left @param {KeyChord} right @param {"mac" | "other"} platform */
function chordsCanCoincide(left, right, platform) {
  const leftResolved = resolvePrimaryModifier(left, platform);
  const rightResolved = resolvePrimaryModifier(right, platform);
  if (leftResolved.alt !== rightResolved.alt || leftResolved.ctrl !== rightResolved.ctrl ||
      leftResolved.meta !== rightResolved.meta || leftResolved.shift !== rightResolved.shift) return false;
  if (leftResolved.code && rightResolved.code) return leftResolved.code === rightResolved.code;
  if (leftResolved.key && rightResolved.key) {
    return leftResolved.key === rightResolved.key ||
      recordedSemanticEventMatches(leftResolved, rightResolved) ||
      recordedSemanticEventMatches(rightResolved, leftResolved);
  }
  if (leftResolved.code && rightResolved.key) {
    return physicalCanCoincideWithSemantic(leftResolved, rightResolved);
  }
  if (leftResolved.key && rightResolved.code) {
    return physicalCanCoincideWithSemantic(rightResolved, leftResolved);
  }
  return false;
}

/**
 * Recorded bindings retain the complementary semantic or physical identity
 * seen in the same event. That lets conflict analysis reproduce TanStack's
 * layout fallback without treating those identities as interchangeable.
 *
 * @param {Keybinding} left
 * @param {Keybinding} right
 * @param {"mac" | "other"} platform
 */
export function bindingsCanCoincide(left, right, platform) {
  return left.sequence.length === right.sequence.length && left.sequence.every((chord, index) =>
    chordsCanCoincide(chord, right.sequence[index], platform));
}

/** @param {Keybinding} prefix @param {Keybinding} value @param {"mac" | "other"} platform */
export function bindingCanBePrefix(prefix, value, platform) {
  return prefix.sequence.length < value.sequence.length && prefix.sequence.every((chord, index) =>
    chordsCanCoincide(chord, value.sequence[index], platform));
}

/**
 * Printable semantic bindings and physical bindings need the complementary
 * identity captured from KeyboardEvent to make layout-dependent conflict
 * analysis conclusive. Older persisted bindings may not contain it.
 *
 * @param {Keybinding} binding
 */
export function bindingHasUnknownLayout(binding) {
  return binding.sequence.some((chord) =>
    (Boolean(chord.key) && chord.key?.length === 1 && !chord.layoutCode) ||
    (Boolean(chord.code) && !chord.layoutKey));
}

/** @param {unknown} eventValue @returns {boolean} */
function hasAltGraph(eventValue) {
  const event = /** @type {{getModifierState?: (name: string) => boolean}} */ (eventValue);
  return typeof event.getModifierState === "function" && event.getModifierState("AltGraph");
}

/**
 * @param {unknown} eventValue
 * @param {{platform: "mac" | "other", physical?: boolean, portable?: boolean}} options
 * @returns {KeyChord | null}
 */
export function chordFromKeyboardEvent(eventValue, options) {
  if (!eventValue || typeof eventValue !== "object") return null;
  const event = /** @type {{altKey?: boolean, code?: string, ctrlKey?: boolean, isComposing?: boolean, key?: string, metaKey?: boolean, shiftKey?: boolean}} */ (eventValue);
  if (event.isComposing || event.key === "Dead" || hasAltGraph(eventValue)) return null;
  const parsed = parseKeyboardEvent(/** @type {KeyboardEvent} */ (eventValue));
  const key = normalizeKey(parsed.key);
  if (modifierKeys.has(String(key))) return null;
  const code = options.physical ? normalizeCode(event.code) : null;
  if (options.physical ? !code : !key) return null;
  const primaryIsMeta = options.platform === "mac";
  const portable = options.portable === true;
  const primaryDown = primaryIsMeta ? event.metaKey === true : event.ctrlKey === true;
  return normalizeChord({
    alt: parsed.alt,
    code,
    ctrl: parsed.ctrl && !(portable && !primaryIsMeta && primaryDown),
    key: options.physical ? null : key,
    layoutCode: options.physical ? null : event.code,
    layoutKey: options.physical ? key : null,
    meta: parsed.meta && !(portable && primaryIsMeta && primaryDown),
    mod: portable && primaryDown,
    shift: parsed.shift,
  });
}

/**
 * Match a runtime KeyboardEvent with TanStack's semantic and layout fallback
 * rules. Physical-code bindings remain an lvllvl extension because TanStack's
 * public binding model intentionally identifies shortcuts by semantic key.
 *
 * @param {KeyChord} chord
 * @param {unknown} eventValue
 * @param {"mac" | "other"} platform
 */
export function eventMatchesChord(chord, eventValue, platform) {
  if (!eventValue || typeof eventValue !== "object") return false;
  const event = /** @type {{altKey?: boolean, code?: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean}} */ (eventValue);
  const resolved = resolvePrimaryModifier(chord, platform);
  if (resolved.code) {
    return event.altKey === resolved.alt && event.ctrlKey === resolved.ctrl &&
      event.metaKey === resolved.meta && event.shiftKey === resolved.shift &&
      event.code === resolved.code;
  }
  if (!resolved.key) return false;
  /** @type {import("@tanstack/hotkeys").CanonicalModifier[]} */
  const modifiers = [];
  if (resolved.ctrl) modifiers.push("Control");
  if (resolved.alt) modifiers.push("Alt");
  if (resolved.shift) modifiers.push("Shift");
  if (resolved.meta) modifiers.push("Meta");
  return matchesKeyboardEvent(
    /** @type {KeyboardEvent} */ (eventValue),
    {
      alt: resolved.alt,
      ctrl: resolved.ctrl,
      key: normalizeKeyName(resolved.key),
      meta: resolved.meta,
      modifiers,
      shift: resolved.shift,
    },
    platform === "mac" ? "mac" : "windows",
  );
}

/** @param {string | null} value @returns {string} */
function displayKey(value) {
  if (!value) return "";
  if (displayKeys[value]) return displayKeys[value];
  if (value.length === 1) return value.toLocaleUpperCase();
  return value.replace(/^Key/, "").replace(/^Digit/, "");
}

/** @param {string | null} value */
function ariaKey(value) {
  if (!value) return "";
  if (/^Key[A-Z]$/.test(value)) return value.slice(3);
  if (/^Digit[0-9]$/.test(value)) return value.slice(5);
  return value.length === 1 ? value.toLocaleUpperCase() : value;
}

/**
 * @param {KeyChord} chord
 * @param {"mac" | "other"} platform
 * @param {{symbols?: boolean}} [options]
 */
export function formatChord(chord, platform, options = {}) {
  const symbols = options.symbols === true && platform === "mac";
  const resolved = resolvePrimaryModifier(chord, platform);
  const parts = [];
  if (resolved.ctrl) parts.push(symbols ? "⌃" : "Ctrl");
  if (resolved.alt) parts.push(symbols ? "⌥" : (platform === "mac" ? "Option" : "Alt"));
  if (resolved.shift) parts.push(symbols ? "⇧" : "Shift");
  if (resolved.meta) parts.push(symbols ? "⌘" : "Cmd");
  parts.push(resolved.code ? `[${displayKey(resolved.code)}]` : displayKey(resolved.key));
  return symbols ? parts.join("") : parts.join("+");
}

/** @param {Keybinding} binding @param {"mac" | "other"} platform */
export function formatBinding(binding, platform) {
  return binding.sequence.map((chord) => formatChord(chord, platform)).join(", ");
}

/**
 * Format a binding using the KeyboardEvent key names expected by
 * aria-keyshortcuts. Physical bindings use their code-derived label because
 * there is no scan-code syntax in ARIA.
 *
 * @param {Keybinding} binding
 * @param {"mac" | "other"} platform
 */
export function formatAriaBinding(binding, platform) {
  if (binding.sequence.length !== 1) return "";
  const resolved = resolvePrimaryModifier(binding.sequence[0], platform);
  const parts = [];
  if (resolved.ctrl) parts.push("Control");
  if (resolved.alt) parts.push("Alt");
  if (resolved.shift) parts.push("Shift");
  if (resolved.meta) parts.push("Meta");
  parts.push(ariaKey(resolved.code || resolved.key));
  return parts.join("+");
}

/**
 * @param {{altKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean}} event
 * @param {"mac" | "other"} platform
 */
export function formatActiveModifiers(event, platform) {
  const parts = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push(platform === "mac" ? "Option" : "Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Cmd");
  return parts.join("+");
}

/** @param {unknown} condition @param {unknown} actual */
function conditionMatches(condition, actual) {
  if (Array.isArray(condition)) return condition.includes(actual);
  if (condition && typeof condition === "object") {
    const rule = /** @type {{anyOf?: unknown[], not?: unknown}} */ (condition);
    if (Array.isArray(rule.anyOf)) return rule.anyOf.includes(actual);
    if (Object.prototype.hasOwnProperty.call(rule, "not")) return actual !== rule.not;
  }
  return actual === condition;
}

/** @param {Record<string, unknown>} when @param {Record<string, unknown>} context */
export function contextMatches(when, context) {
  return Object.keys(when).every((key) => conditionMatches(when[key], context[key]));
}

/** @param {unknown} value @returns {string} */
function stableValueSignature(value) {
  if (Array.isArray(value)) return `[${value.map(stableValueSignature).join(",")}]`;
  if (value && typeof value === "object") {
    const record = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableValueSignature(record[key])}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  return serialized === undefined ? `${typeof value}:${String(value)}` : `${typeof value}:${serialized}`;
}

/**
 * Stable identity for a context clause. Array conditions are sets, so their
 * order does not turn an otherwise equivalent user rule into a new rule.
 *
 * @param {Record<string, unknown>} context
 */
export function contextSignature(context) {
  return Object.keys(context).sort().map((key) => {
    const condition = context[key];
    /** @type {string} */
    let signature;
    if (Array.isArray(condition)) {
      signature = `any:${Array.from(new Set(condition.map(stableValueSignature))).sort().join(",")}`;
    } else if (condition && typeof condition === "object") {
      const rule = /** @type {{anyOf?: unknown[], not?: unknown}} */ (condition);
      if (Array.isArray(rule.anyOf)) {
        signature = `any:${Array.from(new Set(rule.anyOf.map(stableValueSignature))).sort().join(",")}`;
      } else if (Object.prototype.hasOwnProperty.call(rule, "not")) {
        signature = `not:${stableValueSignature(rule.not)}`;
      } else {
        signature = `value:${stableValueSignature(condition)}`;
      }
    } else {
      signature = `equal:${stableValueSignature(condition)}`;
    }
    return `${JSON.stringify(key)}=${signature}`;
  }).join("|");
}

/** @param {unknown} condition @returns {{include: unknown[] | null, exclude: unknown[]}} */
function conditionDomain(condition) {
  if (Array.isArray(condition)) return { include: condition, exclude: [] };
  if (condition && typeof condition === "object") {
    const rule = /** @type {{anyOf?: unknown[], not?: unknown}} */ (condition);
    if (Array.isArray(rule.anyOf)) return { include: rule.anyOf, exclude: [] };
    if (Object.prototype.hasOwnProperty.call(rule, "not")) return { include: null, exclude: [rule.not] };
  }
  return { include: [condition], exclude: [] };
}

/** @param {unknown} left @param {unknown} right */
function conditionsOverlap(left, right) {
  const leftDomain = conditionDomain(left);
  const rightDomain = conditionDomain(right);
  if (leftDomain.include && rightDomain.include) {
    const rightIncluded = rightDomain.include;
    return leftDomain.include.some((value) => rightIncluded.includes(value));
  }
  if (leftDomain.include) {
    return leftDomain.include.some((value) => !rightDomain.exclude.includes(value));
  }
  if (rightDomain.include) {
    return rightDomain.include.some((value) => !leftDomain.exclude.includes(value));
  }
  return true;
}

/** @param {Record<string, unknown>} left @param {Record<string, unknown>} right */
export function contextsOverlap(left, right) {
  const sharedKeys = Object.keys(left).filter((key) => Object.prototype.hasOwnProperty.call(right, key));
  return sharedKeys.every((key) => conditionsOverlap(left[key], right[key]));
}

/**
 * Determine whether several context clauses can all be true at once. This is
 * used when command context and a user binding's narrower `when` context both
 * participate in conflict analysis.
 *
 * @param {...Record<string, unknown>} contexts
 */
export function contextClausesOverlap(...contexts) {
  const keys = new Set(contexts.flatMap((context) => Object.keys(context)));
  for (const key of keys) {
    const domains = contexts
      .filter((context) => Object.prototype.hasOwnProperty.call(context, key))
      .map((context) => conditionDomain(context[key]));
    /** @type {unknown[] | null} */
    let included = null;
    const excluded = domains.flatMap((domain) => domain.exclude);
    for (const domain of domains) {
      if (!domain.include) continue;
      included = included === null
        ? domain.include.slice()
        : included.filter((value) => domain.include?.includes(value));
    }
    if (included !== null && !included.some((value) => !excluded.includes(value))) return false;
  }
  return true;
}

/** @param {Record<string, unknown>} context @returns {number} */
export function contextSpecificity(context) {
  let score = Object.keys(context).length * 1000;
  for (const condition of Object.values(context)) {
    if (Array.isArray(condition)) {
      score += Math.max(2, 100 - condition.length);
      continue;
    }
    if (condition && typeof condition === "object") {
      const rule = /** @type {{anyOf?: unknown[], not?: unknown}} */ (condition);
      if (Array.isArray(rule.anyOf)) {
        score += Math.max(2, 100 - rule.anyOf.length);
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(rule, "not")) {
        score += 1;
        continue;
      }
    }
    score += 100;
  }
  return score;
}

/** @param {unknown} condition @returns {string} */
function describeCondition(condition) {
  if (Array.isArray(condition)) return condition.join(" or ");
  if (condition && typeof condition === "object") {
    const rule = /** @type {{anyOf?: unknown[], not?: unknown}} */ (condition);
    if (Array.isArray(rule.anyOf)) return rule.anyOf.join(" or ");
    if (Object.prototype.hasOwnProperty.call(rule, "not")) return `not ${String(rule.not)}`;
  }
  if (condition === true) return "yes";
  if (condition === false) return "no";
  return String(condition);
}

/** @param {Record<string, unknown>} context */
export function describeContext(context) {
  /** @type {Readonly<Record<string, string>>} */
  const names = Object.freeze({
    browserEditOperations: "browser editing",
    editorMode: "mode",
    focus: "focus",
    graphicType: "document",
    modal: "dialog",
    popupOpen: "popup",
    screenMode: "screen mode",
    selectionActive: "selection",
    shortcutsAllowed: "shortcuts",
    spriteFramesVisible: "sprite timeline",
    textEditorMode: "text editor",
    textTool: "tool",
    textTyping: "typing",
  });
  const omitted = new Set(["modal", "popupOpen", "shortcutsAllowed"]);
  const parts = Object.keys(context)
    .filter((key) => !omitted.has(key))
    .map((key) => `${names[key] || key}: ${describeCondition(context[key])}`);
  return parts.length ? parts.join("; ") : "Global";
}

/** @param {Keybinding} binding @param {"mac" | "other"} platform */
export function isRiskyBinding(binding, platform) {
  if (binding.sequence.length !== 1) return false;
  const chord = resolvePrimaryModifier(binding.sequence[0], platform);
  const key = chord.key || chord.layoutKey;
  if (chord.meta && platform === "mac" && ["h", "m", "q", "w"].includes(String(key))) return true;
  if (chord.ctrl && platform !== "mac" && ["l", "n", "r", "t", "w"].includes(String(key))) return true;
  return chord.alt && ["ArrowLeft", "ArrowRight", "F4"].includes(String(key));
}
