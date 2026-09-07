import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/js/ui/canvasPanel.js", import.meta.url), "utf8");

test("canvas panels preserve fractional DPR and resize only when backing dimensions change", () => {
  let widthWrites = 0;
  let heightWrites = 0;
  let backingWidth = 0;
  let backingHeight = 0;
  const canvas = { style: {} };
  Object.defineProperties(canvas, {
    width: {
      get: () => backingWidth,
      set: (value) => { backingWidth = value; widthWrites++; },
    },
    height: {
      get: () => backingHeight,
      set: (value) => { backingHeight = value; heightWrites++; },
    },
  });
  const UI = {
    canvasComponents: [],
    devicePixelRatio: 1.25,
    registerComponentType() {},
  };
  const sandbox = vm.createContext({
    UI,
    SafeHTML: { setHTML() {} },
    document: { getElementById: () => canvas },
    $: () => ({ width: () => 101, height: () => 51, offset: () => ({ left: 3, top: 4 }) }),
  });
  vm.runInContext(source, sandbox);
  const panel = new UI.CanvasPanel();
  panel.init({});
  panel.id = "test";
  panel.trigger = () => {};

  panel.resize();
  assert.equal(panel.getScale(), 1.25);
  assert.equal(canvas.width, 126);
  assert.equal(canvas.height, 64);
  assert.equal(canvas.style.width, "101px");
  assert.equal(canvas.style.height, "51px");

  panel.resize();
  assert.equal(widthWrites, 1, "an unchanged resize must not reset canvas state");
  assert.equal(heightWrites, 1, "an unchanged resize must not reset canvas state");

  UI.devicePixelRatio = 1.5;
  panel.resize();
  assert.equal(panel.getScale(), 1.5);
  assert.equal(canvas.width, 152);
  assert.equal(canvas.height, 77);
});
