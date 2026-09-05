import { DocumentRevisionState } from "../domain/documentRevisionState.mjs";

/**
 * @typedef {object} DocumentPersistence
 * @property {(request: object) => Promise<{projectId: string, manifest: unknown[], savedRevisions: Array<{id: string | number, revision: number}>, versionKey: string}>} saveDocument
 */

/**
 * @typedef {object} DocumentSessionDependencies
 * @property {DocumentPersistence} persistence
 * @property {() => number} clock
 * @property {() => string} createId
 * @property {(operation: string, error: unknown) => void} reportError
 * @property {(operation: string) => void} clearError
 */

export class DocumentSession {
  /** @param {DocumentSessionDependencies} dependencies */
  constructor({
    persistence,
    clock,
    createId,
    reportError = () => {},
    clearError = () => {},
  }) {
    if (!persistence || typeof persistence.saveDocument !== "function") {
      throw new TypeError("DocumentSession requires a persistence service");
    }
    if (typeof clock !== "function" || typeof createId !== "function") {
      throw new TypeError("DocumentSession requires clock and identifier providers");
    }

    this.persistence = persistence;
    this.clock = clock;
    this.createId = createId;
    this.reportError = reportError;
    this.clearError = clearError;
    this.revisions = new DocumentRevisionState();
    this.saveInFlight = false;
    this.saveStartedAt = 0;
  }

  get activeRevision() {
    return this.revisions.activeRevision;
  }

  get modified() {
    return this.revisions.modified;
  }

  get modifiedRevision() {
    return this.revisions.modifiedRevision;
  }

  /** @param {string | null} revision */
  open(revision) {
    this.revisions.open(revision);
  }

  /** @param {Record<string, {path: string, revision: number}>} modified @param {number} revision */
  adoptLegacyState(modified, revision) {
    this.revisions.adopt(modified, revision);
  }

  /** @param {string | number} id @param {string} path */
  markModified(id, path) {
    return this.revisions.markModified(id, path);
  }

  /** @param {string | number} id @param {number} [revision] */
  markSaved(id, revision) {
    const record = this.revisions.modified[String(id)];
    if (record && (revision == null || record.revision === revision)) {
      delete this.revisions.modified[String(id)];
    }
  }

  /**
   * Serialize and snapshot dirty revisions synchronously, then publish only
   * after blobs, manifest, pointer, catalog, and cleanup have all completed.
   *
   * @param {{
   *   projectDetails: object,
   *   serialize: () => unknown[],
   *   pendingProjectId?: string | null,
   *   onProjectIdentified?: (projectId: string) => void,
   *   onPublished?: (result: {projectId: string, manifest: unknown[], versionKey: string}) => void
   * }} request
   */
  save(request) {
    if (this.saveInFlight) {
      return Promise.resolve({
        success: false,
        error: new Error("A browser-storage save is already in progress."),
      });
    }

    this.saveInFlight = true;
    this.saveStartedAt = this.clock();

    /** @type {unknown[]} */
    let files;
    try {
      files = request.serialize();
    } catch (error) {
      this.saveInFlight = false;
      this.reportError("Save", error);
      return Promise.resolve({ success: false, error });
    }

    const modifiedSnapshot = this.revisions.snapshot();
    return this.persistence.saveDocument({
      files,
      modifiedSnapshot,
      onProjectIdentified: request.onProjectIdentified,
      pendingProjectId: request.pendingProjectId,
      projectDetails: request.projectDetails,
    }).then((result) => {
      this.revisions.activeRevision = result.versionKey;
      this.revisions.publish(result.savedRevisions);
      try {
        request.onPublished?.(result);
        this.clearError("Save");
      } catch (error) {
        // Persistence has already committed. A compatibility-view update must
        // not turn that durable success into a retryable storage failure.
        this.reportError("Publishing saved document", error);
      }
      return { ...result, duration: this.clock() - this.saveStartedAt, success: true };
    }).catch((error) => {
      this.reportError("Save", error);
      return { success: false, error };
    }).finally(() => {
      this.saveInFlight = false;
    });
  }
}
