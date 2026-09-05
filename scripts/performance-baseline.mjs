import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { chromium, devices } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(projectRoot, "dist");
const baselineFile = path.join(projectRoot, "docs/performance-baseline.json");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function round(value) {
  return value == null ? null : Math.round(value * 100) / 100;
}

function relativeRequestPath(requestUrl, origin) {
  const url = new URL(requestUrl);
  if (url.origin !== origin) return null;
  return decodeURIComponent(url.pathname.replace(/^\//, "") || "index.html");
}

async function measuredContent(root, filename) {
  const absolute = path.resolve(root, filename);
  const relative = path.relative(root, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Performance request escapes the build root: ${filename}`);
  }
  return readFile(absolute);
}

export async function chunkReport(paths, { root = buildRoot } = {}) {
  const report = {};
  for (const filename of [...new Set(paths)].sort()) {
    if (!/\.(?:css|m?js)$/.test(filename)) continue;
    const content = await measuredContent(root, filename);
    report[filename] = {
      gzipBytes: gzipSync(content, { level: 9 }).byteLength,
      rawBytes: content.byteLength,
    };
  }
  return report;
}

export async function requestReport(paths, { root = buildRoot } = {}) {
  const counts = new Map();
  for (const filename of paths) counts.set(filename, (counts.get(filename) ?? 0) + 1);

  const report = {};
  for (const filename of [...counts.keys()].sort()) {
    const count = counts.get(filename) ?? 0;
    const content = await measuredContent(root, filename);
    report[filename] = {
      count,
      gzipBytes: gzipSync(content, { level: 9 }).byteLength * count,
      rawBytes: content.byteLength * count,
    };
  }
  return report;
}

function sumChunkBytes(chunks) {
  return Object.values(chunks).reduce(
    (total, chunk) => ({
      gzipBytes: total.gzipBytes + chunk.gzipBytes,
      rawBytes: total.rawBytes + chunk.rawBytes,
    }),
    { gzipBytes: 0, rawBytes: 0 },
  );
}

function metricMap(metrics) {
  return new Map(metrics.map(({ name, value }) => [name, value]));
}

async function measureProfile(browser, baseUrl, profile) {
  const context = await browser.newContext(profile.context);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const localResponses = [];
  const origin = new URL(baseUrl).origin;

  page.on("response", (response) => {
    const filename = relativeRequestPath(response.url(), origin);
    if (filename) localResponses.push(filename);
  });
  await page.route((url) => url.origin !== origin, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.addInitScript(() => {
    globalThis.__lvllvlBaseline = {};
    const observeStartPage = () => {
      const startPage = document.querySelector("#startPage");
      if (startPage && getComputedStyle(startPage).display !== "none") {
        globalThis.__lvllvlBaseline.startPageVisibleMilliseconds = performance.now();
        return;
      }
      requestAnimationFrame(observeStartPage);
    };
    requestAnimationFrame(observeStartPage);
  });

  await cdp.send("Performance.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuSlowdownMultiplier });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.locator("#startPage").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForLoadState("load");
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );

    const startMetrics = metricMap((await cdp.send("Performance.getMetrics")).metrics);
    const startPageVisibleMilliseconds = await page.evaluate(
      () => globalThis.__lvllvlBaseline.startPageVisibleMilliseconds,
    );
    const initialChunks = await chunkReport(localResponses);

    await page.locator("#start2D").click();
    await page.getByText("OK", { exact: true }).last().click();
    await page.locator("#startPage").waitFor({ state: "hidden", timeout: 30_000 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const editorReadyMilliseconds = await page.evaluate(() => performance.now());

    await cdp.send("HeapProfiler.collectGarbage");
    const heapBefore = await cdp.send("Runtime.getHeapUsage");
    const responseIndex = localResponses.length;
    const coldActivationMilliseconds = await page.evaluate(async () => {
      const startedAt = performance.now();
      await globalThis.g_app.activateFeature(
        "imageImport",
        globalThis.g_app.textModeEditor,
      );
      return performance.now() - startedAt;
    });
    const activationRequests = localResponses.slice(responseIndex);
    const activationResources = await requestReport(activationRequests);
    const warmActivationMilliseconds = await page.evaluate(async () => {
      const startedAt = performance.now();
      await globalThis.g_app.activateFeature(
        "imageImport",
        globalThis.g_app.textModeEditor,
      );
      return performance.now() - startedAt;
    });
    await page.evaluate(() =>
      globalThis.g_app.featureRegistry.dispose("imageImport", globalThis.g_app.textModeEditor),
    );
    await cdp.send("HeapProfiler.collectGarbage");
    const heapAfter = await cdp.send("Runtime.getHeapUsage");

    return {
      activation: {
        imageImport: {
          coldMilliseconds: round(coldActivationMilliseconds),
          requestBytes: sumChunkBytes(activationResources),
          requestCount: activationRequests.length,
          requests: activationResources,
          warmMilliseconds: round(warmActivationMilliseconds),
        },
      },
      initial: {
        chunks: initialChunks,
        requestBytes: sumChunkBytes(initialChunks),
        requestCount: Object.keys(initialChunks).length,
      },
      memoryAfterClose: {
        reliability: "diagnostic-only",
        retainedBytes: heapAfter.usedSize - heapBefore.usedSize,
        usedBytesAfter: heapAfter.usedSize,
        usedBytesBefore: heapBefore.usedSize,
      },
      timings: {
        editorReadyMilliseconds: round(editorReadyMilliseconds),
        javaScriptExecutionMilliseconds: round(
          (startMetrics.get("ScriptDuration") ?? 0) * 1_000,
        ),
        javaScriptParseMilliseconds: round(
          (startMetrics.get("V8CompileDuration") ?? 0) * 1_000,
        ),
        startPageVisibleMilliseconds: round(startPageVisibleMilliseconds),
      },
    };
  } finally {
    await context.close();
  }
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const relativePath = decodeURIComponent(requestUrl.pathname.replace(/^\//, "")) || "index.html";
      const filename = path.resolve(buildRoot, relativePath);
      const withinBuild = path.relative(buildRoot, filename);
      if (withinBuild === ".." || withinBuild.startsWith(`..${path.sep}`)) {
        response.writeHead(400).end("Invalid path");
        return;
      }
      const content = await readFile(filename);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": content.byteLength,
        "Content-Type": contentTypes.get(path.extname(filename)) ?? "application/octet-stream",
      });
      response.end(content);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.message);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    ),
  };
}

const profileDefinitions = [
  {
    context: { viewport: { height: 800, width: 1280 } },
    cpuSlowdownMultiplier: 1,
    name: "representative-desktop",
  },
  {
    context: {
      ...devices["Pixel 7"],
      viewport: { height: 640, width: 360 },
    },
    cpuSlowdownMultiplier: 4,
    name: "minimum-mobile",
  },
];

export async function runPerformanceBaseline({ write = false } = {}) {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const profiles = {};
    for (const profile of profileDefinitions) {
      console.log(`Measuring ${profile.name}`);
      profiles[profile.name] = await measureProfile(browser, server.baseUrl, profile);
      profiles[profile.name].environment = {
        cpuSlowdownMultiplier: profile.cpuSlowdownMultiplier,
        viewport: profile.context.viewport,
      };
    }

    const report = {
      environment: {
        architecture: process.arch,
        chromium: browser.version(),
        host: os.platform(),
        node: process.version,
      },
      measuredAt: new Date().toISOString(),
      profiles,
      schemaVersion: 2,
    };
    const output = `${JSON.stringify(report, null, 2)}\n`;
    if (write) {
      await writeFile(baselineFile, output);
      console.log(`Wrote ${path.relative(projectRoot, baselineFile)}`);
    } else {
      process.stdout.write(output);
    }
    return report;
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runPerformanceBaseline({ write: process.argv.includes("--write") });
}
