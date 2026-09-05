#!/usr/bin/env node
// Opt-in, single-host diagnostic, not a CI timing budget. See docs/performance/workflows.md.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { installWorkflowFixture } from "./workflow-fixture.mjs";

const { values } = parseArgs({ options: {
  before: { type: "string" }, after: { type: "string", default: "." },
  out: { type: "string" }, rounds: { type: "string", default: "3" },
  samples: { type: "string", default: "5" }, warmups: { type: "string", default: "2" },
  sizes: { type: "string", default: "40x25,160x100,320x200" },
  workflows: { type: "string", default: "pencil-click,pencil-drag,onion-drag,rectangle,choose-tile,pan" },
  zoom: { type: "string", default: "3.5" },
} });
if (!values.before || !values.out) throw new Error("Required: --before <built worktree> --out <results.json>");
const positiveInt = (value) => { const n = Number(value); assert(Number.isInteger(n) && n > 0); return n; };
const config = {
  rounds: positiveInt(values.rounds), samples: positiveInt(values.samples),
  warmups: positiveInt(values.warmups), zoom: Number(values.zoom),
  sizes: values.sizes.split(",").map((size) => size.split("x").map(positiveInt)),
  workflows: values.workflows.split(","), viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
};
assert(config.sizes.every((size) => size.length === 2));
assert(config.workflows.every((name) => ["pencil-click", "pencil-drag", "onion-drag", "rectangle", "choose-tile", "pan"].includes(name)));
assert(Number.isFinite(config.zoom) && config.zoom > 0);
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const renderSources = [
  "textMode/graphic.js", "textMode/gridView2d.js", "textMode/grid2d.js", "textMode/frames/frames.js",
  "textMode/layers/layerGrid.js", "textMode/layers/layers.js", "textMode/tools/shapes.js",
  "textMode/tileSet/tileSet.js", "textMode/tileSet/tilePaletteDisplay.js", "textMode/currentTile.js",
  "textMode/animationPreview.js", "textMode/history.js",
];
async function qualify(root) {
  root = path.resolve(root);
  const bundle = await readFile(path.join(root, "dist/js/main.js"));
  const mapBytes = await readFile(path.join(root, "dist/js/main.js.map"));
  const map = JSON.parse(mapBytes);
  const verifiedSources = [];
  for (const source of renderSources) {
    const filename = `js/${source}`;
    const index = map.sources.indexOf(filename);
    assert(index >= 0, `Missing source map entry: ${filename}`);
    const bytes = await readFile(path.join(root, "src", filename));
    assert.equal(map.sourcesContent[index], bytes.toString(), `Stale build: ${filename}`);
    verifiedSources.push({ file: `src/${filename}`, sha256: sha(bytes) });
  }
  return { root, commit: git(root, "rev-parse", "HEAD"), status: git(root, "status", "--short"),
    bundleSha256: sha(bundle), sourceMapSha256: sha(mapBytes), verifiedSources };
}
const mimeTypes = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml",
  ".wasm": "application/wasm", ".jpg": "image/jpeg", ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff" };
async function serve(root) {
  const dist = path.join(root, "dist");
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const filename = path.resolve(dist, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!filename.startsWith(`${dist}${path.sep}`) || !(await stat(filename)).isFile()) {
        response.writeHead(404).end(); return;
      }
      response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(await readFile(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
const quantile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
};
const distribution = (values) => ({ n: values.length, p50: quantile(values, 0.5), p95: quantile(values, 0.95) });
function summarize(runs) {
  const summaries = [];
  for (const variant of ["before", "after"]) for (const [width, height] of config.sizes) for (const workflow of config.workflows) {
    const matches = runs.filter((run) => run.variant === variant && run.width === width && run.height === height && run.workflow === workflow);
    if (!matches.length) continue;
    const samples = matches.flatMap((run) => run.samples);
    summaries.push({ variant, width, height, workflow,
      taskMs: distribution(samples.map((sample) => sample.taskMs)),
      dispatchTotalMs: distribution(samples.map((sample) => sample.events.reduce((sum, event) => sum + event.ms, 0))),
      moveDispatchMs: distribution(samples.flatMap((sample) => sample.events.filter((event) => event.type === "mousemove").map((event) => event.ms))),
      releaseDispatchMs: distribution(samples.flatMap((sample) => sample.events.filter((event) => event.type === "mouseup").map((event) => event.ms))),
      gestureMs: distribution(samples.map((sample) => sample.gestureMs)),
      rafGapMs: distribution(samples.flatMap((sample) => sample.rafGapsMs)),
      releaseToTwoRafsMs: distribution(samples.map((sample) => sample.releaseToTwoRafsMs)),
      longTasks: samples.flatMap((sample) => sample.longTasks).length,
      countRuns: matches.map((run) => run.counts),
      roundTaskMedians: matches.map((run) => distribution(run.samples.map((sample) => sample.taskMs)).p50),
    });
  }
  return summaries;
}
const output = path.resolve(values.out);
await mkdir(path.dirname(output), { recursive: true });
const builds = { before: await qualify(values.before), after: await qualify(values.after) };
const result = {
  schemaVersion: 1, startedAt: new Date().toISOString(), config, builds,
  harnessSha256: sha(Buffer.concat(await Promise.all([
    readFile(new URL(import.meta.url)), readFile(new URL("./workflow-fixture.mjs", import.meta.url)),
  ]))),
  host: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length, memoryBytes: os.totalmem(), node: process.version,
    loadAverageAtStart: os.loadavg() },
  playwright: JSON.parse(await readFile(new URL("../../node_modules/@playwright/test/package.json", import.meta.url))).version,
  runs: [],
};
const servers = {};
let browser;
try {
  servers.before = await serve(builds.before.root);
  servers.after = await serve(builds.after.root);
  browser = await chromium.launch({ headless: true });
  result.browser = { name: "chromium", version: browser.version(), executable: chromium.executablePath(),
    headless: true, cpuThrottling: 1, launchOptions: { headless: true } };
  for (let round = 0; round < config.rounds; round++) {
    // Alternate variant, fixture and workflow order to expose host/JIT drift.
    const order = round % 2 ? ["after", "before"] : ["before", "after"];
    const sizes = round % 2 ? [...config.sizes].reverse() : config.sizes;
    const workflows = round % 2 ? [...config.workflows].reverse() : config.workflows;
    for (const [width, height] of sizes) for (const workflow of workflows) for (const variant of order) {
      const { origin } = servers[variant];
      const context = await browser.newContext({ viewport: config.viewport, deviceScaleFactor: config.deviceScaleFactor, serviceWorkers: "block" });
      const errors = [];
      const blocked = new Set();
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        blocked.add(url.origin);
        return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.stack || error.message));
      page.on("response", (response) => { if (response.url().startsWith(origin) && response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
      page.on("requestfailed", (request) => { if (request.url().startsWith(origin)) errors.push(`Request failed ${request.url()}`); });
      try {
        await page.goto(origin, { waitUntil: "load" });
        await page.locator("#start2D").click();
        await page.getByText("OK", { exact: true }).last().click();
        await page.locator("#startPage").waitFor({ state: "hidden" });
        await page.waitForFunction(() => Array.from(document.querySelectorAll(".ui-dialog-background")).every((element) => getComputedStyle(element).display === "none"));
        const fixture = await page.evaluate(installWorkflowFixture, { width, height, workflow, zoom: config.zoom });
        const cdp = await context.newCDPSession(page);
        await cdp.send("Performance.enable");
        const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
        for (let i = 0; i < config.warmups; i++) {
          await page.evaluate(() => workflowBenchmark.prepare());
          await page.evaluate(() => workflowBenchmark.run());
          await page.evaluate(() => workflowBenchmark.validate());
        }
        const samples = [];
        for (let i = 0; i < config.samples; i++) {
          await page.evaluate(() => workflowBenchmark.prepare());
          const before = await metrics();
          const sample = await page.evaluate(() => workflowBenchmark.run());
          const after = await metrics();
          sample.taskMs = (after.TaskDuration - before.TaskDuration) * 1000;
          sample.scriptMs = (after.ScriptDuration - before.ScriptDuration) * 1000;
          sample.layoutMs = (after.LayoutDuration - before.LayoutDuration) * 1000;
          samples.push(sample);
          await page.evaluate(() => workflowBenchmark.validate());
        }
        await page.evaluate(() => workflowBenchmark.prepare());
        const counted = await page.evaluate(() => workflowBenchmark.run(true));
        await page.evaluate(() => workflowBenchmark.validate());
        const fingerprint = await page.evaluate(() => workflowBenchmark.fingerprint());
        assert.deepEqual(errors, [], `${variant} ${width}x${height} ${workflow}`);
        if (!fingerprint.thumbnailMatchesFresh) console.warn(`${variant} ${width}x${height} ${workflow}: thumbnail differs from full-render control (${fingerprint.thumbnailDifference.differentPixels} pixels, max channel delta ${fingerprint.thumbnailDifference.maxChannelDelta})`);
        result.runs.push({ round, variant, width, height, workflow, fixture, samples,
          counts: counted.counts, fingerprint, errors, blockedOrigins: [...blocked] });
        result.summary = summarize(result.runs);
        await writeFile(output, JSON.stringify(result, null, 2) + "\n");
        console.log(`${round + 1}/${config.rounds} ${variant.padEnd(6)} ${width}x${height} ${workflow.padEnd(13)} task p50=${distribution(samples.map((sample) => sample.taskMs)).p50.toFixed(2)}ms`);
      } finally { await context.close(); }
    }
  }
  // Compare real committed document state and selection/camera controls, not just
  // the number of drawing calls. Thumbnail pixels are retained as evidence too.
  result.equivalence = result.runs.filter((run) => run.variant === "after").map((after) => {
    const before = result.runs.find((run) => run.variant === "before" && run.round === after.round && run.width === after.width && run.height === after.height && run.workflow === after.workflow);
    for (const key of ["cells", "camera", "brush"]) assert.deepEqual(after.fingerprint[key], before.fingerprint[key], `Final ${key} differs: ${after.workflow}`);
    return { round: after.round, width: after.width, height: after.height, workflow: after.workflow,
      document: true, thumbnail: before.fingerprint.thumbnail === after.fingerprint.thumbnail,
      beforeThumbnailMatchesFresh: before.fingerprint.thumbnailMatchesFresh,
      afterThumbnailMatchesFresh: after.fingerprint.thumbnailMatchesFresh };
  });
  result.finishedAt = new Date().toISOString();
  result.host.loadAverageAtEnd = os.loadavg();
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
} finally {
  await browser?.close();
  await Promise.all(Object.values(servers).map(({ server }) => new Promise((resolve) => server.close(resolve))));
}
