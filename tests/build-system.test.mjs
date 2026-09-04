import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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

import { publishDirectory } from "../scripts/build.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    const urlMatch = output.match(/Local:\s+(http:\/\/\S+)/);
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
    if (!output.includes("Local:")) {
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
