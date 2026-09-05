export const ImportSourceKind = Object.freeze({
  BYTES: "bytes",
  TEXT: "text",
});

export const ImportSourceErrorCode = Object.freeze({
  EMPTY: "empty",
  INVALID: "invalid",
  OVERSIZED: "oversized",
  TRUNCATED: "truncated",
  UNSUPPORTED: "unsupported",
});

export class ImportSourceError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "ImportSourceError";
    this.code = code;
  }
}

/** @param {unknown} value */
function byteView(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

/**
 * Validate external input once and retain a private copy. Consumers can request
 * a fresh byte copy, so one parser cannot mutate the input seen by a retry.
 *
 * @param {{
 *   bytes?: unknown,
 *   text?: unknown,
 *   filename?: string,
 *   mediaType?: string,
 * }} source
 * @param {{
 *   allowEmpty?: boolean,
 *   maxBytes?: number,
 *   minBytes?: number,
 *   mediaTypes?: readonly string[],
 * }} [constraints]
 */
export function validateImportSource(source, constraints = {}) {
  if (!source || typeof source !== "object") {
    throw new ImportSourceError(ImportSourceErrorCode.INVALID, "Import source is required");
  }

  const hasText = typeof source.text === "string";
  const bytes = byteView(source.bytes);
  if (hasText === Boolean(bytes)) {
    throw new ImportSourceError(
      ImportSourceErrorCode.INVALID,
      "Import source must contain exactly one of text or bytes",
    );
  }

  const mediaType = source.mediaType?.trim() || "application/octet-stream";
  if (constraints.mediaTypes?.length && !constraints.mediaTypes.includes(mediaType)) {
    throw new ImportSourceError(
      ImportSourceErrorCode.UNSUPPORTED,
      `Unsupported import media type: ${mediaType}`,
    );
  }

  const size = hasText
    ? new TextEncoder().encode(/** @type {string} */ (source.text)).byteLength
    : /** @type {Uint8Array} */ (bytes).byteLength;
  if (!constraints.allowEmpty && size === 0) {
    throw new ImportSourceError(ImportSourceErrorCode.EMPTY, "Import source is empty");
  }
  if (constraints.minBytes != null && size < constraints.minBytes) {
    throw new ImportSourceError(
      ImportSourceErrorCode.TRUNCATED,
      `Import source is truncated (${size} bytes; expected at least ${constraints.minBytes})`,
    );
  }
  if (constraints.maxBytes != null && size > constraints.maxBytes) {
    throw new ImportSourceError(
      ImportSourceErrorCode.OVERSIZED,
      `Import source is too large (${size} bytes; maximum ${constraints.maxBytes})`,
    );
  }

  const common = {
    byteLength: size,
    filename: source.filename?.trim() || "Untitled",
    mediaType,
  };
  if (hasText) {
    return Object.freeze({
      ...common,
      kind: ImportSourceKind.TEXT,
      text: /** @type {string} */ (source.text),
    });
  }

  const copy = /** @type {Uint8Array} */ (bytes).slice();
  return Object.freeze({
    ...common,
    kind: ImportSourceKind.BYTES,
    readBytes: () => copy.slice(),
  });
}

/**
 * Deeply copy and freeze plain snapshot data. Mutable application objects and
 * functions are rejected rather than accidentally crossing the export seam.
 *
 * @param {unknown} value
 * @returns {any}
 */
export function createImmutableExportSnapshot(value) {
  if (value == null || typeof value === "string" || typeof value === "number" ||
      typeof value === "boolean") {
    return value;
  }
  if (typeof value === "function" || typeof value !== "object") {
    throw new TypeError("Export snapshots contain data only");
  }
  const bytes = byteView(value);
  if (bytes) return Object.freeze(Array.from(bytes));
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => createImmutableExportSnapshot(item)));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Export snapshots must contain only plain objects and arrays");
  }
  /** @type {Record<string, any>} */
  const snapshot = {};
  for (const [key, item] of Object.entries(value)) {
    Object.defineProperty(snapshot, key, {
      configurable: false,
      enumerable: true,
      value: createImmutableExportSnapshot(item),
      writable: false,
    });
  }
  return Object.freeze(snapshot);
}

/**
 * @param {{ filename: string, mediaType: string, data: string | Uint8Array | ArrayBuffer }} value
 */
export function createExportArtifact(value) {
  if (!value || typeof value.filename !== "string" || value.filename.trim() === "" ||
      typeof value.mediaType !== "string" || value.mediaType.trim() === "") {
    throw new TypeError("Export artifacts require a filename and media type");
  }
  if (typeof value.data === "string") {
    return Object.freeze({
      filename: value.filename,
      mediaType: value.mediaType,
      text: value.data,
      byteLength: new TextEncoder().encode(value.data).byteLength,
    });
  }
  const bytes = byteView(value.data);
  if (!bytes) throw new TypeError("Export artifact data must be text or bytes");
  const copy = bytes.slice();
  return Object.freeze({
    filename: value.filename,
    mediaType: value.mediaType,
    byteLength: copy.byteLength,
    readBytes: () => copy.slice(),
  });
}
