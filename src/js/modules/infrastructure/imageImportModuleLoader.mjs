/**
 * Browsers retain failed module-map entries by URL. Give each activation load
 * attempt a distinct URL so the feature registry's retry issues a new request,
 * while the generated module target remains fixed and reviewable.
 *
 * @param {string} release
 */
export function createImageImportModuleLoader(release) {
  let attempt = 0;
  return () => {
    return import(
      /* @vite-ignore */
      `../../features/image-import.js?v=${encodeURIComponent(release)}&attempt=${attempt++}`
    );
  };
}
