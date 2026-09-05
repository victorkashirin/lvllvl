import {
  FeatureRegistry,
} from "./modules/application/featureRegistry.mjs";
import { DocumentSession } from "./modules/application/documentSession.mjs";
import { PersistenceService } from "./modules/application/persistenceService.mjs";
import {
  createImageImportFeature,
  imageImportFeatureName,
} from "./modules/feature-adapters/imageImportFeature.mjs";
import { createClassicScriptLoader } from "./modules/infrastructure/classicScriptLoader.mjs";
import { createBrowserStorageAdapter } from "./modules/infrastructure/browserStorageAdapter.mjs";

const featureRegistry = new FeatureRegistry();
const featureScriptUrl = new URL("./features/image-import.js", import.meta.url);
featureScriptUrl.search = new URL(import.meta.url).search;

featureRegistry.register(
  imageImportFeatureName,
  createImageImportFeature({
    legacyGlobal: /** @type {any} */ (globalThis),
    loadScript: createClassicScriptLoader(document),
    scriptUrl: featureScriptUrl.href,
    reportError(error) {
      globalThis.g_app?.reportFeatureError("image import", error);
    },
    clearError() {
      globalThis.g_app?.clearFeatureError();
    },
  }),
);

const app = new globalThis.Editor();
const clock = () => Date.now();
const createId = () => globalThis.generateUUID();
const persistence = new PersistenceService({
  storage: createBrowserStorageAdapter(globalThis.BrowserStorage),
  clock,
  createId,
});
const services = {
  clock,
  persistence,
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
app.init({ features: featureRegistry, services });
