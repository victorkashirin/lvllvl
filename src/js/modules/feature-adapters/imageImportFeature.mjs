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

const imageImportCapabilities = Object.freeze([
  "charsImageData", "checkerboardPattern", "chooseCharactersDialog", "chooseColorsDialog",
  "colorPaletteManager", "colorPickerPopupMenu", "currentTile", "currentTileSetID", "frames",
  "getC64ECMColor", "getColorPerMode", "getHasTileFlip", "getHasTileRotate",
  "getScreenMode", "graphic", "grid", "history", "layers", "petscii",
  "setBackgroundColor", "setBorderColor", "setC64ECMColor", "setC64Multi1Color",
  "setC64Multi2Color", "setValue", "showTileEditor", "tileEditor", "tileEditorMobile",
  "tileSetManager", "tileSets", "tools", "updateBackgroundColorPicker",
]);

/**
 * Give the lazy image importer only the editor capabilities it uses. This is a
 * deliberately local adapter, not a registry for every legacy file format.
 *
 * @param {Record<string, any>} editor
 */
export function createImageImportDestination(editor) {
  if (!editor || typeof editor !== "object") {
    throw new TypeError("Image import requires an editor context");
  }
  /** @type {Record<string, any>} */
  const destination = {};
  for (const name of imageImportCapabilities) {
    const value = editor[name];
    if (typeof value === "function") {
      Object.defineProperty(destination, name, {
        enumerable: true,
        value: value.bind(editor),
      });
    } else {
      Object.defineProperty(destination, name, {
        enumerable: true,
        get: () => editor[name],
      });
    }
  }
  return Object.freeze(destination);
}

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
