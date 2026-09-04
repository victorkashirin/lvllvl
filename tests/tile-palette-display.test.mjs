import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function createTilePaletteDisplay({ tileWidth, tileHeight }) {
  const source = await readFile(
    path.join(projectRoot, "src/js/textMode/tileSet/tilePaletteDisplay.js"),
    "utf8",
  );
  const context = vm.createContext({
    styles: {
      tilePalette: { highlightOutline: "#fff", selectOutline: "#0ff" },
      ui: { scrollbar: "#aaa", scrollbarHolder: "#111", scrollbarWidth: 10 },
    },
    UI: {
      devicePixelRatio: 1,
      getContextNoSmoothing(canvas) {
        return canvas.context;
      },
    },
  });
  vm.runInContext(source, context, {
    filename: "src/js/textMode/tileSet/tilePaletteDisplay.js",
  });

  const rectangles = [];
  const canvasContext = {
    beginPath() {},
    clearRect() {},
    drawImage() {},
    rect(...rectangle) {
      rectangles.push(rectangle);
    },
    stroke() {},
  };
  const display = new context.TilePaletteDisplay();
  display.editor = {
    tileSetManager: {
      getCurrentTileSet() {
        return {
          getTileHeight: () => tileHeight,
          getTileWidth: () => tileWidth,
        };
      },
    },
  };
  display.canvas = { context: canvasContext, height: 100, width: 100 };
  display.tileCanvas = {};
  display.tilePaletteScale = 2;
  display.canvasScale = 1;
  display.viewHeight = 100;
  display.viewWidth = 100;
  display.vScrollBarWidth = 0;
  display.hScrollBarHeight = 0;
  display.columnHeight = 8;
  display.columnWidth = 16;
  display.selectedGridCells = [{ x: 4, y: 1 }];
  display.calculateScroll = function () {};

  return { display, rectangles };
}

test("tile palette selection follows non-square tile dimensions", async () => {
  const { display, rectangles } = await createTilePaletteDisplay({
    tileWidth: 8,
    tileHeight: 14,
  });

  display.draw();

  assert.deepEqual(rectangles, [[69, 30, 16, 28]]);
});
