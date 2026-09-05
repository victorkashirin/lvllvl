export const RemoteProviderId = Object.freeze({
  GITHUB: "github",
  GIST: "gist",
  GOOGLE_DRIVE: "google-drive",
});

export const RemoteProviderCapability = Object.freeze({
  IDENTITY: "identity",
  LIST: "list",
  LOAD: "load",
  SAVE: "save",
  PUBLISH: "publish",
});

export const RemoteProviderErrorCode = Object.freeze({
  AUTHENTICATION_REQUIRED: "authentication-required",
  CANCELLED: "cancelled",
  DISABLED: "provider-disabled",
  INVALID_REQUEST: "invalid-request",
  OFFLINE: "offline",
  PROVIDER_ERROR: "provider-error",
  RATE_LIMITED: "rate-limited",
  UNSUPPORTED: "unsupported-operation",
});

const operationCapabilities = Object.freeze({
  signIn: RemoteProviderCapability.IDENTITY,
  signOut: RemoteProviderCapability.IDENTITY,
  list: RemoteProviderCapability.LIST,
  load: RemoteProviderCapability.LOAD,
  save: RemoteProviderCapability.SAVE,
  publish: RemoteProviderCapability.PUBLISH,
});

const requestFields = new Set(["capabilities", "content", "onProgress", "signal"]);
/** @type {WeakMap<RemoteProviderService, Map<string, RemoteProviderPort>>} */
const registeredProviders = new WeakMap();
const sessionFields = new Set([
  "accountLabel",
  "capabilities",
  "providerId",
  "reason",
  "status",
]);
const sessionStatuses = new Set(["disabled", "signed-out", "signed-in"]);
/** @type {Readonly<Record<string, string>>} */
const providerErrorMessages = Object.freeze({
  [RemoteProviderErrorCode.AUTHENTICATION_REQUIRED]:
    "Authentication is required for this remote provider operation.",
  [RemoteProviderErrorCode.CANCELLED]: "The remote operation was cancelled.",
  [RemoteProviderErrorCode.DISABLED]: "This remote provider is disabled.",
  [RemoteProviderErrorCode.INVALID_REQUEST]: "The remote provider rejected the request.",
  [RemoteProviderErrorCode.OFFLINE]: "The remote operation is unavailable while offline.",
  [RemoteProviderErrorCode.PROVIDER_ERROR]: "The remote provider request failed.",
  [RemoteProviderErrorCode.RATE_LIMITED]: "The remote provider rate limit was reached.",
  [RemoteProviderErrorCode.UNSUPPORTED]: "The remote provider operation is unsupported.",
});

/**
 * @typedef {object} RemoteProviderSession
 * @property {string} providerId
 * @property {"disabled" | "signed-out" | "signed-in"} status
 * @property {string | null} accountLabel
 * @property {readonly string[]} capabilities
 * @property {string | null} reason
 */

/**
 * Provider ports accept application-owned requests. Session and error output is
 * normalized by the service; a reviewed application result contract is required
 * before any live provider adapter can be registered. OAuth credentials remain
 * inside a future server-side infrastructure adapter.
 *
 * @typedef {object} RemoteProviderPort
 * @property {string} id
 * @property {boolean} enabled
 * @property {readonly string[]} capabilities
 * @property {() => RemoteProviderSession} getSession
 * @property {(request: RemoteProviderRequest) => Promise<unknown>} signIn
 * @property {(request: RemoteProviderRequest) => Promise<unknown>} signOut
 * @property {(request: RemoteProviderRequest) => Promise<unknown>} list
 * @property {(request: RemoteProviderRequest) => Promise<unknown>} load
 * @property {(request: RemoteProviderRequest) => Promise<unknown>} save
 * @property {(request: RemoteProviderRequest) => Promise<unknown>} publish
 */

/**
 * @typedef {object} RemoteProviderRequest
 * @property {{aborted: boolean}=} signal
 * @property {((progress: {completed?: number, message?: string, total?: number}) => void)=} onProgress
 * @property {unknown=} content
 * @property {readonly string[]=} capabilities
 */

export class RemoteProviderError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{providerId?: string, operation?: string, retryAfterSeconds?: number | null}=} details
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RemoteProviderError";
    this.code = code;
    this.providerId = details.providerId ?? "";
    this.operation = details.operation ?? "";
    this.retryAfterSeconds = details.retryAfterSeconds ?? null;
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object";
}

/** @param {unknown} request @param {string} providerId @param {string} operation */
function assertValidRequestEnvelope(request, providerId, operation) {
  const prototype = isRecord(request) ? Object.getPrototypeOf(request) : null;
  if (!isRecord(request) || (prototype !== Object.prototype && prototype !== null)) {
    throw new RemoteProviderError(
      RemoteProviderErrorCode.INVALID_REQUEST,
      "Remote provider requests must use the application request envelope.",
      { operation, providerId },
    );
  }

  const unsupportedField = Object.keys(request).find((key) => !requestFields.has(key));
  if (unsupportedField) {
    throw new RemoteProviderError(
      RemoteProviderErrorCode.INVALID_REQUEST,
      `Unsupported remote provider request field: ${unsupportedField}`,
      { operation, providerId },
    );
  }
  if (
    request.signal !== undefined &&
    (!isRecord(request.signal) || typeof request.signal.aborted !== "boolean")
  ) {
    throw new RemoteProviderError(
      RemoteProviderErrorCode.INVALID_REQUEST,
      "Remote provider cancellation signals must expose an aborted boolean.",
      { operation, providerId },
    );
  }
  if (request.onProgress !== undefined && typeof request.onProgress !== "function") {
    throw new RemoteProviderError(
      RemoteProviderErrorCode.INVALID_REQUEST,
      "Remote provider progress handlers must be functions.",
      { operation, providerId },
    );
  }
  if (
    request.capabilities !== undefined &&
    (!Array.isArray(request.capabilities) ||
      request.capabilities.some((capability) => typeof capability !== "string"))
  ) {
    throw new RemoteProviderError(
      RemoteProviderErrorCode.INVALID_REQUEST,
      "Requested provider capabilities must be a list of identifiers.",
      { operation, providerId },
    );
  }
}

/**
 * Session state is application-owned metadata. Reject an adapter contract
 * violation instead of allowing provider responses or credentials to leak into
 * application code through a session object.
 *
 * @param {RemoteProviderPort} provider
 * @returns {RemoteProviderSession}
 */
function getValidatedSession(provider) {
  try {
    const session = provider.getSession();
    const prototype = isRecord(session) ? Object.getPrototypeOf(session) : null;
    const unsupportedField = isRecord(session)
      ? Object.keys(session).find((key) => !sessionFields.has(key))
      : null;
    const validCapabilities = isRecord(session) && Array.isArray(session.capabilities) &&
      session.capabilities.every((capability) =>
        typeof capability === "string" && provider.capabilities.includes(capability));
    if (
      !isRecord(session) ||
      (prototype !== Object.prototype && prototype !== null) ||
      unsupportedField ||
      session.providerId !== provider.id ||
      !sessionStatuses.has(session.status) ||
      (session.accountLabel !== null && typeof session.accountLabel !== "string") ||
      (session.reason !== null && typeof session.reason !== "string") ||
      !validCapabilities
    ) {
      throw new TypeError("Invalid provider session");
    }

    return Object.freeze({
      accountLabel: session.accountLabel,
      capabilities: Object.freeze([...session.capabilities]),
      providerId: session.providerId,
      reason: session.reason,
      status: session.status,
    });
  } catch {
    throw new RemoteProviderError(
      RemoteProviderErrorCode.PROVIDER_ERROR,
      "The remote provider returned invalid session state.",
      { providerId: provider.id },
    );
  }
}

/**
 * @param {unknown} error
 * @param {string} providerId
 * @param {string} operation
 * @param {{aborted: boolean}=} signal
 */
function normalizeProviderError(error, providerId, operation, signal) {
  if (error instanceof RemoteProviderError) {
    const code = Object.prototype.hasOwnProperty.call(providerErrorMessages, error.code)
      ? error.code
      : RemoteProviderErrorCode.PROVIDER_ERROR;
    const retryAfterSeconds = code === RemoteProviderErrorCode.RATE_LIMITED &&
      typeof error.retryAfterSeconds === "number" &&
      Number.isFinite(error.retryAfterSeconds) &&
      error.retryAfterSeconds >= 0
      ? error.retryAfterSeconds
      : null;
    return new RemoteProviderError(code, providerErrorMessages[code], {
      operation,
      providerId,
      retryAfterSeconds,
    });
  }
  if (signal?.aborted) {
    return new RemoteProviderError(
      RemoteProviderErrorCode.CANCELLED,
      providerErrorMessages[RemoteProviderErrorCode.CANCELLED],
      { operation, providerId },
    );
  }

  const details = isRecord(error) ? error : {};
  const status = typeof details.status === "number" ? details.status : 0;
  const code = typeof details.code === "string" ? details.code.toLowerCase() : "";
  if (status === 401 || code.includes("auth")) {
    return new RemoteProviderError(
      RemoteProviderErrorCode.AUTHENTICATION_REQUIRED,
      providerErrorMessages[RemoteProviderErrorCode.AUTHENTICATION_REQUIRED],
      { operation, providerId },
    );
  }
  if (status === 429 || code.includes("rate")) {
    const retryAfterSeconds = typeof details.retryAfterSeconds === "number" &&
      Number.isFinite(details.retryAfterSeconds) && details.retryAfterSeconds >= 0
      ? details.retryAfterSeconds
      : null;
    return new RemoteProviderError(
      RemoteProviderErrorCode.RATE_LIMITED,
      providerErrorMessages[RemoteProviderErrorCode.RATE_LIMITED],
      { operation, providerId, retryAfterSeconds },
    );
  }
  return new RemoteProviderError(
    RemoteProviderErrorCode.PROVIDER_ERROR,
    providerErrorMessages[RemoteProviderErrorCode.PROVIDER_ERROR],
    { operation, providerId },
  );
}

/**
 * @param {RemoteProviderService} service
 * @param {string} providerId
 * @returns {RemoteProviderPort}
 */
function getRegisteredProvider(service, providerId) {
  const provider = registeredProviders.get(service)?.get(providerId);
  if (!provider) {
    throw new RemoteProviderError(
      RemoteProviderErrorCode.UNSUPPORTED,
      `Unknown remote provider: ${providerId}`,
      { providerId },
    );
  }
  return provider;
}

export class RemoteProviderService {
  /** @param {{providers: readonly RemoteProviderPort[], isOnline?: () => boolean}} dependencies */
  constructor({ providers, isOnline = () => true }) {
    if (!Array.isArray(providers) || providers.length === 0) {
      throw new TypeError("RemoteProviderService requires provider ports");
    }
    if (typeof isOnline !== "function") {
      throw new TypeError("RemoteProviderService requires an online-state provider");
    }
    /** @type {Map<string, RemoteProviderPort>} */
    const providersById = new Map();
    for (const provider of providers) {
      if (typeof provider?.id !== "string" || !provider.id || providersById.has(provider.id)) {
        throw new TypeError("Remote provider identifiers must be present and unique");
      }
      if (
        typeof provider.enabled !== "boolean" ||
        !Array.isArray(provider.capabilities) ||
        provider.capabilities.some(
          (/** @type {unknown} */ capability) => typeof capability !== "string",
        ) ||
        new Set(provider.capabilities).size !== provider.capabilities.length ||
        typeof provider.getSession !== "function" ||
        Object.keys(operationCapabilities).some(
          (operation) => typeof provider[operation] !== "function",
        )
      ) {
        throw new TypeError(`Remote provider ${provider.id} does not implement the provider port`);
      }
      providersById.set(provider.id, provider);
    }
    registeredProviders.set(this, providersById);
    this.isOnline = isOnline;
  }

  /** @param {string} providerId */
  isEnabled(providerId) {
    return getRegisteredProvider(this, providerId).enabled;
  }

  /** @param {string} providerId */
  getSession(providerId) {
    return getValidatedSession(getRegisteredProvider(this, providerId));
  }

  /**
   * @param {string} providerId
   * @param {"signIn" | "signOut" | "list" | "load" | "save" | "publish"} operation
   * @param {RemoteProviderRequest} request
   */
  async run(providerId, operation, request = {}) {
    assertValidRequestEnvelope(request, providerId, operation);
    const requiredCapability = Object.prototype.hasOwnProperty.call(operationCapabilities, operation)
      ? operationCapabilities[operation]
      : null;
    if (!requiredCapability) {
      throw new RemoteProviderError(
        RemoteProviderErrorCode.UNSUPPORTED,
        `Unsupported remote provider operation: ${operation}`,
        { operation, providerId },
      );
    }
    if (request.signal?.aborted) {
      throw new RemoteProviderError(
        RemoteProviderErrorCode.CANCELLED,
        "The remote operation was cancelled.",
        { operation, providerId },
      );
    }

    const provider = getRegisteredProvider(this, providerId);
    if (!provider.enabled) {
      const session = getValidatedSession(provider);
      throw new RemoteProviderError(
        RemoteProviderErrorCode.DISABLED,
        session.reason ?? providerErrorMessages[RemoteProviderErrorCode.DISABLED],
        { operation, providerId },
      );
    }
    const requestedCapabilities = request.capabilities ?? [];
    if (!provider.capabilities.includes(requiredCapability)) {
      throw new RemoteProviderError(
        RemoteProviderErrorCode.UNSUPPORTED,
        `Provider ${providerId} does not support capability: ${requiredCapability}`,
        { operation, providerId },
      );
    }
    const unsupportedCapability = requestedCapabilities.find(
      (capability) => !provider.capabilities.includes(capability),
    );
    if (unsupportedCapability) {
      throw new RemoteProviderError(
        RemoteProviderErrorCode.UNSUPPORTED,
        `Provider ${providerId} does not support capability: ${unsupportedCapability}`,
        { operation, providerId },
      );
    }
    if (operation !== "signOut" && !this.isOnline()) {
      throw new RemoteProviderError(
        RemoteProviderErrorCode.OFFLINE,
        "The remote operation is unavailable while offline.",
        { operation, providerId },
      );
    }

    try {
      return await provider[operation](request);
    } catch (error) {
      throw normalizeProviderError(error, providerId, operation, request.signal);
    }
  }

  /** @param {string} providerId @param {RemoteProviderRequest=} request */
  signIn(providerId, request) { return this.run(providerId, "signIn", request); }
  /** @param {string} providerId @param {RemoteProviderRequest=} request */
  signOut(providerId, request) { return this.run(providerId, "signOut", request); }
  /** @param {string} providerId @param {RemoteProviderRequest=} request */
  list(providerId, request) { return this.run(providerId, "list", request); }
  /** @param {string} providerId @param {RemoteProviderRequest=} request */
  load(providerId, request) { return this.run(providerId, "load", request); }
  /** @param {string} providerId @param {RemoteProviderRequest=} request */
  save(providerId, request) { return this.run(providerId, "save", request); }
  /** @param {string} providerId @param {RemoteProviderRequest=} request */
  publish(providerId, request) { return this.run(providerId, "publish", request); }
}
