import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function makeCanvas(record) {
  let width = 0;
  let height = 0;
  const context = {
    clearRect() {},
    drawImage() { record.drawImage++; },
  };
  const canvas = {
    style: {},
    getContext: () => context,
  };
  Object.defineProperties(canvas, {
    width: {
      get: () => width,
      set: (value) => { width = value; record.width++; },
    },
    height: {
      get: () => height,
      set: (value) => { height = value; record.height++; },
    },
  });
  return canvas;
}

function previewFixture({ frameCount = 5 } = {}) {
  const sizeWrites = { width: 0, height: 0, drawImage: 0 };
  const canvases = [];
  const createCanvas = () => {
    const canvas = makeCanvas(sizeWrites);
    canvases.push(canvas);
    return canvas;
  };
  let now = 100;
  let selectedRange = "";
  const sandbox = vm.createContext({
    document: { createElement: createCanvas },
    getTimestamp: () => now,
    FRAMERATE: 20,
    $: () => ({
      val(value) {
        if(arguments.length) { selectedRange = value; }
        return selectedRange;
      },
    }),
  });
  vm.runInContext(
    `${readFileSync(new URL("../src/js/textMode/animationPreview.js", import.meta.url), "utf8")}
     ;globalThis.__AnimationPreview = AnimationPreview;`,
    sandbox,
  );

  const frameRevisions = Array(frameCount).fill(0);
  const frames = Array.from({ length: frameCount }, (_, index) => ({ index, duration: 1 }));
  const tileSet = { tileRenderRevisions: [] };
  const layer = {
    getFrameRenderState: (frame, background) => [frames[frame], frameRevisions[frame], background],
    getTileSet: () => tileSet,
    getTileUsage: () => ({ 1: [{}] }),
  };
  const layerData = {
    layerId: "grid", type: "grid", visible: true,
    opacity: 1, compositeOperation: "source-over",
  };
  let rasterizations = 0;
  const editor = {
    graphic: {
      frames,
      getFrameCount: () => frameCount,
      getFrameRanges: () => [],
      getGraphicWidth: () => 16,
      getGraphicHeight: () => 8,
      getCurrentFrame: () => 0,
    },
    frames: { playFrames: false },
    spriteFrames: { drawRange() {}, draw() {} },
    layers: {
      layers: [layerData],
      isBackgroundVisible: () => true,
      getLayerObject: () => layer,
    },
    grid: { grid2d: { drawFrame: () => { rasterizations++; } } },
  };
  const preview = new sandbox.__AnimationPreview();
  preview.init(editor);
  preview.visible = true;
  preview.canvas = createCanvas();
  preview.canvas.width = 80;
  preview.canvas.height = 60;
  preview.context = preview.canvas.getContext("2d");
  preview.canvasScale = 1;
  return {
    preview, frameRevisions, tileSet, layerData, sizeWrites, canvases,
    rasterizations: () => rasterizations,
    advance: (amount) => { now += amount; },
  };
}

test("animation preview reuses unchanged composites and refreshes render dependencies", () => {
  const f = previewFixture();
  f.preview.draw();
  const coldWrites = { width: f.sizeWrites.width, height: f.sizeWrites.height };
  f.preview.draw();
  assert.equal(f.rasterizations(), 1);
  assert.deepEqual(
    { width: f.sizeWrites.width, height: f.sizeWrites.height },
    coldWrites,
    "a cache hit must not reset backing dimensions",
  );

  f.frameRevisions[0]++;
  f.preview.draw();
  assert.equal(f.rasterizations(), 2, "cell content revisions refresh the frame");

  f.tileSet.tileRenderRevisions[1] = 1;
  f.preview.draw();
  assert.equal(f.rasterizations(), 3, "selective animated-glyph revisions refresh used frames");

  f.layerData.opacity = 0.5;
  f.preview.draw();
  assert.equal(f.rasterizations(), 4, "layer blend metadata participates in the key");

  f.preview.currentFrame = 1;
  f.preview.draw();
  f.preview.currentFrame = 0;
  f.preview.draw();
  assert.equal(f.rasterizations(), 5, "returning to a retained frame uses its composite");
});

test("animation preview keeps a bounded least-recently-used frame cache", () => {
  const f = previewFixture();
  for(let frame = 0; frame < 5; frame++) {
    f.preview.currentFrame = frame;
    f.preview.draw();
  }
  assert.equal(f.preview.frameCache.length, 3);
  assert.deepEqual(Array.from(f.preview.frameCache, (entry) => entry.frame), [4, 3, 2]);
  const before = f.rasterizations();
  f.preview.currentFrame = 0;
  f.preview.draw();
  assert.equal(f.rasterizations(), before + 1, "an evicted frame is rendered again");
  assert.equal(f.preview.frameCache.length, 3);
});

test("one-frame ranges skip unchanged ticks but still publish dependency changes", () => {
  const f = previewFixture({ frameCount: 1 });
  f.preview.draw();
  f.advance(100);
  f.preview.update();
  assert.equal(f.rasterizations(), 1);

  f.frameRevisions[0]++;
  f.advance(100);
  f.preview.update();
  assert.equal(f.rasterizations(), 2);
});

test("scale changes re-present cached one-frame previews without rerasterizing", () => {
  const f = previewFixture({ frameCount: 1 });
  f.preview.draw();
  const rasterizations = f.rasterizations();
  const presentations = f.sizeWrites.drawImage;
  f.preview.setScale(2);
  assert.equal(f.rasterizations(), rasterizations);
  assert.equal(f.sizeWrites.drawImage, presentations + 1);
});

test("range changes present an already-cached starting frame", () => {
  const f = previewFixture({ frameCount: 2 });
  f.preview.currentFrame = 1;
  f.preview.draw();
  f.preview.currentFrame = 0;
  f.preview.draw();
  const rasterizations = f.rasterizations();
  const presentations = f.sizeWrites.drawImage;
  f.preview.editor.graphic.getFrameRanges = () => [{ start: 1, end: 2 }];
  f.preview.setFrameRange(0);
  assert.equal(f.preview.currentFrame, 1);
  assert.equal(f.rasterizations(), rasterizations);
  assert.equal(f.sizeWrites.drawImage, presentations + 1);
});

test("legacy Grid2d guards scratch sizes and does not allocate the disabled effect buffer", () => {
  const sizeWrites = { width: 0, height: 0, drawImage: 0 };
  const created = [];
  const sandbox = vm.createContext({
    document: { createElement: () => {
      const canvas = makeCanvas(sizeWrites);
      created.push(canvas);
      return canvas;
    } },
  });
  vm.runInContext(
    `${readFileSync(new URL("../src/js/textMode/grid2d.js", import.meta.url), "utf8")}
     ;globalThis.__Grid2d = Grid2d;`,
    sandbox,
  );
  const grid = new sandbox.__Grid2d();
  grid.editor = {
    graphic: {
      getCurrentFrame: () => 0,
      getGraphicWidth: () => 16,
      getGraphicHeight: () => 8,
      getOnlyViewBoundsDrawn: () => false,
    },
    layers: { layers: [], isBackgroundVisible: () => true },
    frames: { getShowPrevFrame: () => false },
    tileSetManager: { getCurrentTileSet: () => null },
    colorPaletteManager: { getCurrentColorPalette: () => null },
  };
  const target = makeCanvas(sizeWrites);
  target.width = 16;
  target.height = 8;
  const args = {
    canvas: target, context: target.getContext("2d"),
    updateLayerCanvas: false, drawPreviousFrame: false,
  };
  grid.drawFrame(args);
  const coldWrites = { ...sizeWrites };
  grid.drawFrame(args);
  assert.deepEqual(sizeWrites, coldWrites);
  assert.equal(created.length, 1, "only the active temporary layer canvas is allocated");
  assert.equal(grid.effectCanvas, null);
});
