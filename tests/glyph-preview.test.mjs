import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { loadUICanvasPrimitives } from "./helpers/load-ui-canvas-primitives.mjs";

const previewSource = loadUICanvasPrimitives();

function canvasFixture() {
  const context = {
    clearRect() {},
    fillRect() {},
    setTransform() {},
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {},
  };
  const canvas = { width: 0, height: 0, style: {}, getContext: () => context };
  context.canvas = canvas;
  return { canvas, context };
}

function fixture(ratio = 1.25) {
  const listeners = [];
  const createdCanvases = [];
  const UI = {
    devicePixelRatio: ratio,
    devicePixelRatioRevision: 0,
    getContextNoSmoothing: (canvas) => canvas.getContext("2d"),
    onDevicePixelRatioChange(listener) {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
  };
  const sandbox = vm.createContext({
    UI,
    document: {
      createElement() {
        const created = canvasFixture().canvas;
        createdCanvases.push(created);
        return created;
      },
    },
    Uint8ClampedArray,
  });
  vm.runInContext(previewSource, sandbox);
  const blits = [];
  UI.PixelArtBlitter = function() {
    this.draw = (...args) => blits.push(args);
  };
  return { UI, listeners, createdCanvases, blits };
}

test("GlyphPreview renders bitmap tiles on the exact backing lattice", () => {
  const { canvas } = canvasFixture();
  const { UI, createdCanvases, blits } = fixture();
  const preview = new UI.GlyphPreview(canvas);
  preview.resize(19, 17);
  let tileDraws = 0;
  const tileSet = {
    getType: () => "bitmap",
    getTileWidth: () => 8,
    getTileHeight: () => 8,
    drawCharacter(args) {
      tileDraws++;
      assert.equal(args.scale, 1);
      assert.equal(args.imageData.data.length, 8 * 8 * 4);
      assert.equal("backgroundColor" in args, false, "surface colour is not a tile palette index");
    },
  };

  preview.drawTile({
    tileSet,
    character: 7,
    backgroundColor: "#222",
    destinationCss: { x: 2, y: 3, width: 8, height: 10 },
  });
  assert.equal(canvas.width, 24);
  assert.equal(canvas.height, 21);
  assert.equal(tileDraws, 1);
  assert.equal(createdCanvases.length, 1, "bitmap source remains intrinsic");
  assert.equal(createdCanvases[0].width, 8);
  assert.equal(createdCanvases[0].height, 8);
  assert.deepEqual(blits[0].slice(3), [0, 0, 8, 8, 3, 4, 10, 12]);
});

test("GlyphPreview renders vectors physically and redraws on a DPR revision", () => {
  const { canvas } = canvasFixture();
  const { UI, listeners, blits } = fixture();
  const preview = new UI.GlyphPreview(canvas);
  preview.resize(19, 17);
  const draws = [];
  const overlays = [];
  const tileSet = {
    getType: () => "vector",
    getTileWidth: () => 8,
    getTileHeight: () => 8,
    drawCharacter(args) {
      draws.push({ x: args.x * args.scale, y: args.y * args.scale, scale: args.scale });
    },
  };

  preview.drawTile({
    tileSet,
    character: 9,
    backgroundColor: "#222",
    destinationCss: { x: 2, y: 3, width: 8, height: 10 },
    afterDraw: ({ destination }) => overlays.push({ ...destination }),
  });
  assert.deepEqual(draws[0], { x: 2.5, y: 3.75, scale: 1.25 });
  assert.deepEqual(overlays[0], { x: 2.5, y: 3.75, width: 10, height: 12.5 });
  assert.equal(blits.length, 0, "vectors render directly into the backing surface");

  UI.devicePixelRatio = 1.5;
  UI.devicePixelRatioRevision++;
  listeners[0]();
  assert.equal(canvas.width, 29);
  assert.equal(canvas.height, 26);
  assert.deepEqual(draws[1], { x: 3, y: 4.5, scale: 1.5 });
  assert.deepEqual(overlays[1], { x: 3, y: 4.5, width: 12, height: 15 });
});
