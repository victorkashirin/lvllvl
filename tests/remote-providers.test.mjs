import assert from "node:assert/strict";
import test from "node:test";

import {
  createDisabledRemoteProviders,
  disabledRemoteProviderReason,
} from "../src/js/modules/feature-adapters/legacyRemoteProviderFacades.mjs";

function createProviders() {
  const reports = [];
  const providers = createDisabledRemoteProviders({
    reportError(providerId, error) {
      reports.push({ error, providerId });
    },
  });
  return { ...providers, reports };
}

test("every remote provider is permanently disabled in the browser policy", () => {
  const { policy } = createProviders();
  for (const providerId of ["github", "gist", "google-drive"]) {
    assert.equal(policy.isEnabled(providerId), false);
    assert.deepEqual(policy.getSession(providerId), {
      accountLabel: null,
      capabilities: [],
      providerId,
      reason: disabledRemoteProviderReason,
      status: "disabled",
    });
  }
  assert.throws(() => policy.getSession("unknown"), /Unknown remote provider/);
});

test("disabled sign-in methods never run success callbacks", async () => {
  const { facades, reports } = createProviders();
  let callbacks = 0;
  assert.equal(facades.githubClient.login(() => { callbacks++; }), false);
  assert.equal(facades.googleDrive.handleAuthClick(() => { callbacks++; }), false);
  await Promise.resolve();
  assert.equal(callbacks, 0);
  assert.deepEqual(reports.map(({ providerId }) => providerId), ["github", "google-drive"]);
  assert.ok(reports.every(({ error }) => error.name === "RemoteProviderDisabledError"));
});

test("dormant load, pull, share, and save callers receive deterministic failures", async () => {
  const { facades, reports } = createProviders();
  const results = [];
  facades.githubClient.pull({}, (result) => results.push(result));
  facades.githubClient.load({}, (result) => results.push(result));
  facades.gist.share({}, (result) => results.push(result));
  facades.googleDrive.listProjects({}, (result) => results.push(result));
  facades.googleDrive.saveProject({}, (result) => results.push(result));
  await Promise.resolve();

  assert.equal(reports.length, 5);
  assert.deepEqual(results[0], {
    filesToPull: [],
    message: disabledRemoteProviderReason,
    success: false,
  });
  assert.equal(results[1].success, false);
  assert.equal(results[2].success, false);
  assert.deepEqual(results[3], []);
  assert.equal(results[4].success, false);
  assert.ok(Object.isFrozen(facades.githubClient));
  assert.ok(Object.isFrozen(facades.github));
  assert.ok(Object.isFrozen(facades.gist));
  assert.ok(Object.isFrozen(facades.googleDrive));
});
