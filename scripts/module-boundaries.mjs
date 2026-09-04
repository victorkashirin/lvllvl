import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "acorn";

import { moduleGraph } from "./build-graph.mjs";
import { sourceDirectory } from "./build-config.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSourceRoot = path.join(projectRoot, sourceDirectory);
const forbiddenGlobals = new Set([
  "document",
  "eval",
  "g_app",
  "globalThis",
  "localStorage",
  "navigator",
  "sessionStorage",
  "window",
]);

function forEachChild(node, visit) {
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

function moduleImports(ast, filename) {
  const imports = [];

  function visit(node) {
    if (
      (node.type === "ImportDeclaration" ||
        node.type === "ExportAllDeclaration" ||
        node.type === "ExportNamedDeclaration") &&
      node.source
    ) {
      imports.push(node.source.value);
    }
    if (node.type === "ImportExpression") {
      if (node.source.type !== "Literal" || typeof node.source.value !== "string") {
        throw new Error(`${filename} has a non-literal dynamic import`);
      }
      imports.push(node.source.value);
    }

    forEachChild(node, visit);
  }

  visit(ast);
  return imports;
}

function addPatternBindings(pattern, scope) {
  if (!pattern) return;

  switch (pattern.type) {
    case "Identifier":
      scope.bindings.add(pattern.name);
      break;
    case "RestElement":
      addPatternBindings(pattern.argument, scope);
      break;
    case "AssignmentPattern":
      addPatternBindings(pattern.left, scope);
      break;
    case "ArrayPattern":
      for (const element of pattern.elements) addPatternBindings(element, scope);
      break;
    case "ObjectPattern":
      for (const property of pattern.properties) {
        addPatternBindings(property.type === "RestElement" ? property.argument : property.value, scope);
      }
      break;
  }
}

function nearestVariableScope(scope) {
  while (scope.type !== "function" && scope.type !== "program") scope = scope.parent;
  return scope;
}

function buildScopeMap(ast) {
  const scopeByNode = new WeakMap();

  function createScope(node, parent, type) {
    const scope = { bindings: new Set(), parent, type };
    scopeByNode.set(node, scope);
    return scope;
  }

  const rootScope = createScope(ast, null, "program");

  function visitFunction(node, parentScope) {
    const parameterScope = createScope(node, parentScope, "parameters");
    if (node.type === "FunctionExpression" && node.id) {
      parameterScope.bindings.add(node.id.name);
    }
    for (const parameter of node.params) addPatternBindings(parameter, parameterScope);
    for (const parameter of node.params) visit(parameter, parameterScope);

    // Body declarations are deliberately one scope below default parameter
    // expressions: `function f(value = window) { var window; }` still reads
    // the outer `window` while evaluating the default.
    const functionScope = { bindings: new Set(), parent: parameterScope, type: "function" };
    visit(node.body, functionScope);
  }

  function visitClass(node, parentScope) {
    const scope = createScope(node, parentScope, "class");
    if (node.id) scope.bindings.add(node.id.name);
    if (node.superClass) visit(node.superClass, scope);
    visit(node.body, scope);
  }

  function visit(node, scope) {
    switch (node.type) {
      case "Program":
        for (const statement of node.body) visit(statement, scope);
        return;
      case "ImportDeclaration":
        for (const specifier of node.specifiers) scope.bindings.add(specifier.local.name);
        return;
      case "VariableDeclaration": {
        const declarationScope = node.kind === "var" ? nearestVariableScope(scope) : scope;
        for (const declaration of node.declarations) {
          addPatternBindings(declaration.id, declarationScope);
          visit(declaration.id, scope);
          if (declaration.init) visit(declaration.init, scope);
        }
        return;
      }
      case "FunctionDeclaration":
        if (node.id) scope.bindings.add(node.id.name);
        visitFunction(node, scope);
        return;
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        visitFunction(node, scope);
        return;
      case "ClassDeclaration":
        if (node.id) scope.bindings.add(node.id.name);
        visitClass(node, scope);
        return;
      case "ClassExpression":
        visitClass(node, scope);
        return;
      case "BlockStatement": {
        const blockScope = createScope(node, scope, "block");
        for (const statement of node.body) visit(statement, blockScope);
        return;
      }
      case "CatchClause": {
        const catchScope = createScope(node, scope, "block");
        addPatternBindings(node.param, catchScope);
        if (node.param) visit(node.param, catchScope);
        visit(node.body, catchScope);
        return;
      }
      case "ForStatement": {
        const loopScope = createScope(node, scope, "block");
        forEachChild(node, (child) => visit(child, loopScope));
        return;
      }
      case "ForInStatement":
      case "ForOfStatement": {
        const loopScope = createScope(node, scope, "block");
        visit(node.left, loopScope);
        // A lexical iteration binding is not available while the iterable is
        // evaluated (`for (const window of window.frames)`).
        visit(node.right, scope);
        visit(node.body, loopScope);
        return;
      }
      case "SwitchStatement": {
        const switchScope = createScope(node, scope, "block");
        visit(node.discriminant, scope);
        for (const switchCase of node.cases) visit(switchCase, switchScope);
        return;
      }
      case "StaticBlock": {
        const staticScope = createScope(node, scope, "function");
        for (const statement of node.body) visit(statement, staticScope);
        return;
      }
      default:
        forEachChild(node, (child) => visit(child, scope));
    }
  }

  visit(ast, rootScope);
  return scopeByNode;
}

function usedForbiddenGlobals(ast) {
  const used = new Set();
  const scopeByNode = buildScopeMap(ast);

  function isBound(name, scope) {
    for (let current = scope; current; current = current.parent) {
      if (current.bindings.has(name)) return true;
    }
    return false;
  }

  function visitBindingPattern(pattern, scope) {
    if (!pattern) return;

    switch (pattern.type) {
      case "AssignmentPattern":
        visitBindingPattern(pattern.left, scope);
        visit(pattern.right, scope);
        break;
      case "ArrayPattern":
        for (const element of pattern.elements) visitBindingPattern(element, scope);
        break;
      case "ObjectPattern":
        for (const property of pattern.properties) {
          if (property.type === "RestElement") {
            visitBindingPattern(property.argument, scope);
          } else {
            if (property.computed) visit(property.key, scope);
            visitBindingPattern(property.value, scope);
          }
        }
        break;
      case "RestElement":
        visitBindingPattern(pattern.argument, scope);
        break;
    }
  }

  function visitAssignmentTarget(target, scope) {
    if (!target) return;

    switch (target.type) {
      case "Identifier":
        visit(target, scope);
        break;
      case "MemberExpression":
        visit(target.object, scope);
        if (target.computed) visit(target.property, scope);
        break;
      case "AssignmentPattern":
        visitAssignmentTarget(target.left, scope);
        visit(target.right, scope);
        break;
      case "ArrayPattern":
        for (const element of target.elements) visitAssignmentTarget(element, scope);
        break;
      case "ObjectPattern":
        for (const property of target.properties) {
          if (property.type === "RestElement") {
            visitAssignmentTarget(property.argument, scope);
          } else {
            if (property.computed) visit(property.key, scope);
            visitAssignmentTarget(property.value, scope);
          }
        }
        break;
      case "RestElement":
        visitAssignmentTarget(target.argument, scope);
        break;
      default:
        visit(target, scope);
    }
  }

  function visitFunction(node, scope) {
    for (const parameter of node.params) visitBindingPattern(parameter, scope);
    visit(node.body, scope);
  }

  function visit(node, inheritedScope) {
    const scope = scopeByNode.get(node) ?? inheritedScope;

    switch (node.type) {
      case "Identifier":
        if (forbiddenGlobals.has(node.name) && !isBound(node.name, scope)) used.add(node.name);
        return;
      case "ImportDeclaration":
      case "Literal":
      case "MetaProperty":
      case "PrivateIdentifier":
      case "Super":
      case "ThisExpression":
        return;
      case "VariableDeclaration":
        for (const declaration of node.declarations) {
          visitBindingPattern(declaration.id, scope);
          if (declaration.init) visit(declaration.init, scope);
        }
        return;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        visitFunction(node, scope);
        return;
      case "ClassDeclaration":
      case "ClassExpression":
        if (node.superClass) visit(node.superClass, scope);
        visit(node.body, scope);
        return;
      case "MemberExpression":
        visit(node.object, scope);
        if (node.computed) visit(node.property, scope);
        return;
      case "Property":
        if (node.computed) visit(node.key, scope);
        visit(node.value, scope);
        return;
      case "MethodDefinition":
      case "PropertyDefinition":
        if (node.computed) visit(node.key, scope);
        if (node.value) visit(node.value, scope);
        return;
      case "LabeledStatement":
        visit(node.body, scope);
        return;
      case "BreakStatement":
      case "ContinueStatement":
        return;
      case "AssignmentExpression":
        visitAssignmentTarget(node.left, scope);
        visit(node.right, scope);
        return;
      case "UpdateExpression":
        visitAssignmentTarget(node.argument, scope);
        return;
      case "ForInStatement":
      case "ForOfStatement":
        if (node.left.type === "VariableDeclaration") visit(node.left, scope);
        else visitAssignmentTarget(node.left, scope);
        visit(node.right, inheritedScope);
        visit(node.body, scope);
        return;
      case "SwitchStatement":
        visit(node.discriminant, inheritedScope);
        for (const switchCase of node.cases) visit(switchCase, scope);
        return;
      case "ExportNamedDeclaration":
        if (node.declaration) visit(node.declaration, scope);
        if (!node.source) {
          for (const specifier of node.specifiers) visit(specifier.local, scope);
        }
        return;
      case "ExportDefaultDeclaration":
        visit(node.declaration, scope);
        return;
      case "ExportAllDeclaration":
        return;
      case "ArrayPattern":
      case "ObjectPattern":
      case "RestElement":
      case "AssignmentPattern":
        visitBindingPattern(node, scope);
        return;
      default:
        forEachChild(node, (child) => visit(child, scope));
    }
  }

  visit(ast, scopeByNode.get(ast));
  return [...used].sort();
}

function matchingLayer(filename, layers) {
  return Object.entries(layers)
    .filter(([prefix]) => filename === prefix || filename.startsWith(prefix))
    .sort(([left], [right]) => right.length - left.length)[0];
}

function resolveModuleImport(importer, specifier) {
  const withoutQuery = specifier.split(/[?#]/, 1)[0];
  if (!withoutQuery.startsWith(".")) {
    throw new Error(`${importer} imports unsupported external module ${specifier}`);
  }
  return path.posix.normalize(path.posix.join(path.posix.dirname(importer), withoutQuery));
}

export async function verifyModuleBoundaries({ graph = moduleGraph, sourceRoot = defaultSourceRoot } = {}) {
  const declaredFiles = new Set(Object.values(graph.files));
  if (!declaredFiles.has(graph.entry)) {
    throw new Error(`Module entry is not declared: ${graph.entry}`);
  }

  const dependencies = new Map();
  for (const filename of declaredFiles) {
    const source = await readFile(path.join(sourceRoot, filename), "utf8");
    const ast = parse(source, {
      ecmaVersion: "latest",
      sourceFile: filename,
      sourceType: "module",
    });
    const importedFiles = moduleImports(ast, filename).map((specifier) =>
      resolveModuleImport(filename, specifier),
    );
    dependencies.set(filename, importedFiles);

    if (!graph.globalAccess.includes(filename)) {
      const globals = usedForbiddenGlobals(ast);
      if (globals.length > 0) {
        throw new Error(`${filename} accesses forbidden globals: ${globals.join(", ")}`);
      }
    }

    const layer = matchingLayer(filename, graph.layers);
    if (!layer) throw new Error(`${filename} is not assigned to a module layer`);
    const allowedImports = layer[1];

    for (const importedFile of importedFiles) {
      if (!declaredFiles.has(importedFile)) {
        throw new Error(`${filename} imports undeclared module ${importedFile}`);
      }
      if (!allowedImports.some((prefix) => importedFile.startsWith(prefix))) {
        throw new Error(`${filename} crosses its dependency boundary into ${importedFile}`);
      }
    }
  }

  const reachable = new Set();
  const remaining = [graph.entry];
  while (remaining.length > 0) {
    const filename = remaining.pop();
    if (reachable.has(filename)) continue;
    reachable.add(filename);
    remaining.push(...(dependencies.get(filename) ?? []));
  }

  const unreachable = [...declaredFiles].filter((filename) => !reachable.has(filename));
  if (unreachable.length > 0) {
    throw new Error(`Module graph contains unreachable files: ${unreachable.join(", ")}`);
  }

  return { files: declaredFiles.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyModuleBoundaries();
  console.log(`Verified ${result.files} ES modules and their dependency boundaries`);
}
