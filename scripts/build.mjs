import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { minify as minifyHtml } from "html-minifier-terser";
import { minify as minifyJavaScript } from "terser";

import {
  assetDirectories,
  buildDirectory,
  mainBundleExcludes,
  packageAssetFiles,
  runtimeAssetFiles,
  sourceDirectory,
  variableReplacements,
  version,
} from "./build-config.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, sourceDirectory);
const buildRoot = path.join(projectRoot, buildDirectory);
const constantsFile = path.join(projectRoot, "buildUtils/constants.js");
const thirdPartyNoticesFile = path.join(projectRoot, "THIRD_PARTY_NOTICES.md");
const thirdPartySbomFile = path.join(projectRoot, "docs/runtime-dependencies.spdx.json");

const outputDirectories = [
  "js/html",
  "css",
  "c64/wasm",
  "js/c64/wasm",
  "c64page/js",
];

let identifierIndex = 0;
const variableMap = new Map();

function sourceFile(relativePath) {
  const packageAsset = packageAssetFiles[relativePath];
  return packageAsset
    ? path.join(projectRoot, packageAsset)
    : path.join(sourceRoot, relativePath);
}

function replaceAll(content, search, replacement) {
  return content.split(search).join(replacement);
}

function identifierFor(index) {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let identifier = `${letters[Math.floor(index / 10) % 26]}${index % 10}`;
  let alphaPart = Math.floor(Math.floor(index / 10) / 26);

  for (let place = 0; place < 2 && alphaPart > 0; place += 1) {
    alphaPart -= 1;
    identifier = `${letters[alphaPart % 26]}${identifier}`;
    alphaPart = Math.floor(alphaPart / 26);
  }

  return identifier;
}

function replaceVariables(content, replacements) {
  const names = [...replacements].sort((left, right) => right.length - left.length);

  for (const name of names) {
    const replacement = identifierFor(identifierIndex);
    identifierIndex += 1;
    variableMap.set(name, replacement);
    content = replaceAll(content, name, replacement);
  }

  return content;
}

function replaceVariablesFromMap(content) {
  const entries = [...variableMap.entries()].sort(
    ([left], [right]) => right.length - left.length,
  );

  for (const [name, replacement] of entries) {
    content = replaceAll(content, name, replacement);
  }

  return content;
}

async function replaceConstants(content) {
  const constantsSource = await readFile(constantsFile, "utf8");
  const constants = new Map();

  for (const originalLine of constantsSource.split("\n")) {
    let line = originalLine.trim();
    if (!line) continue;

    line = line.replace(/^var\s+/, "").replace(/;+$/, "");
    const parts = line.split("=");
    if (parts.length !== 2) {
      throw new Error(`Invalid constant declaration: ${line}`);
    }

    const name = parts[0].trim();
    if (constants.has(name)) {
      throw new Error(`Duplicate constant: ${name}`);
    }

    constants.set(name, parts[1].trim());
    content = replaceAll(content, originalLine, "");
  }

  const entries = [...constants.entries()].sort(
    ([left], [right]) => right.length - left.length,
  );

  for (const [name, value] of entries) {
    content = replaceAll(content, name, value);
  }

  return content;
}

function referencesFromHtml(html, attribute, prefix) {
  const expression = new RegExp(`${attribute}="${prefix}([^"]+)`, "g");

  return [...html.matchAll(expression)].map((match) => {
    const reference = `${prefix}${match[1]}`;
    return reference.split("?", 1)[0];
  });
}

async function concatenateFiles(relativePaths) {
  const chunks = [];

  for (const relativePath of relativePaths) {
    const filename = sourceFile(relativePath);
    chunks.push(await readFile(filename, "utf8"));
  }

  return `${chunks.join("\n\n")}\n\n`;
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relativePath)));
    } else if (entry.isFile() && entry.name !== ".DS_Store") {
      files.push(relativePath);
    }
  }

  return files;
}

async function buildHtmlCache() {
  const htmlRoot = path.join(sourceRoot, "html");
  const files = await listFiles(htmlRoot);
  const assignments = ["g_htmlCache = {};"];

  for (const relativePath of files) {
    const html = await readFile(path.join(htmlRoot, relativePath), "utf8");
    const compactHtml = await minifyHtml(html, {
      collapseWhitespace: true,
      conservativeCollapse: true,
      keepClosingSlash: false,
      removeComments: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
    });
    const cacheKey = `html/${relativePath.split(path.sep).join("/")}`;
    assignments.push(`g_htmlCache[${JSON.stringify(cacheKey)}] = ${JSON.stringify(compactHtml)};`);
  }

  await writeFile(
    path.join(buildRoot, "js/html/htmlcache.js"),
    `${assignments.join("\n")}\n`,
  );
}

async function buildMainBundle(indexHtml) {
  const paths = referencesFromHtml(indexHtml, "src", "js/").filter(
    (filename) => !mainBundleExcludes.some((exclude) => filename.includes(exclude)),
  );

  let source = await concatenateFiles(paths);
  source = replaceAll(source, "{v}", version);
  source = await replaceConstants(source);
  source = replaceVariables(source, variableReplacements);

  const result = await minifyJavaScript(source, {
    compress: false,
    ecma: 5,
    mangle: true,
    safari10: true,
    format: {
      ascii_only: true,
      comments: false,
    },
  });

  if (!result.code) throw new Error("Terser did not produce the main bundle");
  await writeFile(path.join(buildRoot, "js/main.js"), `${result.code}\n`);
}

async function buildLibraryBundle(indexHtml) {
  const paths = referencesFromHtml(indexHtml, "src", "lib/").filter(
    (filename) => !mainBundleExcludes.some((exclude) => filename.includes(exclude)),
  );
  await writeFile(path.join(buildRoot, "js/libs.js"), await concatenateFiles(paths));
}

async function buildStyles(indexHtml) {
  const paths = referencesFromHtml(indexHtml, "href", "").filter(
    (filename) =>
      filename.endsWith(".css") &&
      !/^(?:[a-z]+:|\/\/|\/)/i.test(filename),
  );
  await writeFile(path.join(buildRoot, "css/style.css"), await concatenateFiles(paths));
}

async function copyWithBuildReplacements(source, destination) {
  let content = `${await readFile(source, "utf8")}\n\n`;
  content = await replaceConstants(content);
  content = replaceVariablesFromMap(content);
  await writeFile(destination, content);
}

async function writeIndexes() {
  const template = await readFile(path.join(sourceRoot, "indexTemplate.html"), "utf8");
  const index = `${replaceAll(template, "{v}", version)}\n\n`;
  await writeFile(path.join(buildRoot, "index.html"), index);

  let c64Index = index.replace("<head>", "<head>\n<base href=\"../\">");
  c64Index = c64Index.replace("<title>lvllvl</title>", "<title>C64</title>");
  c64Index = c64Index.replace(
    "Draw pictures using text characters",
    "Commodore 64 Emulator in a Web Browser",
  );
  c64Index = c64Index.replace(
    "https://lvllvl.com/images/logo-large.png",
    "https://lvllvl.com/images/c64.png",
  );
  c64Index = c64Index.replace(
    "https://lvllvl.com/images/logo32.png",
    "https://lvllvl.com/images/c64logo32.png",
  );
  c64Index = c64Index.replace(
    "https://lvllvl.com/images/logo16.png",
    "https://lvllvl.com/images/c64logo16.png",
  );
  await writeFile(path.join(buildRoot, "c64/index.html"), c64Index);

  const standaloneTemplate = await readFile(path.join(sourceRoot, "c64page/index.html"), "utf8");
  await writeFile(
    path.join(buildRoot, "c64page/index.html"),
    `${replaceAll(standaloneTemplate, "{v}", version)}\n\n`,
  );
}

async function patchC64Runtime() {
  const source = await readFile(path.join(sourceRoot, "c64/c64/c64.js"), "utf8");
  const versioned = replaceAll(source, "c64.wasm", `c64.wasm?v=${version}`);
  await writeFile(path.join(buildRoot, "c64/c64/c64.js"), versioned);
}

async function copyAssets() {
  for (const directory of assetDirectories) {
    await cp(path.join(sourceRoot, directory), path.join(buildRoot, directory), {
      filter: (filename) => path.basename(filename) !== ".DS_Store",
      force: true,
      recursive: true,
    });
  }
}

async function copyRuntimeAssets() {
  for (const relativePath of runtimeAssetFiles) {
    const destination = path.join(buildRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(sourceFile(relativePath), destination, { force: true });
  }
}

async function cleanBuildDirectory() {
  const expectedBuildRoot = path.join(projectRoot, "dist");
  if (buildRoot !== expectedBuildRoot || path.basename(buildRoot) !== "dist") {
    throw new Error(`Refusing to clean unexpected build directory: ${buildRoot}`);
  }

  await rm(buildRoot, { force: true, recursive: true });
}

async function build() {
  console.log(`Building lvllvl ${version} into a fresh ${buildDirectory}/`);

  identifierIndex = 0;
  variableMap.clear();
  await cleanBuildDirectory();

  for (const directory of outputDirectories) {
    await mkdir(path.join(buildRoot, directory), { recursive: true });
  }

  await copyAssets();
  await copyRuntimeAssets();

  const indexHtml = await readFile(path.join(sourceRoot, "index.html"), "utf8");
  await buildHtmlCache();
  await buildMainBundle(indexHtml);
  await buildLibraryBundle(indexHtml);
  await buildStyles(indexHtml);

  await copyWithBuildReplacements(
    path.join(sourceRoot, "js/utils/storageManager.js"),
    path.join(buildRoot, "js/storageManager.js"),
  );
  await cp(
    path.join(sourceRoot, "js/file/githubApi.js"),
    path.join(buildRoot, "js/githubApi.js"),
    { force: true },
  );
  await copyWithBuildReplacements(
    path.join(sourceRoot, "js/file/githubClient.js"),
    path.join(buildRoot, "js/githubClient.js"),
  );
  await cp(
    path.join(sourceRoot, "js/assembler/acmeAssembler.js"),
    path.join(buildRoot, "js/acmeAssembler.js"),
    { force: true },
  );
  await cp(
    path.join(sourceRoot, "js/assembler/ca65Assembler.js"),
    path.join(buildRoot, "js/ca65Assembler.js"),
    { force: true },
  );
  await cp(path.join(sourceRoot, "js/c64/c64.js"), path.join(buildRoot, "js/c64/c64.js"), {
    force: true,
  });
  await cp(path.join(sourceRoot, "manifest.json"), path.join(buildRoot, "manifest.json"), {
    force: true,
  });
  await cp(thirdPartyNoticesFile, path.join(buildRoot, "THIRD_PARTY_NOTICES.md"), {
    force: true,
  });
  await cp(thirdPartySbomFile, path.join(buildRoot, "runtime-dependencies.spdx.json"), {
    force: true,
  });
  await writeIndexes();
  await patchC64Runtime();

  const wasmSource = path.join(sourceRoot, "c64/c64/c64.wasm");
  await cp(wasmSource, path.join(buildRoot, "js/c64/wasm/c64.wasm"), { force: true });
  await cp(wasmSource, path.join(buildRoot, "c64page/js/c64.wasm"), { force: true });

  console.log("Build complete");
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) await build();

export { build };
