/**
 * @param {Document} documentObject
 * @returns {(source: string) => Promise<void>}
 */
export function createClassicScriptLoader(documentObject) {
  if (!documentObject || typeof documentObject.createElement !== "function") {
    throw new TypeError("A document-like object is required to load feature scripts");
  }

  /** @type {Map<string, Promise<void>>} */
  const requests = new Map();

  return function loadClassicScript(source) {
    if (requests.has(source)) {
      return /** @type {Promise<void>} */ (requests.get(source));
    }

    /** @type {Promise<void>} */
    const request = new Promise((resolve, reject) => {
      const script = documentObject.createElement("script");
      script.async = true;
      script.src = source;
      script.dataset.lvllvlFeature = "true";
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        requests.delete(source);
        reject(new Error(`Could not load feature script: ${source}`));
      };
      documentObject.head.appendChild(script);
    });

    requests.set(source, request);
    return request;
  };
}
