function requireFeatureName(name) {
  if (typeof name !== "string" || name.trim() === "") {
    throw new TypeError("Feature names must be non-empty strings");
  }
}

function requireDefinition(definition) {
  if (
    !definition ||
    typeof definition.load !== "function" ||
    typeof definition.activate !== "function"
  ) {
    throw new TypeError("Features must define load and activate functions");
  }
}

export class FeatureRegistry {
  constructor() {
    this.features = new Map();
  }

  register(name, definition) {
    requireFeatureName(name);
    requireDefinition(definition);
    if (this.features.has(name)) throw new Error(`Feature is already registered: ${name}`);

    this.features.set(name, {
      definition,
      instance: null,
      promise: null,
    });
  }

  has(name) {
    return this.features.has(name);
  }

  isActive(name) {
    return this.features.get(name)?.instance != null;
  }

  activate(name, context) {
    const state = this.features.get(name);
    if (!state) return Promise.reject(new Error(`Unknown feature: ${name}`));
    if (state.instance != null) return Promise.resolve(state.instance);
    if (state.promise) return state.promise;

    state.promise = Promise.resolve()
      .then(() => state.definition.load())
      .then(() => state.definition.activate(context))
      .then((instance) => {
        if (instance == null) throw new Error(`Feature did not return an instance: ${name}`);
        state.instance = instance;
        state.promise = null;
        return instance;
      })
      .catch((error) => {
        // A rejected load must remain retryable; transient network failures should
        // not poison the feature for the rest of the browser session.
        state.promise = null;
        throw error;
      });

    return state.promise;
  }

  createFacade(name, context) {
    const state = this.features.get(name);
    if (!state) throw new Error(`Unknown feature: ${name}`);
    if (typeof state.definition.createFacade !== "function") {
      throw new Error(`Feature does not define a legacy facade: ${name}`);
    }

    const activate = () => this.activate(name, context);
    return state.definition.createFacade(activate, context);
  }
}

export function createClassicScriptLoader(documentObject) {
  if (!documentObject || typeof documentObject.createElement !== "function") {
    throw new TypeError("A document-like object is required to load feature scripts");
  }

  const requests = new Map();

  return function loadClassicScript(source) {
    if (requests.has(source)) return requests.get(source);

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
