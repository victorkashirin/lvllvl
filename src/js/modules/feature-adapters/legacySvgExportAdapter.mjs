import { encodeSvgExport } from "../domain/svgExport.mjs";

/**
 * @typedef {{ error: string, supported: false } |
 *   { filename: string, mediaType: string, text: string }} SvgPortArtifact
 */

const supportedScreenModes = new Set(["vector", "textmode", "c64standard", "c64ecm"]);

/**
 * @param {any} editor
 * @param {any} layer
 * @returns {{ maxX: number, maxY: number, minX: number, minY: number } | false}
 */
function svgExportSelection(editor, layer) {
  const select = editor.tools?.drawTools?.select;
  if (
    !select || typeof select.isActive !== "function" || !select.isActive() ||
    typeof select.getSelection !== "function"
  ) {
    return false;
  }
  const selection = select.getSelection();
  if (
    !selection ||
    ![selection.minX, selection.minY, selection.maxX, selection.maxY].every(Number.isFinite)
  ) {
    return false;
  }
  const gridWidth = layer.getGridWidth();
  const gridHeight = layer.getGridHeight();
  const minX = Math.max(0, Math.min(gridWidth, Math.floor(selection.minX)));
  const minY = Math.max(0, Math.min(gridHeight, Math.floor(selection.minY)));
  const maxX = Math.max(0, Math.min(gridWidth, Math.ceil(selection.maxX)));
  const maxY = Math.max(0, Math.min(gridHeight, Math.ceil(selection.maxY)));
  if (maxX <= minX || maxY <= minY) return false;
  return Object.freeze({ maxX, maxY, minX, minY });
}

/**
 * @param {any} layer
 * @param {string} screenMode
 * @param {{ maxX: number, maxY: number, minX: number, minY: number }} [bounds]
 */
function svgExportDimensions(layer, screenMode, bounds) {
  const vector = screenMode === "vector";
  const cellWidth = vector ? 32 : layer.getCellWidth();
  const cellHeight = vector ? 32 : layer.getCellHeight();
  const gridWidth = bounds ? bounds.maxX - bounds.minX : layer.getGridWidth();
  const gridHeight = bounds ? bounds.maxY - bounds.minY : layer.getGridHeight();
  return Object.freeze({
    cellHeight,
    cellWidth,
    height: cellHeight * gridHeight,
    width: cellWidth * gridWidth,
  });
}

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

/**
 * @param {any} editor
 * @param {string} [filename]
 * @param {{ area?: "document" | "selection" }} [options]
 */
export function captureLegacySvgExportSnapshot(editor, filename = "Untitled", options = {}) {
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
  const selection = options.area === "selection" ? svgExportSelection(editor, layer) : false;
  if (options.area === "selection" && selection === false) {
    return Object.freeze({ error: "Please make a selection to export", supported: false });
  }
  const bounds = selection || Object.freeze({
    maxX: layer.getGridWidth(),
    maxY: layer.getGridHeight(),
    minX: 0,
    minY: 0,
  });
  const dimensions = svgExportDimensions(layer, screenMode, bounds);
  const { cellHeight, cellWidth, height, width } = dimensions;
  const vectorScale = vector ? cellWidth * tileSet.getFontScale() : 1;
  const scaledAscent = vector ? tileSet.getFontAscent() * vectorScale : 0;
  const cells = [];

  for (let y = bounds.minY; y < bounds.maxY; y++) {
    for (let x = bounds.minX; x < bounds.maxX; x++) {
      const cell = layer.getCell({ x, y });
      if (cell === false) continue;
      const colors = cellColors(layer, tileSet, cell);
      const exportX = x - bounds.minX;
      const exportY = y - bounds.minY;
      let path = null;
      if (vector) {
        const vectorPath = tileSet.getSVGPath(cell.t);
        if (vectorPath !== false && !vectorPath.startsWith("lyph glyph-name")) {
          const xPosition = exportX * cellWidth;
          const yPosition = exportY * cellHeight;
          cells.push({
            background: colorValue(palette, colors.background, noColor),
            foreground: colorValue(palette, colors.foreground, noColor),
            path: vectorPath,
            transform: `translate(${xPosition} ${yPosition + scaledAscent}) scale(${vectorScale} -${vectorScale})`,
            x: exportX,
            y: exportY,
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
        x: exportX,
        y: exportY,
      });
    }
  }

  return {
    background: colorValue(palette, layer.getBackgroundColor(), noColor),
    cellHeight,
    cellWidth,
    cells,
    filename,
    height,
    supported: true,
    vector,
    width,
  };
}

/**
 * @param {{
 *   editor: any,
 *   getProjectName: () => string,
 *   host: {
 *     copyText: (value: string) => Promise<void>,
 *     downloadArtifact: (artifact: { filename: string, mediaType: string, text: string }) => void,
 *     reportError: (operation: string, error: unknown) => void,
 *     showAlert: (message: string) => void,
 *   },
 * }} dependencies
 */
export function createLegacySvgExportPort({ editor, getProjectName, host }) {
  /**
   * @param {string} filename
   * @param {{ area?: "document" | "selection", includeBackground?: boolean, scale?: number }} [options]
   * @returns {Promise<SvgPortArtifact>}
   */
  async function artifact(filename, options) {
    const snapshot = captureLegacySvgExportSnapshot(editor, filename, options);
    if ("error" in snapshot) {
      return Object.freeze({ error: snapshot.error, supported: /** @type {false} */ (false) });
    }
    const encoded = encodeSvgExport(snapshot, options);
    return Object.freeze({
      filename: encoded.filename,
      mediaType: encoded.mediaType,
      text: encoded.data,
    });
  }

  return Object.freeze({
    /** @param {{ area?: "document" | "selection", includeBackground?: boolean, scale?: number }} [options] */
    async copy(options) {
      const result = await artifact("Untitled", options);
      if ("error" in result) {
        host.showAlert(result.error);
        return false;
      }
      await host.copyText(result.text);
      return result;
    },
    getDefaultFilename() {
      const projectName = getProjectName();
      return typeof projectName === "string" && projectName !== "" ? projectName : "Untitled";
    },
    /** @param {"document" | "selection"} [area] */
    getDimensions(area = "document") {
      const layer = editor.layers.getSelectedLayerObject();
      if (!layer || layer.getType() !== "grid") return false;
      const screenMode = layer.getScreenMode();
      if (!supportedScreenModes.has(screenMode)) return false;
      const selection = area === "selection" ? svgExportSelection(editor, layer) : false;
      if (area === "selection" && selection === false) return false;
      const { height, width } = svgExportDimensions(layer, screenMode, selection || undefined);
      return Object.freeze({ height, width });
    },
    /**
     * @param {string} filename
     * @param {{ area?: "document" | "selection", includeBackground?: boolean, scale?: number }} [options]
     */
    async export(filename, options) {
      const result = await artifact(filename, options);
      if ("error" in result) {
        host.showAlert(result.error);
        return false;
      }
      host.downloadArtifact(result);
      return result;
    },
    /** @param {{ area?: "document" | "selection", includeBackground?: boolean, scale?: number }} [options] */
    async getSVGData(options) {
      const result = await artifact("Untitled", options);
      return "error" in result ? false : result.text;
    },
    reportError(/** @type {unknown} */ error) {
      host.reportError("SVG export", error);
    },
  });
}
