import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

function createStripedBmp() {
  const width = 8;
  const height = 5;
  const rowSize = width * 3;
  const pixelOffset = 54;
  const buffer = Buffer.alloc(pixelOffset + rowSize * height);
  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(pixelOffset, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(rowSize * height, 34);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = x % 2 === 0 ? 0 : 255;
      const offset = pixelOffset + y * rowSize + x * 3;
      buffer[offset] = value;
      buffer[offset + 1] = value;
      buffer[offset + 2] = value;
    }
  }
  return buffer;
}

async function decodePngPixels(page, bytes, points) {
  return page.evaluate(async ({ base64, samplePoints }) => {
    const encoded = atob(base64);
    const data = Uint8Array.from(encoded, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([data], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const result = {
      height: bitmap.height,
      pixels: samplePoints.map(({ x, y }) =>
        Array.from(context.getImageData(x, y, 1, 1).data)),
      width: bitmap.width,
    };
    bitmap.close();
    return result;
  }, { base64: bytes.toString("base64"), samplePoints: points });
}

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
      awayCell,
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

function readSavedProjectState(page, fixture) {
  return page.evaluate(({ glyph, palette, positions }) => {
    const editor = g_app.textModeEditor;
    const graphic = editor.graphic;
    const layers = editor.layers;
    const tileSet = editor.tileSetManager.getCurrentTileSet();
    const colorPalette = editor.colorPaletteManager.getCurrentColorPalette();
    const copyCell = (cell) => {
      const { bc, fc, fh, fv, rz, t } = cell;
      return { bc, fc, fh, fv, rz, t };
    };
    const files = g_app.doc.getFiles();
    const screenFile = files.find((file) => file.id === graphic.doc.id);
    const tileSetFile = files.find((file) => file.id === tileSet.getId());
    const paletteFile = files.find((file) => file.id === colorPalette.getId());
    if (!screenFile || !tileSetFile || !paletteFile) {
      throw new Error("Representative project files were not serialized");
    }

    return {
      dirtyIds: Object.keys(g_app.doc.modified).sort(),
      dirtyRecords: Object.entries(g_app.doc.modified)
        .map(([id, record]) => ({ id, path: record.path }))
        .sort((left, right) => left.path.localeCompare(right.path)),
      fileIds: {
        palette: paletteFile.id,
        screen: screenFile.id,
        tileSet: tileSetFile.id,
      },
      filePaths: files.map((file) => file.path).sort(),
      runtime: {
        frameDurations: Array.from(
          { length: graphic.getFrameCount() },
          (_, frame) => graphic.getFrameDuration(frame),
        ),
        glyphPixel: tileSet.getPixel(glyph.tile, glyph.x, glyph.y),
        layers: layers.layers.map((layer) => {
          const layerObject = layers.getLayerObject(layer.layerId);
          return {
            cells: Array.from({ length: graphic.getFrameCount() }, (_, frame) =>
              positions.map((position) => copyCell(layerObject.getCell({ ...position, frame })))),
            id: layer.layerId,
            label: layer.label,
            visible: layer.visible,
          };
        }),
        paletteColor: colorPalette.getHex(palette.index),
      },
      serialized: {
        frameDurations: screenFile.content.frames.map((frame) => frame.duration),
        glyphPixel: tileSetFile.content.tiles[glyph.tile]
          .data[0][glyph.x + glyph.y * tileSetFile.content.width],
        layers: screenFile.content.layers.map((layer) => ({
          cells: layer.frames.map((frame) =>
            positions.map(({ x, y }) => copyCell(frame.data[y][x]))),
          id: layer.layerId,
          label: layer.label,
          visible: layer.visible,
        })),
        paletteColor: paletteFile.content.data[palette.index] & 0xffffff,
      },
      session: {
        activeRevision: g_app.doc.documentSession.activeRevision,
        currentFrame: graphic.getCurrentFrame(),
        currentProjectId: g_app.doc.currentProjectId,
        selectedLayerId: layers.getSelectedLayerId(),
      },
    };
  }, fixture);
}

function readStoredProjects(page) {
  return page.evaluate(() => new Promise((resolve) => {
    g_app.fileManager.getProjectList(
      { thumbnails: false, type: "project" },
      (result) => resolve(result.projects.map((project) => ({
        id: project.id,
        name: project.name,
      }))),
    );
  }));
}

function readDocumentSaveState(page) {
  return page.evaluate(() => ({
    activeRevision: g_app.doc.documentSession.activeRevision,
    currentProjectId: g_app.doc.currentProjectId,
    isNew: g_app.fileManager.getIsNew(),
    saveInFlight: g_app.doc.documentSession.saveInFlight,
  }));
}

async function chooseMenuItem(page, menuName, itemName) {
  await page.locator(".ui-menubar-item").filter({ hasText: new RegExp(`^${menuName}$`) }).click();
  const item = page.getByRole("menuitem", { name: itemName }).first();
  await expect(item).toBeVisible();
  await item.click();
}

function readCellPixelPoint(page, { cell, pixel }) {
  return page.evaluate(({ cell: position, pixel: tilePixel }) => {
    const editor = g_app.textModeEditor;
    const view = editor.gridView2d;
    const layer = editor.layers.getSelectedLayerObject();
    const scale = view.displayScale;
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
    const bounds = view.canvas.getBoundingClientRect();
    return {
      x: bounds.left + artworkX
        + position.x * layer.getCellWidth() * scale
        + (tilePixel.x + 0.5) * scale,
      y: bounds.top + artworkY
        + position.y * layer.getCellHeight() * scale
        + (tilePixel.y + 0.5) * scale,
    };
  }, { cell, pixel });
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

test("save and reopen a real project", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await openDefault2DProject(page);
  const projectName = "Scenario 5 Persistence";
  const firstBrush = await selectBrushFromEditorControls(page, { staticTile: true });
  const target = await prepareLayerCell(page);
  const initialLayerId = await page.evaluate(() =>
    g_app.textModeEditor.layers.getSelectedLayerId());

  await page.locator(`#textModeLayerDetails${initialLayerId}`).dblclick();
  const layerDialog = page.getByRole("dialog", { name: "Layer Properties" });
  await expect(layerDialog).toBeVisible();
  await page.locator("#layersRefImageName").fill("Base Artwork");
  await layerDialog.getByText("OK", { exact: true }).click();
  await expect(layerDialog).toBeHidden();

  await page.mouse.click(target.point.x, target.point.y);
  await page.mouse.move(0, 0);
  await expect.poll(() => page.evaluate(({ layerId, position }) => {
    const cell = g_app.textModeEditor.layers.getLayerObject(layerId).getCell(position);
    return { fc: cell.fc, t: cell.t };
  }, { layerId: initialLayerId, position: target.cell })).toEqual({
    fc: firstBrush.color,
    t: firstBrush.tile,
  });

  const firstDuration = await page.evaluate(() =>
    g_app.textModeEditor.graphic.getFrameDuration(0));
  await page.locator("#duplicateFrame").click();
  await expect.poll(() => page.evaluate(() => ({
    currentFrame: g_app.textModeEditor.graphic.getCurrentFrame(),
    frameCount: g_app.textModeEditor.graphic.getFrameCount(),
  }))).toEqual({ currentFrame: 1, frameCount: 2 });

  const secondBrush = await selectBrushFromEditorControls(page, {
    overlapTile: firstBrush.tile,
    staticTile: true,
  });
  await page.mouse.click(target.point.x, target.point.y);
  await page.mouse.move(0, 0);
  const secondDuration = firstDuration === 3 ? 4 : 3;
  await page.locator("#frameDuration").fill(String(secondDuration));
  await page.locator("#frameDuration").press("Tab");
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.graphic.getFrameDuration(1))).toBe(secondDuration);

  await page.locator("#layersNewLayer").click();
  await expect(layerDialog).toBeVisible();
  await page.locator("#layersRefImageName").fill("Hidden Overlay");
  await layerDialog.getByText("OK", { exact: true }).click();
  await expect(layerDialog).toBeHidden();
  const overlayLayerId = await page.evaluate(() =>
    g_app.textModeEditor.layers.getSelectedLayerId());

  await page.mouse.click(target.awayPoint.x, target.awayPoint.y);
  await page.mouse.move(0, 0);
  await expect.poll(() => page.evaluate(({ layerId, position }) => {
    const cell = g_app.textModeEditor.layers.getLayerObject(layerId).getCell(position);
    return { fc: cell.fc, t: cell.t };
  }, { layerId: overlayLayerId, position: target.awayCell })).toEqual({
    fc: secondBrush.color,
    t: secondBrush.tile,
  });

  await chooseMenuItem(page, "Layers", /^Send Backward\b/);
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.layers.layers.map((layer) => layer.layerId))).toEqual([
    overlayLayerId,
    initialLayerId,
  ]);
  await page.locator(`#textModeLayerVisible${overlayLayerId}`).click();
  await expect.poll(() => page.evaluate((layerId) => {
    const layers = g_app.textModeEditor.layers;
    return layers.layers[layers.getLayerIndex(layerId)].visible;
  }, overlayLayerId)).toBe(false);

  await chooseMenuItem(page, "Tiles", /^Show Tile Editor\b/);
  const tileEditorCanvas = page.locator("#tileEditorCanvas");
  await expect(tileEditorCanvas).toBeVisible();
  const glyph = await page.evaluate((expectedTile) => {
    const grid = g_app.textModeEditor.tileEditor.tileEditorGrid;
    const tile = grid.characters[0][0];
    if (tile !== expectedTile) throw new Error("Tile editor did not open the selected tile");
    for (let y = 0; y < grid.charHeight; y++) {
      for (let x = 0; x < grid.charWidth; x++) {
        if (grid.getPixel(x, y) === 0) {
          return {
            tile,
            x,
            y,
            clickX: (x + 0.5) * grid.pixelWidth,
            clickY: (y + 0.5) * grid.pixelHeight,
          };
        }
      }
    }
    throw new Error("Selected glyph has no blank pixel to modify");
  }, secondBrush.tile);
  await tileEditorCanvas.click({ position: { x: glyph.clickX, y: glyph.clickY } });
  await expect.poll(() => page.evaluate(({ tile, x, y }) =>
    g_app.textModeEditor.tileSetManager.getCurrentTileSet().getPixel(tile, x, y), glyph))
    .toBe(1);

  await chooseMenuItem(page, "Colors", /^Show Color Editor\b/);
  const colorInput = page.locator("#editColorHex");
  await expect(colorInput).toBeVisible();
  const originalPaletteColor = await page.evaluate((index) =>
    g_app.textModeEditor.colorPaletteManager.getCurrentColorPalette().getHex(index),
  secondBrush.color);
  const paletteColor = originalPaletteColor === 0x2a6fca ? 0xd45c31 : 0x2a6fca;
  await colorInput.fill(paletteColor.toString(16).padStart(6, "0"));
  await colorInput.press("Tab");
  await expect.poll(() => page.evaluate((index) =>
    g_app.textModeEditor.colorPaletteManager.getCurrentColorPalette().getHex(index),
  secondBrush.color)).toBe(paletteColor);

  const fixture = {
    glyph: { tile: glyph.tile, x: glyph.x, y: glyph.y },
    palette: { index: secondBrush.color },
    positions: [target.cell, target.awayCell],
  };
  const expected = await readSavedProjectState(page, fixture);
  expect(expected.runtime).toEqual(expected.serialized);
  expect(expected.dirtyIds.length).toBeGreaterThan(0);
  expect(expected.runtime.frameDurations).toEqual([firstDuration, secondDuration]);
  expect(expected.runtime.layers.map(({ id, label, visible }) => ({ id, label, visible })))
    .toEqual([
      { id: overlayLayerId, label: "Hidden Overlay", visible: false },
      { id: initialLayerId, label: "Base Artwork", visible: true },
    ]);
  expect(expected.runtime.layers[1].cells[0][0])
    .toEqual(expect.objectContaining({ fc: firstBrush.color, t: firstBrush.tile }));
  expect(expected.runtime.layers[1].cells[1][0])
    .toEqual(expect.objectContaining({ fc: secondBrush.color, t: secondBrush.tile }));
  expect(expected.runtime.layers[0].cells[1][1])
    .toEqual(expect.objectContaining({ fc: secondBrush.color, t: secondBrush.tile }));
  expect(expected.session).toEqual(expect.objectContaining({
    currentFrame: 1,
    selectedLayerId: overlayLayerId,
  }));

  const renderedPoint = await readCellPixelPoint(page, {
    cell: target.cell,
    pixel: glyph,
  });
  const expectedRgba = [
    (paletteColor >> 16) & 0xff,
    (paletteColor >> 8) & 0xff,
    paletteColor & 0xff,
    255,
  ];
  await expect.poll(() => readEditorCanvasPixel(page, renderedPoint)).toEqual(expectedRgba);

  await chooseMenuItem(page, "Project", /^Save As\b/);
  const saveDialog = page.getByRole("dialog", { name: "Save As" });
  await expect(saveDialog).toBeVisible();
  await page.locator("#saveProjectAs").fill(projectName);
  await page.getByText("Save", { exact: true }).last().click();
  await expect(saveDialog).toBeHidden();
  await expect.poll(() => readDocumentSaveState(page)).toEqual({
    activeRevision: expect.any(String),
    currentProjectId: expect.any(String),
    isNew: false,
    saveInFlight: false,
  });
  const saved = await readDocumentSaveState(page);
  const savedProjects = await readStoredProjects(page);
  expect(savedProjects).toEqual([{ id: saved.currentProjectId, name: projectName }]);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();
  const savedProjectTile = page.locator(".start-tile-label.project-open", {
    hasText: projectName,
  });
  await expect(savedProjectTile).toBeVisible();
  await savedProjectTile.click();
  await expect(page.locator("#startPage")).toBeHidden();
  await expect.poll(() => page.evaluate(() => ({
    frameCount: g_app.textModeEditor?.graphic?.getFrameCount(),
    layerCount: g_app.textModeEditor?.layers?.getLayerCount(),
    opening: g_app.openingProject,
  }))).toEqual({ frameCount: 2, layerCount: 2, opening: false });

  const reopened = await readSavedProjectState(page, fixture);
  expect(reopened.dirtyRecords).toEqual([]);
  expect(reopened.fileIds).toEqual(expected.fileIds);
  expect(reopened.filePaths).toEqual(expected.filePaths);
  expect(reopened.runtime).toEqual(expected.runtime);
  expect(reopened.serialized).toEqual(expected.serialized);
  expect(reopened.session).toEqual(expect.objectContaining({
    activeRevision: saved.activeRevision,
    currentProjectId: saved.currentProjectId,
  }));
  await expect(page.locator(`#textModeLayerVisible${overlayLayerId} .layerHiddenIcon`))
    .toBeVisible();
  await expect(page.locator(`#textModeLayerDetails${initialLayerId} .layerLabelName`))
    .toHaveText("Base Artwork");
  await expect(page.locator(`#textModeLayerDetails${overlayLayerId} .layerLabelName`))
    .toHaveText("Hidden Overlay");

  if (reopened.session.currentFrame === 0) {
    await page.locator("#nextFrame").click();
  }
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.graphic.getCurrentFrame())).toBe(1);
  const reopenedRenderedPoint = await readCellPixelPoint(page, {
    cell: target.cell,
    pixel: glyph,
  });
  await expect.poll(() => readEditorCanvasPixel(page, reopenedRenderedPoint))
    .toEqual(expectedRgba);

  await page.locator(`#textModeLayerDetails${initialLayerId}`).click();
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.layers.getSelectedLayerId())).toBe(initialLayerId);
  const postReloadTarget = await prepareLayerCell(page);
  const postReloadBrush = await selectBrushFromEditorControls(page, { staticTile: true });
  await page.mouse.click(postReloadTarget.awayPoint.x, postReloadTarget.awayPoint.y);
  await page.mouse.move(0, 0);
  await expect.poll(() => page.evaluate(({ layerId, position }) => {
    const cell = g_app.textModeEditor.layers.getLayerObject(layerId).getCell(position);
    return { fc: cell.fc, t: cell.t };
  }, { layerId: initialLayerId, position: postReloadTarget.awayCell })).toEqual({
    fc: postReloadBrush.color,
    t: postReloadBrush.tile,
  });
  await expect.poll(async () => (await readSavedProjectState(page, fixture)).dirtyIds.length)
    .toBeGreaterThan(0);

  await chooseMenuItem(page, "Project", /^Save\b(?! As)/);
  await expect.poll(async () => {
    const state = await readSavedProjectState(page, fixture);
    return {
      dirtyIds: state.dirtyIds,
      projectId: state.session.currentProjectId,
      revisionChanged: state.session.activeRevision !== saved.activeRevision,
    };
  }).toEqual({
    dirtyIds: [],
    projectId: saved.currentProjectId,
    revisionChanged: true,
  });
  expect(await readStoredProjects(page)).toEqual([
    { id: saved.currentProjectId, name: projectName },
  ]);
});

test("import and export artwork", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  await openDefault2DProject(page);
  await chooseMenuItem(page, "Import", /^Image \/ Video\b/);

  const importDialog = page.getByRole("dialog", { name: "Import Image / Video" });
  const importButton = importDialog.getByRole("button", { name: "Import", exact: true });
  await expect(importDialog).toBeVisible();
  await expect(importButton).toHaveClass(/ui-button-disabled/);

  await page.locator("#importImageMethod").selectOption("method1");
  await page.locator("#importImageBackgroundColorType").selectOption("perCell");
  await page.locator("#importImageUseColors").selectOption("create");
  await page.locator("#importImageCreatePaletteColorCount").selectOption("2");
  await page.locator("#importImageColorReduction").selectOption("closest");
  await page.locator("#importImageUseChars").selectOption("all");
  await expect(page.locator("#importImageSmoothing")).not.toBeChecked();

  await page.locator("#importImageSourceFile").setInputFiles({
    buffer: createStripedBmp(),
    mimeType: "image/bmp",
    name: "scenario-6-stripes.bmp",
  });
  await expect(page.locator("#importImageChooseFileName"))
    .toHaveText("scenario-6-stripes.bmp");
  await expect.poll(() => page.evaluate(() => {
    const importer = g_app.services.imageImport.getActive(g_app.textModeEditor);
    return {
      height: importer.importImage?.naturalHeight,
      mediaReady: importer.mediaReady,
      scale: importer.importImageScale,
      width: importer.importImage?.naturalWidth,
    };
  })).toEqual({ height: 5, mediaReady: true, scale: 4000, width: 8 });
  await expect(importButton).not.toHaveClass(/ui-button-disabled/);

  await importButton.click();
  await expect(importDialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const importer = g_app.services.imageImport.getActive(g_app.textModeEditor);
    return {
      historyEntry: g_app.textModeEditor.history
        .history[g_app.textModeEditor.history.historyPosition - 1]?.name,
      importInProgress: importer.importInProgress,
      progressVisible: getComputedStyle(document.querySelector("#importImageProgress")).display,
    };
  }), { timeout: 30_000 }).toEqual({
    historyEntry: "Import Image",
    importInProgress: false,
    progressVisible: "none",
  });

  const imported = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const tileSet = layer.getTileSet();
    const palette = layer.getColorPalette();
    const positions = [2, 7, 12, 17].map((x) => ({ x, y: 12 }));
    const cells = positions.map(({ x, y }) => {
      const { bc, fc, t } = layer.getCell({ x, y });
      const tileColors = new Set();
      for (let pixelY = 0; pixelY < tileSet.getTileHeight(); pixelY++) {
        for (let pixelX = 0; pixelX < tileSet.getTileWidth(); pixelX++) {
          tileColors.add(tileSet.getPixel(t, pixelX, pixelY));
        }
      }
      const centerUsesForeground = tileSet.getPixel(
        t,
        Math.floor(tileSet.getTileWidth() / 2),
        Math.floor(tileSet.getTileHeight() / 2),
      ) !== 0;
      const centerColor = centerUsesForeground ? fc : bc;
      return {
        bc,
        centerHex: palette.getHex(centerColor),
        fc,
        t,
        tileColorCount: tileColors.size,
      };
    });
    return {
      cells,
      dimensions: {
        cellHeight: layer.getCellHeight(),
        cellWidth: layer.getCellWidth(),
        graphicHeight: editor.graphic.getGraphicHeight(),
        graphicWidth: editor.graphic.getGraphicWidth(),
        gridHeight: layer.getGridHeight(),
        gridWidth: layer.getGridWidth(),
      },
      historyEntry: editor.history.history[editor.history.historyPosition - 1]?.name,
      palette: Array.from({ length: palette.getColorCount() }, (_, index) =>
        palette.getHex(index)),
    };
  });
  expect(imported.dimensions).toEqual({
    cellHeight: 8,
    cellWidth: 8,
    graphicHeight: 200,
    graphicWidth: 320,
    gridHeight: 25,
    gridWidth: 40,
  });
  expect(imported.historyEntry).toBe("Import Image");
  expect(new Set(imported.palette)).toEqual(new Set([0x000000, 0xffffff]));
  expect(imported.cells.map(({ centerHex }) => centerHex))
    .toEqual([0x000000, 0xffffff, 0x000000, 0xffffff]);
  expect(imported.cells[0]).toEqual(imported.cells[2]);
  expect(imported.cells[1]).toEqual(imported.cells[3]);
  expect(imported.cells[0]).not.toEqual(imported.cells[1]);
  expect(imported.cells.every(({ tileColorCount }) => tileColorCount === 1)).toBe(true);

  await chooseMenuItem(page, "Export", /^GIF \/ PNG\b/);
  const exportDialog = page.getByRole("dialog", { name: "Export Image" });
  await expect(exportDialog).toBeVisible();
  await expect(page.locator("input[name='exportImageFormat'][value='png']")).toBeChecked();
  await page.locator("#exportImageAs").fill("scenario-6-import");
  await page.locator("#exportImageScale").selectOption("1");
  await expect(page.locator("#exportImageDimensions")).toHaveText("320x200 pixels");

  const downloadPromise = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Download", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("scenario-6-import.png");
  const png = await readFile(await download.path());
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(320);
  expect(png.readUInt32BE(20)).toBe(200);
  expect(await decodePngPixels(page, png, [
    { x: 20, y: 100 },
    { x: 60, y: 100 },
    { x: 100, y: 100 },
    { x: 140, y: 100 },
  ])).toEqual({
    height: 200,
    pixels: [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [255, 255, 255, 255],
    ],
    width: 320,
  });
});
