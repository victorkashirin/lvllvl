import { UiRouteId } from "../application/uiRouteService.mjs";

const legacyModes = Object.freeze([
  [UiRouteId.START, "start", "Start page"],
  [UiRouteId.EDITOR_2D, "2d", "2D editor"],
  [UiRouteId.EDITOR_3D, "3d", "3D editor"],
  [UiRouteId.COLOR_PALETTE, "color palette", "Color palette editor"],
  [UiRouteId.TILE_SET, "tile set", "Tile set editor"],
  [UiRouteId.SCRIPT, "script", "Script editor"],
  [UiRouteId.JSON, "json", "JSON editor"],
  [UiRouteId.TEXT, "text", "Text editor"],
  [UiRouteId.HEX, "hex", "Hex editor"],
  [UiRouteId.MUSIC, "music", "Music editor"],
  [UiRouteId.ASSEMBLER, "assembler", "Assembler"],
  [UiRouteId.C64, "c64", "C64 debugger"],
  [UiRouteId.NES, "nes", "NES debugger"],
  [UiRouteId.X16, "x16", "Commander X16 debugger"],
  [UiRouteId.NONE, "none", "No editor"],
]);

/**
 * Register every legacy editor mode behind a stable route identifier. The
 * aliases keep existing callers synchronous while they migrate independently.
 *
 * @param {{ register: (id: string, definition: import("../application/uiRouteService.mjs").UiRouteDefinition, options?: { aliases?: string[] }) => unknown }} routes
 * @param {(mode: string) => void} applyMode
 */
export function registerLegacyModeRoutes(routes, applyMode) {
  if (!routes || typeof routes.register !== "function" || typeof applyMode !== "function") {
    throw new TypeError("Legacy mode routes require a route service and mode adapter");
  }

  for (const [id, mode, label] of legacyModes) {
    routes.register(id, {
      label,
      showLoading: false,
      activate() {
        applyMode(mode);
        return Object.freeze({ mode });
      },
    }, { aliases: [mode] });
  }
}

/**
 * @typedef {object} ImageImportRouteInstance
 * @property {(parameters?: unknown) => unknown | Promise<unknown>} start
 * @property {boolean} [visible]
 * @property {(() => void) | null} [routeClosed]
 * @property {() => void | Promise<void>} [close]
 */

/**
 * @template Context
 * @param {{
 *   activate: (context: Context) => Promise<ImageImportRouteInstance>,
 * }} feature
 * @param {() => Context} getDefaultContext
 * @returns {import("../application/uiRouteService.mjs").UiRouteDefinition}
 */
export function createImageImportRoute(feature, getDefaultContext) {
  if (!feature || typeof feature.activate !== "function" ||
      typeof getDefaultContext !== "function") {
    throw new TypeError("The image-import route requires a feature handle and context provider");
  }

  /** @type {WeakMap<object, { closeRoute: () => void }>} */
  const importerOwners = new WeakMap();
  /** @type {WeakMap<object, { closeRoute: () => void }>} */
  const activationOwners = new WeakMap();

  /**
   * Release an importer only when the navigation being retired still owns it.
   * A context-scoped importer can be reacquired before a stale async activation
   * settles, so stale cleanup must not close the newer navigation's UI.
   *
   * @param {ImageImportRouteInstance} importer
   * @param {object} request
   */
  function releaseImporter(importer, request) {
    const owner = activationOwners.get(request);
    activationOwners.delete(request);
    if (!owner || importerOwners.get(/** @type {object} */ (importer)) !== owner) {
      return undefined;
    }
    importerOwners.delete(/** @type {object} */ (importer));
    if (importer.routeClosed === owner.closeRoute) importer.routeClosed = null;
    return importer.close?.();
  }

  return {
    label: "image import",
    focusSelector: "#importImageChooseFile, #importImageMobileChooseFile",
    overlay: true,
    reuseOnRepeat: true,
    restoreFocus: true,
    errorMessage() {
      return "Could not load image import. Check your connection and try again.";
    },
    async activate(request) {
      const context = request.context == null
        ? getDefaultContext()
        : /** @type {Context} */ (request.context);
      if (context == null) throw new Error("Image import requires an editor context");
      const importer = await feature.activate(context);
      // Feature instances are context-scoped and may already belong to a newer
      // navigation. An aborted request has not opened UI, so it must not return
      // that shared instance for stale-navigation cleanup.
      if (request.signal.aborted) return null;
      const owner = {
        closeRoute: () => { void request.close(); },
      };
      importerOwners.set(/** @type {object} */ (importer), owner);
      activationOwners.set(/** @type {object} */ (request), owner);
      importer.routeClosed = owner.closeRoute;
      try {
        const opened = await importer.start(request.parameters);
        if (opened === false) {
          throw new Error("Image import is unavailable for the selected layer");
        }
        return importer;
      } catch (error) {
        await releaseImporter(importer, /** @type {object} */ (request));
        throw error;
      }
    },
    deactivate(instance, request) {
      const importer = /** @type {ImageImportRouteInstance} */ (instance);
      return releaseImporter(importer, /** @type {object} */ (request));
    },
  };
}

/**
 * DOM and focus behavior intentionally remains in this UI adapter rather than
 * in the application route service or feature definitions.
 *
 * @param {{
 *   document: Document,
 *   schedule?: (callback: () => void) => void,
 *   logError?: (message: string, error: unknown) => void,
 * }} dependencies
 * @returns {import("../application/uiRouteService.mjs").UiRouteAdapter}
 */
export function createLegacyUiRouteAdapter({
  document,
  schedule = (callback) => { callback(); },
  logError = () => {},
}) {
  if (!document || typeof document.createElement !== "function") {
    throw new TypeError("The UI route adapter requires a document");
  }

  function removeStatus() {
    document.getElementById("featureLoadStatus")?.remove();
  }

  function removeError() {
    document.getElementById("featureLoadError")?.remove();
  }

  let focusRevision = 0;

  /** @param {string} text */
  function statusElement(text) {
    removeStatus();
    const status = document.createElement("div");
    status.id = "featureLoadStatus";
    status.setAttribute("role", "status");
    status.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;" +
      "z-index:100000;padding:12px;background:#333;color:#fff;border-radius:3px";
    status.textContent = text;
    document.body.appendChild(status);
  }

  return {
    captureFocus() {
      const active = document.activeElement;
      return active && typeof /** @type {HTMLElement} */ (active).focus === "function"
        ? active
        : null;
    },
    loading(route) {
      focusRevision++;
      removeError();
      const verb = route.status === "retrying" ? "Retrying" : "Loading";
      statusElement(`${verb} ${route.label}…`);
    },
    ready(route) {
      const revision = ++focusRevision;
      removeStatus();
      removeError();
      if (!route.focusSelector) return;
      const focusVisibleTarget = (attempt = 0) => {
        if (revision !== focusRevision) return;
        const targets = document.querySelectorAll(route.focusSelector ?? "");
        const target = Array.from(targets).find((candidate) => {
          const element = /** @type {HTMLElement} */ (candidate);
          return typeof element.focus === "function" &&
            (element.offsetParent !== null || element.getClientRects().length > 0);
        });
        if (target) {
          /** @type {HTMLElement} */ (target).focus();
        } else if (attempt < 20) {
          schedule(() => focusVisibleTarget(attempt + 1));
        }
      };
      schedule(() => focusVisibleTarget());
    },
    failed(route) {
      focusRevision++;
      removeStatus();
      removeError();
      const error = document.createElement("div");
      error.id = "featureLoadError";
      error.setAttribute("role", "alert");
      error.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;" +
        "z-index:100000;padding:12px;background:#8b1e1e;color:#fff;border-radius:3px";

      const message = document.createElement("span");
      message.className = "feature-load-error-message";
      message.textContent = route.message;
      error.appendChild(message);

      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "ui-button ui-button-primary feature-load-retry";
      retry.style.marginLeft = "12px";
      retry.textContent = "Retry";
      retry.addEventListener("click", route.retry, { once: true });
      error.appendChild(retry);
      document.body.appendChild(error);
      retry.focus();
    },
    disposed() {
      focusRevision++;
      removeStatus();
      removeError();
    },
    restoreFocus(target) {
      if (target && /** @type {Node} */ (target).isConnected &&
          typeof /** @type {HTMLElement} */ (target).focus === "function") {
        /** @type {HTMLElement} */ (target).focus();
      }
    },
    reportCleanupError(routeId, error) {
      logError(`Could not clean up UI route ${routeId}`, error);
    },
  };
}
