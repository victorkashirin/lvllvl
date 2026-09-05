import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function fixture() {
  const timers = new Map();
  let nextTimer = 0;
  const sandbox = vm.createContext({
    setTimeout(fn, delay) { assert.equal(delay, 100); timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    document: { createElement: () => ({}) }, g_newSystem: true,
  });
  for (const file of ["layers/layers.js", "graphic.js"]) {
    vm.runInContext(readFileSync(new URL(`../src/js/textMode/${file}`, import.meta.url), "utf8"), sandbox);
  }
  const layers = new sandbox.Layers();
  const graphic = new sandbox.Graphic();
  const editor = { layers, graphic, grid: { getUpdateEnabled: () => graphic.getDrawEnabled() },
    gridView2d: { draw() { layers.requestLayerPreviewUpdate(); } } };
  graphic.editor = layers.editor = editor;
  graphic.doc = {};
  graphic.setDrawEnabled(true);
  function add(id) {
    const layer = { revision: 0, rendered: 0, updates: 0,
      isPreviewDirty() { return this.rendered !== this.revision; },
      updatePreview(canvas) { this.rendered = this.revision; this.updates++; this.scratch = canvas; },
    };
    layers.layers.push({ layerId: id, type: "grid" });
    layers.layerObjects[id] = layer;
    return layer;
  }
  const a = add("a"), b = add("b");
  layers.selectedLayerId = "a";
  const tick = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((fn) => fn()); };
  return { layers, graphic, a, b, timers, tick };
}

test("redraw batches many edits across layers without synchronous resampling; view-only redraws stay idle", () => {
  const f = fixture();
  f.layers.layers.push({ layerId: "image", type: "image" });
  f.layers.layerObjects.image = { updatePreview: () => assert.fail("unrelated images must not resample on grid edits") };
  for (let i = 0; i < 30; i++) {
    f.a.revision++;
    f.b.revision++;
    f.graphic.redraw();
  }
  assert.equal(f.a.updates + f.b.updates, 0);
  assert.equal(f.timers.size, 1);
  f.tick();
  assert.equal(f.a.updates, 1);
  assert.equal(f.b.updates, 1);
  assert.equal(f.a.rendered, 30);
  assert.equal(f.b.rendered, 30);
  assert.equal(f.a.scratch, f.b.scratch, "one shared scratch, not one full canvas per layer");
  for (let i = 0; i < 30; i++) f.graphic.redraw({ allCells: true });
  assert.equal(f.timers.size, 0);
  assert.equal(f.a.updates + f.b.updates, 2);
});

test("explicit flush publishes the latest state and cancels the trailing callback", () => {
  const f = fixture();
  f.a.revision++;
  f.graphic.redraw();
  f.a.revision++;
  f.layers.updateAllLayerPreviews();
  assert.equal(f.timers.size, 0);
  assert.equal(f.a.rendered, 2);
  assert.equal(f.a.updates, 1);
  f.tick();
  assert.equal(f.a.updates, 1);
  f.a.revision++;
  f.layers.updateLayerPreview();
  assert.equal(f.a.rendered, 3, "on-demand display flush does not need a redraw first");
});

test("batch resolves live layer identities after deletion/replacement, and cancellation releases the document", () => {
  const f = fixture();
  f.a.revision++;
  f.b.revision++;
  f.graphic.redraw();
  f.layers.layerObjects.a = null;
  const replacement = { ...f.b, revision: 42 };
  f.layers.layerObjects.b = replacement;
  f.tick();
  assert.equal(f.a.updates + f.b.updates, 0);
  assert.equal(replacement.rendered, 42);
  replacement.revision++;
  f.graphic.redraw();
  f.layers.cancelLayerPreviewUpdate();
  f.tick();
  assert.equal(replacement.updates, 1);
});

test("disabled drawing defers rather than discards dirty thumbnails", () => {
  const f = fixture();
  f.a.revision++;
  f.graphic.redraw();
  f.graphic.setDrawEnabled(false);
  f.tick();
  assert.equal(f.a.updates, 0);
  f.graphic.setDrawEnabled(true);
  f.graphic.redraw();
  f.tick();
  assert.equal(f.a.rendered, 1);
});
