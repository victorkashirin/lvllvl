/** @typedef {"application" | "context" | "per-use"} FeatureScopeName */

/**
 * @template Context
 * @template Instance
 * @typedef {object} FeatureDefinition
 * @property {FeatureScopeName} scope
 * @property {() => void | Promise<void>} load
 * @property {(context: Context) => Instance | Promise<Instance>} activate
 * @property {(instance: Instance, context: Context) => void | Promise<void>} [dispose]
 */

/**
 * @template Context
 * @template Instance
 * @typedef {object} FeatureHandle
 * @property {(context: Context) => Promise<Instance>} activate
 * @property {(target?: Context | Instance) => Promise<boolean>} dispose
 * @property {() => Promise<number>} disposeAll
 * @property {(context?: Context) => Instance | null} getActive
 * @property {() => boolean} isLoaded
 * @property {(target?: Context | Instance) => boolean} isActive
 */

/**
 * @typedef {object} FeatureState
 * @property {Promise<any> | null} applicationActivation
 * @property {any} applicationContext
 * @property {Promise<boolean> | null} applicationDisposal
 * @property {any} applicationInstance
 * @property {Map<any, Promise<any>>} contextActivations
 * @property {Map<any, Promise<boolean>>} contextDisposals
 * @property {Map<any, any>} contextInstances
 * @property {FeatureDefinition<any, any>} definition
 * @property {Promise<number> | null} disposeAllPromise
 * @property {boolean} loaded
 * @property {Promise<void> | null} loadPromise
 * @property {Set<Promise<any>>} perUseActivations
 * @property {Map<any, Promise<boolean>>} perUseDisposals
 * @property {Map<any, any>} perUseInstances
 */

export const FeatureScope = Object.freeze({
  APPLICATION: "application",
  CONTEXT: "context",
  PER_USE: "per-use",
});

export const FeatureId = Object.freeze({
  IMAGE_IMPORT: "imageImport",
});

const featureScopeValues = new Set(Object.values(FeatureScope));

/** @param {string} name */
function requireFeatureName(name) {
  if (typeof name !== "string" || name.trim() === "") {
    throw new TypeError("Feature names must be non-empty strings");
  }
}

/** @param {FeatureDefinition<any, any>} definition */
function requireDefinition(definition) {
  if (
    !definition ||
    !featureScopeValues.has(definition.scope) ||
    typeof definition.load !== "function" ||
    typeof definition.activate !== "function"
  ) {
    throw new TypeError("Features must define scope, load, and activate");
  }
  if (definition.dispose != null && typeof definition.dispose !== "function") {
    throw new TypeError("Feature disposal must be a function");
  }
  if (definition.scope !== FeatureScope.APPLICATION && typeof definition.dispose !== "function") {
    throw new TypeError("Context and per-use features must define disposal");
  }
}

/** @param {string} name @param {any} instance */
function requireInstance(name, instance) {
  if (instance == null) throw new Error(`Feature did not return an instance: ${name}`);
  return instance;
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

    this.features.set(name, {
      applicationActivation: null,
      applicationContext: null,
      applicationDisposal: null,
      applicationInstance: null,
      contextActivations: new Map(),
      contextDisposals: new Map(),
      contextInstances: new Map(),
      definition,
      disposeAllPromise: null,
      loaded: false,
      loadPromise: null,
      perUseActivations: new Set(),
      perUseDisposals: new Map(),
      perUseInstances: new Map(),
    });

    return Object.freeze({
      activate: (context) =>
        /** @type {Promise<Instance>} */ (this.activate(name, context)),
      dispose: (target) => this.dispose(name, target),
      disposeAll: () => this.disposeAll(name),
      getActive: (...contexts) =>
        /** @type {Instance | null} */ (
          contexts.length > 0 ? this.getActive(name, contexts[0]) : this.getActive(name)
        ),
      isActive: (...targets) =>
        targets.length > 0 ? this.isActive(name, targets[0]) : this.isActive(name),
      isLoaded: () => this.isLoaded(name),
    });
  }

  /** @param {string} name */
  has(name) {
    return this.features.has(name);
  }

  /** @param {string} name */
  isLoaded(name) {
    return this.features.get(name)?.loaded === true;
  }

  /** @param {string} name @param {unknown} [context] */
  isActive(name, context) {
    const state = this.features.get(name);
    if (!state) return false;

    switch (state.definition.scope) {
      case FeatureScope.APPLICATION:
        return state.applicationInstance != null;
      case FeatureScope.CONTEXT:
        return arguments.length > 1
          ? state.contextInstances.has(context)
          : state.contextInstances.size > 0;
      case FeatureScope.PER_USE:
        return arguments.length > 1
          ? state.perUseInstances.has(context)
          : state.perUseInstances.size > 0;
      default:
        return false;
    }
  }

  /** @param {string} name @param {unknown} [context] @returns {unknown | null} */
  getActive(name, context) {
    const state = this.features.get(name);
    if (!state) return null;
    switch (state.definition.scope) {
      case FeatureScope.APPLICATION:
        return state.applicationInstance;
      case FeatureScope.CONTEXT:
        return arguments.length > 1 ? state.contextInstances.get(context) ?? null : null;
      default:
        return null;
    }
  }

  /** @param {string} name @returns {Promise<void>} */
  load(name) {
    const state = this.features.get(name);
    if (!state) return Promise.reject(new Error(`Unknown feature: ${name}`));
    if (state.loaded) return Promise.resolve();
    if (state.loadPromise) return state.loadPromise;

    state.loadPromise = Promise.resolve()
      .then(() => state.definition.load())
      .then(() => {
        state.loaded = true;
        state.loadPromise = null;
      })
      .catch((error) => {
        // Loading is single-flight, but a rejected request remains retryable.
        state.loadPromise = null;
        throw error;
      });
    return state.loadPromise;
  }

  /** @param {string} name @param {unknown} context @returns {Promise<unknown>} */
  activate(name, context) {
    const state = this.features.get(name);
    if (!state) return Promise.reject(new Error(`Unknown feature: ${name}`));
    if (state.disposeAllPromise) {
      return state.disposeAllPromise.then(() => this.activate(name, context));
    }

    switch (state.definition.scope) {
      case FeatureScope.APPLICATION:
        return this.activateApplication(name, state, context);
      case FeatureScope.CONTEXT:
        if (context == null) {
          return Promise.reject(new TypeError(`Context-scoped feature requires a context: ${name}`));
        }
        return this.activateContext(name, state, context);
      case FeatureScope.PER_USE:
        return this.activatePerUse(name, state, context);
      default:
        return Promise.reject(new Error(`Feature has an unsupported scope: ${name}`));
    }
  }

  /**
   * @param {string} name
   * @param {FeatureState} state
   * @param {any} context
   * @returns {Promise<any>}
   */
  activateApplication(name, state, context) {
    if (state.applicationDisposal) {
      return state.applicationDisposal.then(() => this.activateApplication(name, state, context));
    }
    if (state.applicationInstance != null) return Promise.resolve(state.applicationInstance);
    if (state.applicationActivation) return state.applicationActivation;

    state.applicationActivation = this.createInstance(name, state, context)
      .then((instance) => {
        state.applicationContext = context;
        state.applicationInstance = instance;
        state.applicationActivation = null;
        return instance;
      })
      .catch((error) => {
        state.applicationActivation = null;
        throw error;
      });
    return state.applicationActivation;
  }

  /**
   * @param {string} name
   * @param {FeatureState} state
   * @param {any} context
   * @returns {Promise<any>}
   */
  activateContext(name, state, context) {
    if (state.contextDisposals.has(context)) {
      return /** @type {Promise<boolean>} */ (state.contextDisposals.get(context))
        .then(() => this.activateContext(name, state, context));
    }
    if (state.contextInstances.has(context)) {
      return Promise.resolve(state.contextInstances.get(context));
    }
    if (state.contextActivations.has(context)) {
      return /** @type {Promise<any>} */ (state.contextActivations.get(context));
    }

    const activation = this.createInstance(name, state, context)
      .then((instance) => {
        state.contextInstances.set(context, instance);
        state.contextActivations.delete(context);
        return instance;
      })
      .catch((error) => {
        state.contextActivations.delete(context);
        throw error;
      });
    state.contextActivations.set(context, activation);
    return activation;
  }

  /**
   * @param {string} name
   * @param {FeatureState} state
   * @param {any} context
   * @returns {Promise<any>}
   */
  activatePerUse(name, state, context) {
    const activation = this.createInstance(name, state, context)
      .then((instance) => {
        state.perUseInstances.set(instance, context);
        state.perUseActivations.delete(activation);
        return instance;
      })
      .catch((error) => {
        state.perUseActivations.delete(activation);
        throw error;
      });
    state.perUseActivations.add(activation);
    return activation;
  }

  /**
   * @param {string} name
   * @param {FeatureState} state
   * @param {any} context
   * @returns {Promise<any>}
   */
  createInstance(name, state, context) {
    return this.load(name)
      .then(() => state.definition.activate(context))
      .then((instance) => requireInstance(name, instance));
  }

  /** @param {string} name @param {unknown} [target] @returns {Promise<boolean>} */
  dispose(name, target) {
    const state = this.features.get(name);
    if (!state) return Promise.reject(new Error(`Unknown feature: ${name}`));

    switch (state.definition.scope) {
      case FeatureScope.APPLICATION: {
        if (state.applicationDisposal) return state.applicationDisposal;
        /** @type {Promise<boolean>} */
        let disposal;
        disposal = Promise.resolve().then(async () => {
          if (state.applicationActivation) await state.applicationActivation;
          const context = state.applicationContext;
          const instance = state.applicationInstance;
          if (instance == null) return false;
          await state.definition.dispose?.(instance, context);
          if (state.applicationInstance === instance) {
            state.applicationContext = null;
            state.applicationInstance = null;
            state.applicationActivation = null;
          }
          return true;
        }).finally(() => {
          if (state.applicationDisposal === disposal) state.applicationDisposal = null;
        });
        state.applicationDisposal = disposal;
        return disposal;
      }
      case FeatureScope.CONTEXT: {
        if (target == null) {
          return Promise.reject(new TypeError(`Feature disposal requires a context: ${name}`));
        }
        if (state.contextDisposals.has(target)) {
          return /** @type {Promise<boolean>} */ (state.contextDisposals.get(target));
        }
        /** @type {Promise<boolean>} */
        let disposal;
        disposal = Promise.resolve().then(async () => {
          if (state.contextActivations.has(target)) {
            await /** @type {Promise<any>} */ (state.contextActivations.get(target));
          }
          const instance = state.contextInstances.get(target);
          if (instance == null) return false;
          await state.definition.dispose?.(instance, target);
          if (state.contextInstances.get(target) === instance) {
            state.contextInstances.delete(target);
            state.contextActivations.delete(target);
          }
          return true;
        }).finally(() => {
          if (state.contextDisposals.get(target) === disposal) {
            state.contextDisposals.delete(target);
          }
        });
        state.contextDisposals.set(target, disposal);
        return disposal;
      }
      case FeatureScope.PER_USE: {
        const instance = target;
        if (state.perUseDisposals.has(instance)) {
          return /** @type {Promise<boolean>} */ (state.perUseDisposals.get(instance));
        }
        if (!state.perUseInstances.has(instance)) return Promise.resolve(false);
        const context = state.perUseInstances.get(instance);
        /** @type {Promise<boolean>} */
        let disposal;
        disposal = Promise.resolve()
          .then(() => state.definition.dispose?.(instance, context))
          .then(() => {
            if (state.perUseInstances.get(instance) === context) {
              state.perUseInstances.delete(instance);
            }
            return true;
          })
          .finally(() => {
            if (state.perUseDisposals.get(instance) === disposal) {
              state.perUseDisposals.delete(instance);
            }
          });
        state.perUseDisposals.set(instance, disposal);
        return disposal;
      }
      default:
        return Promise.resolve(false);
    }
  }

  /** @param {string} name @returns {Promise<number>} */
  disposeAll(name) {
    const state = this.features.get(name);
    if (!state) return Promise.reject(new Error(`Unknown feature: ${name}`));
    if (state.disposeAllPromise) return state.disposeAllPromise;

    /** @type {Promise<number>} */
    let disposal;
    disposal = Promise.resolve().then(async () => {
      switch (state.definition.scope) {
        case FeatureScope.APPLICATION:
          return Number(await this.dispose(name));
        case FeatureScope.CONTEXT: {
          const contexts = new Set([
            ...state.contextInstances.keys(),
            ...state.contextActivations.keys(),
          ]);
          const results = await Promise.all(
            [...contexts].map((context) => this.dispose(name, context)),
          );
          return results.filter(Boolean).length;
        }
        case FeatureScope.PER_USE: {
          await Promise.allSettled([...state.perUseActivations]);
          const results = await Promise.all(
            [...state.perUseInstances.keys()].map((instance) => this.dispose(name, instance)),
          );
          return results.filter(Boolean).length;
        }
        default:
          return 0;
      }
    }).finally(() => {
      if (state.disposeAllPromise === disposal) state.disposeAllPromise = null;
    });
    state.disposeAllPromise = disposal;
    return disposal;
  }

}
