import {
  FeatureRegistry,
} from "./modules/application/featureRegistry.mjs";
import {
  createImageImportFeature,
  imageImportFeatureName,
} from "./modules/feature-adapters/imageImportFeature.mjs";
import { createClassicScriptLoader } from "./modules/infrastructure/classicScriptLoader.mjs";

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
globalThis.g_app = app;
app.init({ features: featureRegistry });
