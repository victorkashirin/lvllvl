import type { FeatureRegistry } from "./application/featureRegistry.mjs";

declare global {
  interface LegacyEditor {
    clearFeatureError(): void;
    init(options: { features: FeatureRegistry }): void;
    reportFeatureError(feature: string, error: unknown): void;
  }

  var Editor: new () => LegacyEditor;
  var g_app: LegacyEditor | undefined;
}

export {};
