import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  UiRouteId,
  UiRouteService,
  UiRouteStatus,
} from "../src/js/modules/application/uiRouteService.mjs";
import {
  createImageImportRoute,
  registerLegacyModeRoutes,
} from "../src/js/modules/feature-adapters/legacyUiRoutes.mjs";

test("routes publish loading, ready, and disposed state with focus cleanup", async () => {
  const events = [];
  const focusTarget = { id: "menu" };
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let deactivated = 0;
  let restored = null;
  const routes = new UiRouteService({
    ui: {
      captureFocus: () => focusTarget,
      loading: (route) => events.push(route.status),
      ready: (route) => events.push(route.status),
      disposed: (route) => events.push(route.status),
      restoreFocus: (target) => { restored = target; },
    },
  });
  routes.register("feature:test", {
    label: "test feature",
    restoreFocus: true,
    async activate() {
      await gate;
      return { ready: true };
    },
    deactivate() { deactivated++; },
  });

  const activation = routes.navigate("feature:test", { source: "menu" });
  assert.equal(routes.getState("feature:test").status, UiRouteStatus.LOADING);
  release();
  assert.deepEqual(await activation, { ready: true });
  assert.equal(routes.getState("feature:test").status, UiRouteStatus.READY);
  assert.equal(await routes.dispose("feature:test"), true);
  assert.equal(routes.getState("feature:test").status, UiRouteStatus.DISPOSED);
  assert.equal(deactivated, 1);
  assert.equal(restored, focusTarget);
  assert.deepEqual(events, ["loading", "ready", "disposed"]);
});

test("repeated activation is single-flight and a route change cancels stale activation", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let slowActivations = 0;
  let slowCleanups = 0;
  const routes = new UiRouteService();
  routes.register("route:slow", {
    label: "slow route",
    async activate() {
      slowActivations++;
      await gate;
      return { id: "slow" };
    },
    deactivate() { slowCleanups++; },
  });
  routes.register("route:fast", {
    label: "fast route",
    activate() { return { id: "fast" }; },
  });

  const first = routes.navigate("route:slow", { context: "editor" });
  const repeated = routes.navigate("route:slow", { context: "editor", source: "keyboard" });
  assert.equal(first, repeated);
  assert.equal(slowActivations, 1);

  assert.deepEqual(await routes.navigate("route:fast"), { id: "fast" });
  assert.equal(routes.getActiveRoute(), "route:fast");
  release();
  assert.equal(await first, null);
  assert.equal(slowCleanups, 1);
  assert.equal(routes.getState("route:slow").status, UiRouteStatus.DISPOSED);
  assert.equal(routes.getState("route:fast").status, UiRouteStatus.READY);
});

test("ready-route reactivation cleans up unless instance reuse is explicit", async () => {
  const cleaned = [];
  let activations = 0;
  const routes = new UiRouteService();
  routes.register("route:repeat", {
    label: "repeat route",
    activate() { return { id: ++activations }; },
    deactivate(instance) { cleaned.push(instance.id); },
  });

  assert.deepEqual(await routes.navigate("route:repeat", { context: "editor" }), { id: 1 });
  assert.deepEqual(await routes.navigate("route:repeat", { context: "editor" }), { id: 2 });
  assert.deepEqual(cleaned, [1]);
  await routes.dispose("route:repeat");
  assert.deepEqual(cleaned, [1, 2]);
});

test("failed activation exposes one retry action and successful retry clears the error", async () => {
  const states = [];
  let attempts = 0;
  let retryAction;
  const routes = new UiRouteService({
    ui: {
      loading: (route) => states.push(route.status),
      failed(route) {
        states.push(route.status);
        retryAction = route.retry;
        assert.equal(route.message, "Stable load message");
      },
      ready: (route) => states.push(route.status),
      disposed: () => {},
    },
  });
  routes.register("feature:retry", {
    label: "retry feature",
    errorMessage: () => "Stable load message",
    activate() {
      attempts++;
      if (attempts === 1) throw new Error("network details");
      return { id: "same-feature" };
    },
  });

  assert.equal(await routes.navigate("feature:retry"), null);
  assert.equal(routes.getState("feature:retry").status, UiRouteStatus.FAILED);
  retryAction();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(routes.getState("feature:retry").status, UiRouteStatus.READY);
  assert.equal(routes.getState("feature:retry").attempt, 2);
  assert.deepEqual(states, ["loading", "failed", "retrying", "ready"]);
});

test("replacement activation waits for async cleanup and cannot restore stale focus", async () => {
  const events = [];
  let releaseCleanup;
  const cleanupGate = new Promise((resolve) => { releaseCleanup = resolve; });
  const routes = new UiRouteService({
    ui: {
      captureFocus: () => ({ id: "old-trigger" }),
      restoreFocus: () => events.push("restore old focus"),
    },
  });
  routes.register("route:old", {
    label: "old route",
    restoreFocus: true,
    activate() {
      events.push("activate old");
      return { id: "old" };
    },
    async deactivate() {
      events.push("cleanup old");
      await cleanupGate;
      events.push("cleaned old");
    },
  });
  routes.register("route:new", {
    label: "new route",
    activate() {
      events.push("activate new");
      return { id: "new" };
    },
  });

  await routes.navigate("route:old");
  const closing = routes.dispose("route:old");
  const replacement = routes.navigate("route:new");
  assert.deepEqual(events, ["activate old", "cleanup old"]);

  releaseCleanup();
  assert.equal(await closing, true);
  assert.deepEqual(await replacement, { id: "new" });
  assert.deepEqual(events, ["activate old", "cleanup old", "cleaned old", "activate new"]);
  assert.equal(routes.getActiveRoute(), "route:new");
});

test("an overlay route restores its underlying route and replacement retires both", async () => {
  const cleaned = [];
  const routes = new UiRouteService();
  routes.register("route:editor", {
    label: "editor",
    activate: () => ({ id: "editor" }),
    deactivate: () => { cleaned.push("editor"); },
  });
  routes.register("route:dialog", {
    label: "dialog",
    overlay: true,
    activate: () => ({ id: "dialog" }),
    deactivate: () => { cleaned.push("dialog"); },
  });
  routes.register("route:start", {
    label: "start",
    activate: () => ({ id: "start" }),
  });

  await routes.navigate("route:editor");
  await routes.navigate("route:dialog");
  assert.equal(routes.getActiveRoute(), "route:dialog");
  assert.equal(routes.getState("route:editor").status, UiRouteStatus.READY);
  await routes.dispose("route:dialog");
  assert.equal(routes.getActiveRoute(), "route:editor");
  assert.equal(routes.getState("route:editor").status, UiRouteStatus.READY);
  assert.deepEqual(cleaned, ["dialog"]);

  await routes.navigate("route:dialog");
  await routes.navigate("route:start");
  assert.equal(routes.getActiveRoute(), "route:start");
  assert.deepEqual(cleaned, ["dialog", "dialog", "editor"]);
  assert.equal(routes.getState("route:editor").status, UiRouteStatus.DISPOSED);
});

test("the same overlay route replaces its previous scoped context", async () => {
  const cleaned = [];
  const routes = new UiRouteService();
  routes.register("route:editor", {
    label: "editor",
    activate: () => ({ id: "editor" }),
  });
  routes.register("route:dialog", {
    label: "dialog",
    overlay: true,
    activate: ({ context }) => ({ context }),
    deactivate: (instance) => { cleaned.push(instance.context); },
  });

  await routes.navigate("route:editor");
  await routes.navigate("route:dialog", { context: "first" });
  await routes.navigate("route:dialog", { context: "second" });

  assert.equal(routes.getActiveRoute(), "route:dialog");
  assert.equal(routes.getState("route:dialog").status, UiRouteStatus.READY);
  assert.deepEqual(cleaned, ["first"]);

  await routes.dispose("route:dialog");
  assert.equal(routes.getActiveRoute(), "route:editor");
  assert.equal(routes.getState("route:dialog").status, UiRouteStatus.DISPOSED);
  assert.deepEqual(cleaned, ["first", "second"]);
});

test("image-import activation rolls back partial UI and rejects unopened routes", async () => {
  for (const outcome of ["throw", "unavailable"]) {
    let closes = 0;
    const importer = {
      visible: false,
      start() {
        if (outcome === "unavailable") return false;
        throw new Error("partial start");
      },
      close() {
        closes++;
        this.visible = false;
      },
    };
    const routes = new UiRouteService();
    routes.register(
      UiRouteId.IMAGE_IMPORT,
      createImageImportRoute({ activate: async () => importer }, () => "editor"),
    );

    assert.equal(await routes.navigate(UiRouteId.IMAGE_IMPORT), null);
    assert.equal(routes.getState(UiRouteId.IMAGE_IMPORT).status, UiRouteStatus.FAILED);
    assert.equal(importer.routeClosed, null);
    assert.equal(importer.visible, false);
    assert.equal(closes, 1);
  }
});

test("an aborted image-import activation does not close a shared scoped instance", async () => {
  let releaseFeature;
  const featureGate = new Promise((resolve) => { releaseFeature = resolve; });
  let starts = 0;
  let closes = 0;
  const importer = {
    visible: false,
    start() { starts++; },
    close() { closes++; },
  };
  const routes = new UiRouteService();
  routes.register(
    UiRouteId.IMAGE_IMPORT,
    createImageImportRoute({
      async activate() {
        await featureGate;
        return importer;
      },
    }, () => "editor"),
  );
  routes.register("route:replacement", {
    label: "replacement",
    activate: () => ({ id: "replacement" }),
  });

  const staleActivation = routes.navigate(UiRouteId.IMAGE_IMPORT);
  await routes.navigate("route:replacement");
  releaseFeature();

  assert.equal(await staleActivation, null);
  assert.equal(starts, 0);
  assert.equal(closes, 0);
  assert.equal(routes.getActiveRoute(), "route:replacement");
});

test("a stale async image-import start cannot release a newer route owner", async () => {
  let releaseFirstStart;
  const firstStart = new Promise((resolve) => { releaseFirstStart = resolve; });
  let starts = 0;
  let closes = 0;
  const importer = {
    routeClosed: null,
    start() {
      starts++;
      return starts === 1 ? firstStart : true;
    },
    close() { closes++; },
  };
  const routes = new UiRouteService();
  routes.register("route:editor", {
    label: "editor",
    activate: () => ({ id: "editor" }),
  });
  routes.register("route:replacement", {
    label: "replacement",
    activate: () => ({ id: "replacement" }),
  });
  routes.register(
    UiRouteId.IMAGE_IMPORT,
    createImageImportRoute({ activate: async () => importer }, () => "editor"),
  );

  await routes.navigate("route:editor");
  const staleActivation = routes.navigate(UiRouteId.IMAGE_IMPORT, { context: "editor" });
  while (starts === 0) await new Promise((resolve) => setImmediate(resolve));
  await routes.navigate("route:replacement");
  await routes.navigate(UiRouteId.IMAGE_IMPORT, {
    context: "editor",
    source: "new-owner",
  });

  assert.equal(typeof importer.routeClosed, "function");
  releaseFirstStart(true);
  assert.equal(await staleActivation, null);
  assert.equal(routes.getActiveRoute(), UiRouteId.IMAGE_IMPORT);
  assert.equal(routes.getState(UiRouteId.IMAGE_IMPORT).status, UiRouteStatus.READY);
  assert.equal(typeof importer.routeClosed, "function");
  assert.equal(closes, 0);

  await routes.dispose(UiRouteId.IMAGE_IMPORT);
  assert.equal(closes, 1);
});

test("stable mode aliases and image-import entry points use the same route contract", async () => {
  const appliedModes = [];
  const routes = new UiRouteService();
  registerLegacyModeRoutes(routes, (mode) => appliedModes.push(mode));

  const modeActivation = routes.navigate("2d", { source: "deep-link" });
  assert.deepEqual(appliedModes, ["2d"], "legacy mode activation remains synchronous");
  assert.deepEqual(await modeActivation, { mode: "2d" });
  assert.equal(routes.getActiveRoute(), UiRouteId.EDITOR_2D);

  const starts = [];
  const importer = {
    visible: false,
    start(parameters) {
      starts.push(parameters);
      this.visible = true;
    },
    close() { this.visible = false; },
  };
  let featureActivations = 0;
  routes.register(
    UiRouteId.IMAGE_IMPORT,
    createImageImportRoute({
      async activate(context) {
        featureActivations++;
        assert.equal(context, "editor");
        return importer;
      },
    }, () => "editor"),
    { aliases: ["image-import"] },
  );

  const sources = ["menu", "keyboard", "mobile-menu", "drag-and-drop", "deep-link"];
  for (const source of sources) {
    assert.equal(
      await routes.navigate("image-import", { context: "editor", parameters: { source }, source }),
      importer,
    );
  }
  assert.equal(featureActivations, sources.length);
  assert.deepEqual(starts, sources.map((source) => ({ source })));
  importer.routeClosed();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(routes.getState(UiRouteId.IMAGE_IMPORT).status, UiRouteStatus.DISPOSED);
  assert.equal(routes.getActiveRoute(), UiRouteId.EDITOR_2D);
});

test("every production image-import launcher goes through the central route", async () => {
  const launchers = [
    "src/js/editor.js",
    "src/js/file/dropImage.js",
    "src/js/file/startPage.js",
    "src/js/textMode/mobileMenu.js",
  ];
  const sources = await Promise.all(launchers.map((filename) => readFile(filename, "utf8")));

  for (const [index, source] of sources.entries()) {
    assert.doesNotMatch(source, /\.importImage\.start\(/, launchers[index]);
    assert.match(source, /openImageImport\(/, launchers[index]);
  }
  assert.match(sources[0], /source:\s*source \|\| 'programmatic'/);
  assert.match(sources[0], /"alt": true, "shift": true, "key": "I"/);
  assert.match(sources[1], /'drag-and-drop'/);
  assert.match(sources[2], /'deep-link'/);
  assert.match(sources[3], /'mobile-menu'/);
});
