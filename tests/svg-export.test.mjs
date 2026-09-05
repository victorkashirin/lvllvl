import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { encodeSvgExport } from "../src/js/modules/domain/svgExport.mjs";
import {
  captureLegacySvgExportSnapshot,
  createLegacySvgExportPort,
} from "../src/js/modules/feature-adapters/legacySvgExportAdapter.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadLegacySource(relativePath, context = {}) {
  const sandbox = vm.createContext(context);
  const source = await readFile(path.join(projectRoot, relativePath), "utf8");
  vm.runInContext(source, sandbox, { filename: relativePath });
  return sandbox;
}

function createTextModeLayer({ cells, pixels, flip = false, rotate = false }) {
  const pixelFrames = [];
  const tileSet = {
    getPixel(tileIndex, x, y, frame) {
      pixelFrames.push(frame);
      return pixels[tileIndex][x + y * 3];
    },
    getTileColor() {
      return 1;
    },
    getCharacterBGColor() {
      return -1;
    },
  };
  const colorPalette = {
    getRGBA(colorIndex) {
      return {
        0: [0, 0, 0, 255],
        1: [255, 0, 0, 255],
        2: [0, 0, 255, 255],
      }[colorIndex];
    },
  };
  const layer = {
    getType: () => "grid",
    getScreenMode: () => "textmode",
    getGridWidth: () => cells[0].length,
    getGridHeight: () => cells.length,
    getCellWidth: () => 3,
    getCellHeight: () => 2,
    getTileSet: () => tileSet,
    getColorPalette: () => colorPalette,
    getBackgroundColor: () => -1,
    getColorPerMode: () => "cell",
    getBlockModeEnabled: () => false,
    getHasTileFlip: () => flip,
    getHasTileRotate: () => rotate,
    getCell: ({ x, y }) => cells[y][x],
  };

  return { layer, pixelFrames };
}

test("text-mode SVG export converts binary tile pixels into crisp vector paths", async () => {
  const cells = [[
    { t: 0, fc: 1, bc: -1, fh: 0, fv: 0, rz: 0 },
    { t: 0, fc: 1, bc: 2, fh: 1, fv: 0, rz: 0 },
  ]];
  const { layer, pixelFrames } = createTextModeLayer({
    cells,
    pixels: [[1, 1, 0, 0, 1, 1]],
    flip: true,
  });
  const editor = {
    colorPaletteManager: { noColor: -1 },
    layers: { getSelectedLayerObject: () => layer },
  };
  const snapshot = captureLegacySvgExportSnapshot(editor);
  const svg = encodeSvgExport(snapshot).data;

  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="6" height="2" viewBox="0 0 6 2" shape-rendering="crispEdges">/);
  assert.doesNotMatch(svg, /<rect width="100%"/);
  assert.match(svg, /<path transform="translate\(0 0\)" d="M0 0h2v1h-2zM1 1h2v1h-2z" fill="rgb\(255,0,0\)"\/>/);
  assert.match(svg, /<rect x="3" y="0" width="3" height="2" fill="rgb\(0,0,255\)"\/>/);
  assert.match(svg, /<path transform="translate\(3 0\)" d="M1 0h2v1h-2zM0 1h2v1h-2z" fill="rgb\(255,0,0\)"\/>/);
  assert.ok(pixelFrames.length > 0);
  assert.deepEqual(new Set(pixelFrames), new Set(["current"]));
});

test("text-mode SVG paths honor tile rotation metadata", async () => {
  const tileSet = {
      getPixel(tileIndex, x, y, frame) {
        assert.equal(tileIndex, 0);
        assert.equal(frame, "current");
        return [1, 0, 0, 0][x + y * 2];
      },
  };
  const layer = {
    getType: () => "grid",
    getScreenMode: () => "textmode",
    getGridWidth: () => 1,
    getGridHeight: () => 1,
    getCellWidth: () => 2,
    getCellHeight: () => 2,
    getTileSet: () => tileSet,
    getColorPalette: () => ({ getRGBA: () => [255, 255, 255, 255] }),
    getBackgroundColor: () => -1,
    getColorPerMode: () => "cell",
    getBlockModeEnabled: () => false,
    getHasTileFlip: () => false,
    getHasTileRotate: () => true,
    getCell: () => ({ t: 0, fc: 1, bc: -1, rz: 1 }),
  };
  const snapshot = captureLegacySvgExportSnapshot({
    colorPaletteManager: { noColor: -1 },
    layers: { getSelectedLayerObject: () => layer },
  });

  assert.equal(snapshot.cells[0].path, "M1 0h1v1h-1z");
});

test("vector SVG export retains paths while using the selected grid dimensions", async () => {
  const cells = [
    { t: 0, fc: 1, bc: -1 },
    { t: 1, fc: 1, bc: -1 },
  ];
  const tileSet = {
    getFontScale: () => 0.001,
    getFontAscent: () => 800,
    getSVGPath: (tileIndex) => `M${tileIndex} 0h1000v1000z`,
  };
  const layer = {
    getType: () => "grid",
    getScreenMode: () => "vector",
    getGridWidth: () => 2,
    getGridHeight: () => 1,
    getTileSet: () => tileSet,
    getColorPalette: () => ({ getRGBA: () => [255, 255, 255, 255] }),
    getBackgroundColor: () => -1,
    getColorPerMode: () => "cell",
    getCell: ({ x }) => cells[x],
  };
  const editor = {
    colorPaletteManager: { noColor: -1 },
    layers: { getSelectedLayerObject: () => layer },
  };
  const snapshot = captureLegacySvgExportSnapshot(editor);
  const svg = encodeSvgExport(snapshot).data;

  assert.match(svg, /width="64" height="32" viewBox="0 0 64 32"/);
  assert.doesNotMatch(svg, /shape-rendering=/);
  assert.equal((svg.match(/<path /g) ?? []).length, 2);
  assert.match(svg, /translate\(32 25\.6\) scale\(0\.032 -0\.032\)/);
});

test("the editor enables SVG export for monochrome text modes", async () => {
  const context = await loadLegacySource("src/js/textMode/textModeEditor.js");
  const editor = new context.TextModeEditor();

  assert.equal(editor.isSVGExportSupported(context.TextModeEditor.Mode.TEXTMODE), true);
  assert.equal(editor.isSVGExportSupported(context.TextModeEditor.Mode.C64STANDARD), true);
  assert.equal(editor.isSVGExportSupported(context.TextModeEditor.Mode.C64ECM), true);
  assert.equal(editor.isSVGExportSupported(context.TextModeEditor.Mode.VECTOR), true);
  assert.equal(editor.isSVGExportSupported(context.TextModeEditor.Mode.C64MULTICOLOR), false);
  assert.equal(editor.isSVGExportSupported(context.TextModeEditor.Mode.INDEXED), false);
});

test("SVG downloads use the standard MIME type and preserve an existing extension", async () => {
  const downloads = [];
  const { layer } = createTextModeLayer({
    cells: [[{ t: 0, fc: 1, bc: -1, fh: 0, fv: 0, rz: 0 }]],
    pixels: [[1, 0, 0, 0, 0, 0]],
  });
  const editor = {
    colorPaletteManager: { noColor: -1 },
    layers: { getSelectedLayerObject: () => layer },
  };
  const port = createLegacySvgExportPort({
    editor,
    host: {
      downloadArtifact: (artifact) => downloads.push(artifact),
      reportError: (operation, error) => assert.fail(`${operation}: ${error}`),
      showAlert: (message) => assert.fail(message),
    },
  });

  await port.export("picture.SVG");

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].filename, "picture.SVG");
  assert.equal(downloads[0].mediaType, "image/svg+xml");
});
