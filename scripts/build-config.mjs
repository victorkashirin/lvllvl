export const sourceDirectory = "src";
export const buildDirectory = "dist";
export const version = "0.496.1";

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

// Files requested after the initial page load must be listed here. Unlike the
// scripts and styles referenced by src/index.html, these files are not included
// in a generated bundle and therefore need to be copied verbatim.
export const runtimeAssetFiles = [
  "lib/ace/src/theme-chrome.js",
  "lib/ace/src/theme-tomorrow_night.js",
  "lib/ace/src/worker-javascript.js",
  "lib/ace/src/worker-json.js",
  "lib/ca65/ca65.js",
  "lib/ca65/ca65.wasm",
  "lib/ca65/ld65.js",
  "lib/ca65/ld65.wasm",
  "lib/codemirror/addon/dialog/dialog.js",
  "lib/codemirror/addon/scroll/simplescrollbars.js",
  "lib/codemirror/addon/search/search.js",
  "lib/codemirror/addon/search/searchcursor.js",
  "lib/codemirror/codemirror.js",
  "lib/codemirror/mode/javascript/javascript.js",
  "lib/gif/gif.worker.js",
  "lib/jshint/jshint.js",
];

// This is the reviewed closure of feature-specific requests. Some entries are
// copied by runtimeAssetFiles; entries under c64/ and css/ are supplied by the
// public asset directories above.
export const runtimeFeatureRequests = {
  aceEditor: [
    "lib/ace/src/theme-chrome.js",
    "lib/ace/src/theme-tomorrow_night.js",
    "lib/ace/src/worker-javascript.js",
    "lib/ace/src/worker-json.js",
  ],
  acmeAssembler: [
    "c64/acme097/acmeAssemblerWorker.js",
    "c64/acme097/acme.js",
    "c64/acme097/acme.wasm",
  ],
  c64Emulator: [
    "c64/c64/c64.js",
    "c64/c64/c64.wasm",
    "c64page/js/c64.min.js",
    "c64page/js/c64.wasm",
  ],
  ca65Assembler: [
    "lib/ca65/ca65.js",
    "lib/ca65/ca65.wasm",
    "lib/ca65/ld65.js",
    "lib/ca65/ld65.wasm",
  ],
  exomizer: [
    "c64/exomizer/exomizerWorker.js",
    "c64/exomizer/exomizer.js",
  ],
  gifExport: ["lib/gif/gif.worker.js"],
  mobileStyles: ["css/ui-mobile.css"],
  musicScripting: [
    "lib/codemirror/addon/dialog/dialog.js",
    "lib/codemirror/addon/scroll/simplescrollbars.js",
    "lib/codemirror/addon/search/search.js",
    "lib/codemirror/addon/search/searchcursor.js",
    "lib/codemirror/codemirror.js",
    "lib/codemirror/mode/javascript/javascript.js",
    "lib/jshint/jshint.js",
  ],
};
