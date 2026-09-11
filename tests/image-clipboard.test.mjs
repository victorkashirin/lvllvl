import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadImageUtils(overrides = {}) {
  const source = await readFile(
    new URL("../src/js/utils/imageUtils.js", import.meta.url),
    "utf8",
  );
  const messages = [];
  const timers = [];
  const context = vm.createContext({
    ClipboardItem: class ClipboardItem {
      constructor(items) { this.items = items; }
    },
    UI: {
      alert(message, options) {
        messages.push({ message, title: options.title });
        return Promise.resolve();
      },
    },
    console: { error: console.error, warn() {} },
    navigator: { clipboard: { write: async () => {} } },
    setTimeout(callback) { timers.push(callback); return timers.length; },
    ...overrides,
  });
  vm.runInContext(`${source}\nglobalThis.TestImageUtils = ImageUtils;`, context);
  return { ImageUtils: context.TestImageUtils, context, messages, timers };
}

test("image clipboard helper awaits writes and reports success", async () => {
  let finishWrite;
  const writes = [];
  const { ImageUtils, timers } = await loadImageUtils({
    navigator: {
      clipboard: {
        write(items) {
          writes.push(items);
          return new Promise((resolve) => { finishWrite = resolve; });
        },
      },
    },
  });
  const enabled = [];
  const labels = [];
  const button = {
    getText: () => "Copy To Clipboard",
    setEnabled(value) { enabled.push(value); },
    setText(value) { labels.push(value); },
  };
  const blob = { size: 12, type: "image/png" };
  const canvas = { toBlob: (callback, type) => callback(type === "image/png" ? blob : null) };

  const copy = ImageUtils.copyCanvasToClipboard(canvas, { button });
  await Promise.resolve();
  assert.deepEqual(enabled, [false]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0].items["image/png"], blob);

  finishWrite();
  assert.equal(await copy, true);
  assert.deepEqual(enabled, [false, true]);
  assert.deepEqual(labels, ["Copied"]);
  timers[0]();
  assert.deepEqual(labels, ["Copied", "Copy To Clipboard"]);
});

test("image clipboard helper preserves the button label across rapid copies", async () => {
  const { ImageUtils, timers } = await loadImageUtils();
  let label = "Copy To Clipboard";
  const button = {
    getText: () => label,
    setEnabled() {},
    setText(value) { label = value; },
  };
  const canvas = {
    toBlob(callback) { callback({ size: 12, type: "image/png" }); },
  };

  assert.equal(await ImageUtils.copyCanvasToClipboard(canvas, { button }), true);
  assert.equal(await ImageUtils.copyCanvasToClipboard(canvas, { button }), true);
  assert.equal(label, "Copied");

  timers[0]();
  assert.equal(label, "Copied");
  timers[1]();
  assert.equal(label, "Copy To Clipboard");
});

test("image clipboard helper reports rejected writes and invalid blobs", async () => {
  const permissionError = new Error("denied");
  permissionError.name = "NotAllowedError";
  const { ImageUtils, messages } = await loadImageUtils({
    navigator: { clipboard: { write: async () => { throw permissionError; } } },
  });
  const button = { getText: () => "Copy", setEnabled() {}, setText() {} };

  assert.equal(await ImageUtils.copyCanvasToClipboard({
    toBlob(callback) { callback({ size: 1, type: "image/png" }); },
  }, { button }), false);
  assert.match(messages[0].message, /permission was denied/i);
  assert.equal(messages[0].title, "Copy Failed");

  assert.equal(await ImageUtils.copyCanvasToClipboard({
    toBlob(callback) { callback(null); },
  }, { button }), false);
  assert.match(messages[1].message, /prepare the image/i);
});

test("image clipboard helper requires the complete browser capability", async () => {
  const { ImageUtils, messages } = await loadImageUtils({
    navigator: { clipboard: {} },
  });

  assert.equal(ImageUtils.canCopyToClipboard(), false);
  assert.equal(await ImageUtils.copyCanvasToClipboard({ toBlob() {} }), false);
  assert.match(messages[0].message, /not available/i);
});
