import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/js/textMode/gridView2d.js", import.meta.url), "utf8");

function fixture({ scale = 8, deviceScale = 1, blockMode = true } = {}) {
  const strokes = [];
  let segments = [];
  let pendingStart = null;
  let transformReads = 0;
  const context = {
    beginPath() {
      segments = [];
      pendingStart = null;
    },
    moveTo(x, y) {
      pendingStart = { x, y };
    },
    lineTo(x, y) {
      segments.push({ from: pendingStart, to: { x, y } });
      pendingStart = null;
    },
    getTransform() {
      transformReads++;
      return { a: deviceScale, b: 0, c: 0, d: deviceScale };
    },
    setLineDash() {},
    stroke() {
      strokes.push({
        lineWidth: this.lineWidth,
        strokeStyle: this.strokeStyle,
        segments: segments.slice(),
      });
    },
  };
  const layer = {
    getType: () => "grid",
    getCellWidth: () => 8,
    getCellHeight: () => 8,
    getBlockModeEnabled: () => blockMode,
    getBlockWidth: () => 2,
    getBlockHeight: () => 3,
  };
  const sandbox = vm.createContext({
    styles: {
      ui: { scrollbarWidth: 10 },
      textMode: {
        gridView2dPixelGridLine: "pixel",
        gridView2dPixelGridLineWidth: 0.2,
        gridView2dGridLine: "tile",
        gridView2dGridLineWidth: 0.3,
        gridView2dGridBlockLine: "block",
        gridView2dGridBlockLineWidth: 0.3,
      },
    },
    TextModeEditor: { Mode: { C64MULTICOLOR: "c64multicolor" } },
  });
  vm.runInContext(source, sandbox);
  const view = new sandbox.GridView2d();
  view.width = 320;
  view.height = 200;
  view.displayScale = scale;
  view.editor = {
    getGridVisible: () => true,
    getEditorMode: () => "tile",
    getScreenMode: () => "textmode",
    layers: { getSelectedLayerObject: () => layer },
    graphic: { getType: () => "screen" },
    blockSetManager: { getCurrentBlockSet: () => ({}) },
  };
  return { context, getTransformReads: () => transformReads, strokes, view };
}

function drawDocument(f, width, clipRegions = false) {
  f.view.drawGrid(-8000, -8000, width, width, f.context, clipRegions);
  return f.strokes.flatMap((stroke) => stroke.segments);
}

test("grid path work stays bounded by the viewport and dirty region", () => {
  const small = fixture();
  const smallSegments = drawDocument(small, 2000);
  const large = fixture();
  const largeSegments = drawDocument(large, 20000);

  assert.equal(largeSegments.length, smallSegments.length);
  assert.ok(largeSegments.length < 100);
  for(const segment of largeSegments) {
    for(const point of [segment.from, segment.to]) {
      assert.ok(point.x >= -2 && point.x <= large.view.width + 2);
      assert.ok(point.y >= -2 && point.y <= large.view.height + 2);
    }
  }

  const dirty = [{ x: 96, y: 64, width: 64, height: 64 }];
  const smallDirty = fixture();
  const smallDirtySegments = drawDocument(smallDirty, 2000, dirty);
  const largeDirty = fixture();
  const largeDirtySegments = drawDocument(largeDirty, 20000, dirty);
  assert.equal(largeDirtySegments.length, smallDirtySegments.length);
  assert.ok(largeDirtySegments.length < largeSegments.length / 2);
  for(const segment of largeDirtySegments) {
    if(segment.from.x === segment.to.x) {
      assert.ok(segment.from.x >= dirty[0].x - 2);
      assert.ok(segment.from.x <= dirty[0].x + dirty[0].width + 2);
      assert.ok(segment.from.y >= -2 && segment.to.y <= largeDirty.view.height + 2);
    } else {
      assert.ok(segment.from.y >= dirty[0].y - 2);
      assert.ok(segment.from.y <= dirty[0].y + dirty[0].height + 2);
      assert.ok(segment.from.x >= -2 && segment.to.x <= largeDirty.view.width + 2);
    }
  }
});

test("fractional device-scale grid lines retain their world phase and edge coverage", () => {
  const region = [{ x: 10.2, y: 15.7, width: 61.65, height: 72.4 }];
  const deviceScales = [1.25, 4];
  const verticalPositions = [];

  for(const deviceScale of deviceScales) {
    const f = fixture({ scale: 3.5, deviceScale, blockMode: false });
    f.view.drawGrid(-123.25, -81.75, 10000, 10000, f.context, region);
    const segments = f.strokes.flatMap((stroke) => stroke.segments);
    assert.ok(f.getTransformReads() > 0);
    assert.ok(segments.length > 0);
    verticalPositions.push(segments
      .filter((segment) => segment.from.x === segment.to.x)
      .map((segment) => segment.from.x));

    for(const segment of segments) {
      if(segment.from.x === segment.to.x) {
        const latticeIndex = (segment.from.x + 123.25) / (8 * 3.5);
        assert.ok(Math.abs(latticeIndex - Math.round(latticeIndex)) < 1e-10);
      } else {
        const latticeIndex = (segment.from.y + 81.75) / (8 * 3.5);
        assert.ok(Math.abs(latticeIndex - Math.round(latticeIndex)) < 1e-10);
      }
    }
  }

  // The line is 0.9 CSS pixels beyond the clip. It can affect the neighbouring
  // device pixel at 1.25x, but is safely outside the one-pixel pad at 4x.
  assert.ok(verticalPositions[0].includes(72.75));
  assert.ok(!verticalPositions[1].includes(72.75));
});
