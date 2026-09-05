import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function createFrames(activeImporter) {
  const html = [];
  const sandbox = vm.createContext({
    g_app: { isMobile: () => false },
    $: () => ({ html: (value) => html.push(value) }),
  });
  const source = readFileSync(
    new URL("../src/js/textMode/frames/frames.js", import.meta.url),
    "utf8",
  );
  vm.runInContext(`${source}\n;globalThis.__Frames = Frames;`, sandbox);
  const feature = { getActive: () => activeImporter };
  const frames = new sandbox.__Frames();
  frames.init({ imageImportFeature: feature });
  return { frames, html };
}

test("frame playback starts before the lazy image importer is activated", () => {
  const { frames, html } = createFrames(null);

  frames.play();

  assert.equal(frames.playFrames, true);
  assert.match(html.at(-1), /Pause/);
});

test("frame playback remains disabled while an image import is in progress", () => {
  const { frames, html } = createFrames({ importInProgress: true });

  frames.play();

  assert.equal(frames.playFrames, false);
  assert.deepEqual(html, []);
});
