import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

import { build } from "./build.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");
const buildRoot = path.join(projectRoot, "dist");
const buildUtilsRoot = path.join(projectRoot, "buildUtils");
const scriptsRoot = path.join(projectRoot, "scripts");

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
      server.ws.send({ type: "full-reload" });
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

server = await createServer({
  appType: "spa",
  configFile: false,
  root: buildRoot,
  server: {
    host: "127.0.0.1",
    port: 5173,
    watch: {
      ignored: ["**/*"],
    },
  },
});

inputWatchers.push(watch(sourceRoot, { recursive: true }, queueRebuild));
inputWatchers.push(
  watch(buildUtilsRoot, (_event, filename) => {
    if (filename === "constants.js") queueRebuild();
  }),
);
inputWatchers.push(
  watch(scriptsRoot, (_event, filename) => {
    if (filename === "build-config.mjs") queueRebuild();
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
