import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { tokenizer } from "acorn";

import {
  buildDirectory,
  packageAssetFiles,
  runtimeAssetFiles,
  runtimeFeatureRequests,
  sourceDirectory,
  version,
} from "./build-config.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, sourceDirectory);
const buildRoot = path.join(projectRoot, buildDirectory);
const thirdPartyNoticesFile = path.join(projectRoot, "THIRD_PARTY_NOTICES.md");
const thirdPartySbomFile = path.join(projectRoot, "docs/runtime-dependencies.spdx.json");

function sourceFile(relativePath) {
  const packageAsset = packageAssetFiles[relativePath];
  return packageAsset
    ? path.join(projectRoot, packageAsset)
    : path.join(sourceRoot, relativePath);
}

const coreFiles = [
  "index.html",
  "manifest.json",
  "THIRD_PARTY_NOTICES.md",
  "runtime-dependencies.spdx.json",
  "css/style.css",
  "js/main.js",
  "js/libs.js",
  "js/html/htmlcache.js",
  "js/storageManager.js",
  "js/githubApi.js",
  "js/githubClient.js",
  "js/acmeAssembler.js",
  "js/ca65Assembler.js",
  "js/c64/c64.js",
  "js/c64/wasm/c64.wasm",
  "c64/index.html",
  "c64/c64/c64.js",
  "c64page/index.html",
  "c64page/js/c64.wasm",
];
const runtimeRequestFiles = new Set(Object.values(runtimeFeatureRequests).flat());
const requiredFiles = new Set([
  ...coreFiles,
  ...runtimeAssetFiles,
  ...runtimeRequestFiles,
]);

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

function requestPath(reference, baseDirectory = "") {
  if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(reference)) return null;

  const withoutQuery = reference.split(/[?#]/, 1)[0];
  if (!withoutQuery || withoutQuery.endsWith("/")) return null;

  const relativePath = withoutQuery.startsWith("/")
    ? withoutQuery.slice(1)
    : path.posix.join(baseDirectory, withoutQuery);
  const normalized = path.posix.normalize(relativePath);

  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Runtime request escapes the build root: ${reference}`);
  }

  return normalized;
}

function stripJavaScriptComments(source) {
  const comments = [];
  const tokens = tokenizer(source, {
    allowHashBang: true,
    ecmaVersion: "latest",
    onComment(_isBlock, _text, start, end) {
      comments.push({ start, end });
    },
  });

  while (tokens.getToken().type.label !== "eof") {
    // Tokenizing lets Acorn distinguish comments from comment markers inside
    // strings, template literals, and regular expressions.
  }

  let uncommented = source;
  for (const { start, end } of comments.reverse()) {
    const whitespace = source.slice(start, end).replace(/[^\r\n]/g, " ");
    uncommented = `${uncommented.slice(0, start)}${whitespace}${uncommented.slice(end)}`;
  }
  return uncommented;
}

function localStylesheetReferences(html) {
  const references = [];
  const pattern = /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(pattern)) {
    const reference = match[1].split(/[?#]/, 1)[0];
    if (!/^(?:[a-z]+:|\/\/|\/)/i.test(reference)) references.push(reference);
  }
  return references;
}

async function verifyStyleBundle() {
  const sourceIndex = await readFile(path.join(sourceRoot, "index.html"), "utf8");
  const stylesheetFiles = localStylesheetReferences(sourceIndex);
  const chunks = [];

  for (const filename of stylesheetFiles) {
    chunks.push(await readFile(sourceFile(filename), "utf8"));
  }

  const expected = `${chunks.join("\n\n")}\n\n`;
  const actual = await readFile(path.join(buildRoot, "css/style.css"), "utf8");
  if (actual !== expected) {
    throw new Error("css/style.css does not contain every local source stylesheet in order");
  }
}

function verifyCommentTokenizer() {
  const fixture = [
    'const marker = "/* live string */";',
    '// new Worker("commented-line-worker.js");',
    'const worker = new Worker("live-worker.js"); /* trailing comment */',
  ].join("\n");
  const uncommented = stripJavaScriptComments(fixture);

  if (!uncommented.includes('"/* live string */"')) {
    throw new Error("JavaScript comment tokenizer removed a comment marker inside a string");
  }
  if (uncommented.includes("commented-line-worker.js") || uncommented.includes("trailing comment")) {
    throw new Error("JavaScript comment tokenizer left comment content active");
  }
}

async function verifyOutputReference(reference, baseDirectory, consumer) {
  const relativePath = requestPath(reference, baseDirectory);
  if (!relativePath) return;

  try {
    await access(path.join(buildRoot, relativePath));
  } catch {
    throw new Error(`${consumer} requests missing build output ${relativePath}`);
  }
}

async function verifyHtmlReferences(filename, baseDirectory) {
  const html = await readFile(path.join(buildRoot, filename), "utf8");
  await verifyHtmlContent(html, filename, baseDirectory);
}

async function verifyHtmlContent(html, consumer, baseDirectory) {
  const activeHtml = html.replace(/<!--[\s\S]*?-->/g, "");
  const referencePattern = /\b(?:href|src)=["']([^"']+)["']/g;

  for (const match of activeHtml.matchAll(referencePattern)) {
    await verifyOutputReference(match[1], baseDirectory, consumer);
  }
}

async function verifyCssReferences(filename) {
  const css = await readFile(path.join(buildRoot, filename), "utf8");
  const activeCss = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const referencePattern = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
  const baseDirectory = path.posix.dirname(filename);

  for (const match of activeCss.matchAll(referencePattern)) {
    await verifyOutputReference(match[1], baseDirectory, filename);
  }
}

async function discoverApplicationRuntimeRequests() {
  const javascriptRoot = path.join(sourceRoot, "js");
  const javascriptFiles = (await listCacheFiles(javascriptRoot)).filter((filename) =>
    filename.endsWith(".js"),
  );
  const references = new Map();

  for (const filename of javascriptFiles) {
    const source = stripJavaScriptComments(await readFile(filename, "utf8"));
    const patterns = [
      /(?:new\s+Worker\s*\(\s*|workerScript\s*:\s*)["']([^"']+)["']/g,
      /["'](lib\/[^"'?\s]+\.js)(?:\?[^"']*)?["']/g,
    ];

    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const relativePath = requestPath(match[1]);
        if (!relativePath) continue;
        if (!references.has(relativePath)) references.set(relativePath, new Set());
        references.get(relativePath).add(path.relative(projectRoot, filename));
      }
    }
  }

  return references;
}

async function discoverApplicationAssetRequests() {
  const javascriptRoot = path.join(sourceRoot, "js");
  const javascriptFiles = (await listCacheFiles(javascriptRoot)).filter((filename) =>
    filename.endsWith(".js"),
  );
  const references = new Map();
  const referencePattern =
    /["']((?:charsets|cursors|fonts|html|icons|images|palettes|vectorsets)\/[^\\"'?#\s]+)(?:[?#][^"']*)?["']/g;

  for (const filename of javascriptFiles) {
    const source = stripJavaScriptComments(await readFile(filename, "utf8"));
    for (const match of source.matchAll(referencePattern)) {
      const relativePath = requestPath(match[1]);
      if (!relativePath) continue;
      if (!references.has(relativePath)) references.set(relativePath, new Set());
      references.get(relativePath).add(path.relative(projectRoot, filename));
    }
  }

  return references;
}

async function verifyNestedRuntimeRequests() {
  for (const relativePath of runtimeRequestFiles) {
    if (!relativePath.endsWith(".js")) continue;

    let source;
    try {
      source = await readFile(path.join(sourceRoot, relativePath), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }

    const activeSource = stripJavaScriptComments(source);
    const references = [];

    for (const match of activeSource.matchAll(/importScripts\(\s*["']([^"']+)["']/g)) {
      references.push(match[1]);
    }
    for (const match of activeSource.matchAll(/wasmBinaryFile\s*=\s*["']([^"']+)["']/g)) {
      if (!match[1].startsWith("data:")) references.push(match[1]);
    }

    for (const reference of references) {
      const dependency = requestPath(reference, path.posix.dirname(relativePath));
      if (!runtimeRequestFiles.has(dependency)) {
        throw new Error(`${relativePath} has an untracked runtime dependency: ${dependency}`);
      }
      await verifyOutputReference(reference, path.posix.dirname(relativePath), relativePath);
    }
  }
}

for (const filename of requiredFiles) {
  await verifyOutputReference(filename, "", "build manifest");
}

const sourceNotices = await readFile(thirdPartyNoticesFile);
const builtNotices = await readFile(path.join(buildRoot, "THIRD_PARTY_NOTICES.md"));
if (!sourceNotices.equals(builtNotices)) {
  throw new Error("The production third-party notices differ from the reviewed inventory");
}

const sourceSbom = await readFile(thirdPartySbomFile);
const builtSbom = await readFile(path.join(buildRoot, "runtime-dependencies.spdx.json"));
if (!sourceSbom.equals(builtSbom)) {
  throw new Error("The production SPDX SBOM differs from the reviewed inventory");
}

verifyCommentTokenizer();

for (const filename of runtimeAssetFiles) {
  if (!runtimeRequestFiles.has(filename)) {
    throw new Error(`Copied runtime asset is not assigned to a feature: ${filename}`);
  }
  const source = await readFile(sourceFile(filename));
  const output = await readFile(path.join(buildRoot, filename));
  if (!source.equals(output)) throw new Error(`${filename} differs from its source`);
}

for (const filename of runtimeRequestFiles) {
  if (filename.startsWith("lib/") && !runtimeAssetFiles.includes(filename)) {
    throw new Error(`Runtime library is not in the copy manifest: ${filename}`);
  }
}

for (const filename of ["index.html", "c64/index.html", "c64page/index.html"]) {
  const html = await readFile(path.join(buildRoot, filename), "utf8");
  if (html.includes("{v}")) throw new Error(`${filename} still contains a version placeholder`);
}

const c64Runtime = await readFile(path.join(buildRoot, "c64/c64/c64.js"), "utf8");
if (!c64Runtime.includes(`c64.wasm?v=${version}`)) {
  throw new Error("The C64 runtime does not reference the versioned WASM file");
}

const indexHtml = await readFile(path.join(buildRoot, "index.html"), "utf8");
const ca65Scripts = [
  "lib/ca65/ca65.js",
  "lib/ca65/ld65.js",
  "js/ca65Assembler.js",
];
const ca65ScriptPositions = ca65Scripts.map((filename) => indexHtml.indexOf(filename));
if (
  ca65ScriptPositions.some((position) => position === -1) ||
  ca65ScriptPositions.some((position, index) => index > 0 && position <= ca65ScriptPositions[index - 1])
) {
  throw new Error("The CA65 and LD65 runtimes must load before the CA65 adapter");
}

const assemblerEditor = await readFile(
  path.join(sourceRoot, "js/assembler/assemblerEditor.js"),
  "utf8",
);
if (
  !assemblerEditor.includes('new Worker("c64/exomizer/exomizerWorker.js")') ||
  assemblerEditor.includes('new Worker("lib/exomizer/exomizerWorker.js")')
) {
  throw new Error("The Exomizer worker URL does not match its public asset path");
}

const discoveredRuntimeRequests = await discoverApplicationRuntimeRequests();
for (const [relativePath, consumers] of discoveredRuntimeRequests) {
  if (!runtimeRequestFiles.has(relativePath)) {
    throw new Error(
      `Untracked runtime request ${relativePath} in ${[...consumers].join(", ")}`,
    );
  }
  await verifyOutputReference(relativePath, "", [...consumers].join(", "));
}

await verifyNestedRuntimeRequests();
await verifyHtmlReferences("index.html", "");
await verifyHtmlReferences("c64/index.html", "");
await verifyHtmlReferences("c64page/index.html", "c64page");
await verifyStyleBundle();
await verifyCssReferences("css/style.css");
await verifyCssReferences("css/ui-mobile.css");

const manifest = JSON.parse(await readFile(path.join(buildRoot, "manifest.json"), "utf8"));
for (const icon of manifest.icons ?? []) {
  await verifyOutputReference(icon.src, "", "manifest.json");
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

for (const filename of sourceHtmlFiles) {
  const relativePath = path.relative(sourceRoot, filename).split(path.sep).join("/");
  const html = await readFile(filename, "utf8");
  await verifyHtmlContent(html, relativePath, "");
}

const discoveredAssetRequests = await discoverApplicationAssetRequests();
for (const [relativePath, consumers] of discoveredAssetRequests) {
  if (relativePath.startsWith("html/")) {
    if (!Object.hasOwn(context.g_htmlCache ?? {}, relativePath)) {
      throw new Error(
        `Missing HTML cache entry ${relativePath} requested by ${[...consumers].join(", ")}`,
      );
    }
  } else {
    await verifyOutputReference(relativePath, "", [...consumers].join(", "));
  }
}

console.log(
  `Verified ${requiredFiles.size} outputs, ${discoveredRuntimeRequests.size} runtime requests, ` +
    `${discoveredAssetRequests.size} asset requests, and ${sourceHtmlFiles.length} cached HTML files`,
);
