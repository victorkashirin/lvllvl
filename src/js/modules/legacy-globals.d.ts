import type { FeatureRegistry } from "./application/featureRegistry.mjs";

declare global {
  interface LegacyEditor {
    fileManager?: {
      clearBrowserStorageError(operation?: string): void;
      showBrowserStorageError(operation: string, error: unknown): void;
    };
    clearFeatureError(): void;
    init(options: { features: FeatureRegistry; services: unknown }): void;
    reportFeatureError(feature: string, error: unknown): void;
    reportRemoteProviderError(providerId: string, error: unknown): void;
  }

  interface LegacyBrowserStorage {
    AUTOSAVE_KEY: string;
    PROJECT_DELETE_JOURNAL_KEY: string;
    PROJECT_SAVE_JOURNAL_KEY: string;
    cleanupPreviousVersion(commit: { previousPointer: unknown; versionKey: string }): Promise<void>;
    commitVersioned(key: string, value: unknown, versionKey?: string): Promise<{
      key: string;
      pointer: unknown;
      previousPointer: unknown;
      versionKey: string;
    }>;
    createVersionKey(key: string): string;
    getItem(key: string): Promise<unknown>;
    getVersionedRecord(key: string): Promise<{
      legacy: boolean;
      pointer: unknown;
      value: unknown;
      versionKey: string | null;
    }>;
    isVersionPointer(value: unknown): boolean;
    removeItem(key: string): Promise<unknown>;
    setItem(key: string, value: unknown): Promise<unknown>;
  }

  var BrowserStorage: LegacyBrowserStorage;
  var Editor: new () => LegacyEditor;
  function generateUUID(): string;
  var g_app: LegacyEditor | undefined;
  var g_newSystem: boolean;
}

export {};
