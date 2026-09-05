import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { buildGraph, legacyGraphExceptions } from "./build-graph.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselineRelativeFile = "tests/fixtures/legacy-main-graph.json";
const baselineFile = path.join(projectRoot, baselineRelativeFile);
const runFile = promisify(execFile);

function validExpiry(expires, now) {
  if (typeof expires !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return false;
  const expiry = new Date(`${expires}T23:59:59.999Z`);
  return Number.isFinite(expiry.valueOf()) && expiry > now;
}

export function verifyLegacyBaselineEvolution({ baselineInputs, previousInputs }) {
  if (!Array.isArray(baselineInputs) || !Array.isArray(previousInputs)) {
    throw new TypeError("Legacy baseline evolution requires current and previous input arrays");
  }

  const previous = new Set(previousInputs);
  const additions = baselineInputs.filter((filename) => !previous.has(filename));
  if (additions.length > 0) {
    throw new Error(
      `Legacy graph baseline cannot grow; use an expiring exception instead: ${additions.join(", ")}`,
    );
  }

  const current = new Set(baselineInputs);
  const retainedPrevious = previousInputs.filter((filename) => current.has(filename));
  if (retainedPrevious.some((filename, index) => filename !== baselineInputs[index])) {
    throw new Error("Legacy graph baseline cannot reorder retained inputs");
  }
}

export function comparisonReference(environment = process.env) {
  if (environment.LEGACY_GRAPH_BASE_REF) {
    return { reference: environment.LEGACY_GRAPH_BASE_REF, required: true };
  }
  if (environment.GITHUB_BASE_REF) {
    return { reference: `origin/${environment.GITHUB_BASE_REF}`, required: true };
  }
  if (environment.CI === "true" && environment.GITHUB_EVENT_NAME === "push") {
    const before = environment.GITHUB_EVENT_BEFORE;
    if (!before || /^0+$/.test(before)) {
      throw new Error("Push CI requires the event's before SHA for legacy graph comparison");
    }
    return { reference: before, required: true };
  }
  return { reference: "HEAD", required: false };
}

async function previousBaselineInputs() {
  let { reference, required } = comparisonReference();
  if (!required && reference === "HEAD") {
    for (const candidate of ["main", "origin/main"]) {
      try {
        const { stdout } = await runFile("git", ["merge-base", "HEAD", candidate], {
          cwd: projectRoot,
        });
        reference = stdout.trim();
        break;
      } catch {
        // A local checkout is not required to expose either conventional main ref.
      }
    }
  }
  try {
    await runFile("git", ["rev-parse", "--verify", `${reference}^{commit}`], {
      cwd: projectRoot,
    });
  } catch (error) {
    if (!required) return null;
    throw new Error(`Cannot resolve legacy graph comparison reference ${reference}`, {
      cause: error,
    });
  }

  try {
    await runFile("git", ["cat-file", "-e", `${reference}:${baselineRelativeFile}`], {
      cwd: projectRoot,
    });
  } catch {
    // On Phase 0's first introduction the base revision has no fixture yet, so
    // derive the protected inputs from its already-reviewed build graph.
    const { stdout } = await runFile(
      "git",
      ["show", `${reference}:scripts/build-graph.mjs`],
      { cwd: projectRoot, maxBuffer: 4 * 1024 * 1024 },
    );
    const encodedSource = Buffer.from(stdout).toString("base64");
    const previousGraph = await import(`data:text/javascript;base64,${encodedSource}`);
    const inputs = previousGraph.buildGraph?.["js/main.js"]?.inputs;
    if (!Array.isArray(inputs)) {
      throw new Error(`Legacy application graph is unavailable at ${reference}`);
    }
    return inputs;
  }

  const { stdout } = await runFile(
    "git",
    ["show", `${reference}:${baselineRelativeFile}`],
    { cwd: projectRoot, maxBuffer: 4 * 1024 * 1024 },
  );
  const previous = JSON.parse(stdout);
  if (previous.schemaVersion !== 1 || previous.graph !== "js/main.js") {
    throw new Error(`Legacy graph baseline at ${reference} has an unsupported schema or target`);
  }
  return previous.inputs;
}

export function verifyLegacyGraphPolicy({
  baselineInputs,
  currentInputs,
  exceptions = {},
  now = new Date(),
}) {
  if (!Array.isArray(baselineInputs) || !Array.isArray(currentInputs)) {
    throw new TypeError("Legacy graph policy requires baseline and current input arrays");
  }
  if (new Set(baselineInputs).size !== baselineInputs.length) {
    throw new Error("Legacy graph baseline contains duplicate inputs");
  }
  if (new Set(currentInputs).size !== currentInputs.length) {
    throw new Error("Legacy application graph contains duplicate inputs");
  }

  const baseline = new Set(baselineInputs);
  const current = new Set(currentInputs);
  const additions = currentInputs.filter((filename) => !baseline.has(filename));
  const removals = baselineInputs.filter((filename) => !current.has(filename));

  if (removals.length > 0) {
    throw new Error(
      `Legacy graph baseline retains removed inputs; update the shrinking baseline: ${removals.join(", ")}`,
    );
  }

  for (const filename of additions) {
    const exception = exceptions[filename];
    if (!exception) {
      throw new Error(
        `New legacy application input requires a reviewed exception: ${filename}`,
      );
    }
    if (typeof exception.reason !== "string" || exception.reason.trim() === "") {
      throw new Error(`Legacy graph exception requires a reason: ${filename}`);
    }
    if (!validExpiry(exception.expires, now)) {
      throw new Error(`Legacy graph exception is expired or has an invalid expiry: ${filename}`);
    }
  }

  const staleExceptions = Object.keys(exceptions).filter((filename) => !additions.includes(filename));
  if (staleExceptions.length > 0) {
    throw new Error(`Legacy graph has unused exceptions: ${staleExceptions.join(", ")}`);
  }

  const grandfatheredInputs = currentInputs.filter((filename) => baseline.has(filename));
  if (grandfatheredInputs.some((filename, index) => filename !== baselineInputs[index])) {
    throw new Error("Legacy application inputs changed their reviewed order");
  }

  return {
    exceptions: additions.length,
    grandfathered: baselineInputs.length,
    inputs: currentInputs.length,
  };
}

export async function verifyProductionLegacyGraph() {
  const baseline = JSON.parse(await readFile(baselineFile, "utf8"));
  if (baseline.schemaVersion !== 1 || baseline.graph !== "js/main.js") {
    throw new Error("Legacy graph baseline has an unsupported schema or target");
  }
  const previousInputs = await previousBaselineInputs();
  if (previousInputs) {
    verifyLegacyBaselineEvolution({
      baselineInputs: baseline.inputs,
      previousInputs,
    });
  }
  return verifyLegacyGraphPolicy({
    baselineInputs: baseline.inputs,
    currentInputs: buildGraph["js/main.js"].inputs,
    exceptions: legacyGraphExceptions,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyProductionLegacyGraph();
  console.log(
    `Legacy graph policy: ${result.inputs} inputs (${result.grandfathered} grandfathered, ` +
      `${result.exceptions} temporary exceptions)`,
  );
}
