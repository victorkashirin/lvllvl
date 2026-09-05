import {
  RemoteProviderError,
  RemoteProviderErrorCode,
} from "../application/remoteProviderService.mjs";

/** @typedef {import("../application/remoteProviderService.mjs").RemoteProviderPort} RemoteProviderPort */

/**
 * A credential-free production adapter used until a reviewed server-side OAuth
 * or provider-app implementation is available.
 *
 * @param {{id: string, capabilities: readonly string[], reason: string}} options
 * @returns {RemoteProviderPort}
 */
export function createDisabledRemoteProviderAdapter({ id, capabilities, reason }) {
  if (!id || !Array.isArray(capabilities) || !reason) {
    throw new TypeError("Disabled providers require an id, capabilities, and reason");
  }
  const unavailable = () => Promise.reject(new RemoteProviderError(
    RemoteProviderErrorCode.DISABLED,
    reason,
    { providerId: id },
  ));
  const session = Object.freeze({
    accountLabel: null,
    capabilities: Object.freeze([...capabilities]),
    providerId: id,
    reason,
    status: /** @type {const} */ ("disabled"),
  });

  return Object.freeze({
    capabilities: session.capabilities,
    enabled: false,
    getSession: () => session,
    id,
    list: unavailable,
    load: unavailable,
    publish: unavailable,
    save: unavailable,
    signIn: unavailable,
    signOut: unavailable,
  });
}
