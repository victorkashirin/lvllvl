import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import {
  loadUICanvasPrimitives,
  loadUIDevicePixelRatio,
} from "./helpers/load-ui-canvas-primitives.mjs";

const surfaceSource = loadUICanvasPrimitives();
const scrollPanelSource = readFileSync(
  new URL("../src/js/ui/canvasScrollPanel.js", import.meta.url),
  "utf8",
);

function trackedCanvas() {
  let width = 0;
  let height = 0;
  let widthWrites = 0;
  let heightWrites = 0;
  const context = { setTransform() {} };
  const canvas = {
    style: {},
    addEventListener() {},
    getContext: () => context,
  };
  Object.defineProperties(canvas, {
    width: {
      get: () => width,
      set: (value) => { width = value; widthWrites++; },
    },
    height: {
      get: () => height,
      set: (value) => { height = value; heightWrites++; },
    },
  });
  return {
    canvas,
    writes: () => ({ width: widthWrites, height: heightWrites }),
  };
}

test("canvas surfaces map shared edges and invalidate DPR-dependent caches", () => {
  const UI = { devicePixelRatio: 1.25, devicePixelRatioRevision: 0 };
  const sandbox = vm.createContext({ UI });
  vm.runInContext(surfaceSource, sandbox);
  const tracked = trackedCanvas();
  const surface = new UI.CanvasSurface(tracked.canvas);

  const first = surface.resize({ cssWidth: 101, cssHeight: 51 });
  assert.equal(first.backingWidth, 126);
  assert.equal(first.backingHeight, 64);
  assert.equal(first.resized, true);
  assert.equal(first.cacheInvalidated, false);
  assert.ok(Object.isFrozen(first));

  const left = first.backingRect(0, 0, 1, 1);
  const right = first.backingRect(1, 0, 1, 1);
  assert.equal(left.x + left.width, right.x, "adjacent rectangles share one rounded edge");

  const unchanged = surface.resize({ cssWidth: 101, cssHeight: 51 });
  assert.equal(unchanged.resized, false);
  assert.deepEqual(tracked.writes(), { width: 1, height: 1 });

  surface.resize({ cssWidth: 102, cssHeight: 51 });
  assert.deepEqual(
    tracked.writes(),
    { width: 2, height: 1 },
    "changing one dimension must not rewrite the other",
  );
  surface.resize({ cssWidth: 101, cssHeight: 51 });

  UI.devicePixelRatioRevision++;
  const invalidated = surface.resize({ cssWidth: 101, cssHeight: 51 });
  assert.equal(invalidated.resized, false);
  assert.equal(invalidated.cacheInvalidated, true);

  UI.devicePixelRatio = 1.5;
  UI.devicePixelRatioRevision++;
  const changedRatio = surface.resize({ cssWidth: 101, cssHeight: 51 });
  assert.equal(changedRatio.ratioChanged, true);
  assert.equal(changedRatio.backingWidth, 152);
  assert.deepEqual(tracked.writes(), { width: 4, height: 2 });
});

test("canvas previews share holder measurement and backing-context setup", () => {
  const tracked = trackedCanvas();
  let ratioListener = null;
  let listenerRemoved = false;
  let ratioChanges = 0;
  const UI = {
    devicePixelRatio: 1.5,
    devicePixelRatioRevision: 0,
    getContextNoSmoothing: (canvas) => canvas.getContext("2d"),
    onDevicePixelRatioChange(listener) {
      ratioListener = listener;
      return () => { listenerRemoved = true; };
    },
  };
  const sandbox = vm.createContext({
    UI,
    $: () => ({
      length: 1,
      offset: () => ({ left: 7, top: 9 }),
      width: () => 101,
      height: () => 51,
    }),
  });
  vm.runInContext(surfaceSource, sandbox);

  const preview = new UI.CanvasPreview(
    tracked.canvas,
    "#preview-holder",
    () => { ratioChanges++; },
  );
  const layout = preview.resize();
  assert.deepEqual(
    { left: layout.left, top: layout.top, width: layout.width, height: layout.height },
    { left: 7, top: 9, width: 101, height: 51 },
  );
  assert.equal(layout.metrics.backingWidth, 152);
  assert.equal(layout.metrics.backingHeight, 77);
  assert.equal(preview.getBackingContext(true), tracked.canvas.getContext("2d"));
  UI.devicePixelRatio = 2;
  UI.devicePixelRatioRevision++;
  ratioListener();
  assert.equal(ratioChanges, 1);
  preview.dispose();
  assert.equal(listenerRemoved, true);
});

test("canvas scroll panels share rounded, idempotent surface sizing", () => {
  const tracked = trackedCanvas();
  const UI = {
    devicePixelRatio: 1.25,
    devicePixelRatioRevision: 0,
    onDevicePixelRatioChange() { return () => {}; },
    registerComponentType() {},
  };
  const sandbox = vm.createContext({
    UI,
    document: { getElementById: () => tracked.canvas },
    styles: { ui: { scrollbarWidth: 12 } },
    normalizeWheel() {},
    $: () => ({ width: () => 101, height: () => 51, offset: () => ({ left: 3, top: 4 }) }),
  });
  vm.runInContext(`${surfaceSource}\n${scrollPanelSource}`, sandbox);
  const panel = new UI.CanvasScrollPanel();
  panel.init({});
  panel.id = "scroll-test";
  panel.trigger = () => {};

  panel.resize();
  panel.resize();
  assert.equal(panel.getScale(), 1.25);
  assert.equal(tracked.canvas.width, 126);
  assert.equal(tracked.canvas.height, 64);
  assert.equal(panel.width, 101, "layout remains in CSS pixels");
  assert.deepEqual(tracked.writes(), { width: 1, height: 1 });

  let resizeEvents = 0;
  panel.trigger = (eventName) => {
    if (eventName === "resize") resizeEvents++;
  };
  sandbox.$ = () => ({
    width: () => 0,
    height: () => 0,
    offset: () => ({ left: 3, top: 4 }),
  });
  panel.resize();
  assert.equal(resizeEvents, 1, "zero-sized layouts still notify resize listeners");
  assert.deepEqual(tracked.writes(), { width: 1, height: 1 });
});

test("DPR changes preserve every positive ratio and isolate failing listeners", () => {
  const source = loadUIDevicePixelRatio();
  const window = {
    devicePixelRatio: 1.25,
    location: { search: "" },
    crypto: { getRandomValues: (values) => values.fill(1) },
  };
  const errors = [];
  const sandbox = vm.createContext({
    UI: {},
    console: { error: (...args) => errors.push(args) },
    window,
  });
  vm.runInContext(source, sandbox);
  const UI = sandbox.UI;
  const notifications = [];
  const unsubscribe = UI.onDevicePixelRatioChange((...args) => notifications.push(args));

  assert.equal(UI.setDevicePixelRatio(1.25), false);
  assert.equal(UI.devicePixelRatioRevision, 0);
  assert.equal(UI.setDevicePixelRatio(1.5), true);
  assert.equal(UI.devicePixelRatioRevision, 1);
  assert.deepEqual(notifications, [[1.5, 1.25, 1]]);

  const afterFailure = [];
  UI.onDevicePixelRatioChange(() => { throw new Error("broken surface"); });
  UI.onDevicePixelRatioChange((ratio) => afterFailure.push(ratio));
  assert.equal(UI.setDevicePixelRatio(0.75), true);
  assert.equal(UI.devicePixelRatio, 0.75);
  assert.deepEqual(afterFailure, [0.75]);
  assert.equal(errors.length, 1);
  window.devicePixelRatio = 0.8;
  assert.equal(UI.getDevicePixelRatio(), 0.8);

  unsubscribe();
  UI.setDevicePixelRatio(2);
  assert.equal(notifications.length, 2);
});

test("matchMedia DPR changes perform one layout pass before notifying renderers", () => {
  const calls = [];
  const mediaQueries = [];
  const animationFrames = [];
  const window = {
    devicePixelRatio: 1.25,
    requestAnimationFrame(callback) {
      animationFrames.push(callback);
    },
    matchMedia(query) {
      const mediaQuery = {
        query,
        listener: null,
        addEventListener(event, listener) {
          assert.equal(event, "change");
          this.listener = listener;
        },
        removeEventListener(event, listener) {
          assert.equal(event, "change");
          assert.equal(listener, this.listener);
        },
      };
      mediaQueries.push(mediaQuery);
      return mediaQuery;
    },
  };
  const UI = { resize: () => calls.push("resize") };
  vm.runInContext(loadUIDevicePixelRatio(), vm.createContext({ UI, window, console }));
  UI.onDevicePixelRatioChange((ratio, previousRatio, revision) => {
    calls.push(["notify", ratio, previousRatio, revision]);
  });

  UI.watchDevicePixelRatio();
  assert.equal(mediaQueries[0].query, "(resolution: 1.25dppx)");
  window.devicePixelRatio = 1.5;
  mediaQueries[0].listener();
  UI.requestDevicePixelRatioRefresh();
  assert.equal(animationFrames.length, 1, "same-frame resize and media events coalesce");
  animationFrames[0]();

  assert.deepEqual(calls, ["resize", ["notify", 1.5, 1.25, 1]]);
  assert.equal(mediaQueries[1].query, "(resolution: 1.5dppx)");
});
