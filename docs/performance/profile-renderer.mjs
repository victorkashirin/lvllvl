// Diagnostic probes, not a frame-rate benchmark or a CI timing gate.
// Start `npm run preview -- --port 4173`, then run:
// node docs/performance/profile-renderer.mjs [baseURL] > /tmp/renderer-profile.json
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseURL = process.argv[2] ?? "http://127.0.0.1:4173/";
const sha256 = (content) => createHash("sha256").update(content).digest("hex");
const map = await fetch(new URL("js/main.js.map", baseURL)).then((r) => r.json());
const rendererFiles = [
  "js/textMode/gridView2d.js", "js/textMode/graphic.js",
  "js/textMode/layers/layerGrid.js", "js/textMode/grid2d.js",
  "js/textMode/animationPreview.js", "js/textMode/tileSet/tileSet.js",
  "js/textMode/tools/shapes.js", "js/textMode/grid3dLayer.js",
  "js/textMode/gridView3d.js", "js/textMode/frames/frames.js",
  "js/textMode/tileSet/tilePaletteDisplay.js", "js/textMode/currentTile.js",
];
const sourceChecks = [];
for (const filename of rendererFiles) {
  const index = map.sources.indexOf(filename);
  const source = await readFile(path.join(root, "src", filename), "utf8");
  const matchesBuild = index >= 0 && map.sourcesContent[index] === source;
  sourceChecks.push({ filename, matchesBuild, sha256: sha256(source) });
  if (!matchesBuild) throw new Error(`Build/source mismatch: ${filename}; rebuild before profiling.`);
}

const mainBundle = await fetch(new URL("js/main.js", baseURL)).then((r) => r.arrayBuffer());
const browser = await chromium.launch();
const report = {
  recordedAt: new Date().toISOString(),
  mainBundleSha256: sha256(Buffer.from(mainBundle)),
  host: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0].model },
  browser: browser.version(),
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  cpuSlowdownMultiplier: 1,
  sourceChecks,
  methodology: "Single headless Chromium run; 3 warmups, 25 synchronous calls per case. Timings exclude probe wrappers; counts come from one separate call. Native Canvas calls still run. Not input-to-paint or GPU-completion timings.",
  fixtures: [],
};
try {
  for (const [width, height] of [[40, 25], [160, 100], [320, 200]]) {
    const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route((url) => url.origin !== new URL(baseURL).origin, (route) => route.abort());
      await page.goto(baseURL);
      await page.locator("#startPage").waitFor({ state: "visible" });
      await page.locator("#start2D").click();
      await page.locator("#newProjectWidth").fill(String(width));
      await page.locator("#newProjectHeight").fill(String(height));
      await page.getByText("OK", { exact: true }).last().click();
      await page.locator("#startPage").waitFor({ state: "hidden" });
      await page.waitForTimeout(300);

      const fixture = await page.evaluate(async ({ width, height }) => {
        const editor = g_app.textModeEditor;
        const graphic = editor.graphic;
        const view = editor.gridView2d;
        const grid = editor.grid.grid2d;
        const layer = editor.layers.getSelectedLayerObject();
        const tiles = layer.getTileSet();
        const x = Math.floor(width / 2);
        const y = Math.floor(height / 2);
        editor.animationPreview.hide();
        editor.frames.playFrames = false;
        editor.frames.setShowPrevFrame(false);
        // Fixture generation is outside measured regions. One repeating tile,
        // default C64 palette, no reference image, one opaque bitmap layer.
        for (const row of layer.frames[0].data) {
          for (const cell of row) Object.assign(cell, { t: 65, fc: 1, bc: -1 });
        }
        view.setScale(3.5, false);
        grid.setCursorEnabled(false);
        graphic.invalidateAllCells();
        graphic.redraw({ allCells: true });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const result = {
          cells: { width, height },
          pixels: { width: graphic.getGraphicWidth(), height: graphic.getGraphicHeight() },
          viewportCanvas: { width: view.width, height: view.height },
          displayScale: view.displayScale,
          cases: [],
        };
        // Actual idle RAF activity, with no editing, selection, or animation.
        let renderCalls = 0;
        let drawCalls = 0;
        const render = view.render;
        const draw = view.draw;
        view.render = function (...args) { renderCalls++; return render.apply(this, args); };
        view.draw = function (...args) { drawCalls++; return draw.apply(this, args); };
        const idleStart = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        result.idle = { milliseconds: performance.now() - idleStart, renderCalls, drawCalls };
        view.render = render;
        view.draw = draw;

        function countOne(operation) {
          const counts = { getImageData: {}, putImageData: {}, lineTo: 0, drawImage: 0, canvasSizeAssignments: {}, layerDraws: {}, viewDraws: 0, thumbnailUpdates: 0 };
          const restore = [];
          function wrap(object, key, before) {
            const original = object[key];
            object[key] = function (...args) { before.call(this, args); return original.apply(this, args); };
            restore.push(() => { object[key] = original; });
          }
          function label(canvas) {
            if (canvas === layer.canvas) return "layer";
            if (canvas === layer.prevFrameCanvas) return "previousFrame";
            if (canvas === grid.tempCanvas) return "previewTemp";
            if (canvas === grid.effectCanvas) return "unusedEffect";
            if (canvas === graphic.shapesCanvas) return "shapes";
            if (canvas === editor.tools.drawTools.tilePalette.tilePaletteDisplay?.tileCanvas) return "bottomTilePalette";
            if (canvas === editor.sideTilePalette.tilePaletteDisplay?.tileCanvas) return "sideTilePalette";
            return "other";
          }
          function imageCount(kind, canvas, pixels) {
            const entry = counts[kind][label(canvas)] ??= { calls: 0, pixels: 0 };
            entry.calls++;
            entry.pixels += pixels;
          }
          const proto = CanvasRenderingContext2D.prototype;
          wrap(proto, "getImageData", function (args) { imageCount("getImageData", this.canvas, args[2] * args[3]); });
          wrap(proto, "putImageData", function (args) { imageCount("putImageData", this.canvas, args[0].width * args[0].height); });
          wrap(proto, "lineTo", () => { counts.lineTo++; });
          wrap(proto, "drawImage", () => { counts.drawImage++; });
          wrap(layer, "draw", ([args]) => { const key = args.draw ?? "grid"; counts.layerDraws[key] = (counts.layerDraws[key] ?? 0) + 1; });
          wrap(view, "draw", () => { counts.viewDraws++; });
          wrap(layer, "updatePreview", () => { counts.thumbnailUpdates++; });
          for (const key of ["width", "height"]) {
            const proto = HTMLCanvasElement.prototype;
            const descriptor = Object.getOwnPropertyDescriptor(proto, key);
            Object.defineProperty(proto, key, {
              ...descriptor,
              set(value) {
                const entry = counts.canvasSizeAssignments[label(this)] ??= { total: 0, sameValue: 0 };
                entry.total++;
                if (descriptor.get.call(this) === Number(value)) entry.sameValue++;
                descriptor.set.call(this, value);
              },
            });
            restore.push(() => Object.defineProperty(proto, key, descriptor));
          }
          try { operation(); return counts; }
          finally { for (const undo of restore.reverse()) undo(); }
        }
        function run(name, operation) {
          for (let i = 0; i < 3; i++) operation();
          const samples = [];
          for (let i = 0; i < 25; i++) {
            const start = performance.now();
            operation();
            samples.push(performance.now() - start);
          }
          const sorted = [...samples].sort((a, b) => a - b);
          const round = (value) => Math.round(value * 1000) / 1000;
          result.cases.push({ name, medianMs: round(sorted[12]), p95Ms: round(sorted[23]), samplesMs: samples.map(round), counts: countOne(operation) });
        }
        let editIndex = 0;
        function editCell() {
          layer.setCell({ x, y, t: 67 + (++editIndex % 2), fc: 1, bc: -1 });
          grid.redrawUpdatedCells(layer);
        }
        run("single-cell-pencil", editCell);
        // Counterfactual controls: deliberately omit one presentation step.
        // These are not correctness-preserving patches or shipping fixes.
        const updatePreview = layer.updatePreview;
        layer.updatePreview = () => {};
        try { run("single-cell-pencil-without-thumbnail-control", editCell); }
        finally { layer.updatePreview = updatePreview; }
        const drawGrid = view.drawGrid;
        view.drawGrid = () => {};
        try { run("single-cell-pencil-without-grid-control", editCell); }
        finally { view.drawGrid = drawGrid; }
        // Neither the artwork nor the current brush uses tile 255.
        const props = tiles.tileData[255].props;
        Object.assign(props, { animated: "blink", ticksPerFrame: 1, frame: 0 });
        let tick = 0;
        run("animate-unused-tile", () => tiles.update(++tick));
        props.animated = false;

        graphic.duplicateFrame(0);
        editor.frames.setShowPrevFrame(true);
        run("single-cell-pencil-onion-skin", editCell);
        editor.frames.setShowPrevFrame(false);

        const shapes = editor.tools.drawTools.shapes;
        editor.tools.drawTools.tool = "rect";
        shapes.startShape("rect", x, y, 0, "xy");
        let endpoint = 0;
        run("small-rectangle-drag", () => shapes.setShapeTo(x + 2 + (++endpoint % 2), y + 2, 0));
        shapes.cancelShape();
        editor.tools.drawTools.tool = "draw";

        // Call the real preview draw path, with a detached 320x200 output canvas
        // so panel layout does not change the artwork viewport between cases.
        const preview = editor.animationPreview;
        preview.canvas = document.createElement("canvas");
        preview.canvas.width = 320;
        preview.canvas.height = 200;
        preview.context = preview.canvas.getContext("2d");
        preview.canvasScale = 1;
        preview.scale = 1;
        preview.currentFrame = 0;
        preview.visible = true;
        run("animation-preview-same-frame", () => preview.draw());
        preview.visible = false;

        view.setScale(8, false);
        graphic.invalidateAllCells();
        graphic.redraw({ allCells: true });
        run("single-cell-pencil-zoom-8", editCell);
        result.zoom8DisplayScale = view.displayScale;
        return result;
      }, { width, height });
      report.fixtures.push({ ...fixture, pageErrors: errors });
    } finally {
      await context.close();
    }
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
