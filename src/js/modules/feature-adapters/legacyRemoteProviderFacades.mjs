export const disabledRemoteProviderReason =
  "Remote providers are disabled until credential handling moves to a reviewed server-side flow.";

const providerIds = Object.freeze(["github", "gist", "google-drive"]);

/** @param {string} providerId */
function disabledError(providerId) {
  const error = /** @type {Error & { providerId: string }} */ (
    new Error(disabledRemoteProviderReason)
  );
  error.name = "RemoteProviderDisabledError";
  error.providerId = providerId;
  return error;
}

/**
 * Keep the few dormant callback-era references deterministic while the provider
 * code, credentials, SDKs, controls, and network origins remain absent.
 *
 * @param {{ reportError: (providerId: string, error: Error) => void }} dependencies
 */
export function createDisabledRemoteProviders({ reportError }) {
  if (typeof reportError !== "function") {
    throw new TypeError("Disabled remote providers require an error reporter");
  }

  /**
   * @param {string} providerId
   * @param {((result: any) => void)=} callback
   * @param {any=} failureResult
   */
  function unavailable(providerId, callback, failureResult) {
    const error = disabledError(providerId);
    Promise.resolve().then(() => {
      reportError(providerId, error);
      callback?.(failureResult ?? { error, message: error.message, success: false });
    });
    return false;
  }

  /** @param {string} providerId @param {any=} failureResult */
  function failWithCallback(providerId, failureResult) {
    return (/** @type {any[]} */ ...args) => {
      /** @type {((result: any) => void) | undefined} */
      let callback;
      for (let index = args.length - 1; index >= 0; index--) {
        if (typeof args[index] === "function") {
          callback = args[index];
          break;
        }
      }
      return unavailable(providerId, callback, failureResult);
    };
  }

  const policy = Object.freeze({
    getSession(/** @type {string} */ providerId) {
      if (!providerIds.includes(providerId)) throw new Error(`Unknown remote provider: ${providerId}`);
      return Object.freeze({
        accountLabel: null,
        capabilities: Object.freeze([]),
        providerId,
        reason: disabledRemoteProviderReason,
        status: "disabled",
      });
    },
    isEnabled() { return false; },
  });

  const githubClient = Object.freeze({
    createGist: failWithCallback("gist"),
    createRepo: failWithCallback("github"),
    getGist: failWithCallback("gist"),
    getLoginName() { return ""; },
    getRepoDetails: failWithCallback("github"),
    getScopes() { return []; },
    hasScope() { return false; },
    isLoggedIn() { return false; },
    load: failWithCallback("github"),
    login() { return unavailable("github"); },
    loginWithRedirect() { return unavailable("github"); },
    logout() { return unavailable("github"); },
    on() {},
    pull: failWithCallback("github", {
      filesToPull: [],
      message: disabledRemoteProviderReason,
      success: false,
    }),
    requestScope() { return unavailable("github"); },
    save: failWithCallback("github"),
    setRepositoryFolder() {},
    setUser() {},
  });

  const github = Object.freeze({
    doCheckForUpdatedFiles: failWithCallback("github"),
    doPull: failWithCallback("github"),
    load: failWithCallback("github"),
    loadRepository(/** @type {any} */ args) { return unavailable("github", args?.callback); },
    openRepository: failWithCallback("github"),
    save: failWithCallback("github"),
    setRepositoryDetails() {},
    showLoadFromRepositoryDialog() { return unavailable("github"); },
  });

  const gist = Object.freeze({
    loadFromGist(/** @type {any} */ args) { return unavailable("gist", args?.callback); },
    share: failWithCallback("gist"),
    startShare: failWithCallback("gist"),
  });

  const googleDrive = Object.freeze({
    checkIsSignedIn() { return false; },
    handleAuthClick() { return unavailable("google-drive"); },
    handleClientLoad() {},
    handleSignoutClick() { return unavailable("google-drive"); },
    init() {},
    listProjects: failWithCallback("google-drive", []),
    openProject: failWithCallback("google-drive"),
    saveProject: failWithCallback("google-drive"),
    uploadToAppFolder(
      /** @type {any} */ _content,
      /** @type {string} */ _filename,
      /** @type {any} */ callbacks = {},
    ) {
      return unavailable("google-drive", callbacks.error);
    },
  });

  return Object.freeze({
    facades: Object.freeze({ gist, github, githubClient, googleDrive }),
    policy,
  });
}
