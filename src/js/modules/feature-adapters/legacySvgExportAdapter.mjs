const supportedScreenModes = new Set(["vector", "textmode", "c64standard", "c64ecm"]);

/** @param {any} palette @param {unknown} index @param {unknown} noColor */
function colorValue(palette, index, noColor) {
  if (index === false || typeof index === "undefined" || index === noColor) return null;
  const color = palette.getRGBA(index);
  return `rgb(${color[0]},${color[1]},${color[2]})`;
}

/** @param {any} layer @param {any} tileSet @param {any} cell */
function cellColors(layer, tileSet, cell) {
  let foreground = cell.fc;
  let background = cell.bc;
  const colorPerMode = layer.getColorPerMode();
  if (colorPerMode === "character") {
    foreground = tileSet.getTileColor(cell.t);
    background = tileSet.getCharacterBGColor(cell.t);
  } else if (
    colorPerMode === "block" && layer.getBlockModeEnabled() &&
    cell.b !== false && typeof cell.b !== "undefined"
  ) {
    const blockSet = layer.getBlockSet();
    foreground = blockSet.getBlockColor(cell.b);
    background = blockSet.getBlockBGColor(cell.b);
  }
  if (layer.getScreenMode() === "c64ecm") {
    if (cell.t >= 64 || background === false || typeof background === "undefined") {
      background = layer.getC64ECMColor(Math.floor(cell.t / 64) % 4);
    } else if (background < 4) {
      background = layer.getC64ECMColor(background);
    }
  }
  return { background, foreground };
}

/**
 * @param {any} tileSet
 * @param {number} tile
 * @param {number} x
 * @param {number} y
 * @param {any} cell
 * @param {any} layer
 * @param {number} width
 * @param {number} height
 */
function rasterPixel(tileSet, tile, x, y, cell, layer, width, height) {
  let sourceX = x;
  let sourceY = y;
  if (layer.getHasTileFlip()) {
    if (cell.fh) sourceX = width - sourceX - 1;
    if (cell.fv) sourceY = height - sourceY - 1;
  }
  if (layer.getHasTileRotate() && width === height) {
    const rotation = ((Number.parseInt(cell.rz, 10) || 0) % 4 + 4) % 4;
    const originalX = sourceX;
    const originalY = sourceY;
    if (rotation === 1) {
      sourceY = width - originalX - 1;
      sourceX = originalY;
    } else if (rotation === 2) {
      sourceX = width - originalX - 1;
      sourceY = height - originalY - 1;
    } else if (rotation === 3) {
      sourceY = originalX;
      sourceX = height - originalY - 1;
    }
  }
  return tileSet.getPixel(tile, sourceX, sourceY, "current") > 0;
}

/** @param {any} tileSet @param {any} cell @param {any} layer @param {number} width @param {number} height */
function rasterPath(tileSet, cell, layer, width, height) {
  let path = "";
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (!rasterPixel(tileSet, cell.t, x, y, cell, layer, width, height)) {
        x++;
        continue;
      }
      const runStart = x;
      while (x < width && rasterPixel(tileSet, cell.t, x, y, cell, layer, width, height)) x++;
      const runWidth = x - runStart;
      path += `M${runStart} ${y}h${runWidth}v1h-${runWidth}z`;
    }
  }
  return path;
}

/** @param {any} editor @param {string} [filename] */
export function captureLegacySvgExportSnapshot(editor, filename = "Untitled") {
  const layer = editor.layers.getSelectedLayerObject();
  if (!layer || layer.getType() !== "grid") {
    return Object.freeze({ error: "Please choose a grid layer", supported: false });
  }
  const screenMode = layer.getScreenMode();
  if (!supportedScreenModes.has(screenMode)) {
    return Object.freeze({
      error: "SVG export is not available for this screen mode",
      supported: false,
    });
  }

  const tileSet = layer.getTileSet();
  const palette = layer.getColorPalette();
  const noColor = editor.colorPaletteManager.noColor;
  const vector = screenMode === "vector";
  const cellWidth = vector ? 32 : layer.getCellWidth();
  const cellHeight = vector ? 32 : layer.getCellHeight();
  const gridWidth = layer.getGridWidth();
  const gridHeight = layer.getGridHeight();
  const vectorScale = vector ? cellWidth * tileSet.getFontScale() : 1;
  const scaledAscent = vector ? tileSet.getFontAscent() * vectorScale : 0;
  const cells = [];

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const cell = layer.getCell({ x, y });
      if (cell === false) continue;
      const colors = cellColors(layer, tileSet, cell);
      let path = null;
      if (vector) {
        const vectorPath = tileSet.getSVGPath(cell.t);
        if (vectorPath !== false && !vectorPath.startsWith("lyph glyph-name")) {
          const xPosition = x * cellWidth;
          const yPosition = y * cellHeight;
          cells.push({
            background: colorValue(palette, colors.background, noColor),
            foreground: colorValue(palette, colors.foreground, noColor),
            path: vectorPath,
            transform: `translate(${xPosition} ${yPosition + scaledAscent}) scale(${vectorScale} -${vectorScale})`,
            x,
            y,
          });
          continue;
        }
      } else {
        path = rasterPath(tileSet, cell, layer, cellWidth, cellHeight);
      }
      cells.push({
        background: colorValue(palette, colors.background, noColor),
        foreground: colorValue(palette, colors.foreground, noColor),
        path,
        x,
        y,
      });
    }
  }

  return {
    background: colorValue(palette, layer.getBackgroundColor(), noColor),
    cellHeight,
    cellWidth,
    cells,
    filename,
    height: cellHeight * gridHeight,
    supported: true,
    vector,
    width: cellWidth * gridWidth,
  };
}

/**
 * @param {{
 *   editor: object,
 *   operations: { export: (format: string, request: { snapshot: unknown }) => Promise<any> },
 *   host: {
 *     downloadArtifact: (artifact: object) => void,
 *     reportError: (operation: string, error: unknown) => void,
 *     showAlert: (message: string) => void,
 *   },
 * }} dependencies
 */
export function createLegacySvgExportPort({ editor, operations, host }) {
  /** @param {string} filename */
  async function artifact(filename) {
    const snapshot = captureLegacySvgExportSnapshot(editor, filename);
    if (!snapshot.supported) return snapshot;
    return operations.export("svg", { snapshot });
  }

  return Object.freeze({
    /** @param {string} filename */
    async export(filename) {
      const result = await artifact(filename);
      if (result.supported === false) {
        host.showAlert(result.error);
        return false;
      }
      host.downloadArtifact(result);
      return result;
    },
    async getSVGData() {
      const result = await artifact("Untitled");
      return result.supported === false ? false : result.text;
    },
    reportError(/** @type {unknown} */ error) {
      host.reportError("SVG export", error);
    },
  });
}
