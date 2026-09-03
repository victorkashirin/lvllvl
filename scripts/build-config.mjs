export const sourceDirectory = "src";
export const buildDirectory = "dist";
export const version = "0.496";

export const mainBundleExcludes = [
  "js/c64/wasm/c64.js",
  "js/nes/wasm/nes.js",
  "js/nes/nes.js",
  "js/c64/c64.js",
  "acmeAssembler",
  "ca65Assembler",
  "storageManager.js",
  "githubClient.js",
];

export const variableReplacements = [
  "vibDelay",
  "vibSpeed",
  "vibDepth",
  "commandData",
  "newCommand",
  "wavetablePosition",
  "pulsetablePosition",
  "speedLeft",
  "speedRight",
  "newCommandData",
  "newSpeedLeft",
  "newSpeedRight",
  "filtertablePosition",
  "filterType",
  "filterCutoff",
  "filterControl",
  "masterFader",
  "funktable",
  "freqtbllo",
  "freqtblhi",
  "lastnote",
  "vibTime",
  "sidMemory",
  "waveTime",
  "pulseTime",
  "trackPosition",
  "newCommandData2",
  "instrumentDuration",
  "hardRestartADSR",
  "SIDAddr",
];

export const assetDirectories = [
  "palettes",
  "charsets",
  "vectorsets",
  "icons",
  "css",
  "cursors",
  "fonts",
  "images",
  "c64page",
  "c64",
];
