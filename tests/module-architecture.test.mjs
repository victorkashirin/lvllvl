import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parse } from "acorn";

import {
  unboundAssignmentTargets,
  verifyModuleBoundaries,
} from "../scripts/module-boundaries.mjs";
import { buildGraph } from "../scripts/build-graph.mjs";
import {
  FeatureRegistry,
  FeatureScope,
} from "../src/js/modules/application/featureRegistry.mjs";
import {
  createImageImportFeature,
  imageImportFeatureName,
} from "../src/js/modules/feature-adapters/imageImportFeature.mjs";
import {
  createLegacyExportDocumentPort,
  createLegacyImportExportAdapter,
  createLegacyImportDestination,
} from "../src/js/modules/feature-adapters/legacyImportExportAdapter.mjs";

function fixtureGraph(overrides = {}) {
  return {
    cycleExceptions: [],
    entry: "bootstrap.mjs",
    globalAccess: [],
    layers: [
      {
        name: "bootstrap",
        root: "bootstrap.mjs",
        mayImport: ["application", "domain"],
      },
      {
        name: "application",
        root: "modules/application/",
        mayImport: ["application", "domain"],
      },
      {
        name: "domain",
        root: "modules/domain/",
        mayImport: ["domain"],
      },
    ],
    publicEntries: [],
    sourceRoots: ["bootstrap.mjs", "modules"],
    ...overrides,
  };
}

async function moduleFixture(context) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvllvl-modules-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

test("application feature activation is single-flight and returns one instance", async () => {
  const registry = new FeatureRegistry();
  let loads = 0;
  let activations = 0;
  const instance = {};

  const feature = registry.register("example", {
    scope: FeatureScope.APPLICATION,
    async load() {
      loads++;
    },
    activate(context) {
      activations++;
      assert.equal(context, "host");
      return instance;
    },
  });

  const [first, second] = await Promise.all([
    feature.activate("host"),
    registry.activate("example", "host"),
  ]);

  assert.equal(first, instance);
  assert.equal(second, instance);
  assert.equal(loads, 1);
  assert.equal(activations, 1);
  assert.equal(registry.isLoaded("example"), true);
  assert.equal(registry.isActive("example"), true);
  assert.equal(feature.isLoaded(), true);
  assert.equal(feature.isActive(), true);
});

test("context features share loading without sharing instances", async () => {
  const registry = new FeatureRegistry();
  let loads = 0;
  let releaseLoad;
  const loading = new Promise((resolve) => {
    releaseLoad = resolve;
  });

  registry.register("scoped", {
    scope: FeatureScope.CONTEXT,
    async load() {
      loads++;
      await loading;
    },
    activate(context) {
      return { context };
    },
    dispose() {},
  });

  const firstContext = { id: "first" };
  const secondContext = { id: "second" };
  const firstActivation = registry.activate("scoped", firstContext);
  const repeatedActivation = registry.activate("scoped", firstContext);
  const secondActivation = registry.activate("scoped", secondContext);
  releaseLoad();

  const [first, repeated, second] = await Promise.all([
    firstActivation,
    repeatedActivation,
    secondActivation,
  ]);
  assert.equal(loads, 1);
  assert.equal(first, repeated);
  assert.notEqual(first, second);
  assert.equal(first.context, firstContext);
  assert.equal(second.context, secondContext);
  assert.equal(registry.isActive("scoped", firstContext), true);
  assert.equal(registry.isActive("scoped", secondContext), true);
});

test("per-use features create and dispose independent instances", async () => {
  const registry = new FeatureRegistry();
  const disposed = [];
  let nextId = 0;

  registry.register("transient", {
    scope: FeatureScope.PER_USE,
    load() {},
    activate(context) {
      return { context, id: ++nextId };
    },
    dispose(instance, context) {
      disposed.push([instance.id, context]);
    },
  });

  const [first, second] = await Promise.all([
    registry.activate("transient", "host"),
    registry.activate("transient", "host"),
  ]);
  assert.notEqual(first, second);
  assert.equal(await registry.dispose("transient", first), true);
  assert.equal(registry.isActive("transient", first), false);
  assert.equal(await registry.disposeAll("transient"), 1);
  assert.deepEqual(disposed, [[first.id, "host"], [second.id, "host"]]);
});

test("bulk disposal waits for pending per-use activation", async () => {
  const registry = new FeatureRegistry();
  let releaseActivation;
  const activationGate = new Promise((resolve) => {
    releaseActivation = resolve;
  });
  let disposals = 0;

  registry.register("pending", {
    scope: FeatureScope.PER_USE,
    load() {},
    async activate() {
      await activationGate;
      return {};
    },
    dispose() {
      disposals++;
    },
  });

  const activation = registry.activate("pending", {});
  const disposal = registry.disposeAll("pending");
  releaseActivation();
  await activation;
  assert.equal(await disposal, 1);
  assert.equal(disposals, 1);
  assert.equal(registry.isActive("pending"), false);
});

test("context disposal releases only the selected instance", async () => {
  const registry = new FeatureRegistry();
  const disposed = [];
  registry.register("scoped", {
    scope: FeatureScope.CONTEXT,
    load() {},
    activate(context) {
      return { context };
    },
    dispose(instance, context) {
      disposed.push([instance, context]);
    },
  });

  const firstContext = {};
  const secondContext = {};
  const first = await registry.activate("scoped", firstContext);
  await registry.activate("scoped", secondContext);
  assert.equal(await registry.dispose("scoped", firstContext), true);
  assert.equal(registry.isActive("scoped", firstContext), false);
  assert.equal(registry.isActive("scoped", secondContext), true);
  assert.deepEqual(disposed, [[first, firstContext]]);

  const replacement = await registry.activate("scoped", firstContext);
  assert.notEqual(replacement, first);
  assert.equal(registry.isLoaded("scoped"), true);
});

test("activation waits for in-flight disposal instead of returning a disposed instance", async () => {
  const registry = new FeatureRegistry();
  let releaseActivation;
  let markActivationStarted;
  const activationGate = new Promise((resolve) => {
    releaseActivation = resolve;
  });
  const activationStarted = new Promise((resolve) => {
    markActivationStarted = resolve;
  });

  registry.register("scoped", {
    scope: FeatureScope.CONTEXT,
    load() {},
    async activate(context) {
      markActivationStarted();
      await activationGate;
      return { context, disposed: false };
    },
    dispose(instance) {
      instance.disposed = true;
    },
  });

  const context = {};
  const firstActivation = registry.activate("scoped", context);
  await activationStarted;
  const disposal = registry.dispose("scoped", context);
  const concurrentActivation = registry.activate("scoped", context);
  releaseActivation();

  const first = await firstActivation;
  assert.equal(await disposal, true);
  const replacement = await concurrentActivation;
  assert.equal(first.disposed, true);
  assert.notEqual(replacement, first);
  assert.equal(replacement.disposed, false);
  assert.equal(registry.isActive("scoped", context), true);
});

test("failed disposal retains the instance and can be retried", async () => {
  const registry = new FeatureRegistry();
  let disposalAttempts = 0;
  registry.register("scoped", {
    scope: FeatureScope.CONTEXT,
    load() {},
    activate(context) {
      return { context };
    },
    dispose() {
      disposalAttempts++;
      if (disposalAttempts === 1) throw new Error("temporary cleanup failure");
    },
  });

  const context = {};
  const instance = await registry.activate("scoped", context);
  await assert.rejects(registry.dispose("scoped", context), /temporary cleanup failure/);
  assert.equal(registry.isActive("scoped", context), true);
  assert.equal(await registry.activate("scoped", context), instance);
  assert.equal(await registry.dispose("scoped", context), true);
  assert.equal(registry.isActive("scoped", context), false);
  assert.equal(disposalAttempts, 2);
});

test("failed feature loading and activation can be retried", async () => {
  const registry = new FeatureRegistry();
  let loads = 0;
  let activations = 0;

  registry.register("retryable", {
    scope: FeatureScope.APPLICATION,
    load() {
      loads++;
      if (loads === 1) throw new Error("temporary load failure");
    },
    activate() {
      activations++;
      if (activations === 1) throw new Error("temporary activation failure");
      return { ready: true };
    },
  });

  await assert.rejects(registry.activate("retryable", {}), /temporary load failure/);
  await assert.rejects(registry.activate("retryable", {}), /temporary activation failure/);
  assert.deepEqual(await registry.activate("retryable", {}), { ready: true });
  assert.equal(loads, 2, "successful code loading is retained after activation fails");
  assert.equal(activations, 2);
});

test("feature definitions require explicit scope and scoped disposal", () => {
  const registry = new FeatureRegistry();
  assert.throws(
    () => registry.register("missing-scope", { load() {}, activate() {} }),
    /scope, load, and activate/,
  );
  assert.throws(
    () => registry.register("missing-disposal", {
      scope: FeatureScope.CONTEXT,
      load() {},
      activate() {},
    }),
    /must define disposal/,
  );
});

test("image import is module-backed, context-scoped, and never installed on the editor", async () => {
  const registry = new FeatureRegistry();
  const starts = [];
  let loads = 0;
  let clears = 0;
  let disposals = 0;

  class FakeImageImporter {
    init(destination, host) {
      this.destination = destination;
      this.host = host;
    }

    start(args) {
      starts.push(args);
      return "started";
    }

    dispose() {
      disposals++;
    }
  }

  registry.register(
    imageImportFeatureName,
    createImageImportFeature({
      async loadModule() {
        loads++;
        return { ImportImage: FakeImageImporter };
      },
      createDestination(editor) {
        return Object.freeze({ editorId: editor.id });
      },
      host: Object.freeze({ isMobile: () => false }),
      clearError() {
        clears++;
      },
    }),
  );

  const editor = { id: "primary" };
  const first = await registry.activate(imageImportFeatureName, editor);
  assert.equal(first.start({ source: "drop" }), "started");
  assert.deepEqual(first.destination, { editorId: "primary" });
  assert.equal(first.host.isMobile(), false);
  assert.equal(registry.getActive(imageImportFeatureName, editor), first);
  assert.equal("importImage" in editor, false);
  assert.ok(first instanceof FakeImageImporter);
  assert.equal(await registry.dispose(imageImportFeatureName, editor), true);
  assert.equal(disposals, 1);
  assert.equal(registry.getActive(imageImportFeatureName, editor), null);
  const second = await registry.activate(imageImportFeatureName, editor);
  assert.equal(second.start({ source: "menu" }), "started");
  assert.notEqual(second, first);
  assert.equal(loads, 1);
  assert.equal(clears, 2);
  assert.deepEqual(starts, [{ source: "drop" }, { source: "menu" }]);
});

test("legacy import/export adapters expose only named document capabilities", () => {
  const host = Object.freeze({ isMobile: () => false });
  const layers = {
    editor: null,
    id: "layers",
    selected: { editor: null, id: "selected", owner: null },
    getSelectedLayerObject() { return this.selected; },
    getEditor() { return this.editor; },
  };
  const editor = {
    colorPaletteManager: { id: "palette" },
    getTileSet() { return layers.selected; },
    graphic: { id: "graphic" },
    layers,
    secretUiState: { token: "hidden" },
  };
  layers.editor = editor;
  layers.selected.editor = editor;
  layers.selected.owner = editor;
  const initialized = [];
  class Controller {
    init(documentPort, receivedHost) {
      initialized.push({ documentPort, receivedHost });
    }
  }
  const adapter = createLegacyImportExportAdapter({
    constructors: {
      "import:spr": Controller,
      "export:text": Controller,
    },
    host,
  });

  const destination = createLegacyImportDestination("spr", editor);
  const documentPort = createLegacyExportDocumentPort("text", editor);
  assert.equal(Object.isFrozen(destination), true);
  assert.equal(Object.isFrozen(documentPort), true);
  assert.deepEqual(Object.keys(destination).sort(), [
    "colorPaletteManager", "graphic", "history", "layers",
  ]);
  assert.deepEqual(Object.keys(documentPort).sort(), ["graphic", "layers"]);
  assert.equal(destination.secretUiState, undefined);
  assert.equal(documentPort.secretUiState, undefined);
  assert.equal(documentPort.layers.editor, undefined);
  assert.equal("editor" in documentPort.layers, false);
  assert.equal(documentPort.layers.getSelectedLayerObject().editor, undefined);
  assert.equal(documentPort.layers.getSelectedLayerObject().owner, undefined);
  assert.equal(documentPort.layers.getEditor(), undefined);
  assert.equal(
    createLegacyExportDocumentPort("to-prg", editor).getTileSet().owner,
    undefined,
  );
  assert.equal(
    Object.getOwnPropertyDescriptor(documentPort.layers, "selected").value.owner,
    undefined,
  );
  assert.throws(() => { documentPort.layers.id = "changed"; }, /read-only/);
  assert.throws(() => Object.setPrototypeOf(documentPort.layers, null), /read-only/);
  assert.equal(layers.id, "layers");

  adapter.createImportController("spr", editor);
  adapter.createExportController("text", editor);
  assert.equal(initialized.length, 2);
  assert.equal(initialized[0].receivedHost, host);
  assert.equal(initialized[1].receivedHost, host);
  assert.equal(initialized[0].documentPort.secretUiState, undefined);
  assert.equal(initialized[1].documentPort.secretUiState, undefined);
});

test("text-mode format families have one adapter entry and no application global access", async () => {
  const containedPrefixes = [
    "js/textMode/import/",
    "js/textMode/import2d/",
    "js/textMode/export/",
    "js/textMode/export3d/",
    "js/textMode/c64export/",
  ];
  const productionFiles = [...new Set(
    Object.values(buildGraph)
      .flatMap((entry) => entry.inputs)
      .filter((filename) => filename.startsWith("js/")),
  )];
  for (const filename of productionFiles) {
    const source = await readFile(new URL(`../src/${filename}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /\b(?:this\.)?editor\.importImage\b|\btextModeEditor\.importImage\b/,
      filename,
    );
  }

  const directConstructionExceptions = [
    "js/bootstrap.mjs",
    "js/modules/",
    "js/debugger/",
    "js/music/",
    ...containedPrefixes,
  ];
  for (const filename of productionFiles) {
    if (directConstructionExceptions.some((entry) => filename.startsWith(entry))) continue;
    const source = await readFile(new URL(`../src/${filename}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /new\s+(?:Import(?!Old\b)[A-Z][A-Za-z0-9_]*|Export[A-Z][A-Za-z0-9_]*|ToPRG|C64ASM)\s*\(/,
      filename,
    );
  }

  const containedFiles = Object.values(buildGraph)
    .flatMap((entry) => entry.inputs)
    .filter((filename) => containedPrefixes.some((prefix) => filename.startsWith(prefix)));
  for (const filename of containedFiles) {
    const source = await readFile(new URL(`../src/${filename}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\bg_app\b/, filename);
  }
});

test("the generated image-import module has no sloppy-script global writes", async () => {
  const imageEntry = buildGraph["js/features/image-import.js"];
  const source = (await Promise.all(imageEntry.inputs.map((filename) =>
    readFile(new URL(`../src/${filename}`, import.meta.url), "utf8"),
  ))).join("\n\n");
  const ast = parse(source, {
    ecmaVersion: 2020,
    sourceType: "module",
  });
  assert.deepEqual(unboundAssignmentTargets(ast), []);
});

test("the production ES-module graph is discovered and obeys its boundaries", async () => {
  const result = await verifyModuleBoundaries();
  assert.equal(result.files, 24);
  assert.deepEqual(result.modules, [
    "js/bootstrap.mjs",
    "js/modules/application/documentSession.mjs",
    "js/modules/application/editorCommandService.mjs",
    "js/modules/application/editorStateService.mjs",
    "js/modules/application/featureRegistry.mjs",
    "js/modules/application/historyService.mjs",
    "js/modules/application/importExportService.mjs",
    "js/modules/application/persistenceService.mjs",
    "js/modules/application/remoteProviderService.mjs",
    "js/modules/application/uiRouteService.mjs",
    "js/modules/domain/documentRevisionState.mjs",
    "js/modules/domain/githubRepositoryAddress.mjs",
    "js/modules/domain/historyState.mjs",
    "js/modules/domain/importExportValues.mjs",
    "js/modules/domain/svgExport.mjs",
    "js/modules/feature-adapters/imageImportFeature.mjs",
    "js/modules/feature-adapters/legacyImportExportAdapter.mjs",
    "js/modules/feature-adapters/legacyRemoteProviderFacades.mjs",
    "js/modules/feature-adapters/legacySvgExportAdapter.mjs",
    "js/modules/feature-adapters/legacyUiRoutes.mjs",
    "js/modules/feature-adapters/textModeHistoryAdapter.mjs",
    "js/modules/infrastructure/browserStorageAdapter.mjs",
    "js/modules/infrastructure/disabledRemoteProviderAdapter.mjs",
    "js/modules/infrastructure/imageImportModuleLoader.mjs",
  ]);
  assert.equal(result.edges.length, 28);
});

test("module discovery rejects an unreachable file under a governed root", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules", "application"), { recursive: true });
  await writeFile(path.join(root, "bootstrap.mjs"), "export const ready = true;\n");
  await writeFile(
    path.join(root, "modules", "application", "unreferenced.mjs"),
    "export const hidden = true;\n",
  );

  await assert.rejects(
    verifyModuleBoundaries({ sourceRoot: root, graph: fixtureGraph() }),
    /unreachable files: modules\/application\/unreferenced\.mjs/,
  );
});

test("governed runtime modules cannot evade checks with another extension", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules", "application"), { recursive: true });
  await writeFile(path.join(root, "bootstrap.mjs"), "export const ready = true;\n");
  await writeFile(
    path.join(root, "modules", "application", "untracked.js"),
    "export const hidden = globalThis;\n",
  );

  await assert.rejects(
    verifyModuleBoundaries({ sourceRoot: root, graph: fixtureGraph() }),
    /Governed runtime modules must use the \.mjs extension/,
  );
});

test("module verification rejects imports outside governed roots", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules"));
  await writeFile(path.join(root, "bootstrap.mjs"), 'import "./legacy.js";\n');
  await writeFile(path.join(root, "legacy.js"), "export const legacy = true;\n");

  await assert.rejects(
    verifyModuleBoundaries({ sourceRoot: root, graph: fixtureGraph() }),
    /imports module outside the governed roots: legacy\.js/,
  );
});

test("source modules leave production cache versions to the build", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules", "application"), { recursive: true });
  await writeFile(
    path.join(root, "bootstrap.mjs"),
    'import "./modules/application/feature.mjs?v=manual";\n',
  );
  await writeFile(path.join(root, "modules", "application", "feature.mjs"), "export {};\n");

  await assert.rejects(
    verifyModuleBoundaries({
      sourceRoot: root,
      graph: fixtureGraph({ publicEntries: ["modules/application/feature.mjs"] }),
    }),
    /imports a source module with a query or fragment/,
  );
});

test("module verification rejects reverse layer imports", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules", "domain"), { recursive: true });
  await mkdir(path.join(root, "modules", "application"), { recursive: true });
  await writeFile(path.join(root, "bootstrap.mjs"), 'import "./modules/domain/model.mjs";\n');
  await writeFile(
    path.join(root, "modules", "domain", "model.mjs"),
    'import "../application/service.mjs";\n',
  );
  await writeFile(path.join(root, "modules", "application", "service.mjs"), "export {};\n");

  await assert.rejects(
    verifyModuleBoundaries({
      sourceRoot: root,
      graph: fixtureGraph({
        publicEntries: [
          "modules/application/service.mjs",
          "modules/domain/model.mjs",
        ],
      }),
    }),
    /crosses its domain dependency boundary/,
  );
});

test("module verification rejects package imports that bypass public entries", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules", "application", "consumer"), { recursive: true });
  await mkdir(path.join(root, "modules", "domain", "model"), { recursive: true });
  await writeFile(
    path.join(root, "bootstrap.mjs"),
    'import "./modules/application/consumer/index.mjs";\n',
  );
  await writeFile(
    path.join(root, "modules", "application", "consumer", "index.mjs"),
    'import "../../domain/model/internal.mjs";\n',
  );
  await writeFile(
    path.join(root, "modules", "domain", "model", "internal.mjs"),
    "export const internal = true;\n",
  );

  await assert.rejects(
    verifyModuleBoundaries({
      sourceRoot: root,
      graph: fixtureGraph({
        publicEntries: ["modules/application/consumer/index.mjs"],
      }),
    }),
    /bypasses the public entry point/,
  );
});

test("module verification rejects undocumented dependency cycles", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules", "application"), { recursive: true });
  await writeFile(path.join(root, "bootstrap.mjs"), 'import "./modules/application/a.mjs";\n');
  await writeFile(path.join(root, "modules", "application", "a.mjs"), 'import "./b.mjs";\n');
  await writeFile(path.join(root, "modules", "application", "b.mjs"), 'import "./a.mjs";\n');

  await assert.rejects(
    verifyModuleBoundaries({
      sourceRoot: root,
      graph: fixtureGraph({
        publicEntries: [
          "modules/application/a.mjs",
          "modules/application/b.mjs",
        ],
      }),
    }),
    /Module dependency cycle/,
  );
});

test("module boundary verification rejects new global coupling", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules", "application"), { recursive: true });
  await writeFile(path.join(root, "bootstrap.mjs"), 'import "./modules/application/feature.mjs";\n');
  await writeFile(
    path.join(root, "modules", "application", "feature.mjs"),
    "export const app = g_app ?? document.body;\n",
  );

  await assert.rejects(
    verifyModuleBoundaries({
      sourceRoot: root,
      graph: fixtureGraph({ publicEntries: ["modules/application/feature.mjs"] }),
    }),
    /modules\/application\/feature\.mjs accesses forbidden globals: document, g_app/,
  );
});

test("module boundary verification confines browser hosts and dynamic code", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules", "application"), { recursive: true });
  await writeFile(path.join(root, "bootstrap.mjs"), 'import "./modules/application/feature.mjs";\n');
  await writeFile(
    path.join(root, "modules", "application", "feature.mjs"),
    "export const unsafe = [fetch('/'), indexedDB, new Function('return 1'), new Worker('w.js')];\n",
  );

  await assert.rejects(
    verifyModuleBoundaries({
      sourceRoot: root,
      graph: fixtureGraph({ publicEntries: ["modules/application/feature.mjs"] }),
    }),
    /accesses forbidden globals: Function, Worker, fetch, indexedDB/,
  );
});

test("computed dynamic imports must keep a declared static module path", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules", "application"), { recursive: true });
  await writeFile(
    path.join(root, "bootstrap.mjs"),
    'import "./modules/application/loader.mjs";\n',
  );
  await writeFile(
    path.join(root, "modules", "application", "loader.mjs"),
    [
      "const version = 'one';",
      "export const load = () => import(`../../generated.js?v=${version}`);",
      "",
    ].join("\n"),
  );
  const dynamicGraph = fixtureGraph({
    dynamicImportEntries: {
      "modules/application/loader.mjs": ["generated.js"],
    },
    generatedEntries: ["generated.js"],
    publicEntries: ["modules/application/loader.mjs"],
  });

  await assert.doesNotReject(verifyModuleBoundaries({ sourceRoot: root, graph: dynamicGraph }));

  await writeFile(
    path.join(root, "modules", "application", "loader.mjs"),
    "export const load = (moduleUrl) => import(moduleUrl);\n",
  );
  await assert.rejects(
    verifyModuleBoundaries({ sourceRoot: root, graph: dynamicGraph }),
    /module path is not statically fixed/,
  );
});

test("dynamic-import declarations cannot invent or broaden runtime edges", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules", "application"), { recursive: true });
  await writeFile(
    path.join(root, "bootstrap.mjs"),
    'import "./modules/application/loader.mjs";\n',
  );
  await writeFile(
    path.join(root, "modules", "application", "loader.mjs"),
    "export const load = (version) => import(`../../other.js?v=${version}`);\n",
  );
  const dynamicGraph = fixtureGraph({
    dynamicImportEntries: {
      "modules/application/loader.mjs": ["generated.js"],
    },
    generatedEntries: ["generated.js", "other.js"],
    publicEntries: ["modules/application/loader.mjs"],
  });

  await assert.rejects(
    verifyModuleBoundaries({ sourceRoot: root, graph: dynamicGraph }),
    /undeclared computed dynamic import: other\.js/,
  );
});

test("module boundary verification permits local bindings and property names", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules"));
  await writeFile(
    path.join(root, "bootstrap.mjs"),
    [
      "const document = { window: true };",
      "export function inspect(window, { navigator: localNavigator }) {",
      "  const g_app = document;",
      "  return { document, window, navigator: localNavigator, g_app };",
      "}",
      "export const propertyOnly = document.window;",
      "",
    ].join("\n"),
  );

  await assert.doesNotReject(
    verifyModuleBoundaries({ sourceRoot: root, graph: fixtureGraph() }),
  );
});

test("a binding in a sibling scope does not hide forbidden global access", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules"));
  await writeFile(
    path.join(root, "bootstrap.mjs"),
    [
      "export function local(document) { return document; }",
      "export function leaked() { return document.body; }",
      "",
    ].join("\n"),
  );

  await assert.rejects(
    verifyModuleBoundaries({ sourceRoot: root, graph: fixtureGraph() }),
    /bootstrap\.mjs accesses forbidden globals: document/,
  );
});

test("body and iteration bindings do not hide globals used before their scope", async (context) => {
  const root = await moduleFixture(context);
  await mkdir(path.join(root, "modules"));
  await writeFile(
    path.join(root, "bootstrap.mjs"),
    [
      "export function defaults(value = window) { var window; return value; }",
      "export function iterate() { for (const document of document.forms) void document; }",
      "export function choose() { switch (navigator) { case 1: { const navigator = 1; return navigator; } } }",
      "",
    ].join("\n"),
  );

  await assert.rejects(
    verifyModuleBoundaries({ sourceRoot: root, graph: fixtureGraph() }),
    /bootstrap\.mjs accesses forbidden globals: document, navigator, window/,
  );
});
