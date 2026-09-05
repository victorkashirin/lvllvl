/** @typedef {string | number} DocumentId */
/** @typedef {{frame: number | null, layer: string | number | null, mode: string | null, selection: any, tool: string | null}} EditorDocumentState */

/** @param {any} value @returns {any} */
function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    /** @type {Record<string, any>} */
    const clone = {};
    for (const [key, item] of Object.entries(value)) clone[key] = cloneValue(item);
    return clone;
  }
  return value;
}

/** @param {{mode: string | null, tool: string | null}} defaults @returns {EditorDocumentState} */
function createDocumentState(defaults) {
  return {
    frame: null,
    layer: null,
    mode: defaults.mode,
    selection: null,
    tool: defaults.tool,
  };
}

/**
 * Minimal, DOM-free editor state. Document-specific values are retained when a
 * document is left and restored only when that same document becomes active.
 */
export class EditorStateService {
  constructor() {
    /** @type {Map<string, EditorDocumentState>} */
    this.documents = new Map();
    /** @type {string | null} */
    this.activeDocumentId = null;
    /** @type {{mode: string | null, tool: string | null}} */
    this.defaults = { mode: null, tool: null };
    /** @type {Set<(event: {field: string, value: any, documentId: string | null}) => void>} */
    this.listeners = new Set();
  }

  /** @param {DocumentId} documentId */
  activateDocument(documentId) {
    const id = String(documentId);
    if (!this.documents.has(id)) {
      this.documents.set(id, createDocumentState(this.defaults));
    }
    this.activeDocumentId = id;
    this.notify("document", id);
    return this.snapshot();
  }

  get activeDocument() {
    return this.activeDocumentId;
  }

  get selection() {
    return cloneValue(this.current()?.selection ?? null);
  }

  get frame() {
    return this.current()?.frame ?? null;
  }

  get layer() {
    return this.current()?.layer ?? null;
  }

  get tool() {
    return this.current()?.tool ?? this.defaults.tool;
  }

  get mode() {
    return this.current()?.mode ?? this.defaults.mode;
  }

  /** @param {unknown} selection */
  setSelection(selection) {
    return this.setDocumentField("selection", cloneValue(selection));
  }

  /** @param {number | null} frame */
  setFrame(frame) {
    return this.setDocumentField("frame", frame);
  }

  /** @param {string | number | null} layer */
  setLayer(layer) {
    return this.setDocumentField("layer", layer);
  }

  /** @param {string | null} tool */
  setTool(tool) {
    this.defaults.tool = tool;
    return this.setDocumentField("tool", tool, true);
  }

  /** @param {string | null} mode */
  setMode(mode) {
    this.defaults.mode = mode;
    return this.setDocumentField("mode", mode, true);
  }

  /** @returns {{documentId: string | null, selection: any, frame: number | null, layer: string | number | null, tool: string | null, mode: string | null}} */
  snapshot() {
    const current = this.current();
    return {
      documentId: this.activeDocumentId,
      selection: cloneValue(current?.selection ?? null),
      frame: current?.frame ?? null,
      layer: current?.layer ?? null,
      tool: current?.tool ?? this.defaults.tool,
      mode: current?.mode ?? this.defaults.mode,
    };
  }

  /** @param {(event: {field: string, value: any, documentId: string | null}) => void} listener */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  current() {
    return this.activeDocumentId === null
      ? null
      : this.documents.get(this.activeDocumentId) ?? null;
  }

  /** @param {"selection" | "frame" | "layer" | "tool" | "mode"} field @param {any} value @param {boolean} [allowWithoutDocument] */
  setDocumentField(field, value, allowWithoutDocument = false) {
    const current = this.current();
    if (!current) {
      if (allowWithoutDocument) this.notify(field, value);
      return false;
    }
    current[field] = value;
    this.notify(field, value);
    return true;
  }

  /** @param {string} field @param {any} value */
  notify(field, value) {
    const event = {
      documentId: this.activeDocumentId,
      field,
      value: cloneValue(value),
    };
    for (const listener of this.listeners) listener(event);
  }
}
