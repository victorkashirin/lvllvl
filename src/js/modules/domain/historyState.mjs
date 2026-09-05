/** @typedef {{name: string, params: Record<string, any>}} HistoryAction */
/** @typedef {{name: string, actions: HistoryAction[]}} HistoryEntry */

/**
 * Owns the legacy history stacks and entry-grouping rules without knowing how
 * editor actions are replayed.
 */
export class HistoryState {
  constructor() {
    /** @type {HistoryEntry[]} */
    this.history = [];
    this.historyLength = 0;
    this.historyPosition = 0;
    /** @type {HistoryAction[]} */
    this.changes = [];
    this.entryName = "";
  }

  /** @param {string} name */
  startEntry(name) {
    this.endEntry();
    this.changes = [];
    this.entryName = name;
  }

  /** @param {string} actionName @param {Record<string, any>} params */
  addAction(actionName, params) {
    if (actionName === "setCell" || actionName === "setCell3d") {
      for (let index = this.changes.length - 1; index >= 0; index--) {
        const previous = this.changes[index];
        if (
          previous.name === actionName &&
          previous.params.x === params.x &&
          previous.params.y === params.y &&
          previous.params.z === params.z &&
          previous.params.frame === params.frame
        ) {
          params.layerRef = previous.params.layerRef;
          params.oldCharacter = previous.params.oldCharacter;
          params.oldColor = previous.params.oldColor;
          params.oldBgColor = previous.params.oldBgColor;
          params.oldRotX = previous.params.oldRotX;
          params.oldRotY = previous.params.oldRotY;
          params.oldRotZ = previous.params.oldRotZ;
          this.changes.splice(index, 1);
        }
      }
    }

    this.changes.push({ name: actionName, params });
  }

  /** @returns {boolean} */
  endEntry() {
    if (this.changes.length === 0) return false;

    this.history[this.historyPosition] = {
      name: this.entryName,
      actions: this.changes,
    };
    this.historyPosition++;
    this.historyLength = this.historyPosition;
    this.history.length = this.historyLength;
    this.changes = [];
    return true;
  }

  /** @returns {HistoryEntry | null} */
  takeUndo() {
    if (this.historyPosition <= 0) return null;
    this.historyPosition--;
    return this.history[this.historyPosition] ?? null;
  }

  restoreUndo() {
    this.historyPosition++;
  }

  /** @returns {HistoryEntry | null} */
  takeRedo() {
    if (this.historyPosition >= this.historyLength) return null;
    const entry = this.history[this.historyPosition] ?? null;
    this.historyPosition++;
    return entry;
  }

  restoreRedo() {
    this.historyPosition--;
  }
}
