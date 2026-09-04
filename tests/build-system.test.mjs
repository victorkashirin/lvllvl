import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";

import { buildGraph } from "../scripts/build-graph.mjs";
import { assertCaseExactPath, publishDirectory } from "../scripts/build.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { JSHINT } = require("jshint");

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assetVersion(html) {
  const versions = [
    ...html.matchAll(/(?:src|href)=["'][^"']+[?&]v=([^&"']+)/g),
  ].map((match) => match[1]);
  assert.ok(versions.length > 0, "development HTML has no versioned assets");
  assert.equal(new Set(versions).size, 1, "development assets use different revisions");
  return versions[0];
}

function emptyLabelTargetLines(source) {
  return [...source.matchAll(/<label\b[^>]*\bfor\s*=\s*(["'])\1/gi)].map(
    (match) => source.slice(0, match.index).split("\n").length,
  );
}

test("empty label target scanning handles multiline markup", () => {
  assert.deepEqual(emptyLabelTargetLines('<label\n  class="field"\n  for="">'), [1]);
  assert.deepEqual(emptyLabelTargetLines('<label\n  for="field-id">'), []);
});

test("source labels never declare an empty target", async () => {
  const sourceRoot = path.join(projectRoot, "src");
  const markupSources = (await readdir(sourceRoot, { recursive: true }))
    .filter((relativePath) => /\.(?:html(?:\.bk)?|m?js)$/.test(relativePath))
    .map((relativePath) => path.join(sourceRoot, relativePath));

  const invalidTargets = [];
  for (const filename of markupSources) {
    const source = await readFile(filename, "utf8");
    for (const line of emptyLabelTargetLines(source)) {
      invalidTargets.push(`${path.relative(projectRoot, filename)}:${line}`);
    }
  }

  assert.deepEqual(
    invalidTargets,
    [],
    `Empty label targets can trigger Firefox getElementById warnings:\n${invalidTargets.join("\n")}`,
  );
});

test("first-party bundle sources contain no unreachable statements", async () => {
  const unreachable = [];
  for (const relativePath of buildGraph["js/main.js"].inputs) {
    const filename = path.join(projectRoot, "src", relativePath);
    const source = await readFile(filename, "utf8");
    JSHINT(source, {
      asi: true,
      browser: true,
      devel: true,
      esversion: 11,
      evil: true,
      expr: true,
      loopfunc: true,
      sub: true,
    });

    for (const warning of JSHINT.errors ?? []) {
      if (warning?.code === "W027") {
        unreachable.push(
          `${path.relative(projectRoot, filename)}:${warning.line}:${warning.character}: ${warning.reason}`,
        );
      }
    }
  }

  assert.deepEqual(
    unreachable,
    [],
    `Unreachable first-party statements:\n${unreachable.join("\n")}`,
  );
});

test("reachable code retains local bindings after unreachable cleanup", async () => {
  const expectedLocals = new Map([
    ["js/file/fileManager.js", new Set(["guid"])],
    ["js/textMode/tileSet/tileSetImport.js", new Set(["dstContext"])],
    ["js/textMode/tools/drawToolsPopup.js", new Set(["height"])],
  ]);
  const undefinedBindings = [];

  for (const [relativePath, identifiers] of expectedLocals) {
    const filename = path.join(projectRoot, "src", relativePath);
    const source = await readFile(filename, "utf8");
    JSHINT(source, {
      asi: true,
      browser: true,
      devel: true,
      esversion: 11,
      evil: true,
      expr: true,
      loopfunc: true,
      sub: true,
      undef: true,
    });

    for (const warning of JSHINT.errors ?? []) {
      const identifier = /^'([^']+)' is not defined\.$/.exec(warning?.reason)?.[1];
      if (warning?.code === "W117" && identifiers.has(identifier)) {
        undefinedBindings.push(
          `${path.relative(projectRoot, filename)}:${warning.line}:${warning.character}: ${warning.reason}`,
        );
      }
    }
  }

  assert.deepEqual(
    undefinedBindings,
    [],
    `Reachable statements lost local bindings:\n${undefinedBindings.join("\n")}`,
  );
});

test("build input paths are validated with exact filesystem casing", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvllvl-case-test-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  await writeFile(path.join(root, "Exact.js"), "");

  assert.equal(await assertCaseExactPath(root, "Exact.js"), path.join(root, "Exact.js"));
  await assert.rejects(
    assertCaseExactPath(root, "exact.js"),
    /uses "exact\.js" but the filesystem entry is "Exact\.js"/,
  );
});

async function waitForCondition(condition, timeout, message) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (condition()) return;
    await delay(50);
  }
  throw new Error(message());
}

test("a failed publish leaves the last good version pointer untouched", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvllvl-build-test-"));
  context.after(() => rm(root, { force: true, recursive: true }));

  const published = path.join(root, "dist");
  const lastGood = path.join(root, ".dist-build-last-good");
  await mkdir(lastGood);
  await writeFile(path.join(lastGood, "marker.txt"), "last-good");
  await symlink(path.basename(lastGood), published, "dir");

  await assert.rejects(
    publishDirectory(path.join(root, "missing-stage"), published),
    /ENOENT/,
  );

  assert.equal(await readlink(published), path.basename(lastGood));
  assert.equal(await readFile(path.join(published, "marker.txt"), "utf8"), "last-good");
  assert.deepEqual(await readdir(root), [".dist-build-last-good", "dist"]);
});

test("a successful publish atomically switches the version pointer", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvllvl-build-test-"));
  context.after(() => rm(root, { force: true, recursive: true }));

  const published = path.join(root, "dist");
  const oldBuild = path.join(root, ".dist-build-old");
  const staged = path.join(root, ".dist-build-new");
  await mkdir(oldBuild);
  await mkdir(staged);
  await writeFile(path.join(oldBuild, "marker.txt"), "old");
  await writeFile(path.join(staged, "marker.txt"), "new");
  await symlink(path.basename(oldBuild), published, "dir");

  await publishDirectory(staged, published);

  assert.equal((await lstat(published)).isSymbolicLink(), true);
  assert.equal(await readlink(published), path.basename(staged));
  assert.equal(await readFile(path.join(published, "marker.txt"), "utf8"), "new");
  assert.deepEqual(await readdir(root), [".dist-build-new", "dist"]);
});

test("the first publish migrates a legacy physical output directory", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvllvl-build-test-"));
  context.after(() => rm(root, { force: true, recursive: true }));

  const published = path.join(root, "dist");
  const staged = path.join(root, ".dist-build-new");
  await mkdir(published);
  await mkdir(staged);
  await writeFile(path.join(published, "marker.txt"), "old");
  await writeFile(path.join(staged, "marker.txt"), "new");

  await publishDirectory(staged, published);

  assert.equal((await lstat(published)).isSymbolicLink(), true);
  assert.equal(await readlink(published), path.basename(staged));
  assert.equal(await readFile(path.join(published, "marker.txt"), "utf8"), "new");
  assert.deepEqual(await readdir(root), [".dist-build-new", "dist"]);
});

test("the development server rebuilds once and remains available", { timeout: 60_000 }, async () => {
  const child = spawn(process.execPath, ["scripts/dev.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, LVLLVL_DEV_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let exited = false;
  let devUrl;
  const rebuildTrigger = path.join(
    projectRoot,
    "src",
    `.dev-rebuild-test-${process.pid}-${Date.now()}`,
  );
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const startupTimeout = setTimeout(() => {
    rejectReady(new Error(`Development server did not start:\n${output}`));
  }, 45_000);

  const collectOutput = (chunk) => {
    output += chunk.toString();
    const plainOutput = stripVTControlCharacters(output);
    const urlMatch = plainOutput.match(/Local:\s+(http:\/\/\S+)/);
    if (urlMatch) {
      devUrl = urlMatch[1];
      clearTimeout(startupTimeout);
      resolveReady();
    }
  };
  child.stdout.on("data", collectOutput);
  child.stderr.on("data", collectOutput);
  child.once("exit", (code, signal) => {
    exited = true;
    if (!stripVTControlCharacters(output).includes("Local:")) {
      clearTimeout(startupTimeout);
      rejectReady(
        new Error(`Development server exited before startup (${code ?? signal}):\n${output}`),
      );
    }
  });

  try {
    await ready;
    await delay(2_000);
    assert.equal((output.match(/Building lvllvl/g) ?? []).length, 1, output);
    assert.doesNotMatch(output, /Failed to run dependency scan|could not be resolved/, output);
    const initialResponse = await fetch(devUrl);
    assert.equal(initialResponse.status, 200, output);
    assert.equal(initialResponse.headers.get("cache-control"), "no-store", output);
    const initialVersion = assetVersion(await initialResponse.text());
    assert.match(initialVersion, /-dev-/);

    await writeFile(rebuildTrigger, "trigger a source watcher event\n");
    await waitForCondition(
      () => output.includes("server restarted"),
      30_000,
      () => `Development server did not finish its rebuild:\n${output}`,
    );
    await delay(2_000);

    assert.equal((output.match(/Building lvllvl/g) ?? []).length, 2, output);
    const rebuiltResponse = await fetch(devUrl);
    assert.equal(rebuiltResponse.status, 200, output);
    assert.notEqual(assetVersion(await rebuiltResponse.text()), initialVersion);
  } finally {
    clearTimeout(startupTimeout);
    if (!exited) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await rm(rebuildTrigger, { force: true });
  }
});
