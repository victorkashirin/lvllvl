import {
  createExportArtifact,
  createImmutableExportSnapshot,
  validateImportSource,
} from "../domain/importExportValues.mjs";

/** @typedef {"import" | "export"} OperationKind */

export class ImportExportCancelledError extends Error {
  /** @param {string} message */
  constructor(message = "Import/export operation was cancelled") {
    super(message);
    this.name = "ImportExportCancelledError";
  }
}

export class ImportExportTimeoutError extends Error {
  /** @param {number} timeoutMs */
  constructor(timeoutMs) {
    super(`Import/export operation timed out after ${timeoutMs}ms`);
    this.name = "ImportExportTimeoutError";
  }
}

/** @param {string} format */
function requireFormat(format) {
  if (typeof format !== "string" || format.trim() === "") {
    throw new TypeError("Import/export formats must be non-empty strings");
  }
  return format.trim().toLowerCase();
}

/** @param {AbortSignal | undefined} signal */
function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new ImportExportCancelledError();
  }
}

/**
 * Race an operation with its caller-owned cancellation and timeout without
 * retaining mutable state on the shared service.
 *
 * @template Result
 * @param {(signal: AbortSignal) => Result | Promise<Result>} operation
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} options
 * @returns {Promise<Result>}
 */
async function runBounded(operation, { signal, timeoutMs }) {
  throwIfAborted(signal);
  if (timeoutMs != null && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new TypeError("timeoutMs must be a positive finite number");
  }

  const boundedController = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {(() => void) | undefined} */
  let removeAbortListener;
  const cancellation = new Promise((resolve, reject) => {
    boundedController.signal.addEventListener("abort", () => {
      reject(boundedController.signal.reason instanceof Error
        ? boundedController.signal.reason
        : new ImportExportCancelledError());
    }, { once: true });
  });
  if (signal) {
    const abort = () => boundedController.abort(signal.reason instanceof Error
      ? signal.reason
      : new ImportExportCancelledError());
    signal.addEventListener("abort", abort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", abort);
  }
  if (timeoutMs != null) {
    timer = setTimeout(
      () => boundedController.abort(new ImportExportTimeoutError(timeoutMs)),
      timeoutMs,
    );
  }

  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(boundedController.signal)),
      cancellation,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    removeAbortListener?.();
  }
}

export class ImportExportService {
  constructor() {
    /** @type {Map<string, any>} */
    this.importers = new Map();
    /** @type {Map<string, any>} */
    this.exporters = new Map();
  }

  /**
   * @param {string} format
   * @param {{
   *   parse: (source: any, operation: { signal?: AbortSignal }) => unknown | Promise<unknown>,
   *   apply: (destination: object, parsed: unknown, operation: { signal?: AbortSignal }) => unknown,
   *   constraints?: object,
   * }} definition
   */
  registerImporter(format, definition) {
    const id = requireFormat(format);
    if (!definition || typeof definition.parse !== "function" ||
        typeof definition.apply !== "function") {
      throw new TypeError("Importers require parse and apply functions");
    }
    if (definition.apply.constructor?.name === "AsyncFunction") {
      throw new TypeError("Importer apply functions must commit synchronously");
    }
    if (this.importers.has(id)) throw new Error(`Importer is already registered: ${id}`);
    this.importers.set(id, Object.freeze({ ...definition }));
    return this;
  }

  /**
   * @param {string} format
   * @param {{ encode: (snapshot: any, operation: { signal?: AbortSignal }) => unknown | Promise<unknown> }} definition
   */
  registerExporter(format, definition) {
    const id = requireFormat(format);
    if (!definition || typeof definition.encode !== "function") {
      throw new TypeError("Exporters require an encode function");
    }
    if (this.exporters.has(id)) throw new Error(`Exporter is already registered: ${id}`);
    this.exporters.set(id, Object.freeze({ ...definition }));
    return this;
  }

  /**
   * @param {string} format
   * @param {{ source: object, destination: object, signal?: AbortSignal, timeoutMs?: number }} request
   */
  async import(format, request) {
    const id = requireFormat(format);
    const definition = this.importers.get(id);
    if (!definition) throw new Error(`Unknown importer: ${id}`);
    if (!request?.destination || typeof request.destination !== "object") {
      throw new TypeError("Imports require an explicit destination contract");
    }
    const source = validateImportSource(request.source, definition.constraints);
    const parsed = await runBounded(async (signal) => {
      const operation = Object.freeze({ signal });
      return definition.parse(source, operation);
    }, request);
    throwIfAborted(request.signal);

    // Application is an atomic commit boundary. JavaScript cannot deliver an
    // abort event during this synchronous call, so a rejected operation cannot
    // leave a later asynchronous mutation running against the destination.
    const result = definition.apply(
      request.destination,
      parsed,
      Object.freeze({ signal: request.signal }),
    );
    if (result && typeof /** @type {any} */ (result).then === "function") {
      throw new TypeError("Importer apply functions must commit synchronously");
    }
    return result;
  }

  /**
   * @param {string} format
   * @param {{ snapshot: unknown, signal?: AbortSignal, timeoutMs?: number }} request
   */
  async export(format, request) {
    const id = requireFormat(format);
    const definition = this.exporters.get(id);
    if (!definition) throw new Error(`Unknown exporter: ${id}`);
    const snapshot = createImmutableExportSnapshot(request?.snapshot);
    return runBounded(async (signal) => {
      const artifact = await definition.encode(
        snapshot,
        Object.freeze({ signal }),
      );
      throwIfAborted(signal);
      return createExportArtifact(artifact);
    }, request);
  }
}
