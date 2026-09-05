/** @typedef {"context"} FeatureScopeName */

/**
 * @template Context
 * @template Instance
 * @typedef {object} FeatureDefinition
 * @property {FeatureScopeName} scope
 * @property {() => void | Promise<void>} load
 * @property {(context: Context) => Instance | Promise<Instance>} activate
 * @property {(instance: Instance, context: Context) => void | Promise<void>} dispose
 */

/**
 * @template Context
 * @template Instance
 * @typedef {object} FeatureHandle
 * @property {(context: Context) => Promise<Instance>} activate
 * @property {(context: Context) => Promise<boolean>} dispose
 * @property {() => Promise<number>} disposeAll
 * @property {(context: Context) => Instance | null} getActive
 * @property {(context: Context) => boolean} isActive
 * @property {() => boolean} isLoaded
 */

/**
 * @typedef {object} FeatureState
 * @property {Map<any, Promise<any>>} activations
 * @property {FeatureDefinition<any, any>} definition
 * @property {Promise<number> | null} disposeAllPromise
 * @property {Map<any, Promise<boolean>>} disposals
 * @property {Map<any, any>} instances
 * @property {boolean} loaded
 * @property {Promise<void> | null} loadPromise
 */

/**
 * The application currently has one real lazy-feature lifecycle: one instance
 * per editor context. Keep that contract explicit instead of carrying unused
 * application-wide and per-use abstractions.
 */
export const FeatureScope = Object.freeze({
  CONTEXT: "context",
});

export const FeatureId = Object.freeze({
  IMAGE_IMPORT: "imageImport",
});

/** @param {string} name */
function requireFeatureName(name) {
  if (typeof name !== "string" || name.trim() === "") {
    throw new TypeError("Feature names must be non-empty strings");
  }
}

/** @param {any} definition */
function requireDefinition(definition) {
  if (
    !definition ||
    definition.scope !== FeatureScope.CONTEXT ||
    typeof definition.load !== "function" ||
    typeof definition.activate !== "function" ||
    typeof definition.dispose !== "function"
  ) {
    throw new TypeError("Context features must define load, activate, and dispose");
  }
}

export class FeatureRegistry {
  constructor() {
    /** @type {Map<string, FeatureState>} */
    this.features = new Map();
  }

  /**
   * @template Context
   * @template Instance
   * @param {string} name
   * @param {FeatureDefinition<Context, Instance>} definition
   * @returns {FeatureHandle<Context, Instance>}
   */
  register(name, definition) {
    requireFeatureName(name);
    requireDefinition(definition);
    if (this.features.has(name)) throw new Error(`Feature is already registered: ${name}`);

    const state = {
      activations: new Map(),
      definition,
      disposeAllPromise: null,
      disposals: new Map(),
      instances: new Map(),
      loaded: false,
      loadPromise: null,
    };
    this.features.set(name, state);

    return Object.freeze({
      activate: (context) => /** @type {Promise<Instance>} */ (this.activate(name, context)),
      dispose: (context) => this.dispose(name, context),
      disposeAll: () => this.disposeAll(name),
      getActive: (context) => /** @type {Instance | null} */ (this.getActive(name, context)),
      isActive: (context) => this.isActive(name, context),
      isLoaded: () => this.isLoaded(name),
    });
  }

  /** @param {string} name @returns {FeatureState} */
  state(name) {
    const state = this.features.get(name);
    if (!state) throw new Error(`Unknown feature: ${name}`);
    return state;
  }

  /** @param {FeatureState} state @returns {Promise<void>} */
  load(state) {
    if (state.loaded) return Promise.resolve();
    if (state.loadPromise) return state.loadPromise;

    /** @type {Promise<void>} */
    let loading;
    loading = Promise.resolve()
      .then(() => state.definition.load())
      .then(() => { state.loaded = true; })
      .finally(() => {
        if (state.loadPromise === loading) state.loadPromise = null;
      });
    state.loadPromise = loading;
    return loading;
  }

  /** @param {string} name @param {any} context @returns {Promise<any>} */
  async activate(name, context) {
    if (context == null) throw new TypeError("Context features require an activation context");
    const state = this.state(name);
    if (state.disposeAllPromise) {
      await state.disposeAllPromise;
      return this.activate(name, context);
    }
    if (state.disposals.has(context)) {
      await state.disposals.get(context);
    }
    if (state.instances.has(context)) return state.instances.get(context);
    if (state.activations.has(context)) return state.activations.get(context);

    /** @type {Promise<any>} */
    let activation;
    activation = this.load(state)
      .then(() => state.definition.activate(context))
      .then((instance) => {
        if (instance == null) throw new Error(`Feature activation returned no instance: ${name}`);
        state.instances.set(context, instance);
        return instance;
      })
      .finally(() => {
        if (state.activations.get(context) === activation) state.activations.delete(context);
      });
    state.activations.set(context, activation);
    return activation;
  }

  /** @param {string} name @param {any} context @returns {any | null} */
  getActive(name, context) {
    const state = this.state(name);
    if (typeof context === "undefined") {
      return state.instances.values().next().value ?? null;
    }
    return state.instances.get(context) ?? null;
  }

  /** @param {string} name @param {any} context @returns {boolean} */
  isActive(name, context) {
    const state = this.state(name);
    if (typeof context === "undefined") {
      return state.instances.size > 0 || state.activations.size > 0;
    }
    return state.instances.has(context) || state.activations.has(context);
  }

  /** @param {string} name @returns {boolean} */
  isLoaded(name) {
    return this.state(name).loaded;
  }

  /** @param {string} name @param {any} context @returns {Promise<boolean>} */
  async dispose(name, context) {
    if (context == null) throw new TypeError("Context features require a disposal context");
    const state = this.state(name);
    if (state.disposals.has(context)) {
      return /** @type {Promise<boolean>} */ (state.disposals.get(context));
    }
    /** @type {Promise<boolean>} */
    let disposal;
    disposal = Promise.resolve()
      .then(async () => {
        if (state.activations.has(context)) {
          try {
            await state.activations.get(context);
          } catch {
            return false;
          }
        }
        if (!state.instances.has(context)) return false;

        const instance = state.instances.get(context);
        await state.definition.dispose(instance, context);
        if (state.instances.get(context) === instance) state.instances.delete(context);
        return true;
      })
      .finally(() => {
        if (state.disposals.get(context) === disposal) state.disposals.delete(context);
      });
    state.disposals.set(context, disposal);
    return disposal;
  }

  /** @param {string} name @returns {Promise<number>} */
  disposeAll(name) {
    const state = this.state(name);
    if (state.disposeAllPromise) return state.disposeAllPromise;
    /** @type {Promise<number>} */
    let disposal;
    disposal = Promise.resolve().then(async () => {
      await Promise.allSettled([...state.activations.values()]);
      const contexts = [...state.instances.keys()];
      const results = await Promise.all(contexts.map((context) => this.dispose(name, context)));
      return results.filter(Boolean).length;
    }).finally(() => {
      if (state.disposeAllPromise === disposal) state.disposeAllPromise = null;
    });
    state.disposeAllPromise = disposal;
    return disposal;
  }
}
