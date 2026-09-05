import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "acorn";

import { moduleGraph } from "./build-graph.mjs";
import { sourceDirectory } from "./build-config.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSourceRoot = path.join(projectRoot, sourceDirectory);
const forbiddenGlobals = new Set([
  "Function",
  "SharedWorker",
  "WebSocket",
  "Worker",
  "caches",
  "document",
  "eval",
  "fetch",
  "g_app",
  "globalThis",
  "indexedDB",
  "localStorage",
  "localforage",
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

function dynamicImportSpecifier(source, filename) {
  if (source.type === "Literal" && typeof source.value === "string") {
    return { computed: false, specifier: source.value };
  }
  if (source.type === "TemplateLiteral") {
    if (source.expressions.length === 0) {
      return { computed: false, specifier: source.quasis[0].value.cooked };
    }
    const prefix = source.quasis[0].value.cooked;
    const queryIndex = typeof prefix === "string" ? prefix.search(/[?#]/) : -1;
    if (queryIndex > 0) {
      return { computed: true, specifier: prefix.slice(0, queryIndex) };
    }
  }
  throw new Error(
    `${filename} has a dynamic import whose module path is not statically fixed`,
  );
}

function moduleImports(ast, filename) {
  const imports = [];
  const dynamicImports = [];

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
      const dynamicImport = dynamicImportSpecifier(node.source, filename);
      imports.push(dynamicImport.specifier);
      dynamicImports.push(dynamicImport);
    }

    forEachChild(node, visit);
  }

  visit(ast);
  return { dynamicImports, imports };
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

/**
 * ES modules are always strict. Report assignment targets that would have
 * become implicit globals in a classic script and would instead throw at
 * runtime when a generated legacy bundle is emitted as ESM.
 *
 * @param {any} ast
 */
export function unboundAssignmentTargets(ast) {
  const scopeByNode = buildScopeMap(ast);
  const names = new Set();

  function isBound(name, scope) {
    for (let current = scope; current; current = current.parent) {
      if (current.bindings.has(name)) return true;
    }
    return false;
  }

  function inspectTarget(target, scope) {
    if (!target) return;
    switch (target.type) {
      case "Identifier":
        if (!isBound(target.name, scope)) names.add(target.name);
        return;
      case "AssignmentPattern":
        inspectTarget(target.left, scope);
        return;
      case "ArrayPattern":
        for (const element of target.elements) inspectTarget(element, scope);
        return;
      case "ObjectPattern":
        for (const property of target.properties) {
          inspectTarget(property.type === "RestElement" ? property.argument : property.value, scope);
        }
        return;
      case "RestElement":
        inspectTarget(target.argument, scope);
        return;
    }
  }

  function visit(node, inheritedScope) {
    const scope = scopeByNode.get(node) ?? inheritedScope;
    if (node.type === "AssignmentExpression" || node.type === "UpdateExpression") {
      inspectTarget(node.left ?? node.argument, scope);
    } else if ((node.type === "ForInStatement" || node.type === "ForOfStatement") &&
        node.left.type !== "VariableDeclaration") {
      inspectTarget(node.left, scope);
    }
    forEachChild(node, (child) => visit(child, scope));
  }

  visit(ast, scopeByNode.get(ast));
  return [...names].sort();
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
  return layers
    .filter(({ root }) => filename === root || filename.startsWith(root))
    .sort((left, right) => right.root.length - left.root.length)[0];
}

function resolveModuleImport(importer, specifier) {
  if (/[?#]/.test(specifier)) {
    throw new Error(`${importer} imports a source module with a query or fragment: ${specifier}`);
  }
  const withoutQuery = specifier.split(/[?#]/, 1)[0];
  if (!withoutQuery.startsWith(".")) {
    throw new Error(`${importer} imports unsupported external module ${specifier}`);
  }
  return path.posix.normalize(path.posix.join(path.posix.dirname(importer), withoutQuery));
}

async function filesUnderRoot(sourceRoot, relativeRoot) {
  const absoluteRoot = path.resolve(sourceRoot, relativeRoot);
  const relative = path.relative(sourceRoot, absoluteRoot);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Module source root escapes the source directory: ${relativeRoot}`);
  }

  const rootStat = await stat(absoluteRoot);
  if (rootStat.isFile()) {
    if (!relativeRoot.endsWith(".mjs")) {
      throw new Error(`Governed module files must use the .mjs extension: ${relativeRoot}`);
    }
    return [relativeRoot.split(path.sep).join("/")];
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`Module source root is not a file or directory: ${relativeRoot}`);
  }

  const discovered = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      if (entry.isFile() && entry.name.endsWith(".mjs")) {
        discovered.push(path.relative(sourceRoot, filename).split(path.sep).join("/"));
      } else if (entry.isFile() && /\.(?:c)?js$/.test(entry.name)) {
        throw new Error(
          `Governed runtime modules must use the .mjs extension: ${path.relative(sourceRoot, filename)}`,
        );
      }
    }
  }

  await visit(absoluteRoot);
  return discovered;
}

export async function discoverModuleFiles({
  graph = moduleGraph,
  sourceRoot = defaultSourceRoot,
} = {}) {
  if (Array.isArray(graph.sourceRoots)) {
    if (graph.sourceRoots.length === 0) throw new Error("Module graph has no governed source roots");
    const files = (
      await Promise.all(graph.sourceRoots.map((root) => filesUnderRoot(sourceRoot, root)))
    ).flat();
    return [...new Set(files)].sort();
  }

  // Retain support for small, in-memory test graphs while production coverage is
  // derived exclusively from governed source roots.
  if (graph.files && typeof graph.files === "object") {
    return [...new Set(Object.values(graph.files))].sort();
  }
  throw new Error("Module graph must define governed source roots");
}

function moduleLayers(graph) {
  if (!Array.isArray(graph.layers) || graph.layers.length === 0) {
    throw new Error("Module graph must define at least one layer");
  }

  const names = new Set();
  for (const layer of graph.layers) {
    if (
      !layer ||
      typeof layer.name !== "string" ||
      typeof layer.root !== "string" ||
      !Array.isArray(layer.mayImport)
    ) {
      throw new Error("Module layers require name, root, and mayImport fields");
    }
    if (names.has(layer.name)) throw new Error(`Duplicate module layer: ${layer.name}`);
    names.add(layer.name);
  }

  for (const layer of graph.layers) {
    for (const importedLayer of layer.mayImport) {
      if (!names.has(importedLayer)) {
        throw new Error(`${layer.name} may import unknown module layer ${importedLayer}`);
      }
    }
  }
  return graph.layers;
}

function packageName(filename, layer) {
  const relative = filename.slice(layer.root.length).replace(/^\//, "");
  return `${layer.name}:${relative.split("/", 1)[0]}`;
}

function dependencyCycles(dependencies) {
  const cycles = [];
  const visited = new Set();
  const active = new Map();
  const pathStack = [];

  function visit(filename) {
    if (active.has(filename)) {
      cycles.push([...pathStack.slice(active.get(filename)), filename]);
      return;
    }
    if (visited.has(filename)) return;

    active.set(filename, pathStack.length);
    pathStack.push(filename);
    for (const dependency of dependencies.get(filename) ?? []) visit(dependency);
    pathStack.pop();
    active.delete(filename);
    visited.add(filename);
  }

  for (const filename of dependencies.keys()) visit(filename);
  return cycles;
}

function cycleKey(cycle) {
  const nodes = cycle.slice(0, -1);
  const rotations = nodes.map((_, index) => [
    ...nodes.slice(index),
    ...nodes.slice(0, index),
  ].join(" -> "));
  return rotations.sort()[0];
}

function allowedCycleKeys(graph, declaredFiles) {
  const allowed = new Set();
  for (const exception of graph.cycleExceptions ?? []) {
    if (
      !exception ||
      !Array.isArray(exception.modules) ||
      exception.modules.length < 2 ||
      typeof exception.reason !== "string" ||
      exception.reason.trim() === ""
    ) {
      throw new Error("Module cycle exceptions require modules and a review reason");
    }
    for (const filename of exception.modules) {
      if (!declaredFiles.has(filename)) {
        throw new Error(`Module cycle exception names an unknown module: ${filename}`);
      }
    }
    allowed.add(cycleKey([...exception.modules, exception.modules[0]]));
  }
  return allowed;
}

export async function verifyModuleBoundaries({ graph = moduleGraph, sourceRoot = defaultSourceRoot } = {}) {
  const modules = await discoverModuleFiles({ graph, sourceRoot });
  const declaredFiles = new Set(modules);
  if (!declaredFiles.has(graph.entry)) {
    throw new Error(`Module entry is outside the governed source roots: ${graph.entry}`);
  }

  const layers = moduleLayers(graph);
  const publicEntries = new Set(graph.publicEntries ?? []);
  const generatedEntries = new Set(graph.generatedEntries ?? []);
  const dynamicImportEntries = graph.dynamicImportEntries ?? {};
  for (const filename of publicEntries) {
    if (!declaredFiles.has(filename)) {
      throw new Error(`Public module entry is outside the governed source roots: ${filename}`);
    }
  }
  for (const filename of graph.globalAccess ?? []) {
    if (!declaredFiles.has(filename)) {
      throw new Error(`Global-access adapter is outside the governed source roots: ${filename}`);
    }
  }
  for (const [filename, entries] of Object.entries(dynamicImportEntries)) {
    if (!declaredFiles.has(filename)) {
      throw new Error(`Dynamic-import adapter is outside the governed source roots: ${filename}`);
    }
    for (const entry of entries) {
      if (!generatedEntries.has(entry)) {
        throw new Error(`Dynamic-import adapter targets an undeclared generated entry: ${entry}`);
      }
    }
  }

  const dependencies = new Map();
  for (const filename of declaredFiles) {
    const source = await readFile(path.join(sourceRoot, filename), "utf8");
    const ast = parse(source, {
      ecmaVersion: "latest",
      sourceFile: filename,
      sourceType: "module",
    });
    const declaredDynamicEntries = new Set(dynamicImportEntries[filename] ?? []);
    const parsedImports = moduleImports(ast, filename);
    const resolvedDynamicImports = parsedImports.dynamicImports.map((entry) => ({
      ...entry,
      filename: resolveModuleImport(filename, entry.specifier),
    }));
    for (const entry of resolvedDynamicImports) {
      if (entry.computed && !declaredDynamicEntries.has(entry.filename)) {
        throw new Error(
          `${filename} has an undeclared computed dynamic import: ${entry.filename}`,
        );
      }
    }
    for (const entry of declaredDynamicEntries) {
      if (!resolvedDynamicImports.some(({ filename: imported }) => imported === entry)) {
        throw new Error(`${filename} declares a dynamic import it does not contain: ${entry}`);
      }
    }
    const importedFiles = [...new Set(parsedImports.imports.map((specifier) =>
      resolveModuleImport(filename, specifier),
    ))];
    dependencies.set(filename, importedFiles);

    if (!(graph.globalAccess ?? []).includes(filename)) {
      const globals = usedForbiddenGlobals(ast);
      if (globals.length > 0) {
        throw new Error(`${filename} accesses forbidden globals: ${globals.join(", ")}`);
      }
    }

    const layer = matchingLayer(filename, layers);
    if (!layer) throw new Error(`${filename} is not assigned to a module layer`);

    for (const importedFile of importedFiles) {
      if (!declaredFiles.has(importedFile)) {
        if (generatedEntries.has(importedFile)) continue;
        throw new Error(`${filename} imports module outside the governed roots: ${importedFile}`);
      }
      const importedLayer = matchingLayer(importedFile, layers);
      if (!importedLayer || !layer.mayImport.includes(importedLayer.name)) {
        throw new Error(
          `${filename} crosses its ${layer.name} dependency boundary into ${importedFile}`,
        );
      }
      if (
        packageName(filename, layer) !== packageName(importedFile, importedLayer) &&
        !publicEntries.has(importedFile)
      ) {
        throw new Error(`${filename} bypasses the public entry point for ${importedFile}`);
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

  const allowedCycles = allowedCycleKeys(graph, declaredFiles);
  const detectedCycles = dependencyCycles(dependencies);
  const detectedCycleKeys = new Set(detectedCycles.map((cycle) => cycleKey(cycle)));
  const staleCycleExceptions = [...allowedCycles].filter((cycle) => !detectedCycleKeys.has(cycle));
  if (staleCycleExceptions.length > 0) {
    throw new Error(`Module graph has unused cycle exceptions: ${staleCycleExceptions.join(", ")}`);
  }
  const cycles = detectedCycles.filter(
    (cycle) => !allowedCycles.has(cycleKey(cycle)),
  );
  if (cycles.length > 0) {
    throw new Error(`Module dependency cycle: ${cycles[0].join(" -> ")}`);
  }

  const edges = modules.flatMap((filename) =>
    (dependencies.get(filename) ?? []).map((dependency) => ({ from: filename, to: dependency })),
  );
  return {
    edges,
    files: declaredFiles.size,
    layers: Object.fromEntries(
      modules.map((filename) => [filename, matchingLayer(filename, layers).name]),
    ),
    modules,
  };
}

export function formatModuleDependencyReport(result) {
  const lines = [`Module dependency report: ${result.files} modules, ${result.edges.length} edges`];
  for (const filename of result.modules) {
    const targets = result.edges
      .filter(({ from }) => from === filename)
      .map(({ to }) => to)
      .join(", ");
    lines.push(`- ${filename} [${result.layers[filename]}] -> ${targets || "(none)"}`);
  }
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyModuleBoundaries();
  console.log(formatModuleDependencyReport(result));
}
