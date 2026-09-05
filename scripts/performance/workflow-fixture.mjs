// Serialized into the page by rendering-workflows.mjs. Keep browser dependencies
// inside this function; never replace rendering methods in timing runs.
export async function installWorkflowFixture({ width, height, workflow, zoom }) {
  const editor = g_app.textModeEditor;
  const { graphic, layers, gridView2d: view } = editor;
  const layer = layers.getSelectedLayerObject();
  const palette = editor.sideTilePalette.tilePaletteDisplay;
  const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 160));
    await raf(); await raf();
  };
  graphic.setGridDimensions({ width, height });
  editor.history.setEnabled(false);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    layer.setCell({ x, y, t: 1, fc: 14, bc: -1, update: false });
  }
  editor.history.setEnabled(true);
  if (workflow === "onion-drag") {
    graphic.duplicateFrame(0);
    editor.frames.setShowPrevFrame(true);
  }
  view.setScale(zoom, false);
  view.setCameraPosition(0, 0);
  editor.tools.drawTools.setDrawTool(workflow === "rectangle" ? "rect" : workflow === "pan" ? "hand" : "pen");
  for (const id of ["drawChangesSmartRect", "shapeFill"]) {
    const input = document.getElementById(id);
    if (input) input.checked = false;
  }
  editor.currentTile.setCharacters([[2]]);
  editor.currentTile.setColor(1);
  editor.currentTile.setBGColor(-1);
  graphic.invalidateAllCells();
  graphic.redraw({ allCells: true });
  layers.updateAllLayerPreviews();
  await settle();

  const rect = view.canvas.getBoundingClientRect();
  const cw = layer.getCellWidth() * view.displayScale;
  const ch = layer.getCellHeight() * view.displayScale;
  const originX = view.width / 2 - layer.getWidth() * view.displayScale / 2;
  const originY = view.height / 2 - layer.getHeight() * view.displayScale / 2;
  const startCell = { x: Math.floor(width / 2) - 5, y: Math.floor(height / 2) - 3 };
  const point = (dx, dy) => ({
    x: rect.left + originX + (startCell.x + dx + 0.5) * cw,
    y: rect.top + originY + (startCell.y + dy + 0.5) * ch,
  });
  const tilePoints = [];
  const pr = palette.canvas.getBoundingClientRect();
  for (let y = 4; y < palette.viewHeight - 16 && tilePoints.length < 2; y += 4) {
    for (let x = 4; x < palette.viewWidth - 16 && tilePoints.length < 2; x += 4) {
      const tile = palette.tilePaletteXYToTile(x + palette.scrollX, y + palette.scrollY);
      if (tile !== false && tile > 2 && !tilePoints.some((p) => p.tile === tile)
        && document.elementFromPoint(pr.left + x, pr.top + y) === palette.canvas) {
        tilePoints.push({ x: pr.left + x, y: pr.top + y, tile });
      }
    }
  }
  if (workflow === "choose-tile" && tilePoints.length !== 2) throw new Error("No visible palette tiles");
  let sequence = 0;
  let expected;
  let counters = null;
  let phase = "input";
  const restores = [];
  const bump = (key, amount = 1) => {
    if (!counters) return;
    for (const group of [counters.total, counters[phase]]) group[key] = (group[key] || 0) + amount;
  };
  const wrap = (object, key, count) => {
    const original = object[key];
    object[key] = function(...args) { count.call(this, args); return original.apply(this, args); };
    restores.push(() => { object[key] = original; });
  };
  const startCounting = () => {
    counters = { total: {}, input: {}, release: {}, deferred: {} };
    wrap(layer, "draw", ([args = {}]) => bump(`layerDraw.${args.draw || "grid"}`));
    wrap(layer, "updatePreview", () => bump("thumbnailUpdates"));
    wrap(view, "draw", () => bump("viewDraws"));
    const proto = CanvasRenderingContext2D.prototype;
    wrap(proto, "getImageData", function(args) {
      bump("readCalls"); bump("readPixels", Math.abs(args[2] * args[3]));
      if (this.canvas === layer.canvas) bump("artworkReadPixels", Math.abs(args[2] * args[3]));
    });
    wrap(proto, "putImageData", (args) => {
      bump("writeCalls");
      bump("writePixels", args.length >= 7 ? Math.abs(args[5] * args[6]) : args[0].width * args[0].height);
    });
    wrap(proto, "drawImage", () => bump("drawImageCalls"));
    wrap(proto, "lineTo", () => bump("lineToCalls"));
  };
  const stopCounting = () => { for (const restore of restores.splice(0)) restore(); const result = counters; counters = null; return result; };
  const hash = (values) => {
    let result = 2166136261;
    for (const value of values) result = Math.imul(result ^ value, 16777619);
    return (result >>> 0).toString(16);
  };
  window.workflowBenchmark = {
    metadata: {
      width, height, workflow, zoom: view.displayScale, tileWidth: layer.getCellWidth(),
      tileHeight: layer.getCellHeight(), tileSet: layer.getTileSet().name,
      artworkViewport: { width: view.width, height: view.height }, startCell, tilePoints,
    },
    async prepare() {
      sequence++;
      // Alternating colors ensure every stroke is a real edit, including warmups.
      expected = { color: sequence % 2 ? 1 : 2, tile: 2 };
      editor.currentTile.setCharacters([[expected.tile]]);
      editor.currentTile.setColor(expected.color);
      if (workflow === "pan") {
        view.setCameraPosition(0, 0);
        graphic.redraw({ allCells: true });
      }
      // Hover/setup is not part of the measured gesture.
      const p = workflow === "choose-tile" ? tilePoints[sequence % 2] : point(0, 0);
      document.elementFromPoint(p.x, p.y).dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true, clientX: p.x, clientY: p.y, buttons: 0,
      }));
      await settle();
    },
    async run(count = false) {
      phase = "input";
      if (count) startCounting();
      const events = [];
      const frameTimes = [];
      const longTasks = [];
      const observer = PerformanceObserver.supportedEntryTypes.includes("longtask")
        ? new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })))) : null;
      observer?.observe({ type: "longtask" });
      let tracking = true;
      let frameId;
      const trackFrame = (time) => { if (tracking) { frameTimes.push(time); frameId = requestAnimationFrame(trackFrame); } };
      frameId = requestAnimationFrame(trackFrame);
      const emit = (type, p, buttons) => {
        // Hit-testing honors the application's actual mouse-capture overlay.
        const target = document.elementFromPoint(p.x, p.y);
        if (!target) throw new Error(`No event target at ${JSON.stringify(p)}`);
        const event = new MouseEvent(type, { bubbles: true, cancelable: true,
          clientX: p.x, clientY: p.y, button: 0, buttons, view: window });
        const start = performance.now();
        target.dispatchEvent(event);
        events.push({ type, ms: performance.now() - start });
      };
      const started = performance.now();
      let released;
      let frameOpportunity;
      try {
        await raf();
        let end = point(0, 0);
        if (workflow === "choose-tile") {
          end = tilePoints[sequence % 2];
          expected.tile = end.tile;
          emit("mousedown", end, 1);
        } else {
          emit("mousedown", end, 1);
          if (workflow !== "pencil-click") {
            // Four samples per RAF: exercise both input burst coalescing and
            // eight intermediate presentations. Never discard a document edit.
            for (let batch = 0; batch < 8; batch++) {
              await raf();
              for (let j = 0; j < 4; j++) {
                const i = batch * 4 + j;
                if (workflow === "rectangle") end = point(3 + i % 2, 2 + Math.floor(i / 2) % 2);
                else if (workflow === "pan") end = { x: point(0, 0).x + (i + 1) * 2, y: point(0, 0).y + i + 1 };
                else end = point(i % 16 < 8 ? i % 8 + 1 : 15 - i % 16, Math.floor(i / 16) * 2);
                emit("mousemove", end, 1);
              }
            }
          }
        }
        phase = "release";
        emit("mouseup", end, 0);
        released = performance.now();
        phase = "deferred";
        await raf(); await raf();
        frameOpportunity = performance.now();
        // Includes the 100ms thumbnail batch and any trailing callbacks. No
        // benchmark-side flush or rendering no-op is used in measured windows.
        await settle();
        return {
          events, gestureMs: released - started,
          releaseToTwoRafsMs: frameOpportunity - released,
          observedWindowMs: performance.now() - started,
          rafGapsMs: frameTimes.slice(1).map((time, i) => time - frameTimes[i]),
          longTasks: longTasks.filter((task) => task.start >= started),
          counts: count ? counters : undefined,
        };
      } finally {
        tracking = false; cancelAnimationFrame(frameId); observer?.disconnect();
        if (count) stopCounting();
      }
    },
    validate() {
      if (view.mouseIsDown || UI.getMouseIsCaptured()) throw new Error("Mouse release not delivered");
      if (editor.tools.drawTools.shapes.getCurrentShape()) throw new Error("Shape not committed");
      if (layers.previewTimer != null) throw new Error("Thumbnail batch still pending");
      if (workflow === "choose-tile") {
        if (editor.currentTile.getCharacters()[0][0] !== expected.tile) throw new Error(`Tile click missed: expected ${expected.tile}, got ${JSON.stringify(editor.currentTile.getCharacters())}`);
      } else if (workflow === "pan") {
        if (!view.camera.position.x && !view.camera.position.y) throw new Error("Pan did not move");
      } else {
        const end = workflow === "rectangle" ? { x: startCell.x + 4, y: startCell.y + 3 }
          : workflow === "pencil-click" ? startCell : { x: startCell.x, y: startCell.y + 2 };
        const checkCell = (position) => {
          const cell = layer.getCell(position);
          if (cell.t !== expected.tile || cell.fc !== expected.color) throw new Error(`Cell not committed at ${JSON.stringify(position)}: ${JSON.stringify(cell)}`);
        };
        checkCell(end);
        if (workflow === "rectangle") {
          for (let y = 0; y <= 3; y++) for (let x = 0; x <= 4; x++) {
            if (x === 0 || x === 4 || y === 0 || y === 3) checkCell({ x: startCell.x + x, y: startCell.y + y });
          }
        } else if (workflow !== "pencil-click") {
          for (const y of [0, 2]) for (let x = 0; x <= 8; x++) checkCell({ x: startCell.x + x, y: startCell.y + y });
        }
      }
    },
    fingerprint() {
      const cells = [];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const cell = layer.getCell({ x, y }); cells.push(cell.t, cell.fc, cell.bc);
      }
      const thumbnail = layer.previewCanvas;
      // Readback ONLY after all timing/count runs, so it cannot select a different
      // Canvas backend for later timing samples.
      const thumbnailPixels = thumbnail.getContext("2d").getImageData(0, 0, thumbnail.width, thumbnail.height).data;
      const raster = document.createElement("canvas");
      raster.width = layer.getWidth(); raster.height = layer.getHeight();
      layer.draw({ canvas: raster, frame: layer.currentFrame, draw: "prevgrid", allCells: true,
        drawBackground: layers.isBackgroundVisible(), scale: 1,
        drawFromX: 0, drawFromY: 0, drawToX: raster.width, drawToY: raster.height });
      const fresh = document.createElement("canvas");
      fresh.width = thumbnail.width; fresh.height = thumbnail.height;
      const context = fresh.getContext("2d");
      context.drawImage(layer.backgroundCanvas, 0, 0);
      context.drawImage(raster, 0, 0, fresh.width, fresh.height);
      const freshPixels = context.getImageData(0, 0, fresh.width, fresh.height).data;
      let differentPixels = 0, maxChannelDelta = 0;
      const differences = [];
      for (let i = 0; i < freshPixels.length; i += 4) {
        const actual = Array.from(thumbnailPixels.slice(i, i + 4));
        const expected = Array.from(freshPixels.slice(i, i + 4));
        if (actual.some((value, channel) => value !== expected[channel])) {
          differentPixels++;
          maxChannelDelta = Math.max(maxChannelDelta, ...actual.map((value, channel) => Math.abs(value - expected[channel])));
          if (differences.length < 16) differences.push({ x: i / 4 % fresh.width, y: Math.floor(i / 4 / fresh.width), actual, expected });
        }
      }
      return {
        cells: hash(cells), thumbnail: hash(thumbnailPixels), freshThumbnail: hash(freshPixels),
        thumbnailMatchesFresh: differentPixels === 0,
        thumbnailDifference: { differentPixels, maxChannelDelta, examples: differences },
        camera: [view.camera.position.x, view.camera.position.y],
        brush: editor.currentTile.getCharacters(),
      };
    },
  };
  return window.workflowBenchmark.metadata;
}
