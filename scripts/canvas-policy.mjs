import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "acorn";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src", "js");

export const CanvasRole = Object.freeze({
  DISPLAY: "display",
  SOURCE: "source",
  BACKING: "backing",
  EXPORT: "export",
});

// Display roles use shared sizing. Non-display roles remain intrinsic, but stay
// visible in the same architecture inventory so DPR use can be rejected there.
export const displayCanvasRoles = new Map([
  ["js/debugger/dbgC64CharEditor.js", ["this.canvas"]],
  ["js/debugger/dbgC64SpriteEditor.js", ["this.canvas"]],
  ["js/debugger/dbgCharset.js", ["this.canvas", "this.colorPaletteCanvas"]],
  ["js/textMode/animationPreview.js", ["this.canvas"]],
  ["js/textMode/blockSet/blockEditor.js", ["this.characterCanvas", "this.blockEditorTilePaletteCanvas"]],
  ["js/textMode/color/colorPaletteDisplay.js", ["this.canvas"]],
  ["js/textMode/color/colorPaletteEdit.js", ["this.imageCanvas", "this.imagePaletteCanvas"]],
  ["js/textMode/currentTile.js", ["this.canvas", "this.tilePaletteCanvas", "this.tileSettingsTileCanvas"]],
  ["js/textMode/export/exportGif.js", ["this.previewCanvas"]],
  ["js/textMode/export/exportGifMobile.js", ["this.previewCanvas"]],
  ["js/textMode/export/exportImage.js", ["this.previewCanvas"]],
  ["js/textMode/export/exportPng.js", ["this.previewCanvas"]],
  ["js/textMode/export/exportPngMobile.js", ["this.previewCanvas"]],
  ["js/textMode/export/exportSpritePng.js", ["this.previewCanvas"]],
  ["js/textMode/export3d/export3dGif.js", ["this.previewCanvas"]],
  ["js/textMode/frames/frameTimeline.js", ["this.canvas"]],
  ["js/textMode/frames/spriteFrames.js", ["this.canvas"]],
  ["js/textMode/info.js", ["this.characterCanvas"]],
  ["js/textMode/tileSet/chooseCharactersDialog.js", ["this.tilePickerCanvas"]],
  ["js/textMode/tileSet/tileEditorGrid.js", ["this.canvas"]],
  ["js/textMode/tileSet/tileMaterials.js", ["this.tileMaterialsCanvas"]],
  ["js/textMode/tileSet/tilePaletteDisplay.js", ["this.canvas"]],
  ["js/textMode/tileSet/tilePaletteEditor.js", ["this.canvas"]],
  ["js/textMode/tileSet/tilePickerPopup.js", ["this.tilePickerCanvas"]],
  ["js/textMode/tools/blockPalette.js", ["this.canvas"]],
  ["js/textMode/tools/replaceCharacter.js", ["this.replaceTileCanvas", "this.replaceTileWithCanvas"]],
  ["js/textMode/tools/tilePalette.js", ["this.canvas", "this.characterCanvas"]],
  ["js/textMode/tools/tilePaletteChooserMobile.js", ["this.previewCanvas"]],
  ["js/textMode/tools/tilePaletteMobile.js", ["this.canvas"]],
  ["js/ui/canvasPanel.js", ["this.canvas"]],
  ["js/ui/canvasScrollPanel.js", ["this.canvas"]],
  ["js/utils/paramGraph.js", ["this.canvas"]],
]);

export const nonDisplayCanvasRoles = new Map([
  ["js/ui/canvasPrimitives.js", new Map([
    ["this.sourceCanvas", CanvasRole.SOURCE],
    ["this.rasterCanvas", CanvasRole.BACKING],
  ])],
  ["js/textMode/export/exportGif.js", new Map([
    ["this.canvas", CanvasRole.EXPORT],
    ["this.screenCanvas", CanvasRole.EXPORT],
  ])],
  ["js/textMode/export/exportGifMobile.js", new Map([
    ["this.canvas", CanvasRole.EXPORT],
    ["this.screenCanvas", CanvasRole.EXPORT],
  ])],
  ["js/textMode/export/exportImage.js", new Map([
    ["this.canvas", CanvasRole.EXPORT],
    ["this.clipboardCanvas", CanvasRole.EXPORT],
  ])],
  ["js/textMode/export/exportPng.js", new Map([
    ["this.canvas", CanvasRole.EXPORT],
    ["this.layersCanvas", CanvasRole.EXPORT],
    ["this.screenCanvas", CanvasRole.EXPORT],
  ])],
  ["js/textMode/export/exportPngMobile.js", new Map([
    ["this.canvas", CanvasRole.EXPORT],
    ["this.layersCanvas", CanvasRole.EXPORT],
    ["this.screenCanvas", CanvasRole.EXPORT],
  ])],
  ["js/textMode/export/exportSpritePng.js", new Map([
    ["this.spritesCanvas", CanvasRole.EXPORT],
  ])],
  ["js/textMode/export3d/export3dGif.js", new Map([
    ["this.canvas", CanvasRole.EXPORT],
    ["this.rendererCanvas", CanvasRole.EXPORT],
  ])],
]);

export const canvasRoles = new Map();
for(const [relativePath, bindings] of displayCanvasRoles) {
  const roles = new Map();
  for(const binding of bindings) roles.set(binding, CanvasRole.DISPLAY);
  canvasRoles.set(relativePath, roles);
}
for(const [relativePath, bindings] of nonDisplayCanvasRoles) {
  const roles = canvasRoles.get(relativePath) ?? new Map();
  for(const [binding, role] of bindings) roles.set(binding, role);
  canvasRoles.set(relativePath, roles);
}

function forEachChild(node, visit) {
  for(const [key, value] of Object.entries(node)) {
    if(key === "loc" || key === "start" || key === "end") continue;
    if(Array.isArray(value)) {
      for(const child of value) {
        if(child?.type) visit(child);
      }
    } else if(value?.type) {
      visit(value);
    }
  }
}

function memberPath(node) {
  if(!node) return null;
  if(node.type === "ThisExpression") return "this";
  if(node.type === "Identifier") return node.name;
  if(node.type !== "MemberExpression" || node.computed) return null;
  const object = memberPath(node.object);
  const property = node.property.type === "Identifier" ? node.property.name : null;
  return object && property ? `${object}.${property}` : null;
}

function containsDevicePixelRatio(node) {
  let found = false;
  function visit(child) {
    if(found) return;
    if(child.type === "Identifier" && child.name === "devicePixelRatio") {
      found = true;
      return;
    }
    if(child.type === "MemberExpression" && !child.computed
      && child.property.type === "Identifier"
      && child.property.name === "devicePixelRatio") {
      found = true;
      return;
    }
    forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function isDisplayFactory(node) {
  if(node.type !== "NewExpression" || node.callee.type !== "MemberExpression"
    || node.callee.computed || node.callee.object.type !== "Identifier"
    || node.callee.object.name !== "UI" || node.callee.property.type !== "Identifier") {
    return false;
  }
  return node.callee.property.name === "CanvasSurface"
    || node.callee.property.name === "CanvasPreview"
    || node.callee.property.name === "GlyphPreview";
}

export function inspectCanvasPolicy(source, relativePath) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 2020,
    locations: true,
    sourceType: "script",
  });
  const violations = [];
  const declaredDisplayBindings = displayCanvasRoles.get(relativePath) ?? [];
  const declaredRoles = canvasRoles.get(relativePath) ?? new Map();
  const displayBindings = new Set(declaredDisplayBindings);
  const constructedBindings = new Set();

  function collectDisplayBindings(node) {
    if(isDisplayFactory(node)) {
      const binding = memberPath(node.arguments[0]);
      if(binding) {
        displayBindings.add(binding);
        constructedBindings.add(binding);
      }
    }
    forEachChild(node, collectDisplayBindings);
  }
  collectDisplayBindings(ast);

  function visit(node) {
    if(node.type === "CallExpression" && memberPath(node.callee) === "Math.floor"
      && node.arguments.some(containsDevicePixelRatio)) {
      violations.push({
        line: node.loc.start.line,
        message: "live code must preserve exact devicePixelRatio instead of flooring it",
      });
    }

    if(relativePath !== "js/ui/canvasPrimitives.js" && node.type === "AssignmentExpression"
      && node.left.type === "MemberExpression" && !node.left.computed
      && node.left.property.type === "Identifier"
      && (node.left.property.name === "width" || node.left.property.name === "height")) {
      const binding = memberPath(node.left.object);
      if(binding && displayBindings.has(binding)) {
        violations.push({
          line: node.loc.start.line,
          message: `${binding}.${node.left.property.name} bypasses shared display-canvas sizing`,
        });
      } else if(binding && containsDevicePixelRatio(node.right)) {
        const role = declaredRoles.get(binding);
        violations.push({
          line: node.loc.start.line,
          message: role
            ? `${role} canvas ${binding} must not derive intrinsic dimensions from devicePixelRatio`
            : `${binding}.${node.left.property.name} uses devicePixelRatio without a declared canvas role`,
        });
      }
    }

    forEachChild(node, visit);
  }

  visit(ast);
  for(const binding of declaredDisplayBindings) {
    if(!constructedBindings.has(binding)) {
      violations.push({
        line: 1,
        message: `${binding} must declare its display role with CanvasSurface or GlyphPreview`,
      });
    }
  }
  return violations;
}

async function javascriptFiles(directory) {
  const files = [];
  for(const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if(entry.isDirectory()) {
      files.push(...await javascriptFiles(filename));
    } else if(entry.isFile() && entry.name.endsWith(".js")) {
      files.push(filename);
    }
  }
  return files;
}

export async function verifyCanvasPolicy() {
  const violations = [];
  for(const filename of await javascriptFiles(sourceRoot)) {
    const relativePath = path.relative(path.join(projectRoot, "src"), filename).split(path.sep).join("/");
    const source = await readFile(filename, "utf8");
    let fileViolations;
    try {
      fileViolations = inspectCanvasPolicy(source, relativePath);
    } catch(error) {
      // A few legacy .js assets contain raw GLSL rather than JavaScript. They
      // have no canvas ownership syntax and are outside this AST policy.
      const hasCanvasPolicySyntax = /devicePixelRatio|Canvas(?:Preview|Surface)|GlyphPreview|\.(?:width|height)\s*=/.test(source);
      if(!hasCanvasPolicySyntax) {
        continue;
      }
      throw new Error(`Cannot inspect ${relativePath}: ${error.message}`, { cause: error });
    }
    for(const violation of fileViolations) {
      violations.push(`${relativePath}:${violation.line}: ${violation.message}`);
    }
  }
  if(violations.length > 0) {
    throw new Error(`Canvas architecture policy failed:\n${violations.join("\n")}`);
  }
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyCanvasPolicy().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
