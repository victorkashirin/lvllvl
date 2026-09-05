import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function createCanvas() {
  const context = {
    drawImage() {},
    fillRect() {},
    clearRect() {},
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, setTransform() {},
  };
  let height = 0;
  let resizeCount = 0;
  let width = 0;

  return {
    get height() {
      return height;
    },
    set height(value) {
      height = Math.trunc(value);
      resizeCount++;
    },
    get resizeCount() {
      return resizeCount;
    },
    get width() {
      return width;
    },
    set width(value) {
      width = Math.trunc(value);
      resizeCount++;
    },
    getContext: () => context,
  };
}

async function loadConstructor(relativePath, constructorName) {
  const sandbox = vm.createContext({
    document: { createElement: createCanvas },
  });
  const source = await readFile(path.join(projectRoot, relativePath), "utf8");
  vm.runInContext(source, sandbox, { filename: relativePath });
  return sandbox[constructorName];
}

async function createLayerFixtures(width, height) {
  const [LayerBackground, LayerGrid, LayerRefImage] = await Promise.all([
    loadConstructor("src/js/textMode/layers/layerBackground.js", "LayerBackground"),
    loadConstructor("src/js/textMode/layers/layerGrid.js", "LayerGrid"),
    loadConstructor("src/js/textMode/layers/layerRefImage.js", "LayerRefImage"),
  ]);

  const background = new LayerBackground();
  background.setDimensions(width, height);
  background.canvas = createCanvas();
  background.previewCanvas = createCanvas();

  const grid = new LayerGrid();
  grid.doc = { cellHeight: 1, cellWidth: 1, gridHeight: height, gridWidth: width };
  grid.editor = { layers: { getSelectedLayerId: () => 2 } };
  grid.layerId = 1;
  grid.canvas = createCanvas();
  grid.getCanvas = () => grid.canvas;
  grid.previewCanvas = createCanvas();
  // Sizing tests isolate layout from the real raster/dependency tests below.
  grid.isPreviewDirty = () => true;
  grid.getPreviewState = () => [];
  grid.getWidth = () => width;
  grid.getHeight = () => height;
  grid.getPreviewDamage = () => ({ minX: 0, minY: 0, maxX: grid.previewCanvas.width, maxY: grid.previewCanvas.height });
  grid.drawPreviewRegion = () => ({ canvas: grid.canvas, x: 0, y: 0 });

  const referenceImage = new LayerRefImage();
  referenceImage.doc = { height, width };
  referenceImage.canvas = createCanvas();
  referenceImage.previewCanvas = createCanvas();

  return { background, grid, referenceImage };
}

for (const [width, height] of [[100, 100], [40, 400], [320, 200], [1, 60]]) {
  test(`layer thumbnails stay within their rows at a ${width}:${height} ratio`, async () => {
    const layers = await createLayerFixtures(width, height);
    const scale = Math.min(1, 80 / width, 48 / height);
    const expectedWidth = Math.max(1, Math.round(width * scale));
    const expectedHeight = Math.max(1, Math.round(height * scale));

    for (const [type, layer] of Object.entries(layers)) {
      layer.updatePreview();

      assert.equal(layer.previewCanvas.width, expectedWidth, `${type} preview width is wrong`);
      assert.equal(layer.previewCanvas.height, expectedHeight, `${type} preview height is wrong`);
      assert.ok(
        layer.previewCanvas.height + 12 <= 60,
        `${type} preview and its vertical margins exceed the layer row`,
      );
      const resizeCount = layer.previewCanvas.resizeCount;

      layer.updatePreview();

      assert.equal(
        layer.previewCanvas.resizeCount,
        resizeCount,
        `${type} preview is resized again when its dimensions are unchanged`,
      );
    }
  });
}
