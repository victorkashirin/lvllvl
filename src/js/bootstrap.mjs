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
import { createOklchColorControl } from "./modules/feature-adapters/oklchColorControl.mjs";
import { createKeyboardShortcutsDialog } from "./modules/feature-adapters/keyboardShortcutsDialog.mjs";
import { createLegacyCommandCatalogAdapter } from "./modules/feature-adapters/legacyCommandCatalogAdapter.mjs";
import { registerNativeEditorCommands } from "./modules/feature-adapters/nativeEditorCommands.mjs";
import { createShortcutContextProvider } from "./modules/feature-adapters/shortcutContextProvider.mjs";
import { createShortcutLabelProjection } from "./modules/feature-adapters/shortcutLabelProjection.mjs";
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

const shortcutContext = createShortcutContextProvider({
  app,
  document: globalThis.document,
  isRecording: () => commands.isRecording(),
  UI: legacy.UI,
  now: clock,
  reportError(operation, error) {
    console.warn(`Could not ${operation}.`, error);
  },
});

const shortcutStorage = createKeybindingStorageAdapter(shortcutBrowserStorage, { now: clock });

const commands = new CommandService({
  clearTimer: (timer) => globalThis.clearTimeout(/** @type {number} */ (timer)),
  getContext: shortcutContext,
  platform: legacy.UI.os === "Mac OS" || legacy.UI.os === "iOS" ? "mac" : "other",
  reportError(operation, error) {
    console.warn(`Could not ${operation}.`, error);
  },
  setTimer: (callback, delay) => globalThis.setTimeout(callback, delay),
  storage: shortcutStorage,
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

const shortcutCatalog = createLegacyCommandCatalogAdapter({
  app,
  commands,
  registerNativeCommands: () => registerNativeEditorCommands({
    app,
    commands,
    toolMetadata: legacy.ShortcutCatalogMetadata,
  }),
  labels: createShortcutLabelProjection({
    app,
    commands,
    document: globalThis.document,
    toolMetadata: legacy.ShortcutCatalogMetadata,
    translate: (value) => legacy.TextStore.get(value),
  }),
  schedule: (callback) => globalThis.setTimeout(callback, 0),
});

legacy.UI.commandKeyDown = (/** @type {KeyboardEvent} */ event) => commands.handleKeyDown(event).handled;
legacy.UI.commandKeyUp = (/** @type {KeyboardEvent} */ event) => commands.handleKeyUp(event).handled;
legacy.UI.commandContextChanged = (/** @type {string} */ source) => commands.cleanup({ source });

const cleanupCommandDispatcher = (/** @type {Event} */ event) =>
  commands.cleanup({ source: event.type });
const disposeCommandDispatcher = (/** @type {Event} */ event) =>
  commands.dispose({ source: event.type });
const cleanupHiddenCommandDispatcher = () => {
  if (globalThis.document.hidden) commands.cleanup({ source: "visibilitychange" });
};
const synchronizeShortcutStorage = (/** @type {StorageEvent} */ event) => {
  if (!shortcutBrowserStorage || event.storageArea !== shortcutBrowserStorage ||
      (event.key !== shortcutStorage.key && event.key !== null)) return;
  // Read the latest value instead of trusting a queued event snapshot. Two
  // tabs can write before either receives the other's storage event.
  try {
    commands.synchronizeConfiguration(shortcutStorage.loadFresh());
  } catch (error) {
    console.warn("Could not synchronize keyboard shortcuts.", error);
  }
};
globalThis.addEventListener("blur", cleanupCommandDispatcher);
globalThis.addEventListener("pagehide", disposeCommandDispatcher);
globalThis.addEventListener("storage", synchronizeShortcutStorage);
globalThis.document.addEventListener("compositionstart", cleanupCommandDispatcher);
globalThis.document.addEventListener("focusout", cleanupCommandDispatcher);
globalThis.document.addEventListener("visibilitychange", cleanupHiddenCommandDispatcher);

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
  createOklchColorControl,
  clock,
  commands,
  imageImport,
  imageImportCoordinator,
  persistence,
  remoteProviderFacades: disabledRemoteProviders.facades,
  remoteProviders: disabledRemoteProviders.policy,
  shortcutCatalog,
  shortcutContext,
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
