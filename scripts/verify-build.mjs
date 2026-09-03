import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { buildDirectory, sourceDirectory, version } from "./build-config.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, sourceDirectory);
const buildRoot = path.join(projectRoot, buildDirectory);

const requiredFiles = [
  "index.html",
  "manifest.json",
  "css/style.css",
  "js/main.js",
  "js/libs.js",
  "js/html/htmlcache.js",
  "js/storageManager.js",
  "js/githubClient.js",
  "js/acmeAssembler.js",
  "js/ca65Assembler.js",
  "js/c64/c64.js",
  "js/c64/wasm/c64.wasm",
  "lib/ace/src/theme-chrome.js",
  "lib/ace/src/theme-tomorrow_night.js",
  "c64/index.html",
  "c64/c64/c64.js",
  "c64page/index.html",
  "c64page/js/c64.wasm",
];

async function listCacheFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listCacheFiles(filename)));
    if (entry.isFile() && entry.name !== ".DS_Store") files.push(filename);
  }

  return files;
}

for (const filename of requiredFiles) {
  await access(path.join(buildRoot, filename));
}

for (const filename of ["index.html", "c64/index.html", "c64page/index.html"]) {
  const html = await readFile(path.join(buildRoot, filename), "utf8");
  if (html.includes("{v}")) throw new Error(`${filename} still contains a version placeholder`);
}

const c64Runtime = await readFile(path.join(buildRoot, "c64/c64/c64.js"), "utf8");
if (!c64Runtime.includes(`c64.wasm?v=${version}`)) {
  throw new Error("The C64 runtime does not reference the versioned WASM file");
}

const wasmSource = await readFile(path.join(sourceRoot, "c64/c64/c64.wasm"));
for (const filename of ["js/c64/wasm/c64.wasm", "c64page/js/c64.wasm"]) {
  const wasmOutput = await readFile(path.join(buildRoot, filename));
  if (!wasmSource.equals(wasmOutput)) throw new Error(`${filename} differs from its source`);
}

const htmlCacheSource = await readFile(path.join(buildRoot, "js/html/htmlcache.js"), "utf8");
const context = vm.createContext({});
new vm.Script(htmlCacheSource, { filename: "htmlcache.js" }).runInContext(context);
const sourceHtmlFiles = await listCacheFiles(path.join(sourceRoot, "html"));

if (Object.keys(context.g_htmlCache ?? {}).length !== sourceHtmlFiles.length) {
  throw new Error("The HTML cache does not contain every source HTML file");
}

console.log(`Verified ${requiredFiles.length} outputs and ${sourceHtmlFiles.length} cached HTML files`);
