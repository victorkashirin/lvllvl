# Browser console issues

Current status (2026-09-05): GitHub, Gist, and Google Drive are disabled. Their
browser implementations, Firebase scripts, and Google API loader are no longer in
the production startup path, so the provider-owned warnings described in the
historical snapshot below no longer occur.

## Snapshot

- Date: 2026-09-04
- Application: lvllvl 0.496.7, served by `npm run dev`
- Firefox: 155.0 at `http://localhost:5173/`
- Scenario: load the start page, choose **New Project**, and accept the default
  Text Mode project settings (C64 PETSCII tile set, C64 palette, 40 by 25,
  tile rotation and flipping enabled)
- Comparison: the same flow was repeated in the Codex in-app Chromium browser
  at `http://127.0.0.1:5174/`

The default project opened successfully in both browsers. Creating the project
did not add any new console messages; the observed messages were emitted while
the application and its eager dependencies were starting.

Firefox emitted 54 messages in the supplied snapshot: 51 warnings and three
informational development/application messages. There were no uncaught
exceptions or console errors. Chromium reported no warnings or errors.

| Classification | Count | Status | Priority | Ownership | Assessment |
| --- | ---: | --- | --- | --- | --- |
| Unreachable code after `return` | 37 | Fixed | Medium | First-party | Obsolete implementations and redundant control statements were removed without changing the reachable paths; a source test now rejects JSHint `W027`. |
| Unsupported `identity-credentials-get` feature policy | 3 | Fixed | Low | Removed Google API integration | The disabled-provider release removed the Google callback and OAuth iframe from production. |
| Invalid Glyphicons glyph bounding boxes | 10 | Fixed | Low | Local font asset | The WOFF2 was regenerated with corrected bounds and side bearings while preserving every glyph outline and character mapping. |
| Empty string passed to `getElementById()` | 1 | Fixed | Medium | First-party markup | Firefox's label-association lookup encountered an empty `for` target. The invalid targets were repaired and verified in Firefox 155. |
| Vite connection messages | 2 | Expected | Informational | Development server | Expected only under `npm run dev`. |
| `lvllvl c64 emulator` banner | 1 | Expected | Informational | Bundled C64 WebAssembly runtime | Expected application noise, not a failure. |

## Verification after the fixes

A fresh Firefox 155 development run on 2026-09-04 loaded the start page and
created the default project. It recorded no first-party warning or error and no
page error. Before providers were disabled, a run with the real Google provider recorded six
provider-owned diagnostics: the three feature-policy warnings above, a quirks-mode
warning from Google's OAuth iframe, a report-only CSP message from that iframe,
and an opaque-response-blocking warning from a Google CSP endpoint. Two Google
timing markers were also present. The current production path does not load those
resources.

The Firefox browser regression records zero warnings, errors,
and page errors through the same default-project flow. The in-app Chromium run
recorded four informational messages—the two Vite messages, the C64 banner, and
one bare object log—and zero warnings or errors.

## Findings

### 1. First-party unreachable code

Firefox parsed the complete minified bundle and reported statements that
followed an unconditional `return`. The production build deliberately runs
Terser with `compress: false`, so those dead statements were retained rather
than eliminated. The warnings therefore appeared during startup even when the
affected features were never opened.

The reported code fell into two broad patterns:

- obsolete implementations left below a replacement `return`, such as the old
  Google Drive JSON upload, old GUID generation, old exporters, and older 3D or
  music implementations;
- statements that appear to express intended behavior but can never run, such
  as the split-panel minimum-size assignments after early returns.

The second pattern required functional review before deletion. For example,
the split-panel implementation rejected a resize below the minimum, while its
unreachable assignments suggested an older clamping approach.

The following historical mappings were produced from the served bundle and
`dist/js/main.js.map` before the fix. Generated columns and source line numbers
are snapshot-specific and no longer describe the rebuilt bundle.

| Area | Firefox generated location | Source-map location |
| --- | --- | --- |
| UI shell | `main.js:1:8112` | `src/js/ui/ui.js:534` |
| UI shell | `main.js:1:40155` | `src/js/ui/splitpanel.js:159` |
| UI shell | `main.js:1:40785` | `src/js/ui/splitpanel.js:196` |
| UI shell | `main.js:1:77695` | `src/js/ui/canvasPanel.js:127` |
| Project navigation | `main.js:1:294275` | `src/js/file/projectNavigator.js:1755` |
| Legacy import | `main.js:1:453132` | `src/js/file/fileManager.js:2216` |
| Google Drive | `main.js:1:483945` | `src/js/file/gdrive.js:872` |
| Text editor layout | `main.js:1:543506` | `src/js/textMode/textModeEditorLayout.js:981` |
| Grid view | `main.js:1:627138` | `src/js/textMode/gridView2d.js:538` |
| Grid layer | `main.js:1:726400` | `src/js/textMode/layers/layerGrid.js:414` |
| Grid layer | `main.js:1:738437` | `src/js/textMode/layers/layerGrid.js:1243` |
| Mobile tile palette | `main.js:1:995687` | `src/js/textMode/tools/tilePaletteMobile.js:589` |
| Draw-tools popup | `main.js:1:1029632` | `src/js/textMode/tools/drawToolsPopup.js:243` |
| Draw-tools popup | `main.js:1:1034864` | `src/js/textMode/tools/drawToolsPopup.js:549` |
| Shape tools | `main.js:1:1037910` | `src/js/textMode/tools/shapes.js:37` |
| Grid | `main.js:1:1210077` | `src/js/textMode/grid.js:717` |
| Grid | `main.js:1:1212355` | `src/js/textMode/grid.js:789` |
| Grid | `main.js:1:1214713` | `src/js/textMode/grid.js:944` |
| Frames | `main.js:1:1274584` | `src/js/textMode/frames/frames.js:1023` |
| Tile set | `main.js:1:1402041` | `src/js/textMode/tileSet/tileSet.js:2919` |
| Tile set | `main.js:1:1403225` | `src/js/textMode/tileSet/tileSet.js:3090` |
| Tile-set import | `main.js:1:1456636` | `src/js/textMode/tileSet/tileSetImport.js:847` |
| Palette chooser | `main.js:1:1539762` | `src/js/textMode/color/colorPaletteChoosePreset.js:594` |
| C64 import | `main.js:1:1800814` | `src/js/textMode/import/importC64Formats.js:725` |
| Sprite-image import | `main.js:1:1835711` | `src/js/textMode/import/importSpriteImage.js:186` |
| PNG export | `main.js:1:1936558` | `src/js/textMode/export/exportPng.js:566` |
| C64 export | `main.js:1:2232609` | `src/js/textMode/c64export/exportC64.js:2046` |
| Music track view | `main.js:1:2404581` | `src/js/music/trackView.js:197` |
| Music track view | `main.js:1:2405224` | `src/js/music/trackView.js:243` |
| Music track view | `main.js:1:2410893` | `src/js/music/trackView.js:555` |
| Music track view | `main.js:1:2430744` | `src/js/music/trackView.js:1688` |
| Music history | `main.js:1:2528336` | `src/js/music/historyGraph.js:39` |
| SID song data | `main.js:1:2786194` | `src/js/music/sid/songData.js:1192` |
| C64 BASIC debugger | `main.js:1:2971022` | `src/js/debugger/dbgC64Basic.js:1098` |
| C64 debugger | `main.js:1:3158974` | `src/js/c64/c64Debugger.js:2165` |
| C64 debugger | `main.js:1:3168213` | `src/js/c64/c64Debugger.js:2762` |
| Compact C64 debugger | `main.js:1:3226725` | `src/js/c64/c64DebuggerCompact.js:468` |

The 37 substantive dead regions were removed while preserving the code paths
that had actually executed before each unconditional `return`. The split-panel
minimum-size checks, for example, continue to reject undersized west and east
panels; their unreachable clamp assignments were not revived. The broader
source audit also removed 111 redundant `break`, `return`, and empty statements
reported by JSHint after an earlier control transfer. A source-level regression
test scans every input to `js/main.js` and rejects JSHint `W027`, so the warning
cannot be reintroduced by updating the artifact golden.

A follow-up scope review found three declarations that the unreachable blocks
had previously hoisted into reachable code: `guid` in the legacy file importer,
`height` in the draw-tools popup, and `dstContext` in font preview. Those bindings
are now declared explicitly at their reachable use sites; `dstContext` is also
initialized from the existing preview canvas. A focused JSHint `W117` regression
test protects all three bindings, avoiding a blanket rule over the legacy bundle's
intentional cross-file globals.

Post-fix verification used the installed Firefox 155 in headless mode against a
fresh profile and created the default project. No `unreachable code after return
statement` warning or first-party runtime exception occurred.

### 2. Google feature-policy warnings (historical, fixed 2026-09-05)

Firefox emitted the following message three times from `cb=gapi.loaded_0`:

```text
Feature Policy: Skipping unsupported feature name “identity-credentials-get”.
```

`src/lib/google-api/api.js` loads Google's remote API modules, and
`src/js/file/gdrive.js:63` eagerly requests `client:auth2`. A Google response
attempts to use a policy token that Firefox 155 does not recognize. Firefox
skips the token; no editor failure was observed.

Resolution: the disabled-provider release removed `gdrive.js`, the retained
Google API loader, Google sign-in controls, and provider origins from the CSP.
Google Drive can be reintroduced only through the credential-free provider
boundary and an approved server-side authentication design.

### 3. Glyphicons font metadata warnings

Firefox adjusted invalid glyph bounding boxes for glyphs 121, 200, 275, 276,
277, 278, 282, 285, 312, and 313 in
`src/fonts/glyphicons-halflings-regular.woff2`, referenced by
`src/css/icons-halflings.css`.

The WOFF2 was regenerated from the repository's existing TTF with FontTools.
The process recalculated all non-empty glyph bounds and aligned four stale left
side bearings with their corrected `xMin` values. Structural comparison
confirmed that all 319 glyph outlines, all 316 character mappings, and every
advance width are unchanged. The legacy WOFF, TTF, EOT, and SVG fallbacks remain
in place. The build-artifact golden now tracks the corrected WOFF2 so an
unintentional binary rollback fails verification.

Post-fix verification used Firefox 155 against a fresh production-preview tab
and created the default project. Filtering the retained console for
`Glyph bbox was incorrect` returned no matches, and the project UI rendered
normally.

### 4. Empty label target reported as `getElementById`

Firefox emitted:

```text
Empty string passed to getElementById().
```

The message carried no source location or stack. Instrumenting
`Document.getElementById` before application startup recorded no empty calls,
which ruled out the provisional `UI.loadScript` candidate. DOM inspection then
found `<label for="">Colour Count</label>` from
`src/html/textMode/colorPaletteEditor.html` in the initial page.

Firefox can emit the misleading message while resolving form-label
associations whose `for` value is empty, as documented in
[Mozilla bug 1752564](https://bugzilla.mozilla.org/show_bug.cgi?id=1752564).
The Colour Count label is now associated with
`colorPaletteEditorFromImageColorCount`; the remaining empty `for` values in
cached dialogs were either associated with their controls or removed from group
and spacer labels. A source-level regression test rejects new empty label
targets.

Post-fix verification used Firefox 155 against the production preview, created
the default project, and filtered the retained console for the exact warning.
There were no matching entries.

### 5. Informational and noisy logging

The Vite `connecting` and `connected` messages are expected development-server
diagnostics. The `lvllvl c64 emulator` line is embedded in
`src/c64/c64/c64.wasm` and is a harmless runtime banner.

Chromium originally recorded four messages for the same flow: the two Vite
diagnostics, the C64 banner, and one opaque application log rendered only as
`Object` from `main.js`. The removed Google Drive initialization path was the
probable source of that log. Disabled-provider errors now use one labelled,
fixed-text reporter.

## Suggested order of work

1. Remove or label non-actionable application `console.log` output.

The browser startup tests observe page errors and local request failures. A
Firefox-only default-project test additionally rejects console warnings and
errors; source checks cover unreachable
statements, the affected local bindings, and multiline empty label targets.
Historical provider-owned diagnostics remain documented rather than allow-listed
as first-party successes.
