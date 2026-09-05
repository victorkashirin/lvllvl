/** @typedef {{path: string, revision: number}} DirtyRecord */

/**
 * Mutable document-session state with revision-checked publication. It has no
 * knowledge of storage, UI, or the legacy application host.
 */
export class DocumentRevisionState {
  constructor() {
    /** @type {string | null} */
    this.activeRevision = null;
    /** @type {Record<string, DirtyRecord>} */
    this.modified = {};
    this.modifiedRevision = 0;
  }

  /** @param {string | null} revision */
  open(revision) {
    this.activeRevision = revision;
    this.modified = {};
    this.modifiedRevision = 0;
  }

  /**
   * Adopt the legacy Document fields at the migration boundary.
   * @param {Record<string, DirtyRecord>} modified
   * @param {number} revision
   */
  adopt(modified, revision) {
    this.modified = modified;
    this.modifiedRevision = revision;
  }

  /** @param {string | number} id @param {string} path */
  markModified(id, path) {
    this.modifiedRevision++;
    this.modified[String(id)] = { path, revision: this.modifiedRevision };
    return this.modifiedRevision;
  }

  /** @returns {Record<string, DirtyRecord>} */
  snapshot() {
    /** @type {Record<string, DirtyRecord>} */
    const snapshot = {};
    for (const id of Object.keys(this.modified)) {
      snapshot[id] = { revision: this.modified[id].revision, path: this.modified[id].path };
    }
    return snapshot;
  }

  /** @param {Array<{id: string | number, revision: number}>} savedRevisions */
  publish(savedRevisions) {
    for (const saved of savedRevisions) {
      const id = String(saved.id);
      if (this.modified[id]?.revision === saved.revision) delete this.modified[id];
    }
  }
}
