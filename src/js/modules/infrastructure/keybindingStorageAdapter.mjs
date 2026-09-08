/**
 * Keep browser-local shortcut preferences behind a small synchronous port so
 * the application can resolve bindings before the legacy UI is constructed.
 *
 * @param {{getItem: (key: string) => string | null, removeItem: (key: string) => void, setItem: (key: string, value: string) => void} | null | undefined} storage
 * @param {{key?: string, now?: () => number}} [options]
 */
export function createKeybindingStorageAdapter(storage, options = {}) {
  const key = options.key || "lvllvl.keyboardShortcuts";
  const now = options.now || (() => Date.now());
  const loadFresh = () => storage ? storage.getItem(key) : null;
  return Object.freeze({
    key,
    load() {
      try { return loadFresh(); } catch { return null; }
    },
    loadFresh,
    /** @param {string} raw @param {string} reason */
    quarantine(raw, reason) {
      if (!storage) return;
      const quarantineKey = `${key}.invalid.${now()}`;
      /** @type {unknown} */
      let archiveError = null;
      try {
        storage.setItem(quarantineKey, JSON.stringify({ raw, reason }));
      } catch (error) {
        archiveError = error;
      }
      try {
        storage.removeItem(key);
      } catch (removeError) {
        if (archiveError) {
          throw Object.assign(
            new Error("Could not archive or remove invalid keyboard shortcuts."),
            { archiveError, removeError },
          );
        }
        throw removeError;
      }
      if (archiveError) throw archiveError;
    },
    /** @param {string} value */
    save(value) {
      if (!storage) return false;
      storage.setItem(key, value);
      return true;
    },
  });
}
