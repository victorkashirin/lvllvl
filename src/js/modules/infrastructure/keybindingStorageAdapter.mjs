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
  return Object.freeze({
    load() {
      if (!storage) return null;
      try { return storage.getItem(key); } catch { return null; }
    },
    /** @param {string} raw @param {string} reason */
    quarantine(raw, reason) {
      if (!storage) return;
      const quarantineKey = `${key}.invalid.${now()}`;
      storage.setItem(quarantineKey, JSON.stringify({ raw, reason }));
      storage.removeItem(key);
    },
    /** @param {string} value */
    save(value) {
      if (!storage) return;
      storage.setItem(key, value);
    },
  });
}
