import {
  FeatureRegistry,
} from "./modules/application/featureRegistry.mjs";
import {
  UiRouteId,
  UiRouteService,
} from "./modules/application/uiRouteService.mjs";
import { DocumentSession } from "./modules/application/documentSession.mjs";
import { EditorCommandService } from "./modules/application/editorCommandService.mjs";
import { ImportExportService } from "./modules/application/importExportService.mjs";
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
import { createLegacyImportExportAdapter } from "./modules/feature-adapters/legacyImportExportAdapter.mjs";
import { createLegacySvgExportPort } from "./modules/feature-adapters/legacySvgExportAdapter.mjs";
import { createBrowserStorageAdapter } from "./modules/infrastructure/browserStorageAdapter.mjs";
import { createDisabledRemoteProviderAdapter } from "./modules/infrastructure/disabledRemoteProviderAdapter.mjs";
import { createImageImportModuleLoader } from "./modules/infrastructure/imageImportModuleLoader.mjs";
import { encodeSvgExport } from "./modules/domain/svgExport.mjs";

const featureRegistry = new FeatureRegistry();
const app = /** @type {any} */ (new globalThis.Editor());
const legacy = /** @type {any} */ (globalThis);
const importExportOperations = new ImportExportService();
importExportOperations.registerExporter("svg", { encode: encodeSvgExport });
const loadImageImportModule = createImageImportModuleLoader("{v}");
const legacyImportExportHost = Object.freeze({
  get assembler() { return app.assembler; },
  get assemblerEditor() { return app.assemblerEditor; },
  get doc() { return app.doc; },
  get fileManager() { return app.fileManager; },
  get gdrive() { return app.gdrive; },
  get music() { return app.music; },
  get textDialog() { return app.textDialog; },
  downloadArtifact(/** @type {any} */ artifact) {
    const data = typeof artifact.text === "string" ? artifact.text : artifact.readBytes();
    legacy.download(data, artifact.filename, artifact.mediaType);
  },
  isDesktopApp: () => app.isDesktopApp(),
  isMobile: () => app.isMobile(),
  reportError: (/** @type {string} */ operation, /** @type {unknown} */ error) =>
    app.reportFeatureError(operation, error),
  setAllowKeyShortcuts: (/** @type {boolean} */ allow) => app.setAllowKeyShortcuts(allow),
  showAlert: (/** @type {string} */ message) => legacy.alert(message),
  showAssembler: () => app.showAssembler(),
});
const importExportControllers = createLegacyImportExportAdapter({
  host: legacyImportExportHost,
  ports: {
    "export:svg": (editor) => createLegacySvgExportPort({
      editor,
      host: legacyImportExportHost,
      operations: importExportOperations,
    }),
  },
  constructors: {
    "import:assembly": legacy.ImportAssembly,
    "import:c": legacy.ImportC,
    "import:c64-formats": legacy.ImportC64Formats,
    "import:c64-sprite-formats": legacy.ImportC64SpriteFormats,
    "import:charpad": legacy.ImportCharPad,
    "import:spr": legacy.ImportSPR,
    "import:sprite-image": legacy.ImportSpriteImage,
    "import:spritepad": legacy.ImportSpritePad,
    "export:3d-gif": legacy.Export3dGif,
    "export:binary": legacy.ExportBinaryData,
    "export:c64-assembly": legacy.ExportC64Assembly,
    "export:c64-dialog": legacy.ExportC64Dialog,
    "export:c64-sprite-assembly": legacy.ExportC64SpriteAssembly,
    "export:charpad": legacy.ExportCharPad,
    "export:frame-image": legacy.ExportFrameImage,
    "export:gif": legacy.ExportGif,
    "export:gif-mobile": legacy.ExportGifMobile,
    "export:image": legacy.ExportImage,
    "export:json": legacy.ExportJson,
    "export:mega65-assembly": legacy.ExportMega65Assembly,
    "export:obj": legacy.ExportObj,
    "export:pet": legacy.ExportPet,
    "export:petscii-c": legacy.ExportPetsciiC,
    "export:png": legacy.ExportPng,
    "export:png-mobile": legacy.ExportPngMobile,
    "export:seq": legacy.ExportSEQ,
    "export:sprite-binary": legacy.ExportSpriteBinaryData,
    "export:sprite-pad": legacy.ExportSpritePad,
    "export:sprite-png": legacy.ExportSpritePng,
    "export:svg": legacy.ExportSvg,
    "export:text": legacy.ExportTxt,
    "export:to-prg": legacy.ToPRG,
    "export:to-prg-advanced": legacy.ToPRGAdv,
    "export:vox": legacy.ExportVox,
    "export:x16-assembly": legacy.ExportX16Assembly,
    "export:x16-basic": legacy.ExportX16Basic,
  },
});

const imageImportFeature = featureRegistry.register(
  imageImportFeatureName,
  createImageImportFeature({
    loadModule: loadImageImportModule,
    createDestination: (editor) => importExportControllers.createImportDestination("image", editor),
    host: legacyImportExportHost,
    clearError() {
      globalThis.g_app?.clearFeatureError();
    },
  }),
);

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
  imageImport: imageImportFeature,
  importExportControllers,
  importExportOperations,
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
