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

async function selectBrushFromEditorControls(page) {
  const readTileChoice = () => page.evaluate(() => {
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

      for (const location of locations) {
        const x = location.paletteX - display.scrollX + dimensions.width / 2;
        const y = location.paletteY - display.scrollY + dimensions.height / 2;
        if (x > 0 && y > 0 && x < canvas.clientWidth && y < canvas.clientHeight) {
          return { canvasId: canvas.id, tile, x, y };
        }
      }
    }
    return null;
  });
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

  return { color: color.color, tile: tile.tile };
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
