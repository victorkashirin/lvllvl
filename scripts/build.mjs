import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { minify as minifyHtml } from "html-minifier-terser";
import MagicString, { Bundle as MagicStringBundle } from "magic-string";
import { rollup } from "rollup";
import { minify as minifyJavaScript } from "terser";

import { browserPolicy } from "./browser-policy.mjs";
import { buildGraph, copiedScripts } from "./build-graph.mjs";
import {
  assetDirectories,
  buildDirectory,
  packageAssetFiles,
  runtimeAssetFiles,
  sourceDirectory,
  sourceMapPolicy,
} from "./build-config.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, sourceDirectory);
const publishedBuildRoot = path.join(projectRoot, buildDirectory);
const thirdPartyNoticesFile = path.join(projectRoot, "THIRD_PARTY_NOTICES.md");
const thirdPartySbomFile = path.join(projectRoot, "docs/runtime-dependencies.spdx.json");

const outputDirectories = [
  "js/html",
  "css",
  "c64/wasm",
  "js/c64/wasm",
  "c64page/js",
];

let buildRoot = publishedBuildRoot;
let version;

function sourceFile(relativePath) {
  const packageAsset = packageAssetFiles[relativePath];
  return packageAsset
    ? path.join(projectRoot, packageAsset)
    : path.join(sourceRoot, relativePath);
}

function renderVersion(content) {
  return content.split("{v}").join(version);
}

function replaceRequired(content, searchValue, replacement, filename) {
  if (!content.includes(searchValue)) {
    throw new Error(`${filename} is missing expected content: ${searchValue}`);
  }
  return content.replace(searchValue, replacement);
}

async function concatenateFiles(relativePaths) {
  const chunks = [];

  for (const relativePath of relativePaths) {
    chunks.push(await readFile(sourceFile(relativePath), "utf8"));
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
    assignments.push(
      `g_htmlCache[${JSON.stringify(cacheKey)}] = ${JSON.stringify(compactHtml)};`,
    );
  }

  await writeFile(
    path.join(buildRoot, "js/html/htmlcache.js"),
    `${assignments.join("\n")}\n`,
  );
}

async function bundleLegacyJavaScript(output, graph) {
  const sourceBundle = new MagicStringBundle({ separator: "\n\n" });
  for (const relativePath of graph.inputs) {
    const content = renderVersion(await readFile(sourceFile(relativePath), "utf8"));
    sourceBundle.addSource({
      content: new MagicString(content, { filename: relativePath }),
      filename: relativePath,
    });
  }

  const outputName = path.posix.basename(output);
  const mapName = `${outputName}.map`;
  // Rollup intentionally suppresses source maps for \0-prefixed virtual modules.
  // A filesystem-style synthetic ID keeps the chained per-file mappings intact.
  const virtualId = path.join(projectRoot, ".legacy-entry", output);
  const inputMap = sourceBundle.generateMap({
    file: `${outputName}.entry.js`,
    hires: true,
    includeContent: sourceMapPolicy.includeSources,
  });
  const rollupBuild = await rollup({
    context: "window",
    input: virtualId,
    plugins: [
      {
        name: "lvllvl-legacy-entry",
        resolveId(id) {
          if (id === virtualId) return id;
          return null;
        },
        load(id) {
          if (id !== virtualId) return null;
          return { code: sourceBundle.toString(), map: inputMap.toString() };
        },
      },
    ],
    treeshake: false,
  });

  let generated;
  try {
    generated = await rollupBuild.generate({
      entryFileNames: outputName,
      format: "es",
      sourcemap: true,
    });
  } finally {
    await rollupBuild.close();
  }

  const chunk = generated.output.find((entry) => entry.type === "chunk");
  if (!chunk?.code || !chunk.map) throw new Error(`Rollup did not produce ${output}`);

  const rollupMap = JSON.parse(chunk.map.toString());
  if (rollupMap.sources.length !== graph.inputs.length) {
    throw new Error(
      `Rollup source map for ${output} covers ${rollupMap.sources.length} sources; ` +
        `expected ${graph.inputs.length}`,
    );
  }
  rollupMap.file = outputName;
  rollupMap.sources = [...graph.inputs];

  if (!graph.minify) {
    const sourceMapReference = graph.sourceMap ? `\n//# sourceMappingURL=${mapName}\n` : "\n";
    await writeFile(path.join(buildRoot, output), `${chunk.code}${sourceMapReference}`);
    if (graph.sourceMap && sourceMapPolicy.publish) {
      await writeFile(
        path.join(buildRoot, path.posix.dirname(output), mapName),
        JSON.stringify(rollupMap),
      );
    }
    return;
  }

  const result = await minifyJavaScript({ [outputName]: chunk.code }, {
    compress: false,
    ecma: browserPolicy.javascriptEcmaVersion,
    mangle: true,
    format: {
      ascii_only: true,
      comments: false,
    },
    sourceMap: graph.sourceMap
      ? {
          filename: outputName,
          content: rollupMap,
          includeSources: sourceMapPolicy.includeSources,
          url: mapName,
        }
      : undefined,
  });

  if (!result.code) throw new Error(`Terser did not produce ${output}`);
  await writeFile(path.join(buildRoot, output), `${result.code}\n`);

  if (graph.sourceMap && sourceMapPolicy.publish) {
    if (!result.map) throw new Error(`Terser did not produce ${output}.map`);
    await writeFile(path.join(buildRoot, path.posix.dirname(output), mapName), result.map);
  }
}

async function buildDeclaredGraph() {
  for (const [output, graph] of Object.entries(buildGraph)) {
    await mkdir(path.join(buildRoot, path.posix.dirname(output)), { recursive: true });
    if (graph.kind === "javascript") {
      await bundleLegacyJavaScript(output, graph);
    } else {
      await writeFile(path.join(buildRoot, output), await concatenateFiles(graph.inputs));
    }
  }
}

async function writeIndexes() {
  const template = await readFile(path.join(sourceRoot, "index.html"), "utf8");
  const index = `${renderVersion(template)}\n`;
  await writeFile(path.join(buildRoot, "index.html"), index);

  let c64Index = replaceRequired(
    index,
    "<head>",
    '<head>\n<base href="../">',
    "src/index.html",
  );
  c64Index = replaceRequired(
    c64Index,
    "<title>lvllvl</title>",
    "<title>C64</title>",
    "src/index.html",
  );
  c64Index = replaceRequired(
    c64Index,
    "Draw pictures using text characters",
    "Commodore 64 Emulator in a Web Browser",
    "src/index.html",
  );
  c64Index = replaceRequired(
    c64Index,
    "images/logo-large.png",
    "images/c64.png",
    "src/index.html",
  );
  c64Index = replaceRequired(
    c64Index,
    "images/logo32.png",
    "images/c64logo32.png",
    "src/index.html",
  );
  c64Index = replaceRequired(
    c64Index,
    "images/logo16.png",
    "images/c64logo16.png",
    "src/index.html",
  );
  await writeFile(path.join(buildRoot, "c64/index.html"), c64Index);

  const standaloneTemplate = await readFile(path.join(sourceRoot, "c64page/index.html"), "utf8");
  await writeFile(
    path.join(buildRoot, "c64page/index.html"),
    `${renderVersion(standaloneTemplate)}\n`,
  );
}

async function patchC64Runtime() {
  const source = await readFile(path.join(sourceRoot, "c64/c64/c64.js"), "utf8");
  const versioned = source.split("c64.wasm").join(`c64.wasm?v=${version}`);
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

async function copyStandaloneScripts() {
  for (const [output, source] of Object.entries(copiedScripts)) {
    const content = renderVersion(await readFile(path.join(sourceRoot, source), "utf8"));
    await writeFile(path.join(buildRoot, output), `${content}\n`);
  }
}

async function publishDirectory(stagedDirectory, publishedDirectory) {
  const stagedStats = await lstat(stagedDirectory);
  if (!stagedStats.isDirectory() || stagedStats.isSymbolicLink()) {
    throw new Error(`Staged build is not a directory: ${stagedDirectory}`);
  }

  const publishedParent = path.dirname(publishedDirectory);
  if (path.dirname(stagedDirectory) !== publishedParent) {
    throw new Error("Staged and published builds must share a directory for atomic publication");
  }

  const buildPrefix = `.${path.basename(publishedDirectory)}-build-`;
  const nextLink = `${publishedDirectory}.next-${randomUUID()}`;
  let previousBuildDirectory;
  let legacyBuildDirectory;

  await symlink(path.basename(stagedDirectory), nextLink, "dir");

  try {
    let publishedStats;
    try {
      publishedStats = await lstat(publishedDirectory);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    if (publishedStats?.isSymbolicLink()) {
      const currentTarget = path.resolve(publishedParent, await readlink(publishedDirectory));
      if (
        path.dirname(currentTarget) === publishedParent &&
        path.basename(currentTarget).startsWith(buildPrefix)
      ) {
        previousBuildDirectory = currentTarget;
      }
      await rename(nextLink, publishedDirectory);
    } else if (publishedStats?.isDirectory()) {
      // One-time migration from the legacy physical dist directory. All later
      // publishes are a single atomic rename of the version-pointer symlink.
      legacyBuildDirectory = path.join(
        publishedParent,
        `${buildPrefix}legacy-${randomUUID()}`,
      );
      await rename(publishedDirectory, legacyBuildDirectory);
      try {
        await rename(nextLink, publishedDirectory);
      } catch (error) {
        await rename(legacyBuildDirectory, publishedDirectory);
        throw error;
      }
      previousBuildDirectory = legacyBuildDirectory;
    } else if (publishedStats) {
      throw new Error(
        `Published build is neither a directory nor a symlink: ${publishedDirectory}`,
      );
    } else {
      await rename(nextLink, publishedDirectory);
    }
  } catch (error) {
    await rm(nextLink, { force: true });
    throw error;
  }

  if (previousBuildDirectory && previousBuildDirectory !== stagedDirectory) {
    await rm(previousBuildDirectory, { force: true, recursive: true }).catch((error) => {
      console.warn(`Could not remove previous build ${previousBuildDirectory}: ${error.message}`);
    });
  }
}

async function build() {
  const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  version = packageJson.version;
  if (typeof version !== "string" || version.trim() === "") {
    throw new Error("package.json must contain a release version");
  }

  console.log(`Building lvllvl ${version} in a temporary directory`);
  const stagedBuildRoot = await mkdtemp(path.join(projectRoot, `.${buildDirectory}-build-`));
  buildRoot = stagedBuildRoot;

  try {
    for (const directory of outputDirectories) {
      await mkdir(path.join(buildRoot, directory), { recursive: true });
    }

    await copyAssets();
    await copyRuntimeAssets();
    await buildHtmlCache();
    await buildDeclaredGraph();
    await copyStandaloneScripts();

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

    await publishDirectory(stagedBuildRoot, publishedBuildRoot);
    console.log(`Build complete: published ${buildDirectory}/`);
  } catch (error) {
    await rm(stagedBuildRoot, { force: true, recursive: true });
    throw error;
  } finally {
    buildRoot = publishedBuildRoot;
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) await build();

export { build, publishDirectory };
