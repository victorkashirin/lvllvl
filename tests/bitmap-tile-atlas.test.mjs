import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("../src/js/textMode/layers/layerGrid.js", import.meta.url),
  "utf8",
);

const modes = {
  TEXTMODE: "textmode",
  C64STANDARD: "c64standard",
  C64ECM: "c64ecm",
  C64MULTICOLOR: "c64multicolor",
  INDEXED: "indexed",
  RGB: "rgb",
  NES: "nes",
  VECTOR: "vector",
};

function fixture(width = 2, height = 2) {
  const canvases = [];
  const makeCanvas = () => {
    const canvas = { width: 0, height: 0, uploads: 0, pixels: new Uint32Array() };
    const context = {
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: () => assert.fail("the bitmap atlas must never read canvas pixels"),
      putImageData(imageData, dx, dy) {
        canvas.uploads++;
        if (canvas.pixels.length !== canvas.width * canvas.height) {
          canvas.pixels = new Uint32Array(canvas.width * canvas.height);
        }
        const sourcePixels = new Uint32Array(imageData.data.buffer);
        for (let y = 0; y < imageData.height; y++) {
          canvas.pixels.set(
            sourcePixels.subarray(y * imageData.width, (y + 1) * imageData.width),
            (dy + y) * canvas.width + dx,
          );
        }
      },
    };
    canvas.getContext = () => context;
    canvases.push(canvas);
    return canvas;
  };
  const sandbox = vm.createContext({
    document: { createElement: makeCanvas },
    TextModeEditor: { Mode: modes },
  });
  vm.runInContext(source, sandbox);
  const layer = new sandbox.LayerGrid();
  const paletteHex = [0x000000, 0xff0000, 0x00ff00, 0x0000ff, 0xf0c030, 0x8142e6];
  const colorPalette = {
    renderRevision: 0,
    colors: paletteHex.map((hex) => ({ hex })),
    getHex: (index) => paletteHex[index] ?? 0,
  };
  const tileSet = {
    renderRevision: 0,
    tileRenderRevisions: [],
    backgroundIsTransparent: true,
  };
  const tileData = [[1, 0, 0, 1]];
  const atlasFor = (screenMode, transparentColorIndex = 0, nesPaletteState = null) =>
    layer.getBitmapTileAtlas({
      tileSet,
      tileData,
      colorPalette,
      tileWidth: width,
      tileHeight: height,
      screenMode,
      transparentColorIndex,
      isSprite: false,
      nesPaletteState,
    });
  const entryFor = (atlas, options = {}) => layer.getBitmapTileAtlasEntry(atlas, {
    key: options.key ?? "entry",
    tileData: options.tileData ?? tileData[0],
    screenMode: options.screenMode ?? modes.TEXTMODE,
    colorPalette,
    colorIndex: options.colorIndex ?? 1,
    bgColorIndex: options.bgColorIndex ?? -1,
    transparentColorIndex: options.transparentColorIndex ?? 0,
    flipH: options.flipH ?? false,
    flipV: options.flipV ?? false,
    rotZ: options.rotZ ?? 0,
    backgroundIsTransparent: options.backgroundIsTransparent ?? true,
    multicolorRGBA: options.multicolorRGBA ?? [0, 0, 0, 0],
    multicolorForegroundIndex: options.multicolorForegroundIndex ?? null,
    nesRGBA: options.nesRGBA ?? [[0, 0, 0, 0]],
    nesPaletteIndex: options.nesPaletteIndex ?? 0,
  });
  const bytesFor = (atlas, entry) => {
    const result = [];
    const bytes = new Uint8ClampedArray(atlas.canvas.pixels.buffer);
    for (let y = 0; y < atlas.height; y++) for (let x = 0; x < atlas.width; x++) {
      const offset = ((entry.y + y) * atlas.canvas.width + entry.x + x) * 4;
      result.push(Array.from(bytes.subarray(offset, offset + 4)));
    }
    return result;
  };
  return { layer, tileSet, tileData, colorPalette, canvases, atlasFor, entryFor, bytesFor };
}

test("bitmap tile atlas caches repeated cells without destination readback", () => {
  const f = fixture();
  const atlas = f.atlasFor(modes.TEXTMODE);
  const first = f.entryFor(atlas, { key: "0/0/1/-1/0/0/0" });
  const repeated = f.entryFor(atlas, { key: "0/0/1/-1/0/0/0" });
  assert.equal(repeated, first);
  assert.equal(atlas.canvas.uploads, 1);
  assert.deepEqual(f.bytesFor(atlas, first), [
    [255, 0, 0, 255], [0, 0, 0, 0],
    [0, 0, 0, 0], [255, 0, 0, 255],
  ]);

  const flipped = f.entryFor(atlas, {
    key: "0/0/2/3/1/0/0", colorIndex: 2, bgColorIndex: 3, flipH: true,
  });
  assert.equal(atlas.canvas.uploads, 2);
  assert.deepEqual(f.bytesFor(atlas, flipped), [
    [0, 0, 255, 255], [0, 255, 0, 255],
    [0, 255, 0, 255], [0, 0, 255, 255],
  ]);
  assert.ok(atlas.capacity <= 1024);
  assert.ok(atlas.canvas.width * atlas.canvas.height <= 4 * 1024 * 1024);

  const tall = fixture(18, 255).atlasFor(modes.TEXTMODE);
  assert.ok(tall.canvas.width * tall.canvas.height <= 4 * 1024 * 1024);
  assert.ok(tall.capacity <= 1024);
});

test("palette and bulk tile revisions replace atlas dependencies", () => {
  const f = fixture();
  const initial = f.atlasFor(modes.TEXTMODE);
  f.entryFor(initial);
  assert.equal(f.atlasFor(modes.TEXTMODE), initial);
  f.colorPalette.renderRevision++;
  const paletteChanged = f.atlasFor(modes.TEXTMODE);
  assert.notEqual(paletteChanged, initial);
  f.tileSet.renderRevision++;
  assert.notEqual(f.atlasFor(modes.TEXTMODE), paletteChanged);
});

test("bitmap tile atlas evicts the oldest slot at its fixed capacity", () => {
  const f = fixture();
  const atlas = f.atlasFor(modes.TEXTMODE);
  atlas.capacity = 1;
  const first = f.entryFor(atlas, { key: "first" });
  const second = f.entryFor(atlas, { key: "second", colorIndex: 2 });
  assert.equal(atlas.entries.size, 1);
  assert.equal(atlas.entries.has("first"), false);
  assert.equal(atlas.entries.get("second"), second);
  assert.equal(second.x, first.x);
  assert.equal(second.y, first.y);
});

test("indexed, RGB, NES, and multicolour loops preserve alpha and palette mapping", () => {
  const f = fixture(4, 1);

  let atlas = f.atlasFor(modes.INDEXED, 0);
  let entry = f.entryFor(atlas, {
    screenMode: modes.INDEXED, tileData: [1, 0, 2, 3], transparentColorIndex: 0,
  });
  assert.deepEqual(f.bytesFor(atlas, entry), [
    [255, 0, 0, 255], [0, 0, 0, 0], [0, 255, 0, 255], [0, 0, 255, 255],
  ]);

  atlas = f.atlasFor(modes.RGB);
  entry = f.entryFor(atlas, {
    screenMode: modes.RGB,
    tileData: [0x80112233, 0xffabcdef, 0x00000000, 0x7f010203],
  });
  assert.deepEqual(f.bytesFor(atlas, entry), [
    [17, 34, 51, 128], [171, 205, 239, 255], [0, 0, 0, 0], [1, 2, 3, 127],
  ]);

  atlas = f.atlasFor(modes.NES, 0, "0,1,2,3");
  entry = f.entryFor(atlas, {
    screenMode: modes.NES, tileData: [0, 1, 2, 7],
    nesRGBA: [[0, f.layer.packBitmapRGB(0xf0c030, 255),
      f.layer.packBitmapRGB(0x8142e6, 255), f.layer.packBitmapRGB(0x0000ff, 255)]],
    nesPaletteIndex: -1,
  });
  assert.deepEqual(f.bytesFor(atlas, entry), [
    [0, 0, 0, 0], [240, 192, 48, 255], [129, 66, 230, 255], [240, 192, 48, 255],
  ]);

  const c64 = fixture(8, 1);
  atlas = c64.atlasFor(modes.C64MULTICOLOR);
  entry = c64.entryFor(atlas, {
    key: "c64-character",
    screenMode: modes.C64MULTICOLOR, tileData: [0, 0, 0, 1, 1, 0, 1, 1],
    colorIndex: 2,
    multicolorRGBA: [c64.layer.packBitmapRGB(0xff0000, 255),
      c64.layer.packBitmapRGB(0xf0c030, 255),
      c64.layer.packBitmapRGB(0x0000ff, 255), 0],
    multicolorForegroundIndex: 3,
    backgroundIsTransparent: true,
  });
  assert.deepEqual(c64.bytesFor(atlas, entry), [
    [0, 0, 0, 0], [0, 0, 0, 0],
    [240, 192, 48, 255], [240, 192, 48, 255],
    [0, 0, 255, 255], [0, 0, 255, 255],
    [0, 255, 0, 255], [0, 255, 0, 255],
  ]);

  entry = c64.entryFor(atlas, {
    key: "c64-sprite",
    screenMode: modes.C64MULTICOLOR, tileData: [0, 0, 0, 1, 1, 0, 1, 1],
    colorIndex: 2,
    multicolorRGBA: [c64.layer.packBitmapRGB(0xff0000, 255),
      c64.layer.packBitmapRGB(0xf0c030, 255), 0,
      c64.layer.packBitmapRGB(0x0000ff, 255)],
    multicolorForegroundIndex: 2,
    backgroundIsTransparent: true,
  });
  assert.deepEqual(c64.bytesFor(atlas, entry), [
    [0, 0, 0, 0], [0, 0, 0, 0],
    [240, 192, 48, 255], [240, 192, 48, 255],
    [0, 255, 0, 255], [0, 255, 0, 255],
    [0, 0, 255, 255], [0, 0, 255, 255],
  ]);
});
