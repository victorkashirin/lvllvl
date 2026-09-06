import { DocumentSession } from "./modules/application/documentSession.mjs";
import { FeatureRegistry } from "./modules/application/featureRegistry.mjs";
import { PersistenceService } from "./modules/application/persistenceService.mjs";
import {
  createImageImportDestination,
  createImageImportFeature,
  imageImportFeatureName,
} from "./modules/feature-adapters/imageImportFeature.mjs";
import { createImageImportCoordinator } from "./modules/feature-adapters/imageImportCoordinator.mjs";
import { createDisabledRemoteProviders } from "./modules/feature-adapters/legacyRemoteProviderFacades.mjs";
import { createLegacySvgExportPort } from "./modules/feature-adapters/legacySvgExportAdapter.mjs";
import { createBrowserStorageAdapter } from "./modules/infrastructure/browserStorageAdapter.mjs";
import { createImageImportModuleLoader } from "./modules/infrastructure/imageImportModuleLoader.mjs";

const app = /** @type {any} */ (new globalThis.Editor());
const legacy = /** @type {any} */ (globalThis);
const featureRegistry = new FeatureRegistry();
const clock = () => Date.now();
const createId = () => globalThis.generateUUID();

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
  imageImport,
  imageImportCoordinator,
  persistence,
  remoteProviderFacades: disabledRemoteProviders.facades,
  remoteProviders: disabledRemoteProviders.policy,
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
