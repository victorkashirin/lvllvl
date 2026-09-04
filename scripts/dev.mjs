import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

import { build } from "./build.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");
const buildRoot = path.join(projectRoot, "dist");
const scriptsRoot = path.join(projectRoot, "scripts");
const packageJsonPath = path.join(projectRoot, "package.json");
const devPort = Number(process.env.LVLLVL_DEV_PORT ?? 5173);

if (!Number.isInteger(devPort) || devPort < 0 || devPort > 65_535) {
  throw new Error("LVLLVL_DEV_PORT must be an integer between 0 and 65535");
}

let rebuildTimer;
let rebuildInProgress = false;
let rebuildQueued = false;
let server;
const inputWatchers = [];

async function rebuild() {
  if (rebuildInProgress) {
    rebuildQueued = true;
    return;
  }

  rebuildInProgress = true;
  do {
    rebuildQueued = false;
    try {
      await build();
      // Vite resolves the symlinked build root when it starts. Restarting makes
      // it serve the newly published version before clients reload.
      await server.restart();
    } catch (error) {
      console.error("Rebuild failed");
      console.error(error);
    }
  } while (rebuildQueued);
  rebuildInProgress = false;
}

function queueRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuild, 100);
}

await build();
let packageJsonContents = await readFile(packageJsonPath, "utf8");

server = await createServer({
  appType: "spa",
  configFile: false,
  root: buildRoot,
  server: {
    fs: {
      allow: [projectRoot],
    },
    host: "127.0.0.1",
    port: devPort,
    watch: {
      ignored: ["**/*"],
    },
  },
});

inputWatchers.push(watch(sourceRoot, { recursive: true }, queueRebuild));
inputWatchers.push(
  watch(projectRoot, (_event, filename) => {
    if (filename?.toString() !== path.basename(packageJsonPath)) return;

    void readFile(packageJsonPath, "utf8")
      .then((contents) => {
        // macOS can report a package.json event when a sibling entry such as the
        // dist symlink changes. Rebuild only when the package contents changed.
        if (contents === packageJsonContents) return;
        packageJsonContents = contents;
        queueRebuild();
      })
      .catch((error) => console.error(`Could not read package.json: ${error.message}`));
  }),
);
inputWatchers.push(
  watch(scriptsRoot, (_event, filename) => {
    if (filename === "build-config.mjs" || filename === "build-graph.mjs") {
      queueRebuild();
    }
  }),
);

await server.listen();
server.printUrls();

async function close() {
  clearTimeout(rebuildTimer);
  for (const watcher of inputWatchers) watcher.close();
  await server.close();
}

process.once("SIGINT", close);
process.once("SIGTERM", close);
