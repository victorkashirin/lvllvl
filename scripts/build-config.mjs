export const sourceDirectory = "src";
export const buildDirectory = "dist";

// Release source maps ship beside the production bundle. They include the
// original first-party sources so deployed stack traces remain actionable.
export const sourceMapPolicy = {
  includeSources: true,
  publish: true,
};

export const assetDirectories = [
  "palettes",
  "charsets",
  "vectorsets",
  "icons",
  "css",
  "cursors",
  "fonts",
  "images",
  "docs",
  "c64page",
  "c64",
];

// Keep public URLs stable while sourcing compatible third-party files from
// exact npm packages. Each migration can move one library without forcing the
// legacy application to adopt modules at the same time.
export const packageAssetFiles = {
  "lib/dompurify/purify.min.js": "node_modules/dompurify/dist/purify.min.js",
  "lib/dompurify/purify.min.js.map":
    "node_modules/dompurify/dist/purify.min.js.map",
  "lib/ace/src/ace.js": "node_modules/ace-builds/src/ace.js",
  "lib/ace/src/ext-language_tools.js":
    "node_modules/ace-builds/src/ext-language_tools.js",
  "lib/ace/src/mode-json.js": "node_modules/ace-builds/src/mode-json.js",
  "lib/ace/src/mode-text.js": "node_modules/ace-builds/src/mode-text.js",
  "lib/ace/src/theme-chrome.js": "node_modules/ace-builds/src/theme-chrome.js",
  "lib/ace/src/theme-tomorrow_night.js":
    "node_modules/ace-builds/src/theme-tomorrow_night.js",
  "lib/ace/src/worker-javascript.js":
    "node_modules/ace-builds/src/worker-javascript.js",
  "lib/ace/src/worker-json.js": "node_modules/ace-builds/src/worker-json.js",
  "lib/babel/babel.min.js": "node_modules/babel-standalone/babel.min.js",
  "lib/chroma/chroma.min.js": "node_modules/chroma-js/chroma.min.js",
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
  "lib/download/download.js": "node_modules/downloadjs/download.js",
  "lib/gif/gif.js": "node_modules/gif.js/dist/gif.js",
  "lib/gif/gif.worker.js": "node_modules/gif.js/dist/gif.worker.js",
  "lib/hammer/hammer.min.js": "node_modules/hammerjs/hammer.min.js",
  "lib/jquery/jquery.min.js": "node_modules/jquery/dist/jquery.min.js",
  "lib/jquery/jquery.mousewheel.min.13.js":
    "node_modules/jquery-mousewheel/jquery.mousewheel.js",
  "lib/jsfeat/jsfeat-min.js": "node_modules/jsfeat/build/jsfeat-min.js",
  "lib/jshint/jshint.js": "node_modules/jshint/dist/jshint.js",
  "lib/jszip/jszip-utils.js": "node_modules/jszip-utils/dist/jszip-utils.js",
  "lib/jszip/jszip.min.js": "node_modules/jszip/dist/jszip.min.js",
  "lib/localForage/localforage.nopromises.min.js":
    "node_modules/localforage/dist/localforage.nopromises.min.js",
  "lib/perfect-scrollbar/perfect-scrollbar.css":
    "node_modules/perfect-scrollbar/css/perfect-scrollbar.css",
  "lib/perfect-scrollbar/perfect-scrollbar.min.js":
    "node_modules/perfect-scrollbar/dist/perfect-scrollbar.min.js",
  "lib/rgbQuant/rgbQuant.js": "node_modules/rgbquant/src/rgbquant.js",
  "lib/threejs/controls/OrbitControls.js":
    "node_modules/three/examples/js/controls/OrbitControls.js",
  "lib/threejs/exporters/GLTFExporter.js":
    "node_modules/three/examples/js/exporters/GLTFExporter.js",
  "lib/threejs/exporters/OBJExporter.js":
    "node_modules/three/examples/js/exporters/OBJExporter.js",
  "lib/threejs/postprocessing/BloomPass.js":
    "node_modules/three/examples/js/postprocessing/BloomPass.js",
  "lib/threejs/postprocessing/DotScreenPass.js":
    "node_modules/three/examples/js/postprocessing/DotScreenPass.js",
  "lib/threejs/postprocessing/EffectComposer.js":
    "node_modules/three/examples/js/postprocessing/EffectComposer.js",
  "lib/threejs/postprocessing/FilmPass.js":
    "node_modules/three/examples/js/postprocessing/FilmPass.js",
  "lib/threejs/postprocessing/GlitchPass.js":
    "node_modules/three/examples/js/postprocessing/GlitchPass.js",
  "lib/threejs/postprocessing/MaskPass.js":
    "node_modules/three/examples/js/postprocessing/MaskPass.js",
  "lib/threejs/postprocessing/RenderPass.js":
    "node_modules/three/examples/js/postprocessing/RenderPass.js",
  "lib/threejs/postprocessing/ShaderPass.js":
    "node_modules/three/examples/js/postprocessing/ShaderPass.js",
  "lib/threejs/postprocessing/TexturePass.js":
    "node_modules/three/examples/js/postprocessing/TexturePass.js",
  "lib/threejs/postprocessing/UnrealBloomPass.js":
    "node_modules/three/examples/js/postprocessing/UnrealBloomPass.js",
  "lib/threejs/shaders/BleachBypassShader.js":
    "node_modules/three/examples/js/shaders/BleachBypassShader.js",
  "lib/threejs/shaders/BrightnessContrastShader.js":
    "node_modules/three/examples/js/shaders/BrightnessContrastShader.js",
  "lib/threejs/shaders/ColorifyShader.js":
    "node_modules/three/examples/js/shaders/ColorifyShader.js",
  "lib/threejs/shaders/ConvolutionShader.js":
    "node_modules/three/examples/js/shaders/ConvolutionShader.js",
  "lib/threejs/shaders/CopyShader.js":
    "node_modules/three/examples/js/shaders/CopyShader.js",
  "lib/threejs/shaders/DigitalGlitch.js":
    "node_modules/three/examples/js/shaders/DigitalGlitch.js",
  "lib/threejs/shaders/DotScreenShader.js":
    "node_modules/three/examples/js/shaders/DotScreenShader.js",
  "lib/threejs/shaders/FilmShader.js":
    "node_modules/three/examples/js/shaders/FilmShader.js",
  "lib/threejs/shaders/FocusShader.js":
    "node_modules/three/examples/js/shaders/FocusShader.js",
  "lib/threejs/shaders/HorizontalBlurShader.js":
    "node_modules/three/examples/js/shaders/HorizontalBlurShader.js",
  "lib/threejs/shaders/HueSaturationShader.js":
    "node_modules/three/examples/js/shaders/HueSaturationShader.js",
  "lib/threejs/shaders/KaleidoShader.js":
    "node_modules/three/examples/js/shaders/KaleidoShader.js",
  "lib/threejs/shaders/LuminosityHighPassShader.js":
    "node_modules/three/examples/js/shaders/LuminosityHighPassShader.js",
  "lib/threejs/shaders/RGBShiftShader.js":
    "node_modules/three/examples/js/shaders/RGBShiftShader.js",
  "lib/threejs/shaders/SepiaShader.js":
    "node_modules/three/examples/js/shaders/SepiaShader.js",
  "lib/threejs/shaders/TechnicolorShader.js":
    "node_modules/three/examples/js/shaders/TechnicolorShader.js",
  "lib/threejs/shaders/VerticalBlurShader.js":
    "node_modules/three/examples/js/shaders/VerticalBlurShader.js",
  "lib/threejs/shaders/VignetteShader.js":
    "node_modules/three/examples/js/shaders/VignetteShader.js",
  "lib/threejs/three.min.js": "node_modules/three/build/three.min.js",
  "lib/threejs/utils/BufferGeometryUtils.js":
    "node_modules/three/examples/js/utils/BufferGeometryUtils.js",
  "lib/threejs/stats.min.js": "node_modules/stats.js/build/stats.min.js",
  "lib/tween/tween.min.js": "node_modules/tween.js/src/Tween.js",
};

const gifWorkerAnalysisResult =
  "this.pixels=null,this.colorDepth=8,this.palSize=7," +
  "this.transparent!==null&&(this.transIndex=this.findClosest(this.transparent))";
const gifWorkerAlphaAwareAnalysisResult =
  "this.pixels=null,this.colorDepth=8,this.palSize=7," +
  "this.transparent!==null&&this.reserveTransparentPaletteEntry()";
const gifWorkerFindClosestPrefix = "},b.prototype.findClosest=function(e){";

function addAlphaAwareGifTransparency(source) {
  if (source.split(gifWorkerAnalysisResult).length !== 2) {
    throw new Error("gif.js worker transparency patch no longer matches analyzePixels");
  }
  if (source.split(gifWorkerFindClosestPrefix).length !== 2) {
    throw new Error("gif.js worker transparency patch no longer matches findClosest");
  }

  const reserveTransparentPaletteEntry = `},b.prototype.reserveTransparentPaletteEntry=function(){
    var image=this.image,indexed=this.indexedPixels,palette=this.colorTab;
    var opaqueUseCount=new Uint32Array(256),reservedIndex=0;
    var pixel,index,paletteOffset,red,green,blue,closestIndex,closestDistance,distance;
    var deltaRed,deltaGreen,deltaBlue;
    for(pixel=0;pixel<indexed.length;pixel++){
      if(image[pixel*4+3]>=128)opaqueUseCount[indexed[pixel]]++;
    }
    for(index=1;index<256;index++){
      if(opaqueUseCount[index]<opaqueUseCount[reservedIndex])reservedIndex=index;
    }
    for(pixel=0;pixel<indexed.length;pixel++){
      if(image[pixel*4+3]<128){
        indexed[pixel]=reservedIndex;
      }else if(indexed[pixel]===reservedIndex){
        red=image[pixel*4];green=image[pixel*4+1];blue=image[pixel*4+2];
        closestIndex=reservedIndex===0?1:0;closestDistance=Infinity;
        for(index=0;index<256;index++){
          if(index===reservedIndex)continue;
          paletteOffset=index*3;
          deltaRed=red-(palette[paletteOffset]&255);
          deltaGreen=green-(palette[paletteOffset+1]&255);
          deltaBlue=blue-(palette[paletteOffset+2]&255);
          distance=deltaRed*deltaRed+deltaGreen*deltaGreen+deltaBlue*deltaBlue;
          if(distance<closestDistance){closestDistance=distance;closestIndex=index;}
        }
        indexed[pixel]=closestIndex;this.usedEntry[closestIndex]=true;
      }
    }
    this.transIndex=reservedIndex;this.usedEntry[reservedIndex]=true;
  },b.prototype.findClosest=function(e){`;

  return source
    .replace(gifWorkerAnalysisResult, gifWorkerAlphaAwareAnalysisResult)
    .replace(gifWorkerFindClosestPrefix, reserveTransparentPaletteEntry)
    .replace("\n//# sourceMappingURL=gif.worker.js.map", "");
}

// gif.js otherwise identifies transparency only by an RGB key after
// quantization. Preserve the source alpha mask and reserve a palette entry so
// an opaque color can never be quantized to the transparent index.
export const packageAssetTransforms = Object.freeze({
  "lib/gif/gif.worker.js": addAlphaAwareGifTransparency,
});

// Some published package maps omit sourcesContent and reference files that are
// not otherwise part of the application build. Embed those package sources so
// browsers and development servers can consume the maps without filesystem
// warnings.
export const packageSourceMapsWithEmbeddedSources = [
  "lib/dompurify/purify.min.js.map",
];

// Files requested after the initial page load must be listed here. Unlike the
// scripts and styles referenced by src/index.html, these files are not included
// in a generated bundle and therefore need to be copied verbatim.
export const runtimeAssetFiles = [
  "music-scripting-sandbox.html",
  "js/musicScriptingSandbox.js",
  "lib/dompurify/purify.min.js",
  "lib/dompurify/purify.min.js.map",
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
// copied by runtimeAssetFiles; entries under c64/, css/, and docs/ are supplied
// by the public asset directories above.
export const runtimeFeatureRequests = {
  helpDocumentation: [
    "docs/api.html",
    "docs/common-action-shortcuts.html",
    "docs/keyboard-shortcuts.html",
  ],
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
  imageImport: ["js/features/image-import.js"],
  mobileStyles: ["css/ui-mobile.css"],
  musicScripting: [
    "lib/codemirror/addon/dialog/dialog.js",
    "lib/codemirror/addon/scroll/simplescrollbars.js",
    "lib/codemirror/addon/search/search.js",
    "lib/codemirror/addon/search/searchcursor.js",
    "lib/codemirror/codemirror.js",
    "lib/codemirror/mode/javascript/javascript.js",
    "lib/jshint/jshint.js",
    "music-scripting-sandbox.html",
    "js/musicScriptingSandbox.js",
  ],
  securityPolicy: [
    "lib/dompurify/purify.min.js",
    "lib/dompurify/purify.min.js.map",
  ],
};
