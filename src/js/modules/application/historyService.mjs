import { HistoryState } from "../domain/historyState.mjs";

/** @typedef {import("../domain/historyState.mjs").HistoryAction} HistoryAction */

/**
 * @typedef {object} HistoryReplayPort
 * @property {(actions: HistoryAction[], direction: "undo" | "redo") => void} replay
 */

/**
 * Narrow history interface retaining the legacy operation names and stored
 * action shapes while delegating editor-specific replay to an injected port.
 */
export class HistoryService {
  /** @param {{replay: HistoryReplayPort}} dependencies */
  constructor({ replay }) {
    if (!replay || typeof replay.replay !== "function") {
      throw new TypeError("HistoryService requires a replay port");
    }

    this.replayPort = replay;
    this.state = new HistoryState();
    this.enabled = true;
    this.newEntryEnabled = true;
  }

  get history() {
    return this.state.history;
  }

  get historyLength() {
    return this.state.historyLength;
  }

  get historyPosition() {
    return this.state.historyPosition;
  }

  get changes() {
    return this.state.changes;
  }

  get entryName() {
    return this.state.entryName;
  }

  /** @param {boolean} enabled */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  getEnabled() {
    return this.enabled;
  }

  /** @param {boolean} enabled */
  setNewEntryEnabled(enabled) {
    this.newEntryEnabled = enabled;
  }

  /** @param {string} name */
  startEntry(name) {
    if (!this.enabled || !this.newEntryEnabled) return false;
    this.state.startEntry(name);
    return true;
  }

  /** @param {string} actionName @param {Record<string, any>} params */
  addAction(actionName, params) {
    if (!this.enabled) return false;
    this.state.addAction(actionName, params);
    return true;
  }

  endEntry() {
    if (!this.enabled || !this.newEntryEnabled) return false;
    return this.state.endEntry();
  }

  undo() {
    const entry = this.state.takeUndo();
    if (!entry) return false;

    const wasEnabled = this.enabled;
    this.enabled = false;
    try {
      this.replayPort.replay(entry.actions, "undo");
      return true;
    } catch (error) {
      this.state.restoreUndo();
      throw error;
    } finally {
      this.enabled = wasEnabled;
    }
  }

  redo() {
    const entry = this.state.takeRedo();
    if (!entry) return false;

    const wasEnabled = this.enabled;
    this.enabled = false;
    try {
      this.replayPort.replay(entry.actions, "redo");
      return true;
    } catch (error) {
      this.state.restoreRedo();
      throw error;
    } finally {
      this.enabled = wasEnabled;
    }
  }
}
