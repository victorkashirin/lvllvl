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
