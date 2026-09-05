import {
  RemoteProviderId,
} from "../application/remoteProviderService.mjs";
import { parseGitHubRepositoryAddress } from "../domain/githubRepositoryAddress.mjs";

/** @typedef {import("../application/remoteProviderService.mjs").RemoteProviderService} RemoteProviderService */

/**
 * Keep dormant callback-era callers safe while provider UI is removed from the
 * production graph. Every attempted operation still crosses the application
 * service and receives the same normalized disabled error.
 *
 * @param {{remoteProviders: RemoteProviderService, reportError: (providerId: string, error: unknown) => void}} dependencies
 */
export function createLegacyRemoteProviderFacades({ remoteProviders, reportError }) {
  const operations = /** @type {const} */ (
    ["signIn", "signOut", "list", "load", "save", "publish"]
  );
  if (
    !remoteProviders ||
    operations.some((operation) => typeof remoteProviders[operation] !== "function") ||
    typeof reportError !== "function"
  ) {
    throw new TypeError("Legacy provider facades require the provider service and error reporter");
  }

  /** @param {unknown} value @returns {import("../application/remoteProviderService.mjs").RemoteProviderRequest} */
  function toProviderRequest(value) {
    if (value === undefined) return {};
    const prototype = value !== null && typeof value === "object"
      ? Object.getPrototypeOf(value)
      : null;
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      (prototype !== Object.prototype && prototype !== null)
    ) {
      return { content: value };
    }
    const source = /** @type {Record<string, any>} */ (value);
    const content = { ...source };
    /** @type {import("../application/remoteProviderService.mjs").RemoteProviderRequest} */
    const request = { content };
    if (source.signal !== undefined) {
      request.signal = source.signal;
      delete content.signal;
    }
    if (source.onProgress !== undefined) {
      request.onProgress = source.onProgress;
      delete content.onProgress;
    }
    if (source.capabilities !== undefined) {
      request.capabilities = source.capabilities;
      delete content.capabilities;
    }
    // Callback-era control flow stays in this compatibility adapter; it must
    // never become provider request content.
    delete content.callback;
    return request;
  }

  /**
   * @param {string} providerId
   * @param {"signIn" | "signOut" | "list" | "load" | "save" | "publish"} operation
   * @param {object=} request
   * @param {((result: any) => void)=} callback
   * @param {any=} failureResult
   */
  function unavailable(providerId, operation, request = {}, callback, failureResult) {
    remoteProviders[operation](providerId, toProviderRequest(request)).catch((error) => {
      reportError(providerId, error);
      callback?.(failureResult ?? {
        error,
        message: error instanceof Error ? error.message : "Remote provider unavailable",
        success: false,
      });
    });
  }

  /** @type {Map<string, (result?: any) => void>} */
  const githubListeners = new Map();
  /** @type {any} */
  const githubClient = {
    createGist(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GIST, "publish", args, callback);
    },
    createRepo(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GITHUB, "publish", args, callback);
    },
    getGist(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GIST, "load", args, callback);
    },
    getLoginName() { return ""; },
    getRepoDetails(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GITHUB, "list", args, callback);
    },
    getScopes() { return []; },
    hasScope() { return false; },
    isLoggedIn() { return false; },
    load(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GITHUB, "load", args, callback);
    },
    login(/** @type {any} */ callback) {
      unavailable(RemoteProviderId.GITHUB, "signIn");
    },
    loginWithRedirect(/** @type {any} */ callback) {
      unavailable(RemoteProviderId.GITHUB, "signIn");
    },
    logout() {
      unavailable(RemoteProviderId.GITHUB, "signOut", {}, githubListeners.get("logout"));
    },
    on(/** @type {any} */ eventName, /** @type {any} */ callback) {
      if (typeof callback === "function") githubListeners.set(eventName, callback);
    },
    pull(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(
        RemoteProviderId.GITHUB,
        "load",
        args,
        callback,
        { filesToPull: [], message: "GitHub is disabled.", success: false },
      );
    },
    requestScope(/** @type {any} */ scope, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GITHUB, "signIn", { capabilities: [scope] });
    },
    save(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GITHUB, "save", args, callback);
    },
    setRepositoryFolder() {},
    setUser(/** @type {any} */ user, /** @type {any} */ callback) { callback?.(); },
  };
  Object.freeze(githubClient);

  /** @type {string | null} */
  let repositoryOwner = null;
  /** @type {string | null} */
  let repositoryName = null;
  /** @type {any} */
  const github = {
    doCheckForUpdatedFiles(/** @type {any} */ callback) {
      unavailable(
        RemoteProviderId.GITHUB,
        "list",
        { owner: repositoryOwner, repository: repositoryName },
        () => callback?.(),
      );
    },
    doPull(/** @type {any} */ callback) {
      unavailable(
        RemoteProviderId.GITHUB,
        "load",
        { owner: repositoryOwner, repository: repositoryName },
        callback,
      );
    },
    load(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GITHUB, "load", args, callback);
    },
    loadRepository(/** @type {any} */ args) {
      unavailable(RemoteProviderId.GITHUB, "load", args, args?.callback);
    },
    openRepository(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GITHUB, "load", args, callback);
    },
    parseRepositoryAddress: parseGitHubRepositoryAddress,
    save() {
      unavailable(RemoteProviderId.GITHUB, "save");
    },
    setRepositoryDetails(/** @type {any} */ owner, /** @type {any} */ repository) {
      repositoryOwner = owner || null;
      repositoryName = repository || null;
    },
    showLoadFromRepositoryDialog() {
      unavailable(RemoteProviderId.GITHUB, "load");
    },
  };
  Object.freeze(github);

  /** @type {any} */
  const gist = {
    loadFromGist(/** @type {any} */ args) {
      unavailable(RemoteProviderId.GIST, "load", args);
    },
    share(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GIST, "publish", args, callback);
    },
    startShare() {
      unavailable(RemoteProviderId.GIST, "publish");
    },
  };
  Object.freeze(gist);

  /** @type {any} */
  const googleDrive = {
    checkIsSignedIn() { return false; },
    handleAuthClick(/** @type {any} */ callback) {
      unavailable(RemoteProviderId.GOOGLE_DRIVE, "signIn");
    },
    handleClientLoad() {},
    handleSignoutClick() {
      unavailable(RemoteProviderId.GOOGLE_DRIVE, "signOut");
    },
    init() {},
    listProjects(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GOOGLE_DRIVE, "list", args, callback, []);
    },
    openProject(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GOOGLE_DRIVE, "load", args, callback);
    },
    saveProject(/** @type {any} */ args, /** @type {any} */ callback) {
      unavailable(RemoteProviderId.GOOGLE_DRIVE, "save", args, callback);
    },
    uploadToAppFolder(
      /** @type {any} */ content,
      /** @type {any} */ filename,
      /** @type {any} */ callbacks = {},
    ) {
      unavailable(
        RemoteProviderId.GOOGLE_DRIVE,
        "save",
        { content, filename },
        callbacks.error,
      );
    },
  };
  Object.freeze(googleDrive);

  return Object.freeze({ gist, github, githubClient, googleDrive });
}
