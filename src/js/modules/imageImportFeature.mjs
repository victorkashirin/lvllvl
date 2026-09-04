export const imageImportFeatureName = "imageImport";

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

  return {
    async load() {
      await loadScript(scriptUrl);
      if (typeof legacyGlobal.ImportImage !== "function") {
        throw new Error("The image-import bundle did not expose ImportImage");
      }
    },

    activate(textModeEditor) {
      if (!textModeEditor) throw new Error("Image import requires a text-mode editor");

      const imageImporter = new legacyGlobal.ImportImage();
      imageImporter.init(textModeEditor);
      textModeEditor.importImage = imageImporter;
      clearError();
      return imageImporter;
    },

    createFacade(activate) {
      return {
        importImageMobile: null,
        importInProgress: false,
        visible: false,

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
    },
  };
}
