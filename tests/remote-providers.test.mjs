import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parse } from "acorn";

import { buildGraph } from "../scripts/build-graph.mjs";
import {
  RemoteProviderCapability,
  RemoteProviderError,
  RemoteProviderErrorCode,
  RemoteProviderId,
  RemoteProviderService,
} from "../src/js/modules/application/remoteProviderService.mjs";
import { createLegacyRemoteProviderFacades } from
  "../src/js/modules/feature-adapters/legacyRemoteProviderFacades.mjs";
import { createDisabledRemoteProviderAdapter } from
  "../src/js/modules/infrastructure/disabledRemoteProviderAdapter.mjs";

const disabledReason = "Remote providers are disabled for this release.";

function createDisabledService() {
  return new RemoteProviderService({
    providers: [
      createDisabledRemoteProviderAdapter({
        id: RemoteProviderId.GITHUB,
        capabilities: [
          RemoteProviderCapability.IDENTITY,
          RemoteProviderCapability.LIST,
          RemoteProviderCapability.LOAD,
          RemoteProviderCapability.PUBLISH,
          RemoteProviderCapability.SAVE,
        ],
        reason: disabledReason,
      }),
      createDisabledRemoteProviderAdapter({
        id: RemoteProviderId.GIST,
        capabilities: [RemoteProviderCapability.LOAD, RemoteProviderCapability.PUBLISH],
        reason: disabledReason,
      }),
      createDisabledRemoteProviderAdapter({
        id: RemoteProviderId.GOOGLE_DRIVE,
        capabilities: [
          RemoteProviderCapability.IDENTITY,
          RemoteProviderCapability.LIST,
          RemoteProviderCapability.LOAD,
          RemoteProviderCapability.SAVE,
        ],
        reason: disabledReason,
      }),
    ],
  });
}

const productionCapabilities = {
  [RemoteProviderId.GITHUB]: [
    RemoteProviderCapability.IDENTITY,
    RemoteProviderCapability.LIST,
    RemoteProviderCapability.LOAD,
    RemoteProviderCapability.PUBLISH,
    RemoteProviderCapability.SAVE,
  ],
  [RemoteProviderId.GIST]: [
    RemoteProviderCapability.LOAD,
    RemoteProviderCapability.PUBLISH,
  ],
  [RemoteProviderId.GOOGLE_DRIVE]: [
    RemoteProviderCapability.IDENTITY,
    RemoteProviderCapability.LIST,
    RemoteProviderCapability.LOAD,
    RemoteProviderCapability.SAVE,
  ],
};

function createEnabledPort(overrides = {}) {
  const operation = async () => ({ success: true });
  return {
    capabilities: [
      RemoteProviderCapability.IDENTITY,
      RemoteProviderCapability.LIST,
      RemoteProviderCapability.LOAD,
      RemoteProviderCapability.SAVE,
    ],
    enabled: true,
    getSession: () => ({
      accountLabel: null,
      capabilities: [],
      providerId: RemoteProviderId.GITHUB,
      reason: null,
      status: "signed-out",
    }),
    id: RemoteProviderId.GITHUB,
    list: operation,
    load: operation,
    publish: operation,
    save: operation,
    signIn: operation,
    signOut: operation,
    ...overrides,
  };
}

function assertRemoteError(error, { code, operation, providerId }) {
  assert.equal(error.code, code);
  assert.equal(error.operation, operation);
  assert.equal(error.providerId, providerId);
  return true;
}

test("production remote-provider adapters are credential-free and disabled", async () => {
  const service = createDisabledService();

  for (const providerId of Object.values(RemoteProviderId)) {
    assert.equal(service.isEnabled(providerId), false);
    assert.deepEqual(service.getSession(providerId), {
      accountLabel: null,
      capabilities: productionCapabilities[providerId],
      providerId,
      reason: disabledReason,
      status: "disabled",
    });
  }

  assert.equal(Object.hasOwn(service, "providers"), false);
  assert.equal(typeof service.provider, "undefined");
  assert.equal(typeof service.registeredProvider, "undefined");

  for (const [operation, invoke] of [
    ["signIn", () => service.signIn(RemoteProviderId.GITHUB)],
    ["signOut", () => service.signOut(RemoteProviderId.GITHUB)],
    ["list", () => service.list(RemoteProviderId.GITHUB)],
    ["load", () => service.load(RemoteProviderId.GITHUB)],
    ["save", () => service.save(RemoteProviderId.GITHUB)],
    ["publish", () => service.publish(RemoteProviderId.GITHUB)],
  ]) {
    await assert.rejects(invoke, (error) => assertRemoteError(error, {
      code: RemoteProviderErrorCode.DISABLED,
      operation,
      providerId: RemoteProviderId.GITHUB,
    }));
  }
});

test("provider requests enforce a strict envelope without inspecting opaque content", async () => {
  let calls = 0;
  const port = createEnabledPort({
    save: async () => {
      calls += 1;
      return { success: true };
    },
  });
  const service = new RemoteProviderService({ providers: [port] });
  const projectContent = { authorization: "document text", token: "source token" };

  await assert.doesNotReject(service.save(RemoteProviderId.GITHUB, {
    content: projectContent,
  }));
  assert.equal(calls, 1);

  for (const request of [
    { authorization: "Bearer secret" },
    { apiKey: "secret" },
    { password: "secret" },
    { secret: "secret" },
    new Headers({ authorization: "Bearer secret" }),
    new Map([["token", "secret"]]),
  ]) {
    await assert.rejects(
      service.save(RemoteProviderId.GITHUB, request),
      (error) => assertRemoteError(error, {
        code: RemoteProviderErrorCode.INVALID_REQUEST,
        operation: "save",
        providerId: RemoteProviderId.GITHUB,
      }),
    );
  }
  assert.equal(calls, 1);
});

test("provider service normalizes capability, cancellation, connectivity, and remote failures", async () => {
  const aborted = { aborted: true };
  const service = new RemoteProviderService({
    providers: [createEnabledPort()],
    isOnline: () => false,
  });

  await assert.rejects(
    service.load(RemoteProviderId.GITHUB, { signal: aborted }),
    (error) => assertRemoteError(error, {
      code: RemoteProviderErrorCode.CANCELLED,
      operation: "load",
      providerId: RemoteProviderId.GITHUB,
    }),
  );
  await assert.rejects(
    service.load(RemoteProviderId.GITHUB),
    (error) => assertRemoteError(error, {
      code: RemoteProviderErrorCode.OFFLINE,
      operation: "load",
      providerId: RemoteProviderId.GITHUB,
    }),
  );
  await assert.doesNotReject(service.signOut(RemoteProviderId.GITHUB));

  const onlineService = new RemoteProviderService({
    providers: [createEnabledPort({
      load: async () => {
        const error = new Error("Authorization: Bearer must-not-cross-boundary");
        error.status = 401;
        throw error;
      },
      save: async () => {
        throw {
          message: "token=must-not-cross-boundary",
          retryAfterSeconds: 12,
          status: 429,
        };
      },
    })],
  });
  await assert.rejects(
    onlineService.list(RemoteProviderId.GITHUB, {
      capabilities: [RemoteProviderCapability.PUBLISH],
    }),
    (error) => assertRemoteError(error, {
      code: RemoteProviderErrorCode.UNSUPPORTED,
      operation: "list",
      providerId: RemoteProviderId.GITHUB,
    }),
  );
  await assert.rejects(
    onlineService.load(RemoteProviderId.GITHUB),
    (error) => {
      assertRemoteError(error, {
        code: RemoteProviderErrorCode.AUTHENTICATION_REQUIRED,
        operation: "load",
        providerId: RemoteProviderId.GITHUB,
      });
      assert.equal(
        error.message,
        "Authentication is required for this remote provider operation.",
      );
      assert.equal(Object.hasOwn(error, "providerCause"), false);
      return true;
    },
  );
  await assert.rejects(onlineService.save(RemoteProviderId.GITHUB), (error) => {
    assertRemoteError(error, {
      code: RemoteProviderErrorCode.RATE_LIMITED,
      operation: "save",
      providerId: RemoteProviderId.GITHUB,
    });
    assert.equal(error.retryAfterSeconds, 12);
    assert.equal(error.message, "The remote provider rate limit was reached.");
    assert.equal(Object.hasOwn(error, "providerCause"), false);
    return true;
  });

  const genericFailureService = new RemoteProviderService({
    providers: [createEnabledPort({
      list: async () => { throw new Error("Remote failure"); },
    })],
  });
  await assert.rejects(genericFailureService.list(RemoteProviderId.GITHUB), (error) =>
    assertRemoteError(error, {
      code: RemoteProviderErrorCode.PROVIDER_ERROR,
      operation: "list",
      providerId: RemoteProviderId.GITHUB,
    }));

  const applicationErrorService = new RemoteProviderService({
    providers: [createEnabledPort({
      list: async () => {
        throw new RemoteProviderError(
          RemoteProviderErrorCode.PROVIDER_ERROR,
          "response included secret=must-not-cross-boundary",
        );
      },
    })],
  });
  await assert.rejects(applicationErrorService.list(RemoteProviderId.GITHUB), (error) => {
    assertRemoteError(error, {
      code: RemoteProviderErrorCode.PROVIDER_ERROR,
      operation: "list",
      providerId: RemoteProviderId.GITHUB,
    });
    assert.equal(error.message, "The remote provider request failed.");
    return true;
  });
});

test("provider sessions reject adapter-specific or credential-bearing state", () => {
  const service = new RemoteProviderService({
    providers: [createEnabledPort({
      getSession: () => ({
        accountLabel: "user",
        capabilities: [RemoteProviderCapability.LOAD],
        providerId: RemoteProviderId.GITHUB,
        reason: null,
        status: "signed-in",
        token: "must-not-cross-boundary",
      }),
    })],
  });

  assert.throws(() => service.getSession(RemoteProviderId.GITHUB), (error) => {
    assertRemoteError(error, {
      code: RemoteProviderErrorCode.PROVIDER_ERROR,
      operation: "",
      providerId: RemoteProviderId.GITHUB,
    });
    assert.equal(error.message, "The remote provider returned invalid session state.");
    assert.doesNotMatch(JSON.stringify(error), /must-not-cross-boundary/);
    return true;
  });
});

test("provider ports are validated when registered", () => {
  assert.throws(
    () => new RemoteProviderService({
      providers: [createEnabledPort({ getSession: null })],
    }),
    /does not implement the provider port/,
  );
  assert.throws(
    () => new RemoteProviderService({
      providers: [createEnabledPort({ capabilities: [RemoteProviderCapability.LOAD, 42] })],
    }),
    /does not implement the provider port/,
  );
});

test("provider operations require their declared capability", async () => {
  let publishCalls = 0;
  const service = new RemoteProviderService({
    providers: [createEnabledPort({
      publish: async () => {
        publishCalls += 1;
        return { success: true };
      },
    })],
  });

  await assert.rejects(service.publish(RemoteProviderId.GITHUB), (error) =>
    assertRemoteError(error, {
      code: RemoteProviderErrorCode.UNSUPPORTED,
      operation: "publish",
      providerId: RemoteProviderId.GITHUB,
    }));
  assert.equal(publishCalls, 0);
});

test("legacy sign-in facades report disabled state without running success callbacks", async () => {
  const errors = [];
  let callbackCalls = 0;
  const facades = createLegacyRemoteProviderFacades({
    remoteProviders: createDisabledService(),
    reportError(providerId, error) {
      errors.push({ error, providerId });
    },
  });

  facades.githubClient.login(() => { callbackCalls += 1; });
  facades.githubClient.requestScope("repo", () => { callbackCalls += 1; });
  facades.googleDrive.handleAuthClick(() => { callbackCalls += 1; });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(callbackCalls, 0);
  assert.deepEqual(errors.map(({ error, providerId }) => ({
    code: error.code,
    providerId,
  })), [
    { code: RemoteProviderErrorCode.DISABLED, providerId: RemoteProviderId.GITHUB },
    { code: RemoteProviderErrorCode.DISABLED, providerId: RemoteProviderId.GITHUB },
    { code: RemoteProviderErrorCode.DISABLED, providerId: RemoteProviderId.GOOGLE_DRIVE },
  ]);
});

test("legacy facades keep callbacks outside the request and preserve opaque content", async () => {
  const calls = [];
  const remoteProviders = Object.fromEntries([
    "signIn",
    "signOut",
    "list",
    "load",
    "save",
    "publish",
  ].map((operation) => [operation, async (providerId, request) => {
    calls.push({ operation, providerId, request });
    return { success: true };
  }]));
  const facades = createLegacyRemoteProviderFacades({
    remoteProviders,
    reportError() {},
  });
  const callback = () => {};
  const opaqueContent = new Blob(["project"]);

  facades.github.loadRepository({ callback, owner: "owner", repository: "repo" });
  facades.githubClient.requestScope("repo", callback);
  facades.gist.loadFromGist(opaqueContent);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls[0], {
    operation: "load",
    providerId: RemoteProviderId.GITHUB,
    request: { content: { owner: "owner", repository: "repo" } },
  });
  assert.deepEqual(calls[1], {
    operation: "signIn",
    providerId: RemoteProviderId.GITHUB,
    request: { capabilities: ["repo"], content: {} },
  });
  assert.equal(calls[2].operation, "load");
  assert.equal(calls[2].providerId, RemoteProviderId.GIST);
  assert.equal(calls[2].request.content, opaqueContent);
});

test("legacy provider facades cover every direct caller in the production graph", async () => {
  const facades = createLegacyRemoteProviderFacades({
    remoteProviders: createDisabledService(),
    reportError() {},
  });
  const facadeByGlobal = {
    gdrive: facades.googleDrive,
    gist: facades.gist,
    github: facades.github,
    githubClient: facades.githubClient,
  };
  const calls = new Set();

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "MemberExpression" && !node.computed &&
      node.object?.type === "MemberExpression" && !node.object.computed &&
      node.object.object?.type === "Identifier" && node.object.object.name === "g_app" &&
      node.object.property?.type === "Identifier" &&
      node.property?.type === "Identifier" &&
      Object.hasOwn(facadeByGlobal, node.object.property.name)
    ) {
      calls.add(`${node.object.property.name}.${node.property.name}`);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) walk(child);
      } else if (value && typeof value === "object") {
        walk(value);
      }
    }
  }

  for (const relativePath of buildGraph["js/main.js"].inputs) {
    const source = await readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
    walk(parse(source, { ecmaVersion: "latest", sourceType: "script" }));
  }

  for (const call of calls) {
    const [facadeName, methodName] = call.split(".");
    assert.equal(typeof facadeByGlobal[facadeName][methodName], "function", call);
  }
});

test("dormant pull and share callers receive normalized disabled failures", async () => {
  const errors = [];
  const facades = createLegacyRemoteProviderFacades({
    remoteProviders: createDisabledService(),
    reportError(providerId, error) { errors.push({ error, providerId }); },
  });

  assert.doesNotThrow(() => facades.github.doPull());
  assert.doesNotThrow(() => facades.gist.share({ files: [] }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(errors.map(({ error, providerId }) => ({
    code: error.code,
    providerId,
  })), [
    { code: RemoteProviderErrorCode.DISABLED, providerId: RemoteProviderId.GITHUB },
    { code: RemoteProviderErrorCode.DISABLED, providerId: RemoteProviderId.GIST },
  ]);
});
