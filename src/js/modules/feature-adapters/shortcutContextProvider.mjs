import { createSafeShortcutContext, isShortcutContext } from "../domain/shortcutContext.mjs";

/** @typedef {import("../domain/shortcutContext.mjs").ShortcutContext} ShortcutContext */
/** @typedef {import("../domain/shortcutContext.mjs").ShortcutInputOwner} ShortcutInputOwner */

const nonTextInputTypes = new Set([
  "button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit",
]);

/** @param {unknown} value @returns {value is {closest?: (selector: string) => unknown, isContentEditable?: boolean, matches?: (selector: string) => boolean, tagName?: string, type?: string}} */
function isElementLike(value) {
  return value !== null && typeof value === "object";
}

/** @param {unknown} value @param {string} selector */
function matches(value, selector) {
  return isElementLike(value) && typeof value.matches === "function" && value.matches(selector);
}

/** @param {unknown} value @param {string} selector */
function closest(value, selector) {
  return isElementLike(value) && typeof value.closest === "function" && value.closest(selector) != null;
}

/** @param {unknown} element */
function isEditableText(element) {
  if (!isElementLike(element)) return false;
  if (element.isContentEditable || closest(element, "[contenteditable='true']")) return true;
  const tagName = String(element.tagName || "").toLowerCase();
  if (tagName === "textarea") return true;
  if (tagName !== "input") return false;
  return !nonTextInputTypes.has(String(element.type || "text").toLowerCase());
}

/** @param {unknown} element */
function isFocusableControl(element) {
  return matches(element, "button, input, select, option, a[href], [role='button'], [role='checkbox'], [role='menuitem'], [role='radio'], [role='slider'], [role='switch'], [role='tab'], [tabindex]") ||
    closest(element, "button, input, select, a[href], [role='button'], [role='checkbox'], [role='menuitem'], [role='radio'], [role='slider'], [role='switch'], [role='tab'], [tabindex]");
}

/**
 * @param {unknown} element
 * @param {boolean} textTyping
 * @param {Document} document
 * @returns {{focus: ShortcutContext["focus"], inputOwner: ShortcutInputOwner}}
 */
function classifyInput(element, textTyping, document) {
  const codeEditor = closest(element, ".ace_editor, .CodeMirror");
  const editableText = codeEditor || isEditableText(element);
  const focusableControl = !editableText && isFocusableControl(element);
  let focus = /** @type {ShortcutContext["focus"]} */ ("unknown");
  if (codeEditor) focus = "codeEditor";
  else if (editableText) focus = "textInput";
  else if (closest(element, "[id*='Palette'], [class*='palette']")) focus = "palette";
  else if (closest(element, "[id*='Frames'], [class*='timeline']")) focus = "timeline";
  else if (closest(element, "[id*='Debugger'], [class*='debugger']")) focus = "debuggerPanel";
  else if (focusableControl) focus = "control";
  else if (textTyping || matches(element, "canvas") || element == null ||
      element === document.body || element === document.documentElement) focus = "canvas";

  if (editableText) return { focus, inputOwner: "editableText" };
  if (focusableControl) return { focus, inputOwner: "focusableControl" };
  if (textTyping) return { focus: "canvas", inputOwner: "canvasTyping" };
  if (focus !== "unknown") return { focus, inputOwner: "canvasPassive" };
  return { focus, inputOwner: "unknown" };
}

/** @param {unknown} dialog */
function modalIdentity(dialog) {
  if (!dialog || typeof dialog !== "object") return "none";
  const candidate = /** @type {{id?: unknown, uiID?: unknown}} */ (dialog).uiID ||
    /** @type {{id?: unknown}} */ (dialog).id;
  return typeof candidate === "string" && candidate !== "" ? candidate : "anonymous-dialog";
}

/**
 * Translate and validate DOM/editor state at one input boundary. The optional
 * target lets keyboard dispatch classify the element that owns this event;
 * callers without an event receive the current active element.
 *
 * @param {{app: any, document: Document, isRecording: () => boolean, UI: any, now?: () => number, reportError?: (operation: string, error: unknown) => void, reportInterval?: number}} dependencies
 */
export function createShortcutContextProvider({
  app,
  document,
  isRecording,
  UI,
  now = () => Date.now(),
  reportError = () => {},
  reportInterval = 5000,
}) {
  /** @type {number | null} */
  let lastReportAt = null;

  /** @param {unknown} error */
  function reportFailure(error) {
    let currentTime = 0;
    try { currentTime = now(); } catch {}
    if (lastReportAt !== null && currentTime >= lastReportAt &&
        currentTime - lastReportAt < reportInterval) return;
    lastReportAt = currentTime;
    try { reportError("resolve keyboard shortcut context", error); } catch {}
  }

  /** @param {unknown} [eventTarget] @returns {ShortcutContext} */
  return function shortcutContext(eventTarget) {
    try {
      const activeDialog = UI.dialogStack.length
        ? UI.dialogStack[UI.dialogStack.length - 1]
        : null;
      const drawTools = app.textModeEditor?.tools?.drawTools;
      const textEditorMode = app.textModeEditor?.getEditorMode?.() || "none";
      const textTyping = activeDialog === null && drawTools?.isTyping?.() === true;
      const input = classifyInput(eventTarget || document.activeElement, textTyping, document);
      const context = {
        browserEditOperations: UI.browserEditOperations === true,
        deviceType: app.deviceType || "desktop",
        editorMode: app.mode || "none",
        focus: input.focus,
        graphicType: app.textModeEditor?.graphic?.getType?.() || "none",
        inputOwner: input.inputOwner,
        modal: modalIdentity(activeDialog),
        popupOpen: UI.popup !== null,
        pointerCanvas: app.textModeEditor?.gridView2d?.mouseInCanvas === true,
        recorderActive: isRecording(),
        screenMode: app.textModeEditor?.getScreenMode?.() || "none",
        selectionActive: textEditorMode === "pixel"
          ? drawTools?.pixelSelect?.isActive?.() === true
          : drawTools?.select?.isActive?.() === true,
        // UI.canProcessKeyEvents is a legacy emulator-focus flag and can
        // remain false after leaving that surface. The editor gate is the
        // authoritative shortcut switch; modal and input ownership are
        // represented independently above.
        shortcutsAllowed: app.allowKeyShortcuts !== false,
        spriteFramesVisible: app.textModeEditor?.spriteFrames?.getVisible?.() === true,
        textEditorMode,
        textTool: drawTools?.tool || "none",
        textTyping,
      };
      if (!isShortcutContext(context)) throw new TypeError("Invalid shortcut context from editor state");
      return context;
    } catch (error) {
      reportFailure(error);
      return createSafeShortcutContext();
    }
  };
}
