import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import parseSpdxExpression from "spdx-expression-parse";

import {
  packageAssetFiles,
  runtimeAssetFiles,
  sourceDirectory,
} from "./build-config.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, sourceDirectory);
const inventoryFile = path.join(projectRoot, "docs/runtime-dependencies.json");
const noticeFile = path.join(projectRoot, "THIRD_PARTY_NOTICES.md");
const sbomFile = path.join(projectRoot, "docs/runtime-dependencies.spdx.json");
const validModificationStatuses = new Set(["modified", "unmodified", "unverified"]);
const purlPattern = /^pkg:[a-z0-9.+-]+\/[^\s]+@[^\s]+$/;

function referencesFromHtml(html) {
  const activeHtml = html.replace(/<!--[\s\S]*?-->/g, "");
  return [...activeHtml.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map(
    (match) => match[1].split(/[?#]/, 1)[0],
  );
}

function matchesComponent(component, entryPoint) {
  return (
    component.paths?.includes(entryPoint) ||
    component.pathPrefixes?.some((prefix) => entryPoint.startsWith(prefix)) ||
    component.supportFiles?.includes(entryPoint) ||
    component.externalEntryPoints?.includes(entryPoint)
  );
}

function componentFor(components, entryPoint) {
  const matches = components.filter((component) => matchesComponent(component, entryPoint));
  if (matches.length !== 1) {
    throw new Error(
      `${entryPoint} must match exactly one dependency component; matched ${matches.length}`,
    );
  }
  return matches[0];
}

function sourceFile(entryPoint) {
  const packageAsset = packageAssetFiles[entryPoint];
  return packageAsset
    ? path.join(projectRoot, packageAsset)
    : path.join(sourceRoot, entryPoint);
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

async function checksumFor(entryPoints) {
  const hash = createHash("sha256");
  for (const entryPoint of [...entryPoints].sort()) {
    hash.update(entryPoint);
    hash.update("\0");
    hash.update(await readFile(sourceFile(entryPoint)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderNotices(inventory, resolvedComponents) {
  const lines = [
    "# Third-party notices",
    "",
    "This file is generated from `docs/runtime-dependencies.json` by",
    "`npm run dependencies:update`. It inventories code loaded by the production",
    "application from `src/lib` or an external production URL; it is not a substitute",
    "for the upstream license texts.",
    "",
    `Last reviewed: ${inventory.reviewedAt}`,
    "",
    "| Component | Version | License | Delivery | Audit identity | Modification | Purpose | Source |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const component of resolvedComponents) {
    const delivery = component.delivery;
    const auditIdentity = component.purl ??
      `exempt until ${component.auditExemption.expiresAt}`;
    const source = component.source === "NOASSERTION"
      ? "NOASSERTION"
      : `[upstream](${component.source})`;
    lines.push(
      `| ${markdownCell(component.name)} | ${markdownCell(component.version)} | ` +
        `${markdownCell(component.license)} | ${markdownCell(delivery)} | ` +
        `${markdownCell(auditIdentity)} | ${markdownCell(component.modificationStatus)} | ` +
        `${markdownCell(component.purpose)} | ${source} |`,
    );
  }

  lines.push(
    "",
    "Components without a resolvable package URL have a time-limited audit exemption",
    "with a documented reason in the source inventory. `NOASSERTION`, `unknown`, and",
    "`unverified` preserve unresolved provenance instead of guessing.",
    "",
  );
  return lines.join("\n");
}

function spdxIdForNpmPackage(name, version) {
  const normalized = `${name}-${version}`.replace(/[^A-Za-z0-9.-]/g, "-");
  return `SPDXRef-Package-npm-${normalized}`;
}

function npmPurl(name, version) {
  const encodedName = name.startsWith("@") ? `%40${name.slice(1)}` : name;
  return `pkg:npm/${encodedName}@${version}`;
}

function npmPackageEntry(packageLock, name) {
  const entry = packageLock.packages?.[`node_modules/${name}`];
  if (!entry?.version) throw new Error(`package-lock.json has no installed package ${name}`);
  return entry;
}

function bundledNpmComponents(packageLock, resolvedComponents) {
  const components = new Map();
  const dependencyRelationships = new Map();
  const containsRelationships = new Map();

  function addRelationship(collection, from, type, to) {
    const key = `${from}:${type}:${to}`;
    collection.set(key, {
      spdxElementId: from,
      relationshipType: type,
      relatedSpdxElement: to,
    });
  }

  function visit(rootComponent, parentId, packageName, ancestors) {
    if (ancestors.has(packageName)) return;
    const parentEntry = npmPackageEntry(packageLock, packageName);
    const nextAncestors = new Set(ancestors).add(packageName);

    for (const dependencyName of Object.keys(parentEntry.dependencies ?? {}).sort()) {
      const dependencyEntry = npmPackageEntry(packageLock, dependencyName);
      const purl = npmPurl(dependencyName, dependencyEntry.version);
      const dependencyId = spdxIdForNpmPackage(dependencyName, dependencyEntry.version);
      let component = components.get(purl);

      if (!component) {
        if (!dependencyEntry.license) {
          throw new Error(`${dependencyName}@${dependencyEntry.version} has no lockfile license`);
        }
        parseSpdxExpression(dependencyEntry.license);
        component = {
          id: `npm-${dependencyName}-${dependencyEntry.version}`,
          spdxId: dependencyId,
          name: dependencyName,
          version: dependencyEntry.version,
          purpose: "Bundled transitive dependency of a package-managed browser asset.",
          source: dependencyEntry.resolved ?? "NOASSERTION",
          downloadLocation: dependencyEntry.resolved ?? "NOASSERTION",
          license: dependencyEntry.license,
          purl,
          modificationStatus: "unmodified",
          delivery: "bundled",
          entryPoints: [],
          containedBy: new Set(),
        };
        components.set(purl, component);
      }

      component.containedBy.add(rootComponent.id);
      component.entryPoints.push(...rootComponent.entryPoints);
      addRelationship(dependencyRelationships, parentId, "DEPENDS_ON", dependencyId);
      addRelationship(
        containsRelationships,
        `SPDXRef-Package-${rootComponent.id}`,
        "CONTAINS",
        dependencyId,
      );
      visit(rootComponent, dependencyId, dependencyName, nextAncestors);
    }
  }

  for (const component of resolvedComponents.filter((candidate) => candidate.package)) {
    visit(component, `SPDXRef-Package-${component.id}`, component.package.name, new Set());
  }

  return {
    components: [...components.values()].map((component) => ({
      ...component,
      containedBy: [...component.containedBy].sort(),
      entryPoints: [...new Set(component.entryPoints)].sort(),
      delivery: `bundled in ${[...component.containedBy].sort().join(", ")}`,
    })),
    relationships: [
      ...dependencyRelationships.values(),
      ...containsRelationships.values(),
    ],
  };
}

function renderSpdx(inventory, packageJson, resolvedComponents, bundled) {
  const allComponents = [...resolvedComponents, ...bundled.components];
  const packages = allComponents.map((component) => {
    const result = {
      SPDXID: component.spdxId ?? `SPDXRef-Package-${component.id}`,
      name: component.name,
      versionInfo: component.version,
      downloadLocation: component.downloadLocation ?? component.source,
      filesAnalyzed: false,
      licenseConcluded: component.license,
      licenseDeclared: component.license,
      copyrightText: "NOASSERTION",
      comment:
        `${component.purpose} Delivery: ${component.delivery}. ` +
        `Modification status: ${component.modificationStatus}. ` +
        `Audit identity: ${component.purl ?? `exempt until ${component.auditExemption.expiresAt}`}. ` +
        `Reachable entry points: ${component.entryPoints.join(", ")}.`,
    };

    if (component.checksum) {
      result.checksums = [{ algorithm: "SHA256", checksumValue: component.checksum }];
    }
    if (component.purl) {
      result.externalRefs = [{
        referenceCategory: "PACKAGE-MANAGER",
        referenceType: "purl",
        referenceLocator: component.purl,
      }];
    }
    return result;
  });

  const relationships = [
    ...resolvedComponents.map((component) => ({
      spdxElementId: "SPDXRef-DOCUMENT",
      relationshipType: "DESCRIBES",
      relatedSpdxElement: `SPDXRef-Package-${component.id}`,
    })),
    ...bundled.relationships,
  ];
  const namespaceDigest = createHash("sha256").update(JSON.stringify({
    inventory,
    runtimeDependencies: packageJson.dependencies,
    packages,
    relationships,
  })).digest("hex");

  return `${JSON.stringify({
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `lvllvl-runtime-${packageJson.version}`,
    documentNamespace:
      `https://github.com/jaammees/lvllvl/sbom/${packageJson.version}/${namespaceDigest}`,
    creationInfo: {
      created: `${inventory.reviewedAt}T00:00:00Z`,
      creators: ["Tool: lvllvl dependency-inventory.mjs"],
    },
    packages,
    relationships,
  }, null, 2)}\n`;
}

function validateException(component, field) {
  const exception = component[field];
  if (
    !exception ||
    typeof exception.reason !== "string" ||
    !exception.reason.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(exception.expiresAt)
  ) {
    throw new Error(`${component.id} requires a reason and expiry in ${field}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  if (exception.expiresAt <= today) {
    throw new Error(`${component.id} has an expired ${field}: ${exception.expiresAt}`);
  }
}

async function buildInventory() {
  const inventory = JSON.parse(await readFile(inventoryFile, "utf8"));
  const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const packageLock = JSON.parse(await readFile(path.join(projectRoot, "package-lock.json"), "utf8"));
  const sourceIndex = await readFile(path.join(sourceRoot, "index.html"), "utf8");
  const productionIndex = await readFile(path.join(sourceRoot, "indexTemplate.html"), "utf8");
  const localEntryPoints = new Set([
    ...referencesFromHtml(sourceIndex).filter((reference) => reference.startsWith("lib/")),
    ...runtimeAssetFiles.filter((reference) => reference.startsWith("lib/")),
  ]);
  const externalEntryPoints = new Set(
    referencesFromHtml(productionIndex).filter((reference) => /^https?:\/\//.test(reference)),
  );
  const allEntryPoints = [...localEntryPoints, ...externalEntryPoints].sort();

  if (inventory.schemaVersion !== 2 || !/^\d{4}-\d{2}-\d{2}$/.test(inventory.reviewedAt)) {
    throw new Error("Dependency inventory schemaVersion or reviewedAt is invalid");
  }

  const ids = new Set();
  for (const component of inventory.components) {
    for (const field of ["id", "name", "version", "purpose", "source", "license", "modificationStatus"]) {
      if (typeof component[field] !== "string" || !component[field].trim()) {
        throw new Error(`Dependency component is missing ${field}: ${JSON.stringify(component)}`);
      }
    }
    if (ids.has(component.id)) throw new Error(`Duplicate dependency id: ${component.id}`);
    ids.add(component.id);
    if (!validModificationStatuses.has(component.modificationStatus)) {
      throw new Error(`Invalid modification status for ${component.id}`);
    }
    if (component.license === "NOASSERTION") {
      validateException(component, "licenseExemption");
    } else {
      try {
        parseSpdxExpression(component.license);
      } catch (error) {
        throw new Error(`Invalid SPDX license expression for ${component.id}: ${error.message}`);
      }
    }
    if (component.source === "NOASSERTION") {
      validateException(component, "sourceExemption");
    } else {
      try {
        const sourceUrl = new URL(component.source);
        if (!new Set(["https:", "http:"]).has(sourceUrl.protocol)) throw new Error("unsupported protocol");
      } catch {
        throw new Error(`Invalid source URL for ${component.id}: ${component.source}`);
      }
    }
    if (component.purl) {
      if (!purlPattern.test(component.purl)) {
        throw new Error(`Invalid package URL for ${component.id}: ${component.purl}`);
      }
      if (!component.purl.endsWith(`@${component.version}`)) {
        throw new Error(`${component.id} package URL does not match version ${component.version}`);
      }
      if (component.auditExemption) {
        throw new Error(`${component.id} cannot have both a package URL and audit exemption`);
      }
    } else {
      validateException(component, "auditExemption");
    }
    if (!component.paths?.length && !component.pathPrefixes?.length && !component.externalEntryPoints?.length) {
      throw new Error(`${component.id} does not identify any entry points`);
    }
  }

  for (const entryPoint of allEntryPoints) componentFor(inventory.components, entryPoint);

  for (const component of inventory.components) {
    for (const externalEntryPoint of component.externalEntryPoints ?? []) {
      if (!externalEntryPoints.has(externalEntryPoint)) {
        throw new Error(`${component.id} lists unused external entry point ${externalEntryPoint}`);
      }
    }
  }

  for (const entryPoint of localEntryPoints) await readFile(sourceFile(entryPoint));

  const supportFiles = new Set(
    inventory.components.flatMap((component) => component.supportFiles ?? []),
  );
  const vendoredFiles = (await listFiles(path.join(sourceRoot, "lib"), "lib/"));
  for (const filename of vendoredFiles) {
    if (!localEntryPoints.has(filename) && !supportFiles.has(filename)) {
      throw new Error(`Unreachable vendored file is not allowed: ${filename}`);
    }
    componentFor(inventory.components, filename);
  }
  for (const filename of supportFiles) await readFile(path.join(sourceRoot, filename));

  for (const [entryPoint, packageAsset] of Object.entries(packageAssetFiles)) {
    if (!localEntryPoints.has(entryPoint)) {
      throw new Error(`Package asset is not reachable: ${entryPoint}`);
    }
    await readFile(path.join(projectRoot, packageAsset));
    if (vendoredFiles.includes(entryPoint)) {
      throw new Error(`Package-managed asset is still vendored: ${entryPoint}`);
    }
    const component = componentFor(inventory.components, entryPoint);
    if (!component.package) throw new Error(`${entryPoint} has no package metadata`);
    if (packageJson.dependencies?.[component.package.name] !== component.package.version) {
      throw new Error(`${component.package.name} is not an exact matching runtime dependency`);
    }
    const expectedPurl = npmPurl(component.package.name, component.package.version);
    if (component.purl !== expectedPurl) {
      throw new Error(`${component.id} package URL must be ${expectedPurl}`);
    }
    const lockEntry = npmPackageEntry(packageLock, component.package.name);
    if (lockEntry.version !== component.package.version || !lockEntry.resolved) {
      throw new Error(`${component.package.name} is not exactly resolved in package-lock.json`);
    }
  }

  const resolvedComponents = [];
  for (const component of inventory.components) {
    const entryPoints = allEntryPoints.filter((entryPoint) => matchesComponent(component, entryPoint));
    if (!entryPoints.length) throw new Error(`${component.id} has no reachable entry points`);
    const localFiles = [
      ...entryPoints.filter((entryPoint) => localEntryPoints.has(entryPoint)),
      ...(component.supportFiles ?? []),
    ];
    resolvedComponents.push({
      ...component,
      delivery: component.package
        ? `npm: ${component.package.name}`
        : component.externalEntryPoints
          ? "external"
          : "vendored",
      downloadLocation: component.package
        ? npmPackageEntry(packageLock, component.package.name).resolved
        : component.source,
      entryPoints,
      checksum: localFiles.length ? await checksumFor(localFiles) : undefined,
    });
  }

  const bundled = bundledNpmComponents(packageLock, resolvedComponents);
  const allComponents = [...resolvedComponents, ...bundled.components];

  return {
    notice: renderNotices(inventory, allComponents),
    sbom: renderSpdx(inventory, packageJson, resolvedComponents, bundled),
    summary: {
      components: allComponents.length,
      directComponents: resolvedComponents.length,
      bundledComponents: bundled.components.length,
      external: externalEntryPoints.size,
      local: localEntryPoints.size,
      vendoredFiles: vendoredFiles.length,
    },
  };
}

async function checkFile(filename, expected) {
  let actual;
  try {
    actual = await readFile(filename, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (actual !== expected) {
    throw new Error(`${path.relative(projectRoot, filename)} is stale; run npm run dependencies:update`);
  }
}

const mode = process.argv[2] ?? "--check";
if (!new Set(["--check", "--write"]).has(mode)) {
  throw new Error("Usage: node scripts/dependency-inventory.mjs [--check|--write]");
}

const generated = await buildInventory();
if (mode === "--write") {
  await writeFile(noticeFile, generated.notice);
  await writeFile(sbomFile, generated.sbom);
} else {
  await checkFile(noticeFile, generated.notice);
  await checkFile(sbomFile, generated.sbom);
}

console.log(
  `Verified ${generated.summary.components} runtime components ` +
    `(${generated.summary.directComponents} direct and ` +
    `${generated.summary.bundledComponents} bundled), ` +
    `${generated.summary.local} local entry points, ${generated.summary.external} external entry points, ` +
    `and ${generated.summary.vendoredFiles} vendored files`,
);
