# Third-party notices

This file is generated from `docs/runtime-dependencies.json` by
`npm run dependencies:update`. It inventories code loaded by the production
application from `src/lib` or an external production URL; it is not a substitute
for the upstream license texts.

Last reviewed: 2026-09-03

| Component | Version | License | Delivery | Audit identity | Modification | Purpose | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ace | 1.4.5 | BSD-3-Clause | vendored | pkg:npm/ace-builds@1.4.5 | modified | Code editor, language modes, themes, and syntax workers. | [upstream](https://github.com/ajaxorg/ace) |
| Babel Standalone | 6.26.0 | MIT | vendored | pkg:npm/babel-standalone@6.26.0 | unverified | Compiles user scripts in the browser. | [upstream](https://github.com/babel/babel-standalone) |
| cc65 WebAssembly builds | unknown | Zlib | vendored | exempt until 2027-09-03 | modified | Provides the CA65 assembler and LD65 linker runtimes. | [upstream](https://github.com/cc65/cc65) |
| chroma.js | 2.1.0 | BSD-3-Clause | vendored | pkg:npm/chroma-js@2.1.0 | unverified | Color conversion and interpolation. | [upstream](https://github.com/gka/chroma.js) |
| CodeMirror | 5.65.21 | MIT | npm: codemirror | pkg:npm/codemirror@5.65.21 | unmodified | Music scripting editor and search UI. | [upstream](https://github.com/codemirror/codemirror5) |
| Colour | unknown | NOASSERTION | vendored | exempt until 2027-09-03 | unverified | Legacy color-space conversion helpers. | NOASSERTION |
| download.js | unknown | MIT | vendored | exempt until 2027-09-03 | unverified | Starts client-side file downloads. | [upstream](https://github.com/rndme/download) |
| gif.js | 0.1.6 | MIT | vendored | pkg:npm/gif.js@0.1.6 | unverified | Encodes animated GIF exports in a worker. | [upstream](https://github.com/jnordberg/gif.js) |
| Hammer.js | 2.0.8 | MIT | vendored | pkg:npm/hammerjs@2.0.8 | unverified | Normalizes touch gestures. | [upstream](https://github.com/hammerjs/hammer.js) |
| jQuery | 3.7.1 | MIT | npm: jquery | pkg:npm/jquery@3.7.1 | unmodified | Legacy DOM, event, and Ajax API. | [upstream](https://github.com/jquery/jquery) |
| jQuery Mouse Wheel | 3.1.13 | MIT | vendored | pkg:npm/jquery-mousewheel@3.1.13 | unmodified | Normalizes mouse-wheel events for legacy UI controls. | [upstream](https://github.com/jquery/jquery-mousewheel) |
| jsfeat | alpha | MIT | vendored | exempt until 2027-09-03 | unverified | Computer-vision routines used by image import. | [upstream](https://github.com/inspirit/jsfeat) |
| JSHint | 2.9.4 | MIT AND JSON | vendored | pkg:npm/jshint@2.9.4 | unmodified | Lints user-authored music scripts. | [upstream](https://github.com/jshint/jshint) |
| JS-Interpreter with Acorn | unknown | Apache-2.0 | vendored | exempt until 2027-09-03 | modified | Runs user scripts in an interpreter. | [upstream](https://github.com/NeilFraser/JS-Interpreter) |
| JSManipulate | 1.0 | MIT | vendored | exempt until 2027-09-03 | unverified | Applies image filters and effects. | [upstream](https://github.com/JoelBesada/JSManipulate) |
| JSZip | 3.10.1 | MIT OR GPL-3.0-or-later | npm: jszip | pkg:npm/jszip@3.10.1 | unmodified | Reads and writes project and export ZIP archives. | [upstream](https://github.com/Stuk/jszip) |
| JSZipUtils | unknown | MIT OR GPL-3.0-only | vendored | exempt until 2027-09-03 | unverified | Loads binary inputs for JSZip. | [upstream](https://github.com/Stuk/jszip-utils) |
| localForage no-Promise build | 1.7.3 | Apache-2.0 | vendored | pkg:npm/localforage@1.7.3 | unmodified | Persists projects and autosaves in browser storage. | [upstream](https://github.com/localForage/localForage) |
| Modernizr custom build | 3.6.0 | MIT | vendored | pkg:npm/modernizr@3.6.0 | modified | Detects CSS scrollbar support. | [upstream](https://github.com/Modernizr/Modernizr) |
| Perfect Scrollbar | 1.4.0 | MIT | npm: perfect-scrollbar | pkg:npm/perfect-scrollbar@1.4.0 | unmodified | Provides styled scrollbars for application panels. | [upstream](https://github.com/mdbootstrap/perfect-scrollbar) |
| RgbQuant.js | unknown | MIT | vendored | exempt until 2027-09-03 | unverified | Quantizes imported and exported image colors. | [upstream](https://github.com/leeoniya/RgbQuant.js) |
| rippleJS | unknown | Apache-2.0 | vendored | exempt until 2027-09-03 | unverified | Adds material-style pointer feedback. | [upstream](https://github.com/samthor/rippleJS) |
| three.js and examples | 0.129.0 | MIT | vendored | pkg:npm/three@0.129.0 | unverified | Renders 3D scenes, exports models, and supplies post-processing effects. | [upstream](https://github.com/mrdoob/three.js) |
| stats.js | unknown | MIT | vendored | exempt until 2027-09-03 | unverified | Displays optional rendering performance statistics. | [upstream](https://github.com/mrdoob/stats.js) |
| Tuna | unknown | MIT | vendored | exempt until 2027-09-03 | unverified | Provides Web Audio effects for the music editor. | [upstream](https://github.com/Theodeus/tuna) |
| tween.js | 11dev | MIT | vendored | exempt until 2027-09-03 | unverified | Animates 3D editor transitions. | [upstream](https://github.com/tweenjs/tween.js) |
| Typr.js | unknown | MIT | vendored | exempt until 2027-09-03 | unverified | Parses font files and extracts glyph outlines. | [upstream](https://github.com/photopea/Typr.js) |
| Firebase JavaScript SDK | 10.9.0 | Apache-2.0 | external | pkg:npm/firebase@10.9.0 | unmodified | Production authentication and Firestore client. | [upstream](https://github.com/firebase/firebase-js-sdk) |
| Google API JavaScript loader | snapshot-2026-09-03 | Apache-2.0 | vendored | exempt until 2027-09-03 | unmodified | Loads the Google Drive API client. | [upstream](https://apis.google.com/js/api.js) |
| lie | 3.3.0 | MIT | bundled in jszip | pkg:npm/lie@3.3.0 | unmodified | Bundled transitive dependency of a package-managed browser asset. | [upstream](https://registry.npmjs.org/lie/-/lie-3.3.0.tgz) |
| immediate | 3.0.6 | MIT | bundled in jszip | pkg:npm/immediate@3.0.6 | unmodified | Bundled transitive dependency of a package-managed browser asset. | [upstream](https://registry.npmjs.org/immediate/-/immediate-3.0.6.tgz) |
| pako | 1.0.11 | (MIT AND Zlib) | bundled in jszip | pkg:npm/pako@1.0.11 | unmodified | Bundled transitive dependency of a package-managed browser asset. | [upstream](https://registry.npmjs.org/pako/-/pako-1.0.11.tgz) |
| readable-stream | 2.3.8 | MIT | bundled in jszip | pkg:npm/readable-stream@2.3.8 | unmodified | Bundled transitive dependency of a package-managed browser asset. | [upstream](https://registry.npmjs.org/readable-stream/-/readable-stream-2.3.8.tgz) |
| core-util-is | 1.0.3 | MIT | bundled in jszip | pkg:npm/core-util-is@1.0.3 | unmodified | Bundled transitive dependency of a package-managed browser asset. | [upstream](https://registry.npmjs.org/core-util-is/-/core-util-is-1.0.3.tgz) |
| inherits | 2.0.4 | ISC | bundled in jszip | pkg:npm/inherits@2.0.4 | unmodified | Bundled transitive dependency of a package-managed browser asset. | [upstream](https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz) |
| isarray | 1.0.0 | MIT | bundled in jszip | pkg:npm/isarray@1.0.0 | unmodified | Bundled transitive dependency of a package-managed browser asset. | [upstream](https://registry.npmjs.org/isarray/-/isarray-1.0.0.tgz) |
| process-nextick-args | 2.0.1 | MIT | bundled in jszip | pkg:npm/process-nextick-args@2.0.1 | unmodified | Bundled transitive dependency of a package-managed browser asset. | [upstream](https://registry.npmjs.org/process-nextick-args/-/process-nextick-args-2.0.1.tgz) |
| safe-buffer | 5.1.2 | MIT | bundled in jszip | pkg:npm/safe-buffer@5.1.2 | unmodified | Bundled transitive dependency of a package-managed browser asset. | [upstream](https://registry.npmjs.org/safe-buffer/-/safe-buffer-5.1.2.tgz) |
| string_decoder | 1.1.1 | MIT | bundled in jszip | pkg:npm/string_decoder@1.1.1 | unmodified | Bundled transitive dependency of a package-managed browser asset. | [upstream](https://registry.npmjs.org/string_decoder/-/string_decoder-1.1.1.tgz) |
| util-deprecate | 1.0.2 | MIT | bundled in jszip | pkg:npm/util-deprecate@1.0.2 | unmodified | Bundled transitive dependency of a package-managed browser asset. | [upstream](https://registry.npmjs.org/util-deprecate/-/util-deprecate-1.0.2.tgz) |
| setimmediate | 1.0.5 | MIT | bundled in jszip | pkg:npm/setimmediate@1.0.5 | unmodified | Bundled transitive dependency of a package-managed browser asset. | [upstream](https://registry.npmjs.org/setimmediate/-/setimmediate-1.0.5.tgz) |

Components without a resolvable package URL have a time-limited audit exemption
with a documented reason in the source inventory. `NOASSERTION`, `unknown`, and
`unverified` preserve unresolved provenance instead of guessing.
