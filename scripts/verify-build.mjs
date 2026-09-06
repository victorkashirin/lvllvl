import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import vm from "node:vm";

import { parse, tokenizer } from "acorn";
import browserslist from "browserslist";

import { browserPolicy } from "./browser-policy.mjs";
import { buildGraph, copiedScripts, moduleGraph } from "./build-graph.mjs";
import { verifyProductionLegacyGraph } from "./legacy-graph-policy.mjs";
import {
  formatModuleDependencyReport,
  verifyModuleBoundaries,
} from "./module-boundaries.mjs";
import { versionModuleImports } from "./module-versioning.mjs";

import {
  buildDirectory,
  packageAssetFiles,
  packageSourceMapsWithEmbeddedSources,
  runtimeAssetFiles,
  runtimeFeatureRequests,
  sourceDirectory,
  sourceMapPolicy,
} from "./build-config.mjs";
import { embedSourceMapSources } from "./source-map-assets.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, sourceDirectory);
const buildRoot = path.join(projectRoot, buildDirectory);
const thirdPartyNoticesFile = path.join(projectRoot, "THIRD_PARTY_NOTICES.md");
const thirdPartySbomFile = path.join(projectRoot, "docs/runtime-dependencies.spdx.json");
const artifactGoldenFile = path.join(projectRoot, "tests/fixtures/build-artifacts.json");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const version = packageJson.version;
const embeddedPackageSourceMaps = new Set(packageSourceMapsWithEmbeddedSources);
const legacyGraphVerification = await verifyProductionLegacyGraph();
const moduleVerification = await verifyModuleBoundaries();
const moduleFiles = moduleVerification.modules;
const moduleScripts = Object.fromEntries(moduleFiles.map((filename) => [filename, filename]));

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
  "js/main.js.map",
  "js/libs.js",
  "js/libs.js.map",
  "js/html/htmlcache.js",
  "js/buildInfo.js",
  ...moduleFiles,
  "js/storageManager.js",
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

function htmlAttribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] ?? null;
}

function localStylesheetReferences(html) {
  const references = [];
  const pattern = /<link\b[^>]*>/gi;

  for (const match of html.matchAll(pattern)) {
    const rel = htmlAttribute(match[0], "rel");
    const href = htmlAttribute(match[0], "href");
    if (!href || !rel?.toLowerCase().split(/\s+/).includes("stylesheet")) continue;

    const reference = requestPath(href);
    if (reference) references.push(reference);
  }
  return references;
}

function localScriptReferences(html) {
  const references = [];
  const pattern = /<script\b[^>]*>/gi;

  for (const match of html.matchAll(pattern)) {
    const source = htmlAttribute(match[0], "src");
    if (!source) continue;

    const reference = requestPath(source);
    if (reference) references.push(reference);
  }
  return references;
}

async function verifyBrowserPolicy() {
  const queries = packageJson.browserslist;
  if (
    !Array.isArray(queries) ||
    queries.length === 0 ||
    queries.some((query) => typeof query !== "string" || query.trim() === "")
  ) {
    throw new Error("package.json must define a non-empty Browserslist support policy");
  }

  const targets = browserslist(queries, { path: projectRoot });
  if (targets.length === 0) throw new Error("The Browserslist support policy is empty");

  const javascriptFiles = (await listCacheFiles(buildRoot)).filter(
    (filename) => filename.endsWith(".js") || filename.endsWith(".mjs"),
  );
  for (const filename of javascriptFiles) {
    const source = await readFile(filename, "utf8");
    const relativePath = path.relative(buildRoot, filename).split(path.sep).join("/");
    const sourceType = filename.endsWith(".mjs") ||
      (moduleGraph.generatedEntries ?? []).includes(relativePath)
      ? "module"
      : "script";
    try {
      parse(source, {
        allowHashBang: true,
        ecmaVersion: browserPolicy.javascriptEcmaVersion,
        sourceType,
      });
    } catch (error) {
      throw new Error(
        `${relativePath} exceeds the ECMA ${browserPolicy.javascriptEcmaVersion} output target: ${error.message}`,
      );
    }
  }

  return { javascriptFiles: javascriptFiles.length, targets: targets.length };
}

async function verifyPerformanceBudgets(indexHtml) {
  const initialFiles = [
    ...new Set([
      ...localStylesheetReferences(indexHtml),
      ...localScriptReferences(indexHtml),
      ...moduleFiles,
      ...runtimeFeatureRequests.mobileStyles,
    ]),
  ];
  let rawBytes = 0;
  let gzipBytes = 0;

  for (const filename of initialFiles) {
    const content = await readFile(path.join(buildRoot, filename));
    rawBytes += content.byteLength;
    gzipBytes += gzipSync(content, { level: 9 }).byteLength;
  }

  const budgets = browserPolicy.performanceBudgets;
  if (rawBytes > budgets.initialPayloadRawBytes) {
    throw new Error(
      `Initial first-party payload is ${rawBytes} raw bytes; budget is ${budgets.initialPayloadRawBytes}`,
    );
  }
  if (gzipBytes > budgets.initialPayloadGzipBytes) {
    throw new Error(
      `Initial first-party payload is ${gzipBytes} gzip bytes; budget is ${budgets.initialPayloadGzipBytes}`,
    );
  }

  return { files: initialFiles.length, gzipBytes, rawBytes };
}

async function verifyStyleBundle() {
  const graph = buildGraph["css/style.css"];
  const chunks = await Promise.all(
    graph.inputs.map((filename) => readFile(sourceFile(filename), "utf8")),
  );
  const expected = `${chunks.join("\n\n")}\n\n`;
  const actual = await readFile(path.join(buildRoot, "css/style.css"), "utf8");
  if (actual !== expected) {
    throw new Error("css/style.css differs from its declared source graph");
  }
}

async function verifyBuildGraph() {
  const outputs = Object.keys(buildGraph);
  if (
    !outputs.includes("css/style.css") ||
    !outputs.includes("js/libs.js") ||
    !outputs.includes("js/main.js")
  ) {
    throw new Error(
      "The build graph must declare the production style, library, and application bundles",
    );
  }

  const declaredScripts = { ...copiedScripts, ...moduleScripts };
  const copiedSources = new Set(Object.values(declaredScripts));
  for (const [output, graph] of Object.entries(buildGraph)) {
    if (!Array.isArray(graph.inputs) || graph.inputs.length === 0) {
      throw new Error(`${output} has no declared inputs`);
    }
    if (new Set(graph.inputs).size !== graph.inputs.length) {
      throw new Error(`${output} contains duplicate inputs`);
    }

    for (const filename of graph.inputs) {
      await access(sourceFile(filename));
      if (copiedSources.has(filename)) {
        throw new Error(`${filename} is both bundled and copied as a standalone script`);
      }
    }

    await access(path.join(buildRoot, output));
  }

  for (const [output, source] of Object.entries(declaredScripts)) {
    const sourceContent = await readFile(path.join(sourceRoot, source), "utf8");
    const rendered = sourceContent.split("{v}").join(version);
    const expectedContent = output.endsWith(".mjs")
      ? versionModuleImports(rendered, version)
      : rendered;
    const expected = `${expectedContent}\n`;
    const actual = await readFile(path.join(buildRoot, output), "utf8");
    if (actual !== expected) throw new Error(`${output} differs from its declared source`);
  }
}

async function verifySourceEntry() {
  const sourceIndex = await readFile(path.join(sourceRoot, "index.html"), "utf8");
  const expectedIndex = `${sourceIndex.split("{v}").join(version)}\n`;
  const outputIndex = await readFile(path.join(buildRoot, "index.html"), "utf8");
  if (outputIndex !== expectedIndex) {
    throw new Error("dist/index.html does not come directly from the sole production entry point");
  }

  try {
    await access(path.join(sourceRoot, "indexTemplate.html"));
    throw new Error("src/indexTemplate.html must not exist as a second production entry point");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function verifySourceMaps() {
  if (!sourceMapPolicy.publish) {
    throw new Error("Production source maps must be published");
  }

  for (const [output, graph] of Object.entries(buildGraph)) {
    if (graph.kind !== "javascript" || !graph.sourceMap) continue;

    const outputName = path.posix.basename(output);
    const mapFilename = `${output}.map`;
    const bundle = await readFile(path.join(buildRoot, output), "utf8");
    if (!bundle.includes(`//# sourceMappingURL=${path.posix.basename(mapFilename)}`)) {
      throw new Error(`${output} does not reference its release source map`);
    }

    const sourceMap = JSON.parse(await readFile(path.join(buildRoot, mapFilename), "utf8"));
    if (sourceMap.file !== outputName) {
      throw new Error(`${mapFilename} names the wrong output`);
    }
    if (JSON.stringify(sourceMap.sources) !== JSON.stringify(graph.inputs)) {
      throw new Error(`${mapFilename} does not cover its declared source graph in order`);
    }
    if (typeof sourceMap.mappings !== "string" || !/[A-Za-z0-9+/]/.test(sourceMap.mappings)) {
      throw new Error(`${mapFilename} contains no usable source mappings`);
    }

    if (sourceMapPolicy.includeSources) {
      if (
        !Array.isArray(sourceMap.sourcesContent) ||
        sourceMap.sourcesContent.length !== graph.inputs.length
      ) {
        throw new Error(`${mapFilename} does not embed every declared source`);
      }

      for (const [index, filename] of graph.inputs.entries()) {
        const source = await readFile(sourceFile(filename), "utf8");
        if (sourceMap.sourcesContent[index] !== source.split("{v}").join(version)) {
          throw new Error(`${mapFilename} embeds stale content for ${filename}`);
        }
      }
    }
  }
}

async function verifyC64Metadata() {
  const c64Index = await readFile(path.join(buildRoot, "c64/index.html"), "utf8");
  const requiredContent = [
    "<title>C64</title>",
    "Commodore 64 Emulator in a Web Browser",
    'content="images/c64.png"',
    'href="images/c64logo32.png"',
    'href="images/c64logo16.png"',
  ];

  for (const content of requiredContent) {
    if (!c64Index.includes(content)) {
      throw new Error(`c64/index.html is missing branded metadata: ${content}`);
    }
  }

  for (const staleReference of [
    "images/logo-large.png",
    "images/logo32.png",
    "images/logo16.png",
  ]) {
    if (c64Index.includes(staleReference)) {
      throw new Error(`c64/index.html retains lvllvl metadata: ${staleReference}`);
    }
  }
}

async function verifyArtifactGolden() {
  const filenames = [
    "index.html",
    "c64/index.html",
    "css/style.css",
    "fonts/glyphicons-halflings-regular.woff2",
    "js/libs.js",
    "js/libs.js.map",
    "js/main.js",
    "js/main.js.map",
    ...moduleFiles,
    "js/features/image-import.js",
    "js/features/image-import.js.map",
    "js/html/htmlcache.js",
  ];
  const artifacts = {};

  for (const filename of filenames) {
    const content = await readFile(path.join(buildRoot, filename));
    artifacts[filename] = {
      bytes: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  }

  const golden = `${JSON.stringify({ schemaVersion: 1, releaseVersion: version, artifacts }, null, 2)}\n`;
  if (process.argv.includes("--update-golden")) {
    await mkdir(path.dirname(artifactGoldenFile), { recursive: true });
    await writeFile(artifactGoldenFile, golden);
    return;
  }

  const expected = await readFile(artifactGoldenFile, "utf8");
  if (golden !== expected) {
    throw new Error(
      "Build artifacts differ from tests/fixtures/build-artifacts.json; inspect the output " +
        "and run npm run artifacts:update for an intentional change",
    );
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
    filename.endsWith(".js") || filename.endsWith(".mjs"),
  );
  const references = new Map();

  for (const filename of javascriptFiles) {
    const source = stripJavaScriptComments(await readFile(filename, "utf8"));
    const patterns = [
      {
        pattern: /(?:new\s+Worker\s*\(\s*|workerScript\s*:\s*)["']([^"']+)["']/g,
        baseDirectory: "",
      },
      { pattern: /["'](lib\/[^"'?\s]+\.js)(?:\?[^"']*)?["']/g, baseDirectory: "" },
      {
        pattern: /new\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
        baseDirectory: path.posix.dirname(
          path.relative(sourceRoot, filename).split(path.sep).join("/"),
        ),
      },
    ];

    for (const { pattern, baseDirectory } of patterns) {
      for (const match of source.matchAll(pattern)) {
        const relativePath = requestPath(match[1], baseDirectory);
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
    filename.endsWith(".js") || filename.endsWith(".mjs"),
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

if (typeof version !== "string" || version.trim() === "") {
  throw new Error("package.json must contain the sole release version");
}

const buildInfoSource = await readFile(path.join(buildRoot, "js/buildInfo.js"), "utf8");
const buildInfoContext = vm.createContext({});
new vm.Script(buildInfoSource, { filename: "buildInfo.js" }).runInContext(buildInfoContext);
const buildInfo = buildInfoContext.LVLLVL_BUILD_INFO;
if (buildInfo?.version !== version) {
  throw new Error("The generated build information does not match package.json");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(buildInfo?.buildDate ?? "")) {
  throw new Error("The generated build information has no valid UTC build date");
}

await verifyBuildGraph();
console.log(formatModuleDependencyReport(moduleVerification));
console.log(
  `Legacy graph policy: ${legacyGraphVerification.inputs} inputs ` +
    `(${legacyGraphVerification.exceptions} temporary exceptions)`,
);
await verifySourceEntry();
await verifySourceMaps();
await verifyC64Metadata();

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
  const source = embeddedPackageSourceMaps.has(filename)
    ? Buffer.from(await embedSourceMapSources(sourceFile(filename)))
    : await readFile(sourceFile(filename));
  const output = await readFile(path.join(buildRoot, filename));
  if (!source.equals(output)) throw new Error(`${filename} differs from its source`);
}

for (const filename of packageSourceMapsWithEmbeddedSources) {
  if (!runtimeAssetFiles.includes(filename) || !packageAssetFiles[filename]) {
    throw new Error(`${filename} must be a copied package runtime asset`);
  }
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
const disabledProviderReferences = [
  "api.github.com",
  "githubApi.js",
  "githubClient.js",
  "google-api/api.js",
  "googleapis.com",
  "gstatic.com/firebasejs",
];
const providerBoundaryFiles = (await listCacheFiles(buildRoot))
  .map((filename) => path.relative(buildRoot, filename).split(path.sep).join("/"))
  .filter((filename) => /\.(?:html|js|mjs)$/.test(filename));
for (const filename of providerBoundaryFiles) {
  const contents = await readFile(path.join(buildRoot, filename), "utf8");
  for (const forbiddenReference of disabledProviderReferences) {
    if (contents.includes(forbiddenReference)) {
      throw new Error(
        `Disabled provider reference remains in ${filename}: ${forbiddenReference}`,
      );
    }
  }
}
for (const forbiddenArtifact of [
  "js/githubApi.js",
  "js/githubClient.js",
  "lib/google-api/api.js",
]) {
  try {
    await access(path.join(buildRoot, forbiddenArtifact));
    throw new Error(`Disabled provider artifact remains in the build: ${forbiddenArtifact}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
const browserVerification = await verifyBrowserPolicy();
const performanceVerification = await verifyPerformanceBudgets(indexHtml);
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
for (const filename of runtimeFeatureRequests.helpDocumentation) {
  await verifyHtmlReferences(filename, path.posix.dirname(filename));
}
await verifyStyleBundle();
await verifyCssReferences("css/style.css");
await verifyCssReferences("css/ui-mobile.css");

const manifest = JSON.parse(await readFile(path.join(buildRoot, "manifest.json"), "utf8"));
if (!indexHtml.includes('<link rel="manifest" href="manifest.json">')) {
  throw new Error("The web manifest URL must remain relative for repository Pages deployments");
}
for (const field of ["start_url", "scope"]) {
  if (typeof manifest[field] !== "string" || manifest[field].startsWith("/")) {
    throw new Error(
      `manifest.json ${field} must remain relative for repository Pages deployments`,
    );
  }
}
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

await verifyArtifactGolden();

console.log(
  `Verified ${requiredFiles.size} outputs, ${discoveredRuntimeRequests.size} runtime requests, ` +
    `${discoveredAssetRequests.size} asset requests, and ${sourceHtmlFiles.length} cached HTML files; ` +
    `${browserVerification.javascriptFiles} scripts target ECMA ${browserPolicy.javascriptEcmaVersion} ` +
    `for ${browserVerification.targets} browser releases with ${moduleVerification.files} ` +
    `boundary-checked modules; ${performanceVerification.files} initial files ` +
    `use ${performanceVerification.rawBytes} raw/${performanceVerification.gzipBytes} gzip bytes`,
);
