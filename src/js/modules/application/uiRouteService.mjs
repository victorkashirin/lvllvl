/** @typedef {"loading" | "ready" | "failed" | "retrying" | "disposed"} UiRouteStatusName */

export const UiRouteStatus = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  FAILED: "failed",
  RETRYING: "retrying",
  DISPOSED: "disposed",
});

export const UiRouteId = Object.freeze({
  START: "app:start",
  EDITOR_2D: "editor:2d",
  EDITOR_3D: "editor:3d",
  COLOR_PALETTE: "editor:color-palette",
  TILE_SET: "editor:tile-set",
  SCRIPT: "editor:script",
  JSON: "editor:json",
  TEXT: "editor:text",
  HEX: "editor:hex",
  MUSIC: "editor:music",
  ASSEMBLER: "editor:assembler",
  C64: "editor:c64",
  NES: "editor:nes",
  X16: "editor:x16",
  NONE: "app:none",
  IMAGE_IMPORT: "feature:image-import",
});

/**
 * @typedef {object} UiRouteRequest
 * @property {unknown} [context]
 * @property {unknown} [parameters]
 * @property {string} [source]
 */

/**
 * @typedef {object} UiRouteActivation
 * @property {unknown} context
 * @property {unknown} parameters
 * @property {string} source
 * @property {AbortSignal} signal
 * @property {() => Promise<boolean>} close
 */

/**
 * @typedef {object} UiRouteDefinition
 * @property {string} label
 * @property {(request: UiRouteActivation) => unknown | Promise<unknown>} activate
 * @property {(instance: unknown, request: UiRouteActivation) => void | Promise<void>} [deactivate]
 * @property {(error: Error) => string} [errorMessage]
 * @property {string} [focusSelector]
 * @property {boolean} [overlay]
 * @property {boolean} [reuseOnRepeat]
 * @property {boolean} [showLoading]
 * @property {boolean} [restoreFocus]
 */

/**
 * @typedef {object} UiRouteSnapshot
 * @property {number} attempt
 * @property {Error | null} error
 * @property {string} id
 * @property {string} label
 * @property {string} source
 * @property {UiRouteStatusName} status
 */

/**
 * @typedef {object} UiRouteAdapter
 * @property {() => unknown} [captureFocus]
 * @property {(route: UiRouteSnapshot) => void} [loading]
 * @property {(route: UiRouteSnapshot & { focusSelector?: string }) => void} [ready]
 * @property {(route: UiRouteSnapshot & { message: string, retry: () => void }) => void} [failed]
 * @property {(route: UiRouteSnapshot) => void} [disposed]
 * @property {(target: unknown) => void} [restoreFocus]
 * @property {(routeId: string, error: unknown) => void} [reportCleanupError]
 */

/**
 * @typedef {object} RegisteredRoute
 * @property {UiRouteDefinition} definition
 * @property {UiRouteSnapshot} snapshot
 */

/**
 * @typedef {object} ActiveNavigation
 * @property {AbortController} controller
 * @property {UiRouteDefinition} definition
 * @property {RegisteredRoute} entry
 * @property {unknown} focusTarget
 * @property {unknown} instance
 * @property {boolean} cleaned
 * @property {ActiveNavigation | null} parentNavigation
 * @property {UiRouteActivation} activationRequest
 * @property {UiRouteRequest} request
 * @property {Promise<unknown | null>} result
 * @property {string} routeId
 */

/** @param {unknown} error */
function normalizeError(error) {
  return error instanceof Error ? error : new Error("The route could not be activated");
}

/** @param {string} id */
function requireRouteId(id) {
  if (typeof id !== "string" || id.trim() === "") {
    throw new TypeError("Route identifiers must be non-empty strings");
  }
}

/** @param {UiRouteDefinition} definition */
function requireDefinition(definition) {
  if (!definition || typeof definition.label !== "string" ||
      definition.label.trim() === "" || typeof definition.activate !== "function") {
    throw new TypeError("Routes must define a label and activation function");
  }
  if (definition.deactivate != null && typeof definition.deactivate !== "function") {
    throw new TypeError("Route deactivation must be a function");
  }
}

/** @param {UiRouteSnapshot} snapshot */
function publicSnapshot(snapshot) {
  return Object.freeze({ ...snapshot });
}

export class UiRouteService {
  /** @param {{ ui?: UiRouteAdapter }} [dependencies] */
  constructor({ ui = {} } = {}) {
    /** @type {Map<string, RegisteredRoute>} */
    this.routes = new Map();
    /** @type {Map<string, string>} */
    this.aliases = new Map();
    /** @type {Set<(route: UiRouteSnapshot) => void>} */
    this.listeners = new Set();
    /** @type {ActiveNavigation | null} */
    this.activeNavigation = null;
    this.navigationRevision = 0;
    /** @type {Promise<void> | null} */
    this.pendingRetirement = null;
    this.ui = ui;
  }

  /**
   * @param {string} id
   * @param {UiRouteDefinition} definition
   * @param {{ aliases?: string[] }} [options]
   */
  register(id, definition, { aliases = [] } = {}) {
    requireRouteId(id);
    requireDefinition(definition);
    if (this.routes.has(id) || this.aliases.has(id)) {
      throw new Error(`Route is already registered: ${id}`);
    }

    const duplicateAlias = aliases.find((alias) =>
      typeof alias !== "string" || alias.trim() === "" ||
      alias === id || this.routes.has(alias) || this.aliases.has(alias));
    if (duplicateAlias != null) {
      throw new Error(`Route alias is invalid or already registered: ${duplicateAlias}`);
    }

    /** @type {UiRouteSnapshot} */
    const snapshot = {
      attempt: 0,
      error: null,
      id,
      label: definition.label,
      source: "registration",
      status: UiRouteStatus.DISPOSED,
    };
    this.routes.set(id, { definition, snapshot });
    for (const alias of aliases) this.aliases.set(alias, id);

    return Object.freeze({
      dispose: () => this.dispose(id),
      getState: () => this.getState(id),
      navigate: (request = {}) => this.navigate(id, request),
      retry: () => this.retry(id),
    });
  }

  /** @param {string} id */
  resolve(id) {
    return this.routes.has(id) ? id : this.aliases.get(id);
  }

  /** @param {string} id */
  getState(id) {
    const resolved = this.resolve(id);
    const entry = resolved ? this.routes.get(resolved) : null;
    if (!entry) throw new Error(`Unknown route: ${id}`);
    return publicSnapshot(entry.snapshot);
  }

  getActiveRoute() {
    return this.activeNavigation?.routeId ?? null;
  }

  /** @param {ActiveNavigation} navigation */
  isNavigationActive(navigation) {
    for (let current = this.activeNavigation; current; current = current.parentNavigation) {
      if (current === navigation) return true;
    }
    return false;
  }

  /** @param {(route: UiRouteSnapshot) => void} listener */
  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Route listener must be a function");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** @param {RegisteredRoute} entry @param {Partial<UiRouteSnapshot>} changes */
  publish(entry, changes) {
    entry.snapshot = { ...entry.snapshot, ...changes };
    const snapshot = publicSnapshot(entry.snapshot);
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }

  /** @param {string} id @param {UiRouteRequest} [request] */
  navigate(id, request = {}) {
    const routeId = this.resolve(id);
    const entry = routeId ? this.routes.get(routeId) : null;
    if (!routeId || !entry) return Promise.reject(new Error(`Unknown route: ${id}`));

    const current = this.activeNavigation;
    if (
      current && current.routeId === routeId &&
      current.request.context === request.context &&
      (entry.snapshot.status === UiRouteStatus.LOADING ||
        entry.snapshot.status === UiRouteStatus.RETRYING)
    ) {
      return current.result;
    }

    const retrying = current?.routeId === routeId &&
      current.request.context === request.context &&
      entry.snapshot.status === UiRouteStatus.FAILED;
    return this.start(routeId, entry, request, retrying, current?.focusTarget);
  }

  /** @param {string} id */
  retry(id) {
    const routeId = this.resolve(id);
    const entry = routeId ? this.routes.get(routeId) : null;
    const current = this.activeNavigation;
    if (!routeId || !entry) return Promise.reject(new Error(`Unknown route: ${id}`));
    if (!current || current.routeId !== routeId ||
        entry.snapshot.status !== UiRouteStatus.FAILED) {
      return Promise.reject(new Error(`Route is not waiting for retry: ${id}`));
    }
    return this.start(routeId, entry, current.request, true, current.focusTarget);
  }

  /**
   * @param {string} routeId
   * @param {RegisteredRoute} entry
   * @param {UiRouteRequest} request
   * @param {boolean} retrying
   * @param {unknown} existingFocusTarget
   */
  start(routeId, entry, request, retrying, existingFocusTarget) {
    const previous = this.activeNavigation;
    const pendingRetirement = this.pendingRetirement;
    const repeatsRoute = previous?.routeId === routeId;
    const repeatsReadyRoute = repeatsRoute &&
      previous.request.context === request.context &&
      entry.snapshot.status === UiRouteStatus.READY;
    // A stable route identifier can own only one place in the active stack.
    // Context changes replace that route while preserving its original parent;
    // otherwise an overlay could become its own parent and share contradictory
    // lifecycle state between two scoped instances.
    const replacesCurrentNavigation = Boolean(previous) && repeatsRoute;
    const transfersRoute = repeatsReadyRoute && entry.definition.reuseOnRepeat === true;
    const parentNavigation = replacesCurrentNavigation
      ? previous?.parentNavigation ?? null
      : entry.definition.overlay && previous &&
          previous.entry.snapshot.status !== UiRouteStatus.FAILED &&
          previous.entry.snapshot.status !== UiRouteStatus.DISPOSED
        ? previous
        : null;

    let currentRetirement;
    if (previous && replacesCurrentNavigation) {
      previous.parentNavigation = null;
      if (transfersRoute) {
        previous.controller.abort();
        previous.cleaned = true;
      } else {
        currentRetirement = this.retireStack(previous, false, true);
      }
    } else if (previous && !parentNavigation) {
      currentRetirement = this.retireStack(previous, false, true);
    }
    const retirement = this.trackRetirement(
      pendingRetirement && currentRetirement
        ? Promise.all([pendingRetirement, currentRetirement]).then(() => {})
        : pendingRetirement ?? currentRetirement,
    );

    const controller = new AbortController();
    const focusTarget = existingFocusTarget ??
      (entry.definition.restoreFocus ? this.ui.captureFocus?.() : null);
    const source = typeof request.source === "string" && request.source !== ""
      ? request.source
      : "programmatic";
    /** @type {ActiveNavigation} */
    const navigation = {
      controller,
      definition: entry.definition,
      entry,
      focusTarget,
      instance: null,
      cleaned: false,
      parentNavigation,
      activationRequest: /** @type {UiRouteActivation} */ ({}),
      request: { ...request, source },
      result: Promise.resolve(null),
      routeId,
    };
    this.navigationRevision++;
    navigation.activationRequest = {
      context: request.context,
      parameters: request.parameters,
      source,
      signal: controller.signal,
      close: () => this.activeNavigation === navigation
        ? this.dispose(routeId)
        : Promise.resolve(false),
    };
    this.activeNavigation = navigation;

    const snapshot = this.publish(entry, {
      attempt: entry.snapshot.attempt + 1,
      error: null,
      source,
      status: retrying ? UiRouteStatus.RETRYING : UiRouteStatus.LOADING,
    });
    if (entry.definition.showLoading !== false) this.ui.loading?.(snapshot);

    const activate = () => {
      if (controller.signal.aborted || !this.isNavigationActive(navigation)) {
        return null;
      }
      try {
        // Calling activation immediately after synchronous cleanup preserves
        // synchronous legacy mode changes while async cleanup remains serialized.
        return entry.definition.activate(navigation.activationRequest);
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const activation = retirement && typeof retirement.then === "function"
      ? retirement.then(activate)
      : activate();

    navigation.result = Promise.resolve(activation).then(
      async (instance) => {
        if (instance == null && (controller.signal.aborted ||
            !this.isNavigationActive(navigation))) return null;
        navigation.instance = instance;
        if (controller.signal.aborted || !this.isNavigationActive(navigation)) {
          await this.cleanup(navigation);
          return null;
        }
        const ready = this.publish(entry, {
          error: null,
          status: UiRouteStatus.READY,
        });
        if (this.activeNavigation === navigation) {
          this.ui.ready?.({ ...ready, focusSelector: entry.definition.focusSelector });
        }
        return instance;
      },
      async (error) => {
        if (controller.signal.aborted || !this.isNavigationActive(navigation)) {
          await this.cleanup(navigation);
          return null;
        }
        const normalized = normalizeError(error);
        const failed = this.publish(entry, {
          error: normalized,
          status: UiRouteStatus.FAILED,
        });
        const message = entry.definition.errorMessage?.(normalized) ??
          `Could not open ${entry.definition.label}. Check your connection and try again.`;
        if (this.activeNavigation === navigation) {
          this.ui.failed?.({
            ...failed,
            message,
            retry: () => { void this.retry(routeId); },
          });
        }
        return null;
      },
    );
    return navigation.result;
  }

  /** @param {string} [id] */
  dispose(id) {
    const navigation = this.activeNavigation;
    if (!navigation) return Promise.resolve(false);
    if (id != null && this.resolve(id) !== navigation.routeId) return Promise.resolve(false);
    const parent = navigation.parentNavigation;
    navigation.parentNavigation = null;
    this.activeNavigation = parent;
    const revision = ++this.navigationRevision;
    const retired = this.trackRetirement(this.retireStack(navigation, false, true));
    return Promise.resolve(retired).then(() => {
      if (revision === this.navigationRevision && this.activeNavigation === parent &&
          navigation.definition.restoreFocus) {
        this.ui.restoreFocus?.(navigation.focusTarget);
      }
      return true;
    });
  }

  /** @param {void | Promise<void> | null} retirement */
  trackRetirement(retirement) {
    if (!retirement || typeof retirement.then !== "function") return retirement;
    const tracked = Promise.resolve(retirement).finally(() => {
      if (this.pendingRetirement === tracked) this.pendingRetirement = null;
    });
    this.pendingRetirement = tracked;
    return tracked;
  }

  /**
   * Retire an active route and every preserved route below it. Lifecycle state
   * changes happen synchronously; asynchronous cleanup is serialized before a
   * replacement route activates.
   *
   * @param {ActiveNavigation} navigation
   * @param {boolean} restoreFocus
   * @param {boolean} deactivate
   * @returns {void | Promise<void>}
  */
  retireStack(navigation, restoreFocus, deactivate) {
    /** @type {ActiveNavigation[]} */
    const stack = [];
    for (let current = /** @type {ActiveNavigation | null} */ (navigation); current; ) {
      stack.push(current);
      const parent = current.parentNavigation;
      current.parentNavigation = null;
      current = parent;
    }

    for (const current of stack) {
      current.controller.abort();
      if (this.activeNavigation === current) this.activeNavigation = null;
      const disposed = this.publish(current.entry, {
        error: null,
        status: UiRouteStatus.DISPOSED,
      });
      this.ui.disposed?.(disposed);
    }

    /** @type {(index: number) => void | Promise<void>} */
    const runCleanup = (index) => {
      if (!deactivate || index >= stack.length) return undefined;
      const cleanup = this.cleanup(stack[index]);
      return cleanup && typeof cleanup.then === "function"
        ? cleanup.then(() => runCleanup(index + 1))
        : runCleanup(index + 1);
    };
    const cleanup = runCleanup(0);
    const restore = () => {
      if (restoreFocus && navigation.definition.restoreFocus) {
        this.ui.restoreFocus?.(navigation.focusTarget);
      }
    };
    if (cleanup && typeof cleanup.then === "function") return cleanup.then(restore);
    restore();
    return undefined;
  }

  /** @param {ActiveNavigation} navigation @returns {void | Promise<void>} */
  cleanup(navigation) {
    if (navigation.cleaned || navigation.instance == null) return undefined;
    navigation.cleaned = true;
    try {
      const cleanup = navigation.definition.deactivate?.(
        navigation.instance,
        navigation.activationRequest,
      );
      if (cleanup && typeof cleanup.then === "function") {
        return Promise.resolve(cleanup).catch((error) => {
          this.ui.reportCleanupError?.(navigation.routeId, error);
        });
      }
    } catch (error) {
      this.ui.reportCleanupError?.(navigation.routeId, error);
    }
    return undefined;
  }
}
