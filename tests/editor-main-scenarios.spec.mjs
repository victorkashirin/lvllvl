import { expect, test } from "@playwright/test";

async function openDefault2DProject(page) {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();
  await page.locator("#start2D").click();
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();
  await expect.poll(() => page.evaluate(() => Boolean(
    g_app.textModeEditor?.history
      && g_app.textModeEditor?.layers?.getSelectedLayerObject()
      && g_app.textModeEditor?.tileSetManager?.getCurrentTileSet(),
  ))).toBe(true);
  await expect.poll(() => page.evaluate(() =>
    Array.from(document.querySelectorAll(".ui-dialog-background"))
      .every((element) => getComputedStyle(element).display === "none"),
  )).toBe(true);
}

async function selectBrushFromEditorControls(
  page,
  { overlapTile = null, staticTile = false } = {},
) {
  const readTileChoice = () => page.evaluate(({ referenceTile, staticTileOnly }) => {
    const editor = g_app.textModeEditor;
    const palette = editor.getTilePalettePanelVisible("side")
      ? editor.sideTilePalette
      : editor.tools.drawTools.tilePalette;
    const display = palette?.tilePaletteDisplay;
    const tileSet = editor.tileSetManager.getCurrentTileSet();
    const canvas = display?.canvas;
    if (!display || !canvas || !display.tileLocations?.length) return null;

    const dimensions = display.getScaledTileDimensions();
    const current = editor.currentTile.getCharacters()[0][0];
    for (let tile = 0; tile < tileSet.getTileCount(); tile++) {
      const locations = display.tileLocations[tile];
      if (tile === current || !locations?.length) continue;
      if (staticTileOnly && tileSet.getAnimatedType(tile)) continue;
      let nonblank = false;
      for (let y = 0; y < tileSet.getTileHeight() && !nonblank; y++) {
        for (let x = 0; x < tileSet.getTileWidth(); x++) {
          if (tileSet.getPixel(tile, x, y)) {
            nonblank = true;
            break;
          }
        }
      }
      if (!nonblank) continue;
      if (referenceTile !== null) {
        let overlaps = false;
        for (let y = 0; y < tileSet.getTileHeight() && !overlaps; y++) {
          for (let x = 0; x < tileSet.getTileWidth(); x++) {
            if (tileSet.getPixel(tile, x, y) && tileSet.getPixel(referenceTile, x, y)) {
              overlaps = true;
              break;
            }
          }
        }
        if (!overlaps) continue;
      }

      for (const location of locations) {
        const x = location.paletteX - display.scrollX + dimensions.width / 2;
        const y = location.paletteY - display.scrollY + dimensions.height / 2;
        if (x > 0 && y > 0 && x < canvas.clientWidth && y < canvas.clientHeight) {
          return { canvasId: canvas.id, tile, x, y };
        }
      }
    }
    return null;
  }, { referenceTile: overlapTile, staticTileOnly: staticTile });
  await expect.poll(readTileChoice).not.toBeNull();
  const tile = await readTileChoice();
  await page.locator(`#${tile.canvasId}`).click({ position: { x: tile.x, y: tile.y } });
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.currentTile.getCharacters()[0][0],
  )).toBe(tile.tile);

  const readColorChoice = () => page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const display = editor.colorPalettePanel?.colorPaletteDisplay;
    const palette = editor.colorPaletteManager.getCurrentColorPalette();
    const canvas = display?.canvas;
    if (!display || !canvas) return null;

    const current = editor.currentTile.getColor();
    for (let color = 0; color < palette.getColorCount(); color++) {
      if (color === current) continue;
      const position = display.colorToGridXy(color);
      if (position.x === false || position.y === false) continue;
      const x = display.colorSpacing
        + position.x * (display.colorWidth + display.colorSpacing)
        + display.colorWidth / 2;
      const y = display.colorSpacing
        + position.y * (display.colorHeight + display.colorSpacing)
        + display.colorHeight / 2;
      if (x > 0 && y > 0 && x < canvas.clientWidth && y < canvas.clientHeight) {
        return { canvasId: canvas.id, color, x, y };
      }
    }
    return null;
  });
  await expect.poll(readColorChoice).not.toBeNull();
  const color = await readColorChoice();
  await page.locator(`#${color.canvasId}`).click({ position: { x: color.x, y: color.y } });
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.currentTile.getColor(),
  )).toBe(color.color);

  const overlap = overlapTile === null ? null : await page.evaluate(({ first, second }) => {
    const tileSet = g_app.textModeEditor.tileSetManager.getCurrentTileSet();
    for (let y = 0; y < tileSet.getTileHeight(); y++) {
      for (let x = 0; x < tileSet.getTileWidth(); x++) {
        if (tileSet.getPixel(first, x, y) && tileSet.getPixel(second, x, y)) {
          return { x, y };
        }
      }
    }
    return null;
  }, { first: overlapTile, second: tile.tile });

  return { color: color.color, overlap, tile: tile.tile };
}

async function prepareLayerCell(page) {
  return page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const view = editor.gridView2d;
    const layer = editor.layers.getSelectedLayerObject();
    const scale = view.displayScale;
    const cellWidth = layer.getCellWidth() * scale;
    const cellHeight = layer.getCellHeight() * scale;
    const artworkX = Math.floor(
      view.width / 2
        - editor.graphic.getGraphicWidth() * scale / 2
        - view.camera.position.x * scale,
    );
    const artworkY = Math.floor(
      view.height / 2
        - editor.graphic.getGraphicHeight() * scale / 2
        + view.camera.position.y * scale,
    );
    const firstVisibleX = Math.max(0, Math.ceil(-artworkX / cellWidth));
    const lastVisibleX = Math.min(
      layer.getGridWidth() - 1,
      Math.floor((view.width - artworkX) / cellWidth) - 1,
    );
    const firstVisibleY = Math.max(0, Math.ceil(-artworkY / cellHeight));
    const lastVisibleY = Math.min(
      layer.getGridHeight() - 1,
      Math.floor((view.height - artworkY) / cellHeight) - 1,
    );
    const cell = {
      x: Math.floor((firstVisibleX + lastVisibleX) / 2),
      y: Math.floor((firstVisibleY + lastVisibleY) / 2),
    };
    const awayCell = cell.x < lastVisibleX
      ? { x: cell.x + 1, y: cell.y }
      : cell.x > firstVisibleX
        ? { x: cell.x - 1, y: cell.y }
        : { x: cell.x, y: cell.y < lastVisibleY ? cell.y + 1 : cell.y - 1 };
    const canvasBounds = view.canvas.getBoundingClientRect();
    return {
      awayPoint: {
        x: canvasBounds.left + artworkX + (awayCell.x + 0.5) * cellWidth,
        y: canvasBounds.top + artworkY + (awayCell.y + 0.5) * cellHeight,
      },
      cell,
      canvasOrigin: {
        x: canvasBounds.left + artworkX + cell.x * cellWidth,
        y: canvasBounds.top + artworkY + cell.y * cellHeight,
      },
      point: {
        x: canvasBounds.left + artworkX + (cell.x + 0.5) * cellWidth,
        y: canvasBounds.top + artworkY + (cell.y + 0.5) * cellHeight,
      },
      scale,
    };
  });
}

function readLayerState(page, cell) {
  return page.evaluate(({ x, y }) => {
    const editor = g_app.textModeEditor;
    const layers = editor.layers;
    const copyCell = (layerId) => {
      const { bc, fc, fh, fv, rz, t } = layers.getLayerObject(layerId).getCell({ x, y });
      return { bc, fc, fh, fv, rz, t };
    };
    return {
      deleteControl: {
        ariaDisabled: document.querySelector("#layersDeleteLayer").getAttribute("aria-disabled"),
        disabled: document.querySelector("#layersDeleteLayer").disabled,
        menuEnabled: UI("layers-delete").enabled,
      },
      domOrder: Array.from(document.querySelectorAll("#layersHolder > .textModeLayer"))
        .map((element) => element.dataset.layerId),
      layers: layers.layers.map((layer) => ({
        cell: copyCell(layer.layerId),
        id: layer.layerId,
        label: layer.label,
        visible: layer.visible,
      })),
      selectedId: layers.getSelectedLayerId(),
    };
  }, cell);
}

function readEditorCanvasPixel(page, point) {
  return page.evaluate(({ x, y }) => {
    const canvas = g_app.textModeEditor.gridView2d.canvas;
    const bounds = canvas.getBoundingClientRect();
    const pixelX = Math.floor((x - bounds.left) * canvas.width / bounds.width);
    const pixelY = Math.floor((y - bounds.top) * canvas.height / bounds.height);
    return Array.from(canvas.getContext("2d").getImageData(pixelX, pixelY, 1, 1).data);
  }, point);
}

function readAnimationState(page, cell) {
  return page.evaluate(({ x, y }) => {
    const editor = g_app.textModeEditor;
    const graphic = editor.graphic;
    const layer = editor.layers.getSelectedLayerObject();
    const readControl = (selector) => {
      const control = document.querySelector(selector);
      return {
        ariaDisabled: control.getAttribute("aria-disabled"),
        disabled: Boolean(control.disabled),
      };
    };
    const copyCell = (frame) => {
      const args = { x, y };
      if (typeof frame !== "undefined") args.frame = frame;
      const { bc, fc, fh, fv, rz, t } = layer.getCell(args);
      return { bc, fc, fh, fv, rz, t };
    };

    return {
      activeCell: copyCell(),
      controls: {
        delete: readControl("#deleteFrame"),
        next: readControl("#nextFrame"),
        play: {
          ...readControl("#play"),
          ariaLabel: document.querySelector("#play").getAttribute("aria-label"),
          ariaPressed: document.querySelector("#play").getAttribute("aria-pressed"),
        },
        previous: readControl("#prevFrame"),
      },
      currentFrame: graphic.getCurrentFrame(),
      durationInput: document.querySelector("#frameDuration").value,
      frameCountInfo: document.querySelector("#frameCountInfo").textContent.trim(),
      frameInput: document.querySelector("#currentFrame").value,
      frames: Array.from({ length: graphic.getFrameCount() }, (_, frame) => ({
        cell: copyCell(frame),
        duration: graphic.getFrameDuration(frame),
      })),
      layerCurrentFrame: layer.getCurrentFrame(),
      playing: editor.frames.playFrames,
    };
  }, cell);
}

async function prepareHorizontalStroke(page, length = 3) {
  return page.evaluate((strokeLength) => {
    const editor = g_app.textModeEditor;
    const view = editor.gridView2d;
    const layer = editor.layers.getSelectedLayerObject();
    const scale = view.displayScale;
    const cellWidth = layer.getCellWidth() * scale;
    const cellHeight = layer.getCellHeight() * scale;
    const artworkX = Math.floor(
      view.width / 2
        - editor.graphic.getGraphicWidth() * scale / 2
        - view.camera.position.x * scale,
    );
    const artworkY = Math.floor(
      view.height / 2
        - editor.graphic.getGraphicHeight() * scale / 2
        + view.camera.position.y * scale,
    );
    const firstVisibleX = Math.max(0, Math.ceil(-artworkX / cellWidth));
    const lastVisibleX = Math.min(
      layer.getGridWidth() - 1,
      Math.floor((view.width - artworkX) / cellWidth) - 1,
    );
    const firstVisibleY = Math.max(0, Math.ceil(-artworkY / cellHeight));
    const lastVisibleY = Math.min(
      layer.getGridHeight() - 1,
      Math.floor((view.height - artworkY) / cellHeight) - 1,
    );
    const startX = Math.max(
      firstVisibleX,
      Math.floor((firstVisibleX + lastVisibleX - strokeLength + 1) / 2),
    );
    const y = Math.floor((firstVisibleY + lastVisibleY) / 2);
    const cells = Array.from({ length: strokeLength }, (_, offset) => ({
      x: startX + offset,
      y,
    }));
    if (cells.at(-1).x > lastVisibleX) throw new Error("No visible horizontal stroke fits");

    const canvasBounds = view.canvas.getBoundingClientRect();
    const pointForCell = ({ x, y: cellY }) => ({
      x: canvasBounds.left + artworkX + (x + 0.5) * cellWidth,
      y: canvasBounds.top + artworkY + (cellY + 0.5) * cellHeight,
    });
    return {
      cells,
      clip: {
        x: canvasBounds.left + artworkX + startX * cellWidth + 1,
        y: canvasBounds.top + artworkY + y * cellHeight + 1,
        width: strokeLength * cellWidth - 2,
        height: cellHeight - 2,
      },
      end: pointForCell(cells.at(-1)),
      start: pointForCell(cells[0]),
    };
  }, length);
}

function readStrokeState(page, cells) {
  return page.evaluate((positions) => {
    const editor = g_app.textModeEditor;
    const history = editor.history;
    const layer = editor.layers.getSelectedLayerObject();
    const copyCell = ({ x, y }) => {
      const { bc, fc, fh, fv, rz, t } = layer.getCell({ x, y });
      return { bc, fc, fh, fv, rz, t, x, y };
    };
    const entry = history.history[history.historyPosition - 1];
    return {
      cells: positions.map(copyCell),
      history: {
        currentEntryActions: history.changes.length,
        entry: entry ? {
          actionNames: entry.actions.map((action) => action.name),
          name: entry.name,
          setCells: entry.actions
            .filter((action) => action.name === "setCell")
            .map((action) => ({ x: action.params.x, y: action.params.y })),
        } : null,
        length: history.historyLength,
        position: history.historyPosition,
      },
      pointer: {
        buttons: editor.gridView2d.buttons,
        captured: UI.getMouseIsCaptured(),
        leftMouseUp: editor.gridView2d.leftMouseUp,
        mouseIsDown: editor.gridView2d.mouseIsDown,
      },
      revision: g_app.doc.modifiedRevision,
    };
  }, cells);
}

async function prepareSelectionFixture(page) {
  return page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const view = editor.gridView2d;
    const layer = editor.layers.getSelectedLayerObject();
    const tileSet = layer.getTileSet();
    const colorPalette = layer.getColorPalette();
    const scale = view.displayScale;
    const cellWidth = layer.getCellWidth() * scale;
    const cellHeight = layer.getCellHeight() * scale;
    const artworkX = Math.floor(
      view.width / 2
        - editor.graphic.getGraphicWidth() * scale / 2
        - view.camera.position.x * scale,
    );
    const artworkY = Math.floor(
      view.height / 2
        - editor.graphic.getGraphicHeight() * scale / 2
        + view.camera.position.y * scale,
    );
    const firstVisibleX = Math.max(0, Math.ceil(-artworkX / cellWidth));
    const lastVisibleX = Math.min(
      layer.getGridWidth() - 1,
      Math.floor((view.width - artworkX) / cellWidth) - 1,
    );
    const firstVisibleY = Math.max(0, Math.ceil(-artworkY / cellHeight));
    const lastVisibleY = Math.min(
      layer.getGridHeight() - 1,
      Math.floor((view.height - artworkY) / cellHeight) - 1,
    );
    const requiredWidth = 8;
    const requiredHeight = 4;
    if (lastVisibleX - firstVisibleX + 1 < requiredWidth
        || lastVisibleY - firstVisibleY + 1 < requiredHeight) {
      throw new Error("No visible region fits the selection fixture");
    }

    const source = {
      minX: Math.floor((firstVisibleX + lastVisibleX - requiredWidth + 1) / 2),
      minY: Math.floor((firstVisibleY + lastVisibleY - requiredHeight + 1) / 2) + 1,
    };
    source.maxX = source.minX + 2;
    source.maxY = source.minY + 2;
    const destination = {
      minX: source.minX + 4,
      minY: source.minY,
      maxX: source.minX + 6,
      maxY: source.minY + 2,
    };
    const moved = { ...destination, minX: destination.minX + 1, maxX: destination.maxX + 1 };
    const guards = [
      { x: source.minX, y: source.minY - 1 },
      { x: moved.maxX, y: moved.minY },
    ];

    const blank = editor.tileSetManager.blankCharacter;
    const tileCount = tileSet.getTileCount();
    const colorCount = colorPalette.getColorCount();
    const tiles = [];
    for (let tile = 0; tile < tileCount && tiles.length < 6; tile++) {
      if (tile !== blank) tiles.push(tile);
    }
    if (tiles.length < 6 || colorCount < 2) {
      throw new Error("The default project does not have enough fixture values");
    }
    const color = (index) => index % colorCount;
    const payloads = [
      { t: tiles[0], fc: color(1), bc: color(5), rz: 0, fh: 0, fv: 0 },
      { t: tiles[1], fc: color(2), bc: color(6), rz: 0.25, fh: 1, fv: 0 },
      { t: tiles[2], fc: color(3), bc: color(7), rz: 0.5, fh: 0, fv: 1 },
      { t: tiles[3], fc: color(4), bc: color(8), rz: 0.75, fh: 1, fv: 1 },
    ];
    const sourceCells = [
      { x: source.minX, y: source.minY },
      { x: source.minX + 1, y: source.minY },
      { x: source.minX, y: source.minY + 1 },
      { x: source.minX + 1, y: source.minY + 1 },
    ];
    const guardPayloads = [
      { t: tiles[4], fc: color(9), bc: color(10), rz: 0.25, fh: 1, fv: 1 },
      { t: tiles[5], fc: color(11), bc: color(12), rz: 0.5, fh: 0, fv: 1 },
    ];

    editor.history.setEnabled(false);
    layer.setHasTileFlip(true);
    layer.setHasTileRotate(true);
    sourceCells.forEach((position, index) => {
      layer.setCell({ ...position, ...payloads[index], update: false });
    });
    guards.forEach((position, index) => {
      layer.setCell({ ...position, ...guardPayloads[index], update: false });
    });
    editor.history.setEnabled(true);
    editor.history.clear();
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    const canvasBounds = view.canvas.getBoundingClientRect();
    const pointForCell = (x, y) => ({
      x: canvasBounds.left + artworkX + (x + 0.5) * cellWidth,
      y: canvasBounds.top + artworkY + (y + 0.5) * cellHeight,
    });
    const dragForBounds = (bounds) => ({
      start: pointForCell(bounds.minX, bounds.minY),
      end: pointForCell(bounds.maxX - 1, bounds.maxY - 1),
    });
    return {
      blank,
      destination,
      destinationDrag: dragForBounds(destination),
      guards,
      moved,
      noColor: editor.colorPaletteManager.noColor,
      payloads,
      source,
      sourceCells,
      sourceDrag: dragForBounds(source),
      artworkClip: {
        x: canvasBounds.left + artworkX + moved.minX * cellWidth + 2,
        y: canvasBounds.top + artworkY + moved.minY * cellHeight + 2,
        width: (moved.maxX - moved.minX) * cellWidth - 4,
        height: (moved.maxY - moved.minY) * cellHeight - 4,
      },
    };
  });
}

function readSelectionState(page, positions) {
  return page.evaluate((cells) => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const select = editor.tools.drawTools.select;
    return {
      cells: cells.map(({ x, y }) => {
        const { bc, fc, fh, fv, rz, t } = layer.getCell({ x, y });
        return { bc, fc, fh, fv, rz, t, x, y };
      }),
      history: {
        length: editor.history.historyLength,
        position: editor.history.historyPosition,
      },
      selection: {
        maxX: select.selection.maxX,
        maxY: select.selection.maxY,
        minX: select.selection.minX,
        minY: select.selection.minY,
        visible: select.selection.visible,
      },
    };
  }, positions);
}

async function dragMarquee(page, drag) {
  await page.mouse.move(drag.start.x, drag.start.y);
  await page.mouse.down();
  await page.mouse.move(drag.end.x, drag.end.y, { steps: 6 });
  await page.mouse.up();
  await page.mouse.move(0, 0);
}

test("create, draw, undo, and redo", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await openDefault2DProject(page);
  const brush = await selectBrushFromEditorControls(page);
  const stroke = await prepareHorizontalStroke(page);
  const before = await readStrokeState(page, stroke.cells);
  expect(before.cells).toEqual(stroke.cells.map((position) => ({
    ...before.cells[0],
    ...position,
  })));
  expect(before.cells.every((cell) => cell.t !== brush.tile || cell.fc !== brush.color))
    .toBe(true);
  expect(before.history.currentEntryActions).toBe(0);
  expect(before.history.position).toBe(before.history.length);
  const expectedCells = before.cells.map((cell) => ({
    ...cell,
    fc: brush.color,
    t: brush.tile,
  }));
  const beforePixels = await page.screenshot({ clip: stroke.clip });

  await page.mouse.move(stroke.start.x, stroke.start.y);
  await page.mouse.down();
  await page.mouse.move(stroke.end.x, stroke.end.y, { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(0, 0);

  await expect.poll(async () => (await readStrokeState(page, stroke.cells)).cells)
    .toEqual(expectedCells);
  const after = await readStrokeState(page, stroke.cells);
  const afterPixels = await page.screenshot({ clip: stroke.clip });
  expect(afterPixels.equals(beforePixels)).toBe(false);
  expect(after.revision).toBeGreaterThan(before.revision);
  expect(after.history).toEqual({
    currentEntryActions: 0,
    entry: {
      actionNames: ["cursorLocation", ...stroke.cells.map(() => "setCell")],
      name: "draw",
      setCells: stroke.cells,
    },
    length: before.history.length + 1,
    position: before.history.position + 1,
  });
  expect(after.pointer).toEqual({
    buttons: 0,
    captured: false,
    leftMouseUp: true,
    mouseIsDown: false,
  });

  const modifier = await page.evaluate(() => UI.os === "Mac OS" ? "Meta" : "Control");
  await page.keyboard.press(`${modifier}+z`);
  await expect.poll(async () => (await readStrokeState(page, stroke.cells)).cells)
    .toEqual(before.cells);
  const undone = await readStrokeState(page, stroke.cells);
  expect(undone.history.position).toBe(before.history.position);

  const editMenu = page.locator(".ui-menubar-item").filter({ hasText: /^Edit$/ });
  await editMenu.click();
  const redoItem = page.getByRole("menuitem", { name: /^Redo\b/ });
  await expect(redoItem).toBeVisible();
  await redoItem.click();
  await expect.poll(async () => (await readStrokeState(page, stroke.cells)).cells)
    .toEqual(expectedCells);
  const redone = await readStrokeState(page, stroke.cells);
  expect(redone.history.position).toBe(after.history.position);
});

test("edit a selection", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await openDefault2DProject(page);
  const fixture = await prepareSelectionFixture(page);
  const modifier = await page.evaluate(() => UI.os === "Mac OS" ? "Meta" : "Control");
  const sourcePositions = fixture.sourceCells;
  const destinationPositions = sourcePositions.map(({ x, y }) => ({
    x: x + fixture.destination.minX - fixture.source.minX,
    y,
  }));
  const movedPositions = destinationPositions.map(({ x, y }) => ({ x: x + 1, y }));
  const observedPositions = [
    ...sourcePositions,
    ...destinationPositions,
    ...movedPositions.filter(({ x }) => x === fixture.moved.maxX - 1),
    ...fixture.guards,
  ];
  const initial = await readSelectionState(page, observedPositions);

  await page.locator("#drawTool_select").click();
  await expect.poll(() => page.evaluate(() => g_app.textModeEditor.tools.drawTools.tool))
    .toBe("select");
  await dragMarquee(page, fixture.sourceDrag);
  await expect.poll(async () => (await readSelectionState(page, observedPositions)).selection)
    .toEqual({ ...fixture.source, visible: true });

  await page.keyboard.press(`${modifier}+c`);
  await dragMarquee(page, fixture.destinationDrag);
  await expect.poll(async () => (await readSelectionState(page, observedPositions)).selection)
    .toEqual({ ...fixture.destination, visible: true });
  await page.keyboard.press(`${modifier}+v`);

  const expectedSource = fixture.payloads.map((payload, index) => ({
    ...payload,
    ...sourcePositions[index],
  }));
  const expectedDestination = fixture.payloads.map((payload, index) => ({
    ...payload,
    ...destinationPositions[index],
  }));
  await expect.poll(async () => (await readSelectionState(page, destinationPositions)).cells)
    .toEqual(expectedDestination);
  const pasted = await readSelectionState(page, observedPositions);
  expect(pasted.cells.slice(0, sourcePositions.length)).toEqual(expectedSource);
  expect(pasted.selection).toEqual({ ...fixture.destination, visible: true });

  await page.keyboard.press(`${modifier}+ArrowRight`);
  const expectedMoved = fixture.payloads.map((payload, index) => ({
    ...payload,
    ...movedPositions[index],
  }));
  await expect.poll(async () => (await readSelectionState(page, movedPositions)).cells)
    .toEqual(expectedMoved);
  const moved = await readSelectionState(page, observedPositions);
  expect(moved.cells.slice(0, sourcePositions.length)).toEqual(expectedSource);
  expect(moved.cells
    .slice(sourcePositions.length, sourcePositions.length + destinationPositions.length)
    .filter((cell) => cell.x === fixture.destination.minX)
    .every((cell) => cell.t === fixture.blank && cell.bc === fixture.noColor)).toBe(true);
  expect(moved.selection).toEqual({ ...fixture.moved, visible: true });
  expect(moved.cells.slice(-fixture.guards.length)).toEqual(
    initial.cells.slice(-fixture.guards.length),
  );
  const cellsOutsideMovedSelection = (state) => state.cells.filter(({ x, y }) =>
    x < fixture.moved.minX || x >= fixture.moved.maxX
      || y < fixture.moved.minY || y >= fixture.moved.maxY);
  const beforeClearPixels = await page.screenshot({ clip: fixture.artworkClip });

  await page.keyboard.press("Delete");
  await expect.poll(async () => (await readSelectionState(page, movedPositions)).cells)
    .toEqual(expect.arrayContaining(movedPositions.map((position) => expect.objectContaining({
      ...position,
      bc: fixture.noColor,
      t: fixture.blank,
    }))));
  const cleared = await readSelectionState(page, observedPositions);
  const afterClearPixels = await page.screenshot({ clip: fixture.artworkClip });
  expect(afterClearPixels.equals(beforeClearPixels)).toBe(false);
  expect(cleared.selection).toEqual({ ...fixture.moved, visible: true });
  expect(cellsOutsideMovedSelection(cleared)).toEqual(cellsOutsideMovedSelection(moved));

  await page.keyboard.press(`${modifier}+z`);
  await expect.poll(async () => {
    const state = await readSelectionState(page, observedPositions);
    return { cells: state.cells, selection: state.selection };
  }).toEqual({ cells: moved.cells, selection: moved.selection });
  await page.keyboard.press(`${modifier}+z`);
  await expect.poll(async () => {
    const state = await readSelectionState(page, observedPositions);
    return { cells: state.cells, selection: state.selection };
  }).toEqual({ cells: pasted.cells, selection: pasted.selection });

  await page.keyboard.press(`${modifier}+Shift+z`);
  await expect.poll(async () => {
    const state = await readSelectionState(page, observedPositions);
    return { cells: state.cells, selection: state.selection };
  }).toEqual({ cells: moved.cells, selection: moved.selection });
  await page.keyboard.press(`${modifier}+Shift+z`);
  await expect.poll(async () => {
    const state = await readSelectionState(page, observedPositions);
    return { cells: state.cells, selection: state.selection };
  }).toEqual({ cells: cleared.cells, selection: cleared.selection });
});

test("manage layers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await openDefault2DProject(page);
  const firstBrush = await selectBrushFromEditorControls(page);
  const target = await prepareLayerCell(page);
  const initial = await readLayerState(page, target.cell);
  expect(initial.layers).toHaveLength(1);
  const firstLayer = initial.layers[0];

  await page.mouse.click(target.point.x, target.point.y);
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await readLayerState(page, target.cell)).layers[0].cell)
    .toEqual(expect.objectContaining({ fc: firstBrush.color, t: firstBrush.tile }));
  const firstArtwork = (await readLayerState(page, target.cell)).layers[0].cell;

  await page.locator("#layersNewLayer").click();
  const layerDialog = page.getByRole("dialog", { name: "Layer Properties" });
  await expect(layerDialog).toBeVisible();
  await page.locator("#layersRefImageName").fill("Overlay Ink");
  await layerDialog.getByText("OK", { exact: true }).click();
  await expect(layerDialog).toBeHidden();
  await expect.poll(async () => (await readLayerState(page, target.cell)).layers.length).toBe(2);

  const added = await readLayerState(page, target.cell);
  const secondLayer = added.layers.find((layer) => layer.id !== firstLayer.id);
  expect(secondLayer).toBeTruthy();
  expect(added.layers.map(({ id, label }) => ({ id, label }))).toEqual([
    { id: firstLayer.id, label: firstLayer.label },
    { id: secondLayer.id, label: "Overlay Ink" },
  ]);
  expect(added.domOrder).toEqual([secondLayer.id, firstLayer.id]);
  expect(added.selectedId).toBe(secondLayer.id);

  await page.locator(`#textModeLayerDetails${firstLayer.id}`).click();
  await expect.poll(async () => (await readLayerState(page, target.cell)).selectedId)
    .toBe(firstLayer.id);
  await page.locator(`#textModeLayerDetails${secondLayer.id}`).click();
  await expect.poll(async () => (await readLayerState(page, target.cell)).selectedId)
    .toBe(secondLayer.id);

  const secondBrush = await selectBrushFromEditorControls(page, { overlapTile: firstBrush.tile });
  expect(secondBrush.overlap).not.toBeNull();
  const overlapClip = {
    x: target.canvasOrigin.x + (secondBrush.overlap.x + 0.5) * target.scale,
    y: target.canvasOrigin.y + (secondBrush.overlap.y + 0.5) * target.scale,
    width: 1,
    height: 1,
  };
  const firstLayerPixel = await page.screenshot({ clip: overlapClip });
  const firstLayerRgba = await readEditorCanvasPixel(page, overlapClip);

  await page.mouse.click(target.point.x, target.point.y);
  await page.mouse.move(0, 0);
  await expect.poll(async () => {
    const state = await readLayerState(page, target.cell);
    return state.layers.find((layer) => layer.id === secondLayer.id).cell;
  }).toEqual(expect.objectContaining({ fc: secondBrush.color, t: secondBrush.tile }));
  const stacked = await readLayerState(page, target.cell);
  const secondArtwork = stacked.layers.find((layer) => layer.id === secondLayer.id).cell;
  expect(secondArtwork).not.toEqual(firstArtwork);
  const secondLayerPixel = await page.screenshot({ clip: overlapClip });
  expect(secondLayerPixel.equals(firstLayerPixel)).toBe(false);
  const secondLayerRgba = await readEditorCanvasPixel(page, overlapClip);
  expect(secondLayerRgba).not.toEqual(firstLayerRgba);

  await page.locator(`#textModeLayerVisible${secondLayer.id}`).click();
  await expect.poll(async () => {
    const state = await readLayerState(page, target.cell);
    return state.layers.find((layer) => layer.id === secondLayer.id).visible;
  }).toBe(false);
  const hiddenPixel = await page.screenshot({ clip: overlapClip });
  expect(hiddenPixel.equals(firstLayerPixel)).toBe(true);

  await page.locator(`#textModeLayerVisible${secondLayer.id}`).click();
  await expect.poll(async () => {
    const state = await readLayerState(page, target.cell);
    return state.layers.find((layer) => layer.id === secondLayer.id).visible;
  }).toBe(true);
  const reshownPixel = await page.screenshot({ clip: overlapClip });
  expect(reshownPixel.equals(secondLayerPixel)).toBe(true);

  const layersMenu = page.locator(".ui-menubar-item").filter({ hasText: /^Layers$/ });
  await layersMenu.click();
  await page.getByRole("menuitem", { name: /^Send Backward\b/ }).click();
  await expect.poll(async () => {
    const state = await readLayerState(page, target.cell);
    const domLayers = await page.locator("#layersHolder > .textModeLayer").evaluateAll(
      (elements) => elements.map((element) => ({
        id: element.dataset.layerId,
        label: element.querySelector(".layerLabelName")?.textContent,
      })),
    );
    return {
      domLayers,
      modelLayers: state.layers.map(({ id, label }) => ({ id, label })),
      selectedId: state.selectedId,
    };
  }).toEqual({
    domLayers: [
      { id: firstLayer.id, label: firstLayer.label },
      { id: secondLayer.id, label: "Overlay Ink" },
    ],
    modelLayers: [
      { id: secondLayer.id, label: "Overlay Ink" },
      { id: firstLayer.id, label: firstLayer.label },
    ],
    selectedId: secondLayer.id,
  });
  await expect.poll(() => readEditorCanvasPixel(page, overlapClip)).toEqual(firstLayerRgba);

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#layersDeleteLayer").click();
  await expect.poll(async () => (await readLayerState(page, target.cell)).layers.length).toBe(1);
  const final = await readLayerState(page, target.cell);
  expect(final).toEqual({
    deleteControl: {
      ariaDisabled: "true",
      disabled: true,
      menuEnabled: false,
    },
    domOrder: [firstLayer.id],
    layers: [{
      cell: firstArtwork,
      id: firstLayer.id,
      label: firstLayer.label,
      visible: true,
    }],
    selectedId: firstLayer.id,
  });
});

test("edit an animation across frames", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await openDefault2DProject(page);
  const firstBrush = await selectBrushFromEditorControls(page, { staticTile: true });
  const target = await prepareLayerCell(page);
  const initial = await readAnimationState(page, target.cell);
  expect(initial.frames).toHaveLength(1);
  const firstDuration = initial.frames[0].duration;

  await page.mouse.click(target.point.x, target.point.y);
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await readAnimationState(page, target.cell)).frames[0].cell)
    .toEqual(expect.objectContaining({ fc: firstBrush.color, t: firstBrush.tile }));
  const firstFrame = (await readAnimationState(page, target.cell)).frames[0];

  await page.locator("#duplicateFrame").click();
  await expect.poll(async () => {
    const state = await readAnimationState(page, target.cell);
    return { currentFrame: state.currentFrame, frameCount: state.frames.length };
  }).toEqual({ currentFrame: 1, frameCount: 2 });
  const duplicated = await readAnimationState(page, target.cell);
  expect(duplicated.frames).toEqual([firstFrame, firstFrame]);
  expect(duplicated.frameInput).toBe("2");
  expect(duplicated.durationInput).toBe(String(firstDuration));
  expect(duplicated.controls).toEqual({
    delete: { ariaDisabled: "false", disabled: false },
    next: { ariaDisabled: "true", disabled: true },
    play: {
      ariaDisabled: "false",
      ariaLabel: "Play animation",
      ariaPressed: "false",
      disabled: false,
    },
    previous: { ariaDisabled: "false", disabled: false },
  });

  const secondBrush = await selectBrushFromEditorControls(page, {
    overlapTile: firstBrush.tile,
    staticTile: true,
  });
  expect(secondBrush.color).not.toBe(firstBrush.color);
  expect(secondBrush.overlap).not.toBeNull();
  const markerPoint = {
    x: target.canvasOrigin.x + (secondBrush.overlap.x + 0.5) * target.scale,
    y: target.canvasOrigin.y + (secondBrush.overlap.y + 0.5) * target.scale,
  };
  await page.mouse.click(target.point.x, target.point.y);
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await readAnimationState(page, target.cell)).frames[1].cell)
    .toEqual(expect.objectContaining({ fc: secondBrush.color, t: secondBrush.tile }));

  const secondDuration = firstDuration === 3 ? 4 : 3;
  await page.locator("#frameDuration").fill(String(secondDuration));
  await page.locator("#frameDuration").press("Tab");
  await expect.poll(async () => (await readAnimationState(page, target.cell)).frames[1].duration)
    .toBe(secondDuration);
  const edited = await readAnimationState(page, target.cell);
  const secondFrame = edited.frames[1];
  expect(edited.frames[0]).toEqual(firstFrame);
  expect(secondFrame.cell).not.toEqual(firstFrame.cell);
  expect(secondFrame.duration).toBe(secondDuration);

  await page.locator("#prevFrame").click();
  await expect.poll(async () => {
    const state = await readAnimationState(page, target.cell);
    return {
      activeCell: state.activeCell,
      currentFrame: state.currentFrame,
      durationInput: state.durationInput,
      frameInput: state.frameInput,
      layerCurrentFrame: state.layerCurrentFrame,
    };
  }).toEqual({
    activeCell: firstFrame.cell,
    currentFrame: 0,
    durationInput: String(firstDuration),
    frameInput: "1",
    layerCurrentFrame: 0,
  });
  expect((await readAnimationState(page, target.cell)).frames).toEqual([firstFrame, secondFrame]);
  await page.mouse.move(target.awayPoint.x, target.awayPoint.y);
  const firstMarkerRgba = await readEditorCanvasPixel(page, markerPoint);
  expect(firstMarkerRgba[3]).toBe(255);

  await page.locator("#nextFrame").click();
  await expect.poll(async () => {
    const state = await readAnimationState(page, target.cell);
    return {
      activeCell: state.activeCell,
      currentFrame: state.currentFrame,
      durationInput: state.durationInput,
      frameInput: state.frameInput,
      layerCurrentFrame: state.layerCurrentFrame,
    };
  }).toEqual({
    activeCell: secondFrame.cell,
    currentFrame: 1,
    durationInput: String(secondDuration),
    frameInput: "2",
    layerCurrentFrame: 1,
  });
  await page.mouse.move(target.awayPoint.x, target.awayPoint.y);
  await expect.poll(() => readEditorCanvasPixel(page, markerPoint)).not.toEqual(firstMarkerRgba);
  expect((await readEditorCanvasPixel(page, markerPoint))[3]).toBe(255);

  await page.locator("#play").click();
  await expect(page.locator("#play")).toHaveAttribute("aria-label", "Pause animation");
  await expect(page.locator("#play")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await readAnimationState(page, target.cell)).currentFrame)
    .toBe(0);
  await page.locator("#play").click();
  await expect.poll(async () => {
    const state = await readAnimationState(page, target.cell);
    return {
      ariaLabel: state.controls.play.ariaLabel,
      ariaPressed: state.controls.play.ariaPressed,
      currentFrameInRange: state.currentFrame >= 0 && state.currentFrame < state.frames.length,
      playing: state.playing,
    };
  }).toEqual({
    ariaLabel: "Play animation",
    ariaPressed: "false",
    currentFrameInRange: true,
    playing: false,
  });

  if((await readAnimationState(page, target.cell)).currentFrame === 0) {
    await page.locator("#nextFrame").click();
  }
  await expect.poll(async () => (await readAnimationState(page, target.cell)).currentFrame).toBe(1);
  await page.locator("#deleteFrame").click();
  await expect.poll(async () => (await readAnimationState(page, target.cell)).frames.length).toBe(1);
  const final = await readAnimationState(page, target.cell);
  expect(final).toEqual({
    activeCell: firstFrame.cell,
    controls: {
      delete: { ariaDisabled: "true", disabled: true },
      next: { ariaDisabled: "true", disabled: true },
      play: {
        ariaDisabled: "true",
        ariaLabel: "Play animation",
        ariaPressed: "false",
        disabled: true,
      },
      previous: { ariaDisabled: "true", disabled: true },
    },
    currentFrame: 0,
    durationInput: String(firstDuration),
    frameCountInfo: "/ 1",
    frameInput: "1",
    frames: [firstFrame],
    layerCurrentFrame: 0,
    playing: false,
  });
});
