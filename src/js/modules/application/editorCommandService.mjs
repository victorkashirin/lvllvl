import { EditorStateService } from "./editorStateService.mjs";
import { HistoryService } from "./historyService.mjs";

/** @typedef {import("./historyService.mjs").HistoryReplayPort} HistoryReplayPort */

/**
 * @typedef {object} TilePixelEdit
 * @property {number} character
 * @property {number} x
 * @property {number} y
 * @property {number} frame
 * @property {any} oldValue
 * @property {any} newValue
 * @property {() => void} apply
 * @property {() => void} markDirty
 * @property {() => void} invalidate
 */

/**
 * Document-aware command boundary used by every legacy text-mode entry point.
 * Only changing the active document changes the selected history timeline.
 */
export class EditorCommandService {
  /** @param {{replay: HistoryReplayPort, state?: EditorStateService}} dependencies */
  constructor({ replay, state = new EditorStateService() }) {
    if (!replay || typeof replay.replay !== "function") {
      throw new TypeError("EditorCommandService requires a history replay port");
    }
    this.replay = replay;
    this.state = state;
    /** @type {Map<string, HistoryService>} */
    this.histories = new Map();
    /** @type {HistoryService | null} */
    this.activeHistory = null;
  }

  /** @param {string | number} documentId */
  activateDocument(documentId) {
    const id = String(documentId);
    let history = this.histories.get(id);
    if (!history) {
      history = new HistoryService({ replay: this.replay });
      this.histories.set(id, history);
    }
    this.activeHistory = history;
    this.state.activateDocument(id);
    return history;
  }

  /** @param {string} name */
  startEntry(name) {
    return this.activeHistory?.startEntry(name) ?? false;
  }

  /** @param {string} actionName @param {Record<string, any>} params */
  addAction(actionName, params) {
    return this.activeHistory?.addAction(actionName, params) ?? false;
  }

  endEntry() {
    return this.activeHistory?.endEntry() ?? false;
  }

  undo() {
    return this.activeHistory?.undo() ?? false;
  }

  redo() {
    return this.activeHistory?.redo() ?? false;
  }

  /** @param {boolean} enabled */
  setEnabled(enabled) {
    this.activeHistory?.setEnabled(enabled);
  }

  getEnabled() {
    return this.activeHistory?.getEnabled() ?? true;
  }

  /** @param {boolean} enabled */
  setNewEntryEnabled(enabled) {
    this.activeHistory?.setNewEntryEnabled(enabled);
  }

  /** @param {unknown} selection */
  setSelection(selection) {
    return this.state.setSelection(selection);
  }

  /** @param {number | null} frame */
  setFrame(frame) {
    return this.state.setFrame(frame);
  }

  /** @param {string | number | null} layer */
  setLayer(layer) {
    return this.state.setLayer(layer);
  }

  /** @param {string | null} tool */
  setTool(tool) {
    return this.state.setTool(tool);
  }

  /** @param {string | null} mode */
  setMode(mode) {
    return this.state.setMode(mode);
  }

  /**
   * Complete character-pixel mutation path shared by pointer, keyboard, and
   * menu callers through TileSet.setPixel().
   * @param {TilePixelEdit} edit
   */
  executeTilePixelEdit(edit) {
    if (Object.is(edit.oldValue, edit.newValue)) return false;

    edit.apply();
    this.addAction("setCharPixel", {
      c: edit.character,
      x: edit.x,
      y: edit.y,
      oldValue: edit.oldValue,
      newValue: edit.newValue,
    });
    this.state.setSelection({
      character: edit.character,
      frame: edit.frame,
      kind: "tile-pixel",
      x: edit.x,
      y: edit.y,
    });
    edit.markDirty();
    edit.invalidate();
    return true;
  }
}
