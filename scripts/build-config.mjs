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
  "githubApi.js",
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

// Keep public URLs stable while sourcing compatible third-party files from
// exact npm packages. Each migration can move one library without forcing the
// legacy application to adopt modules at the same time.
export const packageAssetFiles = {
  "lib/codemirror/addon/dialog/dialog.css":
    "node_modules/codemirror/addon/dialog/dialog.css",
  "lib/codemirror/addon/dialog/dialog.js":
    "node_modules/codemirror/addon/dialog/dialog.js",
  "lib/codemirror/addon/scroll/simplescrollbars.css":
    "node_modules/codemirror/addon/scroll/simplescrollbars.css",
  "lib/codemirror/addon/scroll/simplescrollbars.js":
    "node_modules/codemirror/addon/scroll/simplescrollbars.js",
  "lib/codemirror/addon/search/search.js":
    "node_modules/codemirror/addon/search/search.js",
  "lib/codemirror/addon/search/searchcursor.js":
    "node_modules/codemirror/addon/search/searchcursor.js",
  "lib/codemirror/codemirror.css": "node_modules/codemirror/lib/codemirror.css",
  "lib/codemirror/codemirror.js": "node_modules/codemirror/lib/codemirror.js",
  "lib/codemirror/mode/javascript/javascript.js":
    "node_modules/codemirror/mode/javascript/javascript.js",
  "lib/jquery/jquery.min.js": "node_modules/jquery/dist/jquery.min.js",
  "lib/jszip/jszip.min.js": "node_modules/jszip/dist/jszip.min.js",
  "lib/perfect-scrollbar/perfect-scrollbar.css":
    "node_modules/perfect-scrollbar/css/perfect-scrollbar.css",
  "lib/perfect-scrollbar/perfect-scrollbar.min.js":
    "node_modules/perfect-scrollbar/dist/perfect-scrollbar.min.js",
};

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
  "lib/google-api/api.js",
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
  googleDrive: ["lib/google-api/api.js"],
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
