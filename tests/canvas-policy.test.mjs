import assert from "node:assert/strict";
import test from "node:test";

import {
  CanvasRole,
  canvasRoles,
  displayCanvasRoles,
  inspectCanvasPolicy,
} from "../scripts/canvas-policy.mjs";

test("canvas policy separates display sizing from intrinsic raster sizing", () => {
  const clean = inspectCanvasPolicy(`
    this.surface = new UI.CanvasSurface(this.canvas);
    this.sourceCanvas.width = artworkWidth;
  `, "js/example.js");
  assert.deepEqual(clean, []);

  const violations = inspectCanvasPolicy(`
    this.canvas.width = width * UI.devicePixelRatio;
    const ratio = Math.floor(window.devicePixelRatio);
    this.surface = new UI.CanvasSurface(this.canvas);
  `, "js/example.js");
  assert.deepEqual(violations.map(({ message }) => message), [
    "this.canvas.width bypasses shared display-canvas sizing",
    "live code must preserve exact devicePixelRatio instead of flooring it",
  ]);
});

test("known live canvases must keep an explicit display role", () => {
  const violations = inspectCanvasPolicy(
    "this.tileMaterialsCanvas = document.createElement('canvas');",
    "js/textMode/tileSet/tileMaterials.js",
  );
  assert.deepEqual(violations.map(({ message }) => message), [
    "this.tileMaterialsCanvas must declare its display role with CanvasSurface or GlyphPreview",
  ]);
});

test("display canvas roles are a declarative architecture inventory", () => {
  assert.deepEqual(
    displayCanvasRoles.get("js/textMode/currentTile.js"),
    ["this.canvas", "this.tilePaletteCanvas", "this.tileSettingsTileCanvas"],
  );
  assert.ok(displayCanvasRoles.size > 25);
  assert.equal(
    canvasRoles.get("js/textMode/export/exportPng.js").get("this.canvas"),
    CanvasRole.EXPORT,
  );
  assert.equal(
    canvasRoles.get("js/ui/canvasPrimitives.js").get("this.sourceCanvas"),
    CanvasRole.SOURCE,
  );
  assert.equal(
    canvasRoles.get("js/ui/canvasPrimitives.js").get("this.rasterCanvas"),
    CanvasRole.BACKING,
  );
});

test("unclassified canvases cannot introduce direct DPR sizing", () => {
  const violations = inspectCanvasPolicy(`
    this.canvas = document.createElement('canvas');
    this.canvas.width = 100 * UI.devicePixelRatio;
  `, "js/newPreview.js");
  assert.deepEqual(violations.map(({ message }) => message), [
    "this.canvas.width uses devicePixelRatio without a declared canvas role",
  ]);
});
