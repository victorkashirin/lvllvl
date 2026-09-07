/**
 * @typedef {"canvasPassive" | "canvasTyping" | "editableText" | "focusableControl" | "unknown"} ShortcutInputOwner
 */

/**
 * @typedef {object} ShortcutContext
 * @property {boolean} browserEditOperations
 * @property {string} deviceType
 * @property {string} editorMode
 * @property {"canvas" | "codeEditor" | "control" | "debuggerPanel" | "palette" | "textInput" | "timeline" | "unknown"} focus
 * @property {string} graphicType
 * @property {ShortcutInputOwner} inputOwner
 * @property {string} modal
 * @property {boolean} pointerCanvas
 * @property {boolean} popupOpen
 * @property {boolean} recorderActive
 * @property {string} screenMode
 * @property {boolean} selectionActive
 * @property {boolean} shortcutsAllowed
 * @property {boolean} spriteFramesVisible
 * @property {string} textEditorMode
 * @property {string} textTool
 * @property {boolean} textTyping
 */

/** @typedef {string | boolean} ShortcutContextValue */

/**
 * @template {ShortcutContextValue} T
 * @typedef {T | readonly T[] | Readonly<{anyOf: readonly T[]}> | Readonly<{not: T}>} ShortcutContextCondition
 */

/**
 * @typedef {Readonly<{
 *   browserEditOperations?: ShortcutContextCondition<boolean>,
 *   deviceType?: ShortcutContextCondition<string>,
 *   editorMode?: ShortcutContextCondition<string>,
 *   focus?: ShortcutContextCondition<ShortcutContext["focus"]>,
 *   graphicType?: ShortcutContextCondition<string>,
 *   inputOwner?: ShortcutContextCondition<ShortcutInputOwner>,
 *   modal?: ShortcutContextCondition<string>,
 *   pointerCanvas?: ShortcutContextCondition<boolean>,
 *   popupOpen?: ShortcutContextCondition<boolean>,
 *   recorderActive?: ShortcutContextCondition<boolean>,
 *   screenMode?: ShortcutContextCondition<string>,
 *   selectionActive?: ShortcutContextCondition<boolean>,
 *   shortcutsAllowed?: ShortcutContextCondition<boolean>,
 *   spriteFramesVisible?: ShortcutContextCondition<boolean>,
 *   textEditorMode?: ShortcutContextCondition<string>,
 *   textTool?: ShortcutContextCondition<string>,
 *   textTyping?: ShortcutContextCondition<boolean>,
 * }>} ShortcutContextClause
 */

const booleanContextKeys = new Set([
  "browserEditOperations", "pointerCanvas", "popupOpen", "recorderActive",
  "selectionActive", "shortcutsAllowed", "spriteFramesVisible", "textTyping",
]);
const stringContextKeys = new Set([
  "deviceType", "editorMode", "focus", "graphicType", "inputOwner", "modal",
  "screenMode", "textEditorMode", "textTool",
]);
const enumeratedContextValues = Object.freeze({
  focus: Object.freeze([
    "canvas", "codeEditor", "control", "debuggerPanel", "palette", "textInput",
    "timeline", "unknown",
  ]),
  inputOwner: Object.freeze([
    "canvasPassive", "canvasTyping", "editableText", "focusableControl", "unknown",
  ]),
});

/** @param {string} key @param {unknown} value @returns {value is ShortcutContextValue} */
function isSupportedContextValue(key, value) {
  if (booleanContextKeys.has(key)) return typeof value === "boolean";
  if (!stringContextKeys.has(key) || typeof value !== "string" || !value.length) return false;
  const allowed = enumeratedContextValues[/** @type {keyof typeof enumeratedContextValues} */ (key)];
  return !allowed || allowed.includes(value);
}

/**
 * Context clauses cross the domain/application boundary in command activations
 * and imported binding `when` conditions. Own and freeze the supported shape
 * once so unknown keys or open-ended rule objects cannot reach dispatch.
 *
 * @param {unknown} value
 * @returns {Readonly<ShortcutContextClause> | null}
 */
export function normalizeShortcutContextClause(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  /** @type {Record<string, ShortcutContextCondition<ShortcutContextValue>>} */
  const normalized = {};
  for (const [key, condition] of Object.entries(
    /** @type {Record<string, unknown>} */ (value),
  )) {
    if (!booleanContextKeys.has(key) && !stringContextKeys.has(key)) return null;
    if (Array.isArray(condition)) {
      if (!condition.length || !condition.every((entry) => isSupportedContextValue(key, entry))) return null;
      normalized[key] = Object.freeze(Array.from(new Set(
        /** @type {ShortcutContextValue[]} */ (condition),
      )));
      continue;
    }
    if (condition && typeof condition === "object") {
      const rule = /** @type {Record<string, unknown>} */ (condition);
      const ruleKeys = Object.keys(rule);
      if (ruleKeys.length !== 1) return null;
      if (ruleKeys[0] === "anyOf" && Array.isArray(rule.anyOf) && rule.anyOf.length &&
          rule.anyOf.every((entry) => isSupportedContextValue(key, entry))) {
        normalized[key] = Object.freeze({
          anyOf: Object.freeze(Array.from(new Set(
            /** @type {ShortcutContextValue[]} */ (rule.anyOf),
          ))),
        });
        continue;
      }
      if (ruleKeys[0] === "not" && isSupportedContextValue(key, rule.not)) {
        normalized[key] = Object.freeze({ not: rule.not });
        continue;
      }
      return null;
    }
    if (!isSupportedContextValue(key, condition)) return null;
    normalized[key] = condition;
  }
  return /** @type {ShortcutContextClause} */ (Object.freeze(normalized));
}

/**
 * A failed legacy-state read must disable context-sensitive dispatch instead
 * of returning a partly populated snapshot that looks like canvas ownership.
 *
 * @returns {ShortcutContext}
 */
export function createSafeShortcutContext() {
  return {
    browserEditOperations: true,
    deviceType: "unknown",
    editorMode: "unknown",
    focus: "unknown",
    graphicType: "unknown",
    inputOwner: "unknown",
    modal: "unknown",
    pointerCanvas: false,
    popupOpen: true,
    recorderActive: false,
    screenMode: "unknown",
    selectionActive: false,
    shortcutsAllowed: false,
    spriteFramesVisible: false,
    textEditorMode: "unknown",
    textTool: "unknown",
    textTyping: false,
  };
}

/**
 * Keep older injected contexts usable while all production DOM/legacy state
 * is translated by the shared adapter.
 *
 * @param {Record<string, unknown>} context
 * @returns {ShortcutInputOwner}
 */
export function inputOwnerFromShortcutContext(context) {
  if (["canvasPassive", "canvasTyping", "editableText", "focusableControl", "unknown"]
    .includes(String(context.inputOwner))) {
    return /** @type {ShortcutInputOwner} */ (context.inputOwner);
  }
  if (context.textTyping === true) return "canvasTyping";
  if (context.focus === "codeEditor" || context.focus === "textInput") return "editableText";
  if (context.focus === "control") return "focusableControl";
  if (["canvas", "debuggerPanel", "palette", "timeline"].includes(String(context.focus))) {
    return "canvasPassive";
  }
  return "unknown";
}
