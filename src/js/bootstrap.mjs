import {
  FeatureRegistry,
  createClassicScriptLoader,
} from "./modules/featureRegistry.mjs?v={v}";
import {
  createImageImportFeature,
  imageImportFeatureName,
} from "./modules/imageImportFeature.mjs?v={v}";

const featureRegistry = new FeatureRegistry();
const featureScriptUrl = new URL("./features/image-import.js", import.meta.url);
featureScriptUrl.search = new URL(import.meta.url).search;

featureRegistry.register(
  imageImportFeatureName,
  createImageImportFeature({
    legacyGlobal: globalThis,
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
