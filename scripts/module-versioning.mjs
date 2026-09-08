import path from "node:path";

import { parse } from "acorn";

function importSpecifiers(ast) {
  const specifiers = [];

  function visit(node) {
    if (
      (node.type === "ImportDeclaration" ||
        node.type === "ExportAllDeclaration" ||
        node.type === "ExportNamedDeclaration") &&
      node.source
    ) {
      specifiers.push(node.source);
    } else if (node.type === "ImportExpression" && node.source.type === "Literal") {
      specifiers.push(node.source);
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child?.type) visit(child);
        }
      } else if (value?.type) {
        visit(value);
      }
    }
  }

  visit(ast);
  return specifiers;
}

export function versionModuleImports(source, version) {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const suffix = `?v=${encodeURIComponent(version)}`;
  const replacements = importSpecifiers(ast)
    .filter(({ value }) => typeof value === "string" && /^\..*\.mjs$/.test(value))
    .sort((left, right) => right.end - left.end);

  let versioned = source;
  for (const specifier of replacements) {
    versioned = `${versioned.slice(0, specifier.end - 1)}${suffix}${versioned.slice(specifier.end - 1)}`;
  }
  return versioned;
}

/**
 * @param {string} source
 * @param {Record<string, string>} replacements
 */
export function rewriteModuleImports(source, replacements) {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const rewrittenSpecifiers = importSpecifiers(ast)
    .filter(({ value }) => typeof value === "string" && replacements[value])
    .sort((left, right) => right.end - left.end);

  let rewritten = source;
  for (const specifier of rewrittenSpecifiers) {
    rewritten = `${rewritten.slice(0, specifier.start + 1)}` +
      `${replacements[specifier.value]}${rewritten.slice(specifier.end - 1)}`;
  }
  return rewritten;
}

/**
 * Rewrite bare dependency imports to their relative production outputs using
 * the authoritative dependency mapping from the build configuration.
 *
 * @param {string} source
 * @param {string} output
 * @param {Record<string, { output: string }>} dependencies
 */
export function rewriteModuleDependencyImports(source, output, dependencies) {
  const replacements = Object.fromEntries(Object.entries(dependencies)
    .map(([specifier, dependency]) => {
      let relative = path.posix.relative(path.posix.dirname(output), dependency.output);
      if (!relative.startsWith(".")) relative = `./${relative}`;
      return [specifier, relative];
    }));
  return rewriteModuleImports(source, replacements);
}

/**
 * @param {string} source
 * @param {string} output
 * @param {string} version
 * @param {Record<string, { output: string }>} dependencies
 */
export function prepareProductionModule(source, output, version, dependencies) {
  return versionModuleImports(
    rewriteModuleDependencyImports(source, output, dependencies),
    version,
  );
}
