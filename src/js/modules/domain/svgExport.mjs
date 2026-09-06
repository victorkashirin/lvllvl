/** @param {unknown} value @param {string} name */
function requireNumber(value, name) {
  if (!Number.isFinite(value) || /** @type {number} */ (value) < 0) {
    throw new TypeError(`SVG snapshots require a non-negative ${name}`);
  }
  return /** @type {number} */ (value);
}

/** @param {unknown} value */
function requireColor(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^rgb\(\d+,\d+,\d+\)$/.test(value)) {
    throw new TypeError("SVG snapshot colors must be RGB strings or null");
  }
  return value;
}

/** @param {string} value */
function escapeAttribute(value) {
  return value.replace(/[&"<>]/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === '"') return "&quot;";
    if (character === "<") return "&lt;";
    return "&gt;";
  });
}

/**
 * Encode a fully detached SVG document snapshot.
 *
 * @param {{
 *   background: string | null,
 *   cellHeight: number,
 *   cellWidth: number,
 *   cells: ReadonlyArray<{
 *     background: string | null,
 *     foreground: string | null,
 *     path: string | null,
 *     transform?: string,
 *     x: number,
 *     y: number,
 *   }>,
 *   filename: string,
 *   height: number,
 *   vector: boolean,
 *   width: number,
 * }} snapshot
 * @param {{ includeBackground?: boolean, scale?: number }} [options]
 */
export function encodeSvgExport(snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.cells)) {
    throw new TypeError("SVG export requires a document snapshot");
  }
  const width = requireNumber(snapshot.width, "width");
  const height = requireNumber(snapshot.height, "height");
  const cellWidth = requireNumber(snapshot.cellWidth, "cell width");
  const cellHeight = requireNumber(snapshot.cellHeight, "cell height");
  const background = requireColor(snapshot.background);
  const includeBackground = options.includeBackground !== false;
  const scale = typeof options.scale === "undefined" ? 1 : options.scale;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new TypeError("SVG export scale must be a positive number");
  }
  let data = '<?xml version="1.0" standalone="no"?>';
  data += `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}"`;
  data += ` viewBox="0 0 ${width} ${height}"`;
  if (!snapshot.vector) data += ' shape-rendering="crispEdges"';
  data += ">";

  if (includeBackground && background !== null) {
    data += `<rect width="100%" height="100%" fill="${background}"/>`;
  }

  for (const cell of snapshot.cells) {
    const x = requireNumber(cell.x, "cell x");
    const y = requireNumber(cell.y, "cell y");
    const foreground = requireColor(cell.foreground);
    const cellBackground = requireColor(cell.background);
    const xPosition = x * cellWidth;
    const yPosition = y * cellHeight;
    if (cellBackground !== null) {
      data += `<rect x="${xPosition}" y="${yPosition}" width="${cellWidth}"`;
      data += ` height="${cellHeight}" fill="${cellBackground}"/>`;
    }
    if (foreground !== null && typeof cell.path === "string" && cell.path !== "") {
      const transform = typeof cell.transform === "string"
        ? cell.transform
        : `translate(${xPosition} ${yPosition})`;
      data += `<path transform="${escapeAttribute(transform)}" d="${escapeAttribute(cell.path)}"`;
      data += ` fill="${foreground}"/>`;
    }
  }

  data += "</svg>";
  const baseFilename = typeof snapshot.filename === "string" && snapshot.filename.trim() !== ""
    ? snapshot.filename.trim()
    : "Untitled";
  return {
    data,
    filename: /\.svg$/i.test(baseFilename) ? baseFilename : `${baseFilename}.svg`,
    mediaType: "image/svg+xml",
  };
}
