import { FeatureScope } from "../application/featureRegistry.mjs";

/**
 * @typedef {import("../application/featureRegistry.mjs").FeatureDefinition<
 *   TextModeEditor,
 *   ImageImporter,
 *   ImageImportFacade
 * >} ImageImportFeatureDefinition
 */

/**
 * @typedef {object} ImageImporter
 * @property {(editor: TextModeEditor) => void} init
 * @property {(args?: unknown) => unknown} start
 * @property {() => void | Promise<void>} [dispose]
 */

/**
 * @typedef {object} ImageImportFacade
 * @property {unknown} importImageMobile
 * @property {boolean} importInProgress
 * @property {boolean} visible
 * @property {(args?: unknown) => Promise<unknown>} start
 * @property {() => void} update
 */

/**
 * @typedef {object} TextModeEditor
 * @property {ImageImporter | ImageImportFacade | null} [importImage]
 */

/**
 * @typedef {object} ImageImportDependencies
 * @property {{ ImportImage?: new () => ImageImporter }} legacyGlobal
 * @property {(source: string) => void | Promise<void>} loadScript
 * @property {string} scriptUrl
 * @property {(error: unknown) => void} [reportError]
 * @property {() => void} [clearError]
 */

export const imageImportFeatureName = "imageImport";

/** @param {{ ImportImage?: new () => ImageImporter }} legacyGlobal */
function imageImporterConstructor(legacyGlobal) {
  if (typeof legacyGlobal.ImportImage !== "function") {
    throw new Error("The image-import bundle did not expose ImportImage");
  }
  return legacyGlobal.ImportImage;
}

/**
 * @param {ImageImportDependencies} dependencies
 * @returns {ImageImportFeatureDefinition}
 */
export function createImageImportFeature({
  legacyGlobal,
  loadScript,
  scriptUrl,
  reportError = () => {},
  clearError = () => {},
}) {
  if (!legacyGlobal || typeof loadScript !== "function" || !scriptUrl) {
    throw new TypeError("The image-import feature requires its legacy host and script loader");
  }

  /** @type {WeakMap<TextModeEditor, ImageImportFacade>} */
  const facades = new WeakMap();

  return {
    scope: FeatureScope.CONTEXT,

    async load() {
      await loadScript(scriptUrl);
      imageImporterConstructor(legacyGlobal);
    },

    /** @param {TextModeEditor} textModeEditor */
    activate(textModeEditor) {
      if (!textModeEditor) throw new Error("Image import requires a text-mode editor");

      const ImageImporter = imageImporterConstructor(legacyGlobal);
      const imageImporter = new ImageImporter();
      imageImporter.init(textModeEditor);
      textModeEditor.importImage = imageImporter;
      clearError();
      return imageImporter;
    },

    /** @param {ImageImporter} imageImporter @param {TextModeEditor} textModeEditor */
    async dispose(imageImporter, textModeEditor) {
      await imageImporter.dispose?.();
      if (textModeEditor?.importImage === imageImporter) {
        textModeEditor.importImage = facades.get(textModeEditor) ?? null;
      }
    },

    /**
     * @param {() => Promise<ImageImporter>} activate
     * @param {TextModeEditor} textModeEditor
     */
    createFacade(activate, textModeEditor) {
      const facade = {
        importImageMobile: null,
        importInProgress: false,
        visible: false,

        /** @param {unknown} [args] */
        start(args) {
          return activate().then(
            (imageImporter) => imageImporter.start(args),
            (error) => {
              reportError(error);
            },
          );
        },

        update() {},
      };
      if (textModeEditor && typeof textModeEditor === "object") {
        facades.set(textModeEditor, facade);
      }
      return facade;
    },
  };
}
