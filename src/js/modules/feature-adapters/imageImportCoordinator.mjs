/**
 * Coordinate the application's one asynchronous overlay without routing every
 * synchronous editor mode through a general navigation framework.
 *
 * @param {{
 *   feature: { activate: (context: any) => Promise<any> },
 *   getContext: () => any,
 *   document: Document,
 *   schedule?: (callback: () => void) => void,
 *   logError?: (message: string, error: unknown) => void,
 * }} dependencies
 */
export function createImageImportCoordinator({
  feature,
  getContext,
  document,
  schedule = (callback) => { callback(); },
  logError = () => {},
}) {
  if (!feature || typeof feature.activate !== "function" ||
      typeof getContext !== "function" || !document?.createElement) {
    throw new TypeError("Image import requires a feature, context, and document");
  }

  /** @type {any | null} */
  let activeImporter = null;
  /** @type {Promise<boolean> | null} */
  let closingPromise = null;
  let focusRevision = 0;
  /** @type {HTMLElement | null} */
  let focusTarget = null;
  /** @type {Promise<any> | null} */
  let openPromise = null;
  let revision = 0;
  let status = "disposed";

  function removeStatus() {
    document.getElementById("featureLoadStatus")?.remove();
  }

  function removeError() {
    document.getElementById("featureLoadError")?.remove();
  }

  function clearMessages() {
    focusRevision++;
    removeStatus();
    removeError();
  }

  function showLoading() {
    clearMessages();
    const message = document.createElement("div");
    message.id = "featureLoadStatus";
    message.setAttribute("role", "status");
    message.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;" +
      "z-index:100000;padding:12px;background:#333;color:#fff;border-radius:3px";
    message.textContent = "Loading image import…";
    document.body.appendChild(message);
  }

  function focusChooser() {
    const currentRevision = ++focusRevision;
    const tryFocus = (attempt = 0) => {
      if (currentRevision !== focusRevision || status !== "ready") return;
      const selectors = "#importImageChooseFile, #importImageMobileChooseFile";
      const candidates = /** @type {NodeListOf<HTMLElement>} */ (
        document.querySelectorAll(selectors)
      );
      const target = Array.from(candidates).find((candidate) =>
        typeof candidate.focus === "function" &&
        (candidate.offsetParent !== null || candidate.getClientRects().length > 0));
      if (target) target.focus();
      else if (attempt < 20) schedule(() => tryFocus(attempt + 1));
    };
    schedule(() => tryFocus());
  }

  function restoreFocus() {
    const target = focusTarget;
    focusTarget = null;
    if (target?.isConnected && typeof target.focus === "function") target.focus();
  }

  /** @param {unknown} parameters */
  function showError(parameters) {
    clearMessages();
    const error = document.createElement("div");
    error.id = "featureLoadError";
    error.setAttribute("role", "alert");
    error.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;" +
      "z-index:100000;padding:12px;background:#8b1e1e;color:#fff;border-radius:3px";

    const message = document.createElement("span");
    message.className = "feature-load-error-message";
    message.textContent = "Could not load image import. Check your connection and try again.";
    error.appendChild(message);

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "ui-button ui-button-primary feature-load-retry";
    retry.style.marginLeft = "12px";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => { void open(parameters); }, { once: true });
    error.appendChild(retry);
    document.body.appendChild(error);
    retry.focus();
  }

  /** @param {any} importer */
  function handleUiClosed(importer) {
    if (activeImporter !== importer) return;
    revision++;
    activeImporter = null;
    status = "disposed";
    clearMessages();
    restoreFocus();
  }

  /** @param {unknown} [parameters] */
  function open(parameters) {
    if (openPromise) return openPromise;
    const activationRevision = ++revision;
    const pendingClose = closingPromise;
    /** @type {any | null} */
    let openingImporter = null;
    let openingImporterReleased = false;

    async function releaseOpeningImporter() {
      if (!openingImporter || openingImporterReleased) return;
      openingImporterReleased = true;
      openingImporter.closeCallback = null;
      if (activeImporter === openingImporter) activeImporter = null;
      await openingImporter.close?.();
    }

    if (!activeImporter && !focusTarget) {
      const target = /** @type {HTMLElement | null} */ (document.activeElement);
      focusTarget = target && typeof target.focus === "function" ? target : null;
    }
    status = "loading";
    showLoading();

    /** @type {Promise<any>} */
    let opening;
    opening = Promise.resolve()
      .then(async () => {
        if (pendingClose) await pendingClose;
        if (activationRevision !== revision) return null;
        const context = getContext();
        if (!context) throw new Error("Image import requires an editor context");
        const importer = await feature.activate(context);
        openingImporter = importer;
        if (activationRevision !== revision) {
          await releaseOpeningImporter();
          return null;
        }
        activeImporter = importer;
        importer.closeCallback = () => handleUiClosed(importer);
        const opened = await importer.start(parameters);
        if (opened === false) {
          throw new Error("Image import is unavailable for the selected layer");
        }
        if (activationRevision !== revision) {
          await releaseOpeningImporter();
          return null;
        }
        status = "ready";
        clearMessages();
        focusChooser();
        return importer;
      })
      .catch(async (error) => {
        try {
          await releaseOpeningImporter();
        } catch (closeError) {
          logError("Could not close failed image import", closeError);
        }
        if (activationRevision === revision) {
          status = "failed";
          showError(parameters);
        }
        logError("Could not load image import", error);
        return null;
      })
      .finally(() => {
        if (openPromise === opening) openPromise = null;
      });
    openPromise = opening;
    return opening;
  }

  function close() {
    if (closingPromise) return closingPromise;
    const pendingOpen = openPromise;
    revision++;
    status = "disposed";
    clearMessages();

    /** @type {Promise<boolean>} */
    let closing;
    closing = Promise.resolve()
      .then(async () => {
        if (pendingOpen) await pendingOpen;
        const importer = activeImporter;
        activeImporter = null;
        if (importer) {
          importer.closeCallback = null;
          await importer.close?.();
        }
        restoreFocus();
        return Boolean(importer);
      })
      .catch((error) => {
        logError("Could not close image import", error);
        restoreFocus();
        return false;
      })
      .finally(() => {
        if (closingPromise === closing) closingPromise = null;
      });
    closingPromise = closing;
    return closing;
  }

  return Object.freeze({
    close,
    getActive: () => activeImporter,
    getStatus: () => status,
    isActive: () => status !== "disposed",
    isOpen: () => status === "ready" || status === "loading",
    open,
  });
}
