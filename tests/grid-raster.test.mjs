import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/js/textMode/gridView2d.js", import.meta.url), "utf8");
const pixelAt = (x, y) => (0xff000000 | ((y + 1) << 12) | (x + 1)) >>> 0;

function fixture({ width = 37, height = 29, sourceWidth = 127, sourceHeight = 193, ratio = 1, tx = 0, ty = 0 } = {}) {
  const reads = [];
  const writes = [];
  const pixels = new Uint32Array(width * height);
  const makeCanvas = () => {
    const canvas = { width: 0, height: 0 };
    const context = {
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (data) => { canvas.pixels = new Uint32Array(data.data.buffer).slice(); },
    };
    canvas.getContext = () => context;
    return canvas;
  };
  const sandbox = vm.createContext({
    styles: { ui: { scrollbarWidth: 12 } },
    document: { createElement: makeCanvas },
    UI: { getContextNoSmoothing: (canvas) => canvas.getContext("2d") },
  });
  vm.runInContext(source, sandbox);
  const view = new sandbox.GridView2d();
  view.width = width;
  view.height = height;
  const image = {
    width: sourceWidth,
    height: sourceHeight,
    getContext: () => ({
      getImageData: (x, y, w, h) => {
        assert.ok([x, y, w, h].every(Number.isInteger));
        assert.ok(x >= 0 && y >= 0 && x + w <= sourceWidth && y + h <= sourceHeight);
        reads.push({ x, y, width: w, height: h });
        const data = new Uint32Array(w * h);
        for (let row = 0; row < h; row++) {
          for (let col = 0; col < w; col++) data[row * w + col] = pixelAt(x + col, y + row);
        }
        return { data: new Uint8ClampedArray(data.buffer) };
      },
    }),
  };
  const context = {
    globalAlpha: 0.4,
    globalCompositeOperation: "multiply",
    getTransform: () => ({ a: ratio, d: ratio, e: tx * ratio, f: ty * ratio }),
    drawImage: (...args) => {
      writes.push(args);
      if (args.length !== 3) return; // Native integer-zoom fast path.
      const [canvas, x, y] = args;
      const left = x + tx;
      const top = y + ty;
      assert.ok(Number.isInteger(left) && Number.isInteger(top));
      for (let row = 0; row < canvas.height; row++) {
        pixels.set(canvas.pixels.subarray(row * canvas.width, (row + 1) * canvas.width),
          (top + row) * width + left);
      }
    },
  };
  return { view, image, context, pixels, reads, writes };
}

test("fractional bitmap sampling matches a pixel-centre oracle across clips, offsets and device ratios", () => {
  for (const scale of [0.1, 0.25, 0.5, 0.75, 1.25, 2.25, 2.5, 2.75, 3.5]) {
    for (const ratio of [1, 2, 3]) {
      for (const bounds of [false, { x: 9, y: 7, width: 13, height: 11 }]) {
        const f = fixture({ ratio, tx: 5, ty: -3 });
        const denominator = scale === 0.1 ? 10 : 4;
        const numerator = Math.round(scale * denominator);
        // Fractional phase, negative origin, clipped source, and non-square image.
        const ox = -7 * denominator + 3 * numerator;
        const oy = 2 * denominator + numerator;
        const sx = 2, sy = 1, sw = 99, sh = 150;
        const dx = ox / denominator + sx * scale - 5;
        const dy = oy / denominator + sy * scale + 3;
        f.view.drawRasterImage(f.context, bounds, f.image, sx, sy, sw, sh, dx, dy, sw * scale, sh * scale);
        for (let y = 0; y < f.view.height; y++) {
          for (let x = 0; x < f.view.width; x++) {
            const srcX = Math.floor(((2 * x + 1) * denominator - 2 * ox) / (2 * numerator));
            const srcY = Math.floor(((2 * y + 1) * denominator - 2 * oy) / (2 * numerator));
            const inside = srcX >= sx && srcX < sx + sw && srcY >= sy && srcY < sy + sh
              && (!bounds || (x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height));
            assert.equal(f.pixels[y * f.view.width + x], inside ? pixelAt(srcX, srcY) : 0,
              `scale=${scale}, DPR=${ratio}, clip=${Boolean(bounds)}, pixel=${x},${y}`);
          }
        }
        assert.equal(f.writes.length, 1);
        assert.equal(f.context.globalAlpha, 0.4);
        assert.equal(f.context.globalCompositeOperation, "multiply");
        assert.ok(f.reads.every(({ height }) => height <= 64));
      }
    }
  }
});

test("dirty rasterization bounds source reads and scratch storage; large reductions use row bands", () => {
  const f = fixture({ width: 160, height: 120, sourceWidth: 1600, sourceHeight: 1200 });
  const bounds = { x: 20, y: 30, width: 18, height: 18 };
  f.view.drawRasterImage(f.context, bounds, f.image, 0, 0, 1600, 1200, 0, 0, 3600, 2700);
  assert.equal(f.view.rasterCanvas.width, 18);
  assert.equal(f.view.rasterCanvas.height, 18);
  assert.ok(f.reads.every(({ width, height }) => width <= 9 && height <= 9));
  f.reads.length = 0;
  f.view.drawRasterImage(f.context, false, f.image, 0, 0, 1600, 1200, 0, 0, 160, 120);
  assert.equal(f.view.rasterCanvas.width, 160);
  assert.equal(f.view.rasterCanvas.height, 120);
  assert.ok(f.reads.length > 1);
  assert.ok(f.reads.every(({ height }) => height <= 64));
});

test("source rectangles crossing image edges are clipped without shifting the sampling phase", () => {
  const f = fixture({ sourceWidth: 13, sourceHeight: 11 });
  const scale = 2.25;
  f.view.drawRasterImage(f.context, false, f.image, -2, -1, 17, 15,
    7.25 - 2 * scale, 3.5 - scale, 17 * scale, 15 * scale);
  for (let y = 0; y < f.view.height; y++) {
    for (let x = 0; x < f.view.width; x++) {
      const sx = Math.floor(((x + 0.5) * 4 - 29) / 9);
      const sy = Math.floor(((y + 0.5) * 4 - 14) / 9);
      const expected = sx >= 0 && sx < 13 && sy >= 0 && sy < 11 ? pixelAt(sx, sy) : 0;
      assert.equal(f.pixels[y * f.view.width + x], expected);
    }
  }
});

test("reusing raster storage replaces transparent pixels rather than retaining the previous glyph", () => {
  const f = fixture();
  const draw = () => f.view.drawRasterImage(f.context, false, f.image, 0, 0, 8, 8, 0, 0, 18, 18);
  draw();
  const buffer = f.view.rasterImageData;
  assert.ok(f.pixels.some(Boolean));
  f.image.getContext = () => ({
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  });
  draw();
  assert.equal(f.view.rasterImageData, buffer);
  assert.ok(f.pixels.every((pixel) => pixel === 0));
});

test("integer magnification avoids raster allocation and readback", () => {
  const f = fixture({ ratio: 2 });
  f.view.drawRasterImage(f.context, false, f.image, 1, 2, 8, 9, 3, 4, 24, 27);
  assert.equal(f.view.rasterCanvas, null);
  assert.equal(f.reads.length, 0);
  assert.deepEqual(f.writes[0], [f.image, 1, 2, 8, 9, 3, 4, 24, 27]);
});

test("offscreen images preserve native compositing without raster work; empty images are ignored", () => {
  const f = fixture();
  f.view.drawRasterImage(f.context, false, f.image, 0, 0, 8, 8, -100, -100, 18, 18);
  f.view.drawRasterImage(f.context, false, f.image, 0, 0, 0, 8, 0, 0, 0, 18);
  assert.equal(f.view.rasterCanvas, null);
  assert.equal(f.reads.length, 0);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].length, 9);
});
