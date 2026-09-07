import { DocumentSession } from "./modules/application/documentSession.mjs";
import { FeatureRegistry } from "./modules/application/featureRegistry.mjs";
import { PersistenceService } from "./modules/application/persistenceService.mjs";
import { CommandService } from "./modules/application/commandService.mjs";
import {
  createImageImportDestination,
  createImageImportFeature,
  imageImportFeatureName,
} from "./modules/feature-adapters/imageImportFeature.mjs";
import { createImageImportCoordinator } from "./modules/feature-adapters/imageImportCoordinator.mjs";
import { createDisabledRemoteProviders } from "./modules/feature-adapters/legacyRemoteProviderFacades.mjs";
import { createLegacySvgExportPort } from "./modules/feature-adapters/legacySvgExportAdapter.mjs";
import { createKeyboardShortcutsDialog } from "./modules/feature-adapters/keyboardShortcutsDialog.mjs";
import { createBrowserStorageAdapter } from "./modules/infrastructure/browserStorageAdapter.mjs";
import { createImageImportModuleLoader } from "./modules/infrastructure/imageImportModuleLoader.mjs";
import { createKeybindingStorageAdapter } from "./modules/infrastructure/keybindingStorageAdapter.mjs";

const app = /** @type {any} */ (new globalThis.Editor());
const legacy = /** @type {any} */ (globalThis);
const featureRegistry = new FeatureRegistry();
const clock = () => Date.now();
const createId = () => globalThis.generateUUID();

/** @type {Storage | null} */
let shortcutBrowserStorage = null;
try {
  shortcutBrowserStorage = globalThis.localStorage;
} catch {}

function shortcutContext() {
  const activeElement = globalThis.document.activeElement;
  let focus = "canvas";
  if (activeElement?.closest?.(".ace_editor, .CodeMirror")) focus = "codeEditor";
  else if (activeElement?.matches?.("input, select, textarea, [contenteditable='true']")) focus = "textInput";
  else if (activeElement?.closest?.("[id*='Palette'], [class*='palette']")) focus = "palette";
  else if (activeElement?.closest?.("[id*='Frames'], [class*='timeline']")) focus = "timeline";
  else if (activeElement?.closest?.("[id*='Debugger'], [class*='debugger']")) focus = "debuggerPanel";

  const activeDialog = legacy.UI.dialogStack.length
    ? legacy.UI.dialogStack[legacy.UI.dialogStack.length - 1]
    : null;
  let graphicType = "none";
  let screenMode = "none";
  let selectionActive = false;
  let spriteFramesVisible = false;
  let textEditorMode = "none";
  let textTool = "none";
  let textTyping = false;
  try {
    graphicType = app.textModeEditor?.graphic?.getType?.() || "none";
    screenMode = app.textModeEditor?.getScreenMode?.() || "none";
    spriteFramesVisible = app.textModeEditor?.spriteFrames?.getVisible?.() === true;
    textEditorMode = app.textModeEditor?.getEditorMode?.() || "none";
    textTool = app.textModeEditor?.tools?.drawTools?.tool || "none";
    textTyping = app.textModeEditor?.tools?.drawTools?.isTyping?.() === true;
    const drawTools = app.textModeEditor?.tools?.drawTools;
    selectionActive = textEditorMode === "pixel"
      ? drawTools?.pixelSelect?.isActive?.() === true
      : drawTools?.select?.isActive?.() === true;
  } catch {}
  return {
    browserEditOperations: legacy.UI.browserEditOperations === true,
    deviceType: app.deviceType || "desktop",
    editorMode: app.mode || "none",
    focus,
    graphicType,
    modal: activeDialog ? (activeDialog.uiID || activeDialog.id || "dialog") : "none",
    popupOpen: legacy.UI.popup !== null,
    pointerCanvas: app.textModeEditor?.gridView2d?.mouseInCanvas === true,
    recorderActive: commands.isRecording(),
    screenMode,
    selectionActive,
    // UI.canProcessKeyEvents is a legacy emulator-focus flag and can remain
    // false after leaving that surface. Editor commands use the editor's own
    // authoritative gate; modal and focus contexts are represented separately.
    shortcutsAllowed: app.allowKeyShortcuts !== false,
    spriteFramesVisible,
    textEditorMode,
    textTool,
    textTyping,
  };
}

const commands = new CommandService({
  clearTimer: (timer) => globalThis.clearTimeout(/** @type {number} */ (timer)),
  getContext: shortcutContext,
  platform: legacy.UI.os === "Mac OS" || legacy.UI.os === "iOS" ? "mac" : "other",
  reportError(operation, error) {
    console.warn(`Could not ${operation}.`, error);
  },
  setTimer: (callback, delay) => globalThis.setTimeout(callback, delay),
  storage: createKeybindingStorageAdapter(shortcutBrowserStorage, { now: clock }),
});

const shortcutSettings = createKeyboardShortcutsDialog({
  commands,
  confirmAction: (message) => legacy.confirm(message),
  document: globalThis.document,
  downloadText(filename, text) {
    legacy.download(text, filename, "application/json");
  },
  reportError(operation, error) {
    console.warn(`Could not ${operation}.`, error);
  },
  setTimer: (callback, delay) => globalThis.setTimeout(callback, delay),
  UI: legacy.UI,
});

legacy.UI.commandKeyDown = (/** @type {KeyboardEvent} */ event) => commands.handleKeyDown(event).handled;
legacy.UI.commandKeyUp = (/** @type {KeyboardEvent} */ event) => commands.handleKeyUp(event).handled;

const featureHost = Object.freeze({
  async copyText(/** @type {string} */ value) {
    if (!globalThis.navigator?.clipboard?.writeText) {
      throw new Error("Clipboard access is not available");
    }
    await globalThis.navigator.clipboard.writeText(value);
  },
  downloadArtifact(/** @type {{filename: string, mediaType: string, text: string}} */ artifact) {
    legacy.download(artifact.text, artifact.filename, artifact.mediaType);
  },
  isMobile: () => app.isMobile(),
  reportError: (/** @type {string} */ operation, /** @type {unknown} */ error) =>
    app.reportFeatureError(operation, error),
  showAlert: (/** @type {string} */ message) => legacy.alert(message),
});

const imageImport = featureRegistry.register(
  imageImportFeatureName,
  createImageImportFeature({
    loadModule: createImageImportModuleLoader("{v}"),
    createDestination: createImageImportDestination,
    host: featureHost,
    clearError() {
      app.clearFeatureError();
    },
  }),
);

const imageImportCoordinator = createImageImportCoordinator({
  feature: imageImport,
  getContext: () => app.textModeEditor,
  document,
  schedule(callback) {
    globalThis.setTimeout(callback, 0);
  },
  logError(message, error) {
    console.error(message, error);
  },
});

const persistence = new PersistenceService({
  storage: createBrowserStorageAdapter(globalThis.BrowserStorage),
  clock,
  createId,
});

const disabledRemoteProviders = createDisabledRemoteProviders({
  reportError(providerId, error) {
    app.reportRemoteProviderError(providerId, error);
  },
});

const services = {
  clock,
  commands,
  imageImport,
  imageImportCoordinator,
  persistence,
  remoteProviderFacades: disabledRemoteProviders.facades,
  remoteProviders: disabledRemoteProviders.policy,
  shortcutSettings,
  createSvgExportPort(/** @type {any} */ editor) {
    return createLegacySvgExportPort({
      editor,
      getProjectName: () => app.fileManager.getProjectName(),
      host: featureHost,
    });
  },
  createDocumentSession() {
    return new DocumentSession({
      persistence,
      clock,
      createId,
      reportError(operation, error) {
        app.fileManager?.showBrowserStorageError(operation, error);
      },
      clearError(operation) {
        app.fileManager?.clearBrowserStorageError(operation);
      },
    });
  },
};

globalThis.g_app = app;
app.init({
  buildInfo: legacy.LVLLVL_BUILD_INFO,
  features: featureRegistry,
  services,
});
