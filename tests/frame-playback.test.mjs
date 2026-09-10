import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function createJQueryRecorder() {
  const changes = [];
  const $ = (selector) => {
    const control = {
      attr(name, value) {
        changes.push({ selector, operation: "attr", name, value });
        return control;
      },
      text(value) {
        changes.push({ selector, operation: "text", value });
        return control;
      },
      prop(name, value) {
        changes.push({ selector, operation: "prop", name, value });
        return control;
      },
      toggleClass(name, value) {
        changes.push({ selector, operation: "toggleClass", name, value });
        return control;
      },
    };
    return control;
  };
  return { $, changes };
}

function createFrames({
  activeImporter = null,
  frameCount = 2,
  durations = [],
  frameRanges = [],
  selectedRange = "",
  type = "screen",
} = {}) {
  const { $, changes } = createJQueryRecorder();
  let now = 1000;
  const graphic = {
    currentFrame: 0,
    frames: Array.from({ length: frameCount }, (_, index) => ({
      duration: durations[index] ?? 1,
    })),
    getCurrentFrame() { return this.currentFrame; },
    getFrameCount() { return this.frames.length; },
    getFrameRanges() { return frameRanges; },
    getType() { return type; },
  };
  const sandbox = vm.createContext({
    g_app: {
      getMode: () => "2d",
      isMobile: () => false,
      scripting: { doTick() {} },
    },
    getTimestamp: () => now,
    g_tick: 0,
    $,
  });
  const source = readFileSync(
    new URL("../src/js/textMode/frames/frames.js", import.meta.url),
    "utf8",
  );
  vm.runInContext(`${source}\n;globalThis.__Frames = Frames;`, sandbox);
  const editor = {
    animationPreview: { getFrameRange: () => selectedRange },
    graphic,
    imageImportFeature: { getActive: () => activeImporter },
    tileSetManager: { getCurrentTileSet: () => null },
  };
  const frames = new sandbox.__Frames();
  frames.init(editor);
  frames.gotoFrame = (frame) => {
    graphic.currentFrame = frame;
    frames.syncFrameControls();
    return true;
  };
  return {
    changes,
    frames,
    graphic,
    setNow(value) { now = value; },
  };
}

function lastChange(changes, selector, operation, name) {
  return changes.findLast((change) => change.selector === selector
    && change.operation === operation
    && (typeof name === "undefined" || change.name === name));
}

test("frame playback exposes matching play and pause state", () => {
  const { frames, changes } = createFrames();

  assert.equal(frames.play(), true);
  assert.equal(frames.playFrames, true);
  assert.equal(lastChange(changes, "#playLabel", "text").value, "Pause");
  assert.equal(lastChange(changes, "#playIcon", "attr", "class").value,
    "halflings halflings-pause");
  assert.equal(lastChange(changes, "#play", "attr", "aria-label").value, "Pause animation");
  assert.equal(lastChange(changes, "#play", "attr", "aria-pressed").value, "true");

  frames.stop();
  assert.equal(lastChange(changes, "#play", "attr", "aria-label").value, "Play animation");
});

test("frame playback remains disabled while an image import is in progress", () => {
  const { frames, changes } = createFrames({ activeImporter: { importInProgress: true } });

  assert.equal(frames.play(), false);
  assert.equal(frames.playFrames, false);
  assert.deepEqual(changes, []);
});

test("single-frame playback and boundary navigation are rejected", () => {
  const { frames, changes } = createFrames({ frameCount: 1 });

  assert.equal(frames.play(), false);
  assert.equal(frames.nextFrame(), false);
  assert.equal(frames.prevFrame(), false);
  assert.equal(lastChange(changes, "#play", "prop", "disabled").value, true);
  assert.equal(lastChange(changes, "#deleteFrame", "prop", "disabled").value, true);
});

test("playback is disabled for a selected one-frame sprite range", () => {
  const { frames, changes } = createFrames({
    frameCount: 3,
    frameRanges: [{ start: 1, end: 2 }],
    selectedRange: 0,
    type: "sprite",
  });

  frames.syncFrameControls();

  assert.equal(frames.play(), false);
  assert.equal(frames.playFrames, false);
  assert.equal(lastChange(changes, "#play", "prop", "disabled").value, true);
  assert.equal(lastChange(changes, "#deleteFrame", "prop", "disabled").value, false);
});

test("once playback stops on the final frame without an external animation tool", () => {
  const { frames, graphic } = createFrames({ frameCount: 3 });
  graphic.currentFrame = 2;
  frames.playMode = "once";
  frames.playFrames = true;

  assert.doesNotThrow(() => frames.update());
  assert.equal(graphic.currentFrame, 2);
  assert.equal(frames.playFrames, false);
});

test("ping-pong playback reverses away from both endpoints", () => {
  const { frames, graphic, setNow } = createFrames();
  frames.playMode = "pingpong";
  frames.playFrames = true;

  const visited = [];
  for(let tick = 1; tick <= 4; tick += 1) {
    setNow(1000 + tick * 100);
    frames.update();
    visited.push(graphic.currentFrame);
  }

  assert.deepEqual(visited, [1, 0, 1, 0]);
});

test("ping-pong playback traverses a three-frame sprite range in both directions", () => {
  const { frames, graphic, setNow } = createFrames({
    frameCount: 5,
    frameRanges: [{ start: 1, end: 4 }],
    selectedRange: 0,
    type: "sprite",
  });
  graphic.currentFrame = 1;
  frames.playMode = "pingpong";
  frames.playFrames = true;

  const visited = [];
  for(let tick = 1; tick <= 5; tick += 1) {
    setNow(1000 + tick * 100);
    frames.update();
    visited.push(graphic.currentFrame);
  }

  assert.deepEqual(visited, [2, 3, 2, 1, 2]);
});

function loadFrameModel(fileName, constructorName) {
  const sandbox = vm.createContext({});
  const source = readFileSync(new URL(`../src/js/textMode/${fileName}`, import.meta.url), "utf8");
  vm.runInContext(`${source}\n;globalThis.__Model = ${constructorName};`, sandbox);
  return new sandbox.__Model();
}

for(const [label, fileName, constructorName] of [
  ["2D", "graphic.js", "Graphic"],
  ["3D", "grid3d.js", "Grid3d"],
]) {
  test(`${label} frame durations reject empty and non-finite values`, () => {
    const model = loadFrameModel(fileName, constructorName);
    model.frames = [{ duration: 12 }];
    model.frameCount = 1;
    model.currentFrame = 0;

    for(const invalidDuration of ["", 0, -1, 1.5, 256, "not-a-number", Number.NaN]) {
      assert.equal(model.setFrameDuration(invalidDuration, 0), false);
    }
    assert.equal(model.frames[0].duration, 12);
    assert.equal(model.setFrameDuration("6", 0), true);
    assert.equal(model.frames[0].duration, 6);
  });
}
