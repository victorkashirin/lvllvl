import { FeatureId, FeatureScope } from "../application/featureRegistry.mjs";

/**
 * @typedef {import("../application/featureRegistry.mjs").FeatureDefinition<
 *   TextModeEditor,
 *   ImageImporter
 * >} ImageImportFeatureDefinition
 */

/**
 * @typedef {object} ImageImporter
 * @property {(editor: TextModeEditor | object, host?: object) => void} init
 * @property {(args?: unknown) => unknown} start
 * @property {() => unknown} [openShaderEditor]
 * @property {() => void | Promise<void>} [dispose]
 */

/**
 * @typedef {object} TextModeEditor
 */

/**
 * @typedef {object} ImageImportDependencies
 * @property {() => Promise<{ ImportImage?: new () => ImageImporter }>} loadModule
 * @property {(editor: TextModeEditor) => object} createDestination
 * @property {object} host
 * @property {() => void} [clearError]
 */

export const imageImportFeatureName = FeatureId.IMAGE_IMPORT;

/** @param {{ ImportImage?: new () => ImageImporter } | null} imageImportModule */
function imageImporterConstructor(imageImportModule) {
  if (typeof imageImportModule?.ImportImage !== "function") {
    throw new Error("The image-import module did not export ImportImage");
  }
  return imageImportModule.ImportImage;
}

/**
 * @param {ImageImportDependencies} dependencies
 * @returns {ImageImportFeatureDefinition}
 */
export function createImageImportFeature({
  loadModule,
  createDestination,
  host,
  clearError = () => {},
}) {
  if (typeof loadModule !== "function" || typeof createDestination !== "function" || !host) {
    throw new TypeError("The image-import feature requires its module and document ports");
  }
  /** @type {{ ImportImage?: new () => ImageImporter } | null} */
  let imageImportModule = null;

  return {
    scope: FeatureScope.CONTEXT,

    async load() {
      imageImportModule = await loadModule();
      imageImporterConstructor(imageImportModule);
    },

    /** @param {TextModeEditor} textModeEditor */
    activate(textModeEditor) {
      if (!textModeEditor) throw new Error("Image import requires a text-mode editor");

      const ImageImporter = imageImporterConstructor(imageImportModule);
      const imageImporter = new ImageImporter();
      imageImporter.init(createDestination(textModeEditor), host);
      clearError();
      return imageImporter;
    },

    /** @param {ImageImporter} imageImporter */
    async dispose(imageImporter) {
      await imageImporter.dispose?.();
    },
  };
}
