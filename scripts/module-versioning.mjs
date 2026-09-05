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
