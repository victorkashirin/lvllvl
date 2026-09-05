import {
  FeatureRegistry,
} from "./modules/application/featureRegistry.mjs";
import {
  UiRouteId,
  UiRouteService,
} from "./modules/application/uiRouteService.mjs";
import { DocumentSession } from "./modules/application/documentSession.mjs";
import { EditorCommandService } from "./modules/application/editorCommandService.mjs";
import { PersistenceService } from "./modules/application/persistenceService.mjs";
import {
  RemoteProviderCapability,
  RemoteProviderId,
  RemoteProviderService,
} from "./modules/application/remoteProviderService.mjs";
import {
  createImageImportFeature,
  imageImportFeatureName,
} from "./modules/feature-adapters/imageImportFeature.mjs";
import {
  createImageImportRoute,
  createLegacyUiRouteAdapter,
  registerLegacyModeRoutes,
} from "./modules/feature-adapters/legacyUiRoutes.mjs";
import {
  createLegacyTextModeHistoryCapabilities,
  createTextModeHistoryReplay,
} from "./modules/feature-adapters/textModeHistoryAdapter.mjs";
import { createLegacyRemoteProviderFacades } from "./modules/feature-adapters/legacyRemoteProviderFacades.mjs";
import { createClassicScriptLoader } from "./modules/infrastructure/classicScriptLoader.mjs";
import { createBrowserStorageAdapter } from "./modules/infrastructure/browserStorageAdapter.mjs";
import { createDisabledRemoteProviderAdapter } from "./modules/infrastructure/disabledRemoteProviderAdapter.mjs";

const featureRegistry = new FeatureRegistry();
const featureScriptUrl = new URL("./features/image-import.js", import.meta.url);
featureScriptUrl.search = new URL(import.meta.url).search;

const imageImportFeature = featureRegistry.register(
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
const uiRoutes = new UiRouteService({
  ui: createLegacyUiRouteAdapter({
    document,
    schedule(callback) {
      globalThis.setTimeout(callback, 0);
    },
    logError(message, error) {
      console.error(message, error);
    },
  }),
});
registerLegacyModeRoutes(uiRoutes, (mode) => app.applyMode(mode));
uiRoutes.register(
  UiRouteId.IMAGE_IMPORT,
  createImageImportRoute(imageImportFeature, () => /** @type {any} */ (app.textModeEditor)),
  { aliases: ["image-import"] },
);
const clock = () => Date.now();
const createId = () => globalThis.generateUUID();
const persistence = new PersistenceService({
  storage: createBrowserStorageAdapter(globalThis.BrowserStorage),
  clock,
  createId,
});
const providerDisabledReason =
  "Remote providers are temporarily disabled until credential handling moves to a reviewed server-side flow.";
const remoteProviders = new RemoteProviderService({
  providers: [
    createDisabledRemoteProviderAdapter({
      id: RemoteProviderId.GITHUB,
      capabilities: [
        RemoteProviderCapability.IDENTITY,
        RemoteProviderCapability.LIST,
        RemoteProviderCapability.LOAD,
        RemoteProviderCapability.PUBLISH,
        RemoteProviderCapability.SAVE,
      ],
      reason: providerDisabledReason,
    }),
    createDisabledRemoteProviderAdapter({
      id: RemoteProviderId.GIST,
      capabilities: [RemoteProviderCapability.LOAD, RemoteProviderCapability.PUBLISH],
      reason: providerDisabledReason,
    }),
    createDisabledRemoteProviderAdapter({
      id: RemoteProviderId.GOOGLE_DRIVE,
      capabilities: [
        RemoteProviderCapability.IDENTITY,
        RemoteProviderCapability.LIST,
        RemoteProviderCapability.LOAD,
        RemoteProviderCapability.SAVE,
      ],
      reason: providerDisabledReason,
    }),
  ],
  isOnline: () => globalThis.navigator?.onLine !== false,
});
const remoteProviderFacades = createLegacyRemoteProviderFacades({
  remoteProviders,
  reportError(providerId, error) {
    app.reportRemoteProviderError(providerId, error);
  },
});
// Provider UI is a separate security-reviewed registration. Installing a live
// infrastructure adapter must not reactivate dormant callback-era controls.
const remoteProviderUi = Object.freeze({
  isEnabled() { return false; },
});

/** @param {any} editor */
function createTextModeCommandService(editor) {
  const capabilities = createLegacyTextModeHistoryCapabilities(editor, {
    isNewSystem: () => Boolean(globalThis.g_newSystem),
  });
  const replay = createTextModeHistoryReplay(capabilities);

  return new EditorCommandService({ replay });
}

const services = {
  clock,
  persistence,
  remoteProviderFacades,
  remoteProviders,
  remoteProviderUi,
  uiRoutes,
  createTextModeCommandService,
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
