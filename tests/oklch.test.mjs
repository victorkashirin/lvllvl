import assert from "node:assert/strict";
import test from "node:test";
import { oklchToRgb, rgbToOklch } from "../src/js/modules/domain/oklch.mjs";

test("OKLCH matches primary reference colors and round-trips sRGB", () => {
  const red = rgbToOklch(0xff0000);
  assert.ok(Math.abs(red.l - 62.795536) < 0.00001);
  assert.ok(Math.abs(red.c - 0.2576833) < 0.000001);
  assert.ok(Math.abs(red.h - 29.233885) < 0.00001);
  for (const rgb of [0, 0xffffff, 0xff0000, 0x00ff00, 0x0000ff, 0x808080,
    0x010203, 0x123456, 0xabcdef, 0xff00ff, 0x00ffff, 0xffff00]) {
    assert.equal(oklchToRgb(rgbToOklch(rgb)), rgb, rgb.toString(16));
  }
  assert.equal(rgbToOklch(0x808080).c, 0);
  assert.equal(rgbToOklch(0xffffff).h, 0);
});

test("out-of-gamut colors reduce chroma while preserving lightness and hue", () => {
  for (const h of [0, 60, 120, 180, 240, 300]) {
    const mapped = rgbToOklch(oklchToRgb({ l: 60, c: 0.4, h }));
    assert.ok(mapped.c < 0.4);
    assert.ok(Math.abs(mapped.l - 60) < 0.2);
    const hueError = Math.abs(((mapped.h - h + 540) % 360) - 180);
    assert.ok(hueError < 1);
  }
});

test("OKLCH handles endpoints, hue wrapping and invalid input", () => {
  assert.equal(oklchToRgb({ l: 0, c: 0.4, h: 120 }), 0);
  assert.equal(oklchToRgb({ l: 100, c: 0.4, h: 120 }), 0xffffff);
  assert.equal(oklchToRgb({ l: 60, c: 0.1, h: 360 }),
    oklchToRgb({ l: 60, c: 0.1, h: 0 }));
  assert.equal(oklchToRgb({ l: 60, c: 0.1, h: -60 }),
    oklchToRgb({ l: 60, c: 0.1, h: 300 }));
  assert.throws(() => oklchToRgb({ l: NaN, c: 0.1, h: 0 }), TypeError);
});
