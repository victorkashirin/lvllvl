/**
 * @typedef {object} LegacyBrowserStorage
 * @property {string} AUTOSAVE_KEY
 * @property {string} PROJECT_DELETE_JOURNAL_KEY
 * @property {string} PROJECT_SAVE_JOURNAL_KEY
 * @property {(key: string) => string} createVersionKey
 * @property {(key: string) => Promise<unknown>} getItem
 * @property {(value: unknown) => boolean} isVersionPointer
 * @property {(key: string) => Promise<{legacy: boolean, pointer: unknown, value: unknown, versionKey: string | null}>} getVersionedRecord
 * @property {(key: string, value: unknown, versionKey?: string) => Promise<{key: string, pointer: unknown, previousPointer: unknown, versionKey: string}>} commitVersioned
 * @property {(commit: {previousPointer: unknown, versionKey: string}) => Promise<void>} cleanupPreviousVersion
 * @property {(key: string) => Promise<unknown>} removeItem
 * @property {(key: string, value: unknown) => Promise<unknown>} setItem
 */

/**
 * @typedef {object} PersistenceStoragePort
 * @property {string} autosaveKey
 * @property {string} projectDeleteJournalKey
 * @property {string} projectSaveJournalKey
 * @property {(key: string) => string} createVersionKey
 * @property {(key: string) => Promise<unknown>} get
 * @property {(value: unknown) => boolean} isVersionPointer
 * @property {(key: string) => Promise<{legacy: boolean, pointer: unknown, value: unknown, versionKey: string | null}>} readVersioned
 * @property {(key: string, value: unknown, versionKey?: string) => Promise<{key: string, pointer: unknown, previousPointer: unknown, versionKey: string}>} commitVersioned
 * @property {(commit: {previousPointer: unknown, versionKey: string}) => Promise<void>} cleanupPreviousVersion
 * @property {(key: string) => Promise<unknown>} remove
 * @property {(key: string, value: unknown) => Promise<unknown>} set
 */

/**
 * Keep the legacy localForage wrapper at the infrastructure boundary while the
 * application layer works only with an injected persistence port.
 *
 * @param {LegacyBrowserStorage} legacyStorage
 * @returns {PersistenceStoragePort}
 */
export function createBrowserStorageAdapter(legacyStorage) {
  if (
    !legacyStorage ||
    typeof legacyStorage.getItem !== "function" ||
    typeof legacyStorage.setItem !== "function" ||
    typeof legacyStorage.removeItem !== "function" ||
    typeof legacyStorage.getVersionedRecord !== "function" ||
    typeof legacyStorage.commitVersioned !== "function" ||
    typeof legacyStorage.cleanupPreviousVersion !== "function" ||
    typeof legacyStorage.createVersionKey !== "function" ||
    typeof legacyStorage.isVersionPointer !== "function"
  ) {
    throw new TypeError("A complete browser-storage implementation is required");
  }

  return Object.freeze({
    autosaveKey: legacyStorage.AUTOSAVE_KEY,
    projectDeleteJournalKey: legacyStorage.PROJECT_DELETE_JOURNAL_KEY,
    projectSaveJournalKey: legacyStorage.PROJECT_SAVE_JOURNAL_KEY,
    createVersionKey: (key) => legacyStorage.createVersionKey(key),
    get: (key) => legacyStorage.getItem(key),
    isVersionPointer: (value) => legacyStorage.isVersionPointer(value),
    readVersioned: (key) => legacyStorage.getVersionedRecord(key),
    commitVersioned: (key, value, versionKey) =>
      legacyStorage.commitVersioned(key, value, versionKey),
    cleanupPreviousVersion: (commit) => legacyStorage.cleanupPreviousVersion(commit),
    remove: (key) => legacyStorage.removeItem(key),
    set: (key, value) => legacyStorage.setItem(key, value),
  });
}
