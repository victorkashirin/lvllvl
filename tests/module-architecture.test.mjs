import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyModuleBoundaries } from "../scripts/module-boundaries.mjs";
import { FeatureRegistry } from "../src/js/modules/featureRegistry.mjs";
import {
  createImageImportFeature,
  imageImportFeatureName,
} from "../src/js/modules/imageImportFeature.mjs";

test("feature activation is single-flight and returns one instance", async () => {
  const registry = new FeatureRegistry();
  let loads = 0;
  let activations = 0;
  const instance = {};

  registry.register("example", {
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
    registry.activate("example", "host"),
    registry.activate("example", "host"),
  ]);

  assert.equal(first, instance);
  assert.equal(second, instance);
  assert.equal(loads, 1);
  assert.equal(activations, 1);
  assert.equal(registry.isActive("example"), true);
});

test("a failed feature load can be retried", async () => {
  const registry = new FeatureRegistry();
  let attempts = 0;

  registry.register("retryable", {
    load() {
      attempts++;
      if (attempts === 1) throw new Error("temporary failure");
    },
    activate() {
      return { ready: true };
    },
  });

  await assert.rejects(registry.activate("retryable", {}), /temporary failure/);
  assert.deepEqual(await registry.activate("retryable", {}), { ready: true });
  assert.equal(attempts, 2);
});

test("the image-import facade preserves the legacy host contract until activation", async () => {
  const registry = new FeatureRegistry();
  const starts = [];
  let loads = 0;
  let clears = 0;

  class FakeImageImporter {
    init(editor) {
      this.editor = editor;
    }

    start(args) {
      starts.push(args);
      return "started";
    }
  }

  registry.register(
    imageImportFeatureName,
    createImageImportFeature({
      legacyGlobal: { ImportImage: FakeImageImporter },
      async loadScript() {
        loads++;
      },
      scriptUrl: "/js/features/image-import.js",
      clearError() {
        clears++;
      },
    }),
  );

  const editor = {};
  const facade = registry.createFacade(imageImportFeatureName, editor);
  editor.importImage = facade;

  assert.equal(facade.visible, false);
  assert.equal(facade.importInProgress, false);
  assert.equal(await facade.start({ source: "drop" }), "started");
  assert.equal(loads, 1);
  assert.equal(clears, 1);
  assert.ok(editor.importImage instanceof FakeImageImporter);
  assert.equal(editor.importImage.editor, editor);
  assert.deepEqual(starts, [{ source: "drop" }]);
});

test("the production ES-module graph obeys its declared boundaries", async () => {
  assert.deepEqual(await verifyModuleBoundaries(), { files: 3 });
});

test("module boundary verification rejects new global coupling", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvllvl-modules-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  await mkdir(path.join(root, "modules"));
  await writeFile(path.join(root, "bootstrap.mjs"), 'import "./modules/feature.mjs";\n');
  await writeFile(
    path.join(root, "modules/feature.mjs"),
    "export const app = g_app ?? document.body;\n",
  );

  await assert.rejects(
    verifyModuleBoundaries({
      sourceRoot: root,
      graph: {
        entry: "bootstrap.mjs",
        files: {
          "bootstrap.mjs": "bootstrap.mjs",
          "modules/feature.mjs": "modules/feature.mjs",
        },
        globalAccess: ["bootstrap.mjs"],
        layers: {
          "bootstrap.mjs": ["modules/"],
          "modules/": ["modules/"],
        },
      },
    }),
    /modules\/feature\.mjs accesses forbidden globals: document, g_app/,
  );
});

test("module boundary verification permits local bindings and property names", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvllvl-modules-"));
  context.after(() => rm(root, { force: true, recursive: true }));
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
    verifyModuleBoundaries({
      sourceRoot: root,
      graph: {
        entry: "bootstrap.mjs",
        files: { "bootstrap.mjs": "bootstrap.mjs" },
        globalAccess: [],
        layers: { "bootstrap.mjs": ["bootstrap.mjs"] },
      },
    }),
  );
});

test("a binding in a sibling scope does not hide forbidden global access", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvllvl-modules-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  await writeFile(
    path.join(root, "bootstrap.mjs"),
    [
      "export function local(document) { return document; }",
      "export function leaked() { return document.body; }",
      "",
    ].join("\n"),
  );

  await assert.rejects(
    verifyModuleBoundaries({
      sourceRoot: root,
      graph: {
        entry: "bootstrap.mjs",
        files: { "bootstrap.mjs": "bootstrap.mjs" },
        globalAccess: [],
        layers: { "bootstrap.mjs": ["bootstrap.mjs"] },
      },
    }),
    /bootstrap\.mjs accesses forbidden globals: document/,
  );
});

test("body and iteration bindings do not hide globals used before their scope", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvllvl-modules-"));
  context.after(() => rm(root, { force: true, recursive: true }));
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
    verifyModuleBoundaries({
      sourceRoot: root,
      graph: {
        entry: "bootstrap.mjs",
        files: { "bootstrap.mjs": "bootstrap.mjs" },
        globalAccess: [],
        layers: { "bootstrap.mjs": ["bootstrap.mjs"] },
      },
    }),
    /bootstrap\.mjs accesses forbidden globals: document, navigator, window/,
  );
});
