# Legacy code removal TODO

Status: prioritized removal backlog backed by the inventory below. No production
code has been removed.

This inventory was added because shortcut scope cannot be designed accurately from the visible 2D image editor alone. The production bundle contains several complete or partial editors that normal navigation does not expose.

## Executive recommendation

Hidden does not automatically mean removable. Some hidden editors are thin views over data and services that the visible image editor, C64 exports, or file-driven workflows still use. Removal should use these labels:

- **Yes**: dead, broken, unreferenced, or superseded code that can be removed without a product decision.
- **No**: active or shared functionality where removal would break a supported workflow or save little code.
- **Yes, with details**: a credible removal candidate, but only after the listed dependency or product decision is resolved.

The recommended first cleanup removes approximately **7,100-7,600 physical source lines**. About 6,354 of those lines are unbundled backup/orphan files, so the corresponding production-bundle reduction is only about **800-1,100 source lines before minification**. If 3D is also retired, the repository reduction rises to about **16,200-17,000 lines**. If both 3D and music are retired, it rises to approximately **53,500-54,700 lines**.

Those larger removals should not be combined with the low-risk cleanup. 3D is reasonably isolated but requires a product decision. Music is heavily coupled to optional SID music in C64 exports and requires a deliberate compatibility migration.

## Actionable removal backlog

Priorities describe execution order, not severity:

- **P1**: verified dead or unreferenced code; remove in the first cleanup pass.
- **P2**: bounded removal that needs a dependency check, compatibility check, or
  small product decision first.
- **P3**: large feature retirement requiring explicit product approval and a
  migration or unsupported-record strategy.

A task is complete only when its named code, related build-graph/template entries,
and now-unused tests or handlers are removed, and the relevant source checks,
production build, and browser tests pass. Keep tasks in separate commits where
practical. Components marked **No** in the research tables are intentionally not
tasks.

### P1 — verified dead or unreferenced

- [ ] **LEG-001 (P1): Remove `src/js/music/patternViewSave.js`.** Confirm it has
  no filename or build-graph references, then delete the tracked backup file.
- [ ] **LEG-002 (P1): Remove `src/js/music/sid/sidplayerbackup.js`.** Confirm it
  has no filename or build-graph references, then delete the backup copy.
- [ ] **LEG-003 (P1): Remove `src/js/music/sid/sidpatternplayerbackup`.** Confirm
  it has no filename or build-graph references, then delete the extensionless
  backup copy.
- [ ] **LEG-004 (P1): Remove `src/js/music/sid/sidplayernew`.** Confirm it has no
  filename or build-graph references, then delete the extensionless experiment.
- [ ] **LEG-005 (P1): Remove `src/js/c64/c64page.js`.** Confirm the exported C64
  page still uses `src/c64page`, then delete this unused old page source.
- [ ] **LEG-006 (P1): Remove `src/js/c64/c64pageimages.js`.** Delete it with the
  unused old C64 page source after confirming there are no runtime references.
- [ ] **LEG-007 (P1): Remove `src/js/sprite/spriteGridView2d.js`.** Confirm current
  sprite documents use `TextModeEditor`, then delete this unbundled orphan.
- [ ] **LEG-008 (P1): Remove `src/js/c64/c64Settings.js`.** Delete the empty file
  and any stale build or source references.
- [ ] **LEG-009 (P1): Remove the legacy standalone `SpriteEditor`.** Delete
  `spriteEditor.js`, its build-graph entry, commented construction/mode code, and
  dead `mode === 'sprite'` keyboard/undo branches without changing the maintained
  2D sprite workflow. `LEG-007` owns deletion of its orphan grid-view file.
- [ ] **LEG-010 (P1): Remove the NES runtime/debugger shell.** Delete the stale
  `.nes` loader route, dormant mode/menu/build branches, debugger fields, and null
  dereferences. Preserve the independent 2D NES palette/screen-mode code.
- [ ] **LEG-011 (P1): Remove the X16 runtime/debugger shell.** Delete stale
  `x16Debugger` mode, project-output, assembler-runtime, menu, and field references.
  Preserve the working X16 assembly-source exporter.
- [ ] **LEG-012 (P1): Remove old `C64Interface` integration.** Delete commented
  construction and stale interface references without changing `C64Debugger`.
  `LEG-008` owns deletion of the empty settings file.
- [ ] **LEG-013 (P1): Remove the Assembly Import dialog.** Delete its class,
  template, initialization, handler, build-graph entry, and commented menu item.
- [ ] **LEG-014 (P1): Remove the old `ui-menu-assembler-old` menu.** Delete the
  unused menu markup/styles and construction path while retaining the active
  `ui-menu-c64-assembler` menu.
- [ ] **LEG-015 (P1): Remove the dead `#startMusic` entry handler.** Delete the
  click binding that has no matching element in either current start-page
  template; do not remove the music editor in this task.
- [ ] **LEG-016 (P1): Remove commented `ProjectShare` construction.** Delete the
  stale construction lines; there is no implementation to retain.
- [ ] **LEG-017 (P1): Remove obsolete Audio Options fragments.** Delete the
  commented Settings-menu entry and any handler that has no implementation.
- [ ] **LEG-018 (P1): Remove obsolete C64 Effects fragments.** Delete the
  commented Settings-menu entry and unimplemented handler while retaining live
  C64 export code.
- [ ] **LEG-019 (P1): Remove obsolete C64 Bytes Free fragments.** Delete the
  commented Tools-menu entry and any unimplemented handler.
- [ ] **LEG-020 (P1): Remove the obsolete standalone Image Effects entry.** Delete
  only the commented standalone Tools-menu fragment; retain image effects used by
  import and GIF/PNG export.
- [ ] **LEG-021 (P1): Remove obsolete 3D OBJ/FBX import fragments.** Delete the
  commented import entries and any unreachable wiring with no matching
  implementation; retain active 3D OBJ and MagicaVoxel export.

### P2 — validate before removal

- [ ] **LEG-022 (P2): Remove the dormant 2D Background Image feature.** First
  inspect old-project fixtures for persisted grid background-image data and add a
  migration or compatibility handling if needed; then remove the implementation,
  template, hidden commands, and build entries. Preserve Reference Image.
- [ ] **LEG-023 (P2): Replace and remove the broken generic text-editor wrapper.**
  Introduce a shared document-code-editor abstraction for generic text, script,
  and JSON records, migrate callers, then delete the old `TextEditor` wrapper.
  Preserve generic text-file support.
- [ ] **LEG-024 (P2): Remove the gated X16 BASIC exporter.** Confirm there is no
  supported output contract or near-term exposure plan, then remove its JS,
  template, feature-gated menu/handler, and build entries. Preserve X16 assembly
  export.
- [ ] **LEG-025 (P2): Remove obsolete Advanced C64 PRG UI only.** Prove the hidden
  advanced menu and code-editing entry points are unreachable, then delete those
  entries and their UI-only handlers. Preserve `toPrgAdvanced.js` and every method
  called by normal PRG export.
- [ ] **LEG-026 (P2): Remove remaining dormant GitHub provider UI/callback paths.**
  Inventory callers first, remove GitHub-specific controls and callback-era code,
  and keep deterministic disabled behavior until all callers are gone.
- [ ] **LEG-027 (P2): Remove remaining dormant Gist provider UI/callback paths.**
  Inventory callers first, remove Gist-specific controls and callback-era code,
  and keep deterministic disabled behavior until all callers are gone.
- [ ] **LEG-028 (P2): Remove remaining dormant Google Drive UI/callback paths.**
  Inventory callers first, remove Drive-specific controls and callback-era code,
  and keep deterministic disabled behavior until all callers are gone.
- [ ] **LEG-029 (P2): Remove the disabled remote-provider facade.** After
  `LEG-026` through `LEG-028` remove every caller, delete
  `legacyRemoteProviderFacades.mjs`, its tests, and build references. Do not remove
  the facade earlier because it provides secure, deterministic failure behavior.
- [ ] **LEG-030 (P2): Resolve the stale Home entry fragments.** Decide whether to
  restore a supported Home command as recommended; if it is rejected, delete each
  commented entry and obsolete handler instead of leaving dormant code.
- [ ] **LEG-031 (P2): Resolve the stale direct C64 entry fragments.** Decide
  whether visible navigation should be restored; if it is rejected, delete each
  commented entry and obsolete handler while preserving file-driven C64 loading.
- [ ] **LEG-032 (P2): Resolve the stale direct 3D entry fragments.** Coordinate
  with `LEG-033`; restore a supported entry if 3D remains, otherwise delete the
  commented navigation fragments as part of retirement.

### P3 — explicit feature-retirement decisions

- [ ] **LEG-033 (P3): Retire the 3D scene editor.** Obtain product approval, add
  an unsupported-record or migration path for saved 3D records, then remove 3D
  grid/view/tools/export code, templates, mode integration, project creation,
  Explorer entries, menus, and tests. Keep Three.js because 2D still uses it.
- [ ] **LEG-034 (P3): Retire the music editor and SID-authoring workflow.** Obtain
  product approval, first remove the music selector/SID-data path from C64 PRG and
  assembly exports, stop seeding `/music/Untitled Music`, define old-project
  handling, and then remove the remaining music code, templates, sandbox, runtime
  assets, Explorer/mode integration, and tests. If SID-backed export remains a
  product feature, close this task as rejected rather than deleting the editor.

### Verification for every cleanup batch

- [ ] Search the source and generated build graph for references to every removed
  file, constructor, mode, menu ID, template, and asset.
- [ ] Run `npm run check` and `npm run test:source`.
- [ ] Run `npm run build` and `npm run test:build`; compare production artifacts
  for large removals.
- [ ] Run the relevant Playwright coverage, including current 2D sprite, C64,
  assembler, X16 assembly-export, and old-project fixtures when those neighboring
  paths are touched.

## Scope and terminology

The baseline used here is a fresh desktop session opened at the normal URL, followed by the start page and 2D image editor. A component is **directly reachable** only if a visible production control leads to it. The following are treated as alternate or developer routes rather than ordinary navigation:

- `?features=all`.
- `?editor=...` URL parameters.
- Calling methods from the developer console.
- Restoring specially prepared project state.
- Opening or dropping a file whose type implicitly switches editors.

The inventory covers top-level modes, user-facing project document editors, emulator/debugger surfaces, and major dormant menu features. It does not list every helper class or internal data record.

## Why the hidden surface area exists

`Editor.setMode()` still contains the product's main surface switch in [`src/js/editor.js`](../src/js/editor.js#L594). In addition to the start page and 2D editor, it has live branches for 3D, standalone palette and tile-set editors, script/JSON/text/hex editors, music, assembler, and C64. The sprite, NES, and X16 branches are commented out.

Every ordinary new project nevertheless creates folders for palettes, tile sets, screens, sprites, music, assembler sources and binaries, scripts, build output, 3D scenes, and configuration in [`src/js/editor.js`](../src/js/editor.js#L2843). It also seeds assembler source, scripts, JSON configuration, and an untitled music document in [`src/js/editor.js`](../src/js/editor.js#L2975). The visible product is therefore screen-centric even though each project contains data for several other subsystems.

Desktop Project Explorer is the universal navigation mechanism for those records. It is always constructed but starts hidden in [`src/js/file/projectNavigator.js`](../src/js/file/projectNavigator.js#L70) and is added as a hidden west panel in [`src/js/editor.js`](../src/js/editor.js#L1692). Its Project-menu entry is created only when `SHOWUNFINISHED` is enabled by `?features=all` in [`src/js/editor.js`](../src/js/editor.js#L1) and [`src/js/editor.js`](../src/js/editor.js#L1019).

### Ace and the music editor

Ace is the third-party in-browser source-code editing library (`ace-builds` 1.4.5 in `package.json`), not an lvllvl product mode. The local `CodeEditor` wrapper embeds it in the assembler, scripting, JSON, generic-text, BASIC, debugger, and source-export surfaces. Ace's own command registry is also why code-focused screens have keyboard behavior that the application-level shortcut implementation does not fully control.

The music editor is a separate, substantial lvllvl feature, but it is not reachable through the normal start page or 2D image-editor menus. It can currently be opened only through `?editor=music`, the Project Explorer exposed by `?features=all`, or restoration of a project whose `currentPath` points to a music record. The start-page controller still registers a `#startMusic` handler, but the current start-page templates contain no element with that ID.

## Top-level mode and editor matrix

| Surface | Built state | Reachable from the normal 2D UI? | Alternate route and assessment |
| --- | --- | --- | --- |
| Start/home page | Active | **No return route from 2D.** The normal initial page is reachable, but the Home and Go To Home Screen menu entries are commented out. | Reloading/navigating to the root returns to it. This is a navigation gap, not a dead surface; see [`src/js/editor.js`](../src/js/editor.js#L1021). |
| Project Explorer | Active, hidden | **No.** | `?features=all` exposes Project -> Project Explorer. A previously saved `projectNavVisible=true` value is also restored without checking the feature gate. Once another hidden mode is open, its View -> Project View menu or Ace's Command/Control+P binding can reveal it. |
| 3D scene editor | Active | **No.** The old Screen -> 3D Mode item is commented. | `?editor=3d`, the gated Project Explorer, or restoration of a saved 3D `currentPath`. Its mode and 3D grid views are built in [`src/js/editor.js`](../src/js/editor.js#L620) and [`src/js/textMode/textModeEditor.js`](../src/js/textMode/textModeEditor.js#L331). |
| Standalone colour-palette editor | Active | **No as a standalone document editor.** | Gated Project Explorer or a restored palette `currentPath`. The normal Colours menu exposes embedded palette selection/edit/load/save/create tools, but those remain inside 2D; see [`src/js/editor.js`](../src/js/editor.js#L1280). |
| Standalone tile-set editor | Active | **No as a standalone document editor.** | Gated Project Explorer or a restored tile-set `currentPath`. The normal Tiles menu exposes embedded tile tools without entering this mode; see [`src/js/editor.js`](../src/js/editor.js#L1262). |
| Music editor | Active and seeded in every project | **No.** | `?editor=music`, gated Project Explorer, or restored music `currentPath`. A `#startMusic` click handler exists, but neither current start-page template contains that element, so it is a dead entry point; see [`src/js/file/startPage.js`](../src/js/file/startPage.js#L849). |
| Top-level assembler IDE | Active | **No.** | `?editor=assembler`, gated Project Explorer opening `/asm/main.asm`, or the assembler embedded in an already-open C64 debugger. The top-level assembler includes Ace, build controls/output, utilities, and a compact C64 debugger; see [`src/js/assembler/assemblerEditor.js`](../src/js/assembler/assemblerEditor.js#L84). |
| Project script editor | Active, lazily built | **No.** | Gated Project Explorer or restored script `currentPath`. This is distinct from the directly reachable View -> Scripting side panel; see [`src/js/editor.js`](../src/js/editor.js#L718). |
| JSON editor | Active, lazily built | **No.** | Gated Project Explorer or restored JSON `currentPath`. Opening an arbitrary `.json` through the start page treats it as project data and then prefers the first 2D screen, rather than opening this editor. |
| Generic text editor | Wired, but likely broken on first open | **No.** | Gated Project Explorer fallback for record types without a specialized editor, or a restored path. `TextEditor.show()` calls `buildInterface()` without the required `parentPanel`, so the first open should fail at `parentPanel.add(...)`. Opening `.txt` directly is interpreted as a palette instead. |
| Hex/binary editor | Active | **No.** | Gated Project Explorer opening a `bin` record or a restored binary path. Opening `.hex` directly is interpreted as a palette. |
| Full C64 runtime/debugger | Active | **No visible 2D command, but reachable by file side door.** | Start -> Open Local File accepts `.prg`; global drag/drop also routes PRG, C64 snapshot, D64, CRT, and BAS data into C64 mode. `?editor=c64` and `/c64/` are supported too. Unlike most rows, this is a working production path, but it is file-driven rather than discoverable navigation. |
| Sprite editing in the current product | Active as 2D `graphic` documents | **No blank-sprite command in normal 2D navigation.** | Opening/dropping SpritePad `.spd`, `?editor=sprite`, gated Project Explorer, or restored sprite state opens the ordinary 2D editor with sprite-specific menus. Screens and sprites share the `graphic` record type. |
| Legacy standalone `SpriteEditor` | Source is bundled, integration disabled | **No.** | Its construction and `setMode('sprite')` UI branch are commented in [`src/js/editor.js`](../src/js/editor.js#L760) and [`src/js/editor.js`](../src/js/editor.js#L1635). Current sprite work replaced it with the 2D editor. Treat it as dead legacy code, not a hidden working editor. |
| NES runtime/debugger | Disabled and broken | **No.** | Construction and the `setMode('nes')` branch are commented. The remaining `.nes` loader still calls `setMode('nes')` and then dereferences the absent debugger, so this path is stale rather than feature-gated; see [`src/js/file/fileManager.js`](../src/js/file/fileManager.js#L448). The gated 2D NES screen mode is unrelated to the emulator. |
| X16 runtime/debugger | Disabled and broken | **No.** | Construction and the `setMode('x16')` branch are commented, but assembler and project-output code still contain calls to it. X16 assembly export from 2D remains active; that is an export format, not the runtime. |
| `none` / no-editor panel | Internal fallback | Not a feature. | Used when a project has no valid screen/path or all editor tabs close. It falls through the default branch of `setMode()`; see [`src/js/editor.js`](../src/js/editor.js#L853). |

## Research reference: removal recommendations by component

The estimates below are physical source lines, including comments and blanks. They exclude shared code unless the recommendation removes the shared capability too. Small edits in `editor.js`, Project Explorer, build configuration, tests, and templates are estimated rather than presented as exact counts.

| Component | Remove? | Estimated removal | Recommendation and dependency details |
| --- | --- | ---: | --- |
| Start/home page | **No** | 0 | It is the normal entry point. Restore a Home command instead of deleting it. |
| Project Explorer | **No** | 0 | Approximately 2,833 lines exist in desktop/mobile Explorer and their New dialogs, but it is the only general navigator for project assets. Decide whether to expose or replace it; deleting it would strand non-screen records and saved `currentPath` behavior. |
| 3D scene editor | **Yes, with details** | ~9,000-9,400 | Remove if 3D is not on the near-term roadmap. About 8,832 lines are directly identifiable in 3D grid/view/tools/export files and templates; the remainder is integration in `Editor`, `TextModeEditor`, Project Explorer, project creation, menus, and tests. Keep Three.js because 2D rendering and effects also use it. |
| Standalone colour-palette editor | **No** | ~55 if only the shell is deleted | It is a tiny adapter over the palette editor used by 2D. Removing only the wrapper provides no meaningful simplification; either expose it through asset navigation or fold the wrapper into a general asset editor. Do not remove the shared palette code or template. |
| Standalone tile-set editor | **No** | ~65 if only the shell is deleted | It is a thin adapter over tile-set and palette-display code used by 2D. The shared subsystem is not legacy. |
| Music editor | **Yes, with details** | ~42,800-43,100 from the untouched tree | The active compiled music subsystem is about 35,675 JS lines, its templates add 1,285, the scripting sandbox adds 386, and unbundled backups add 5,391. Before removal, remove the music selector/SID-data path from C64 PRG/assembly exports, stop seeding `/music/Untitled Music`, define how old projects retain or discard music records, and remove music-specific runtime assets. If SID-backed export is a product feature, change this recommendation to **No** and expose the editor instead. |
| Top-level assembler IDE and assembler core | **No** | 0 | The assembler and utilities are about 7,300 source/template lines, but the C64 debugger embeds the assembler and image-editor C64 export uses `g_app.assembler`. Removing only the top-level route saves almost nothing. Remove this subsystem only together with the C64 development/export workflows. |
| Project script editor | **No** | 0 | The wrapper is only 107 lines and edits scripts already seeded into projects. It should be reachable through a restored asset navigator. Consolidation with JSON/text editors is preferable to deletion. |
| JSON editor | **No** | 0 | The 120-line wrapper edits assembler/C64 configuration records. Keep the capability and consolidate the repeated Ace wrapper implementation. |
| Generic text editor | **Yes, with details** | ~80-180 net after consolidation | Do not remove generic text-file support. Replace the currently broken 118-line wrapper with a shared document-code-editor abstraction used by script and JSON. The exact net deletion depends on the replacement. |
| Hex/binary editor | **No** | 0 | It is only 81 lines and gives generated/imported assembler binaries a viewer. Removing it does not materially reduce the application. |
| Full C64 runtime/debugger | **No** | 0 | This is a working file-driven feature, not dead code. The debugger/runtime UI is roughly 23,600 first-party source/template lines, plus around 2.4 MB of copied emulator and export-page assets. Removing it would also affect PRG/D64/CRT/BAS loading, the compact assembler debugger, and exported C64 HTML pages. |
| Current 2D sprite workflow | **No** | 0 | SpritePad import and sprite documents use the maintained 2D editor. Preserve this path. |
| Legacy standalone `SpriteEditor` | **Yes** | ~250-300 | Remove the bundled 29-line `spriteEditor.js`, the unbundled 188-line `spriteGridView2d.js`, the dead `mode === 'sprite'` keyboard/undo branches, the commented construction/mode block, and its build-graph entry. Do not remove current 2D sprite support. |
| NES runtime/debugger shell | **Yes** | ~50-100 | No NES debugger implementation is constructed or present in the build, while `.nes` loading still dereferences `null`. Remove the loader route, dormant mode/menu/build branches, and stale fields. Keep the separate NES palette/screen-mode work only if it is useful to 2D export. |
| X16 runtime/debugger shell | **Yes** | ~50-100 | Remove stale `x16Debugger` mode, project-output, and assembler runtime calls. Preserve the working X16 assembly-source exporter. Decide separately on the gated X16 BASIC exporter. |
| `none` / no-editor fallback | **No** | 0 | This is defensive application state rather than legacy functionality. |
| Old `C64Interface` integration | **Yes** | <20 | Remove the commented construction block and stale references. The empty `c64Settings.js` file can also go. This does not affect `C64Debugger`. |

## Research reference: removal recommendations for dormant pieces

| Dormant piece | Remove? | Estimated removal | Details |
| --- | --- | ---: | --- |
| Unbundled backup/orphan files | **Yes** | 6,354 | Delete the eight files listed in the next section after one focused reference/build test. They are tracked but neither named by the build nor referenced by other source. This reduces repository size, not the production bundle. |
| 2D Background Image feature | **Yes, with details** | ~280 | The 231-line implementation and 40-line template have no active UI entry. Reference Image is the maintained visible alternative. First confirm that persisted projects do not depend on a grid background-image field that must be migrated. |
| Assembly import dialog | **Yes** | ~120 | The 109-line class and 3-line template are constructed but have no live entry. Remove its initialization, dead handler, build-graph entry, and commented menu item. |
| Advanced C64 PRG engine | **No** | 0 | Normal C64/PRG export calls into `toPrgAdvanced.js`. Remove only obsolete menu comments or the inaccessible code-editing UI after proving those methods are not called; do not remove the generator. |
| Old Settings and Tools menu fragments | **Yes** | ~50-100 | Delete commented Audio Options/C64 Effects/C64 Bytes Free menu blocks and handlers that have no implementation. Keep live image effects and C64 export code. |
| Old assembler C64 menu (`ui-menu-assembler-old`) | **Yes** | ~35-50 | No active mode selects the class. The current assembler/debugger menu uses `ui-menu-c64-assembler`. |
| Dead Start Music/Home/direct C64/3D entry fragments | **Yes, with details** | ~20-40 | Delete the missing `#startMusic` handler and stale commented entries. For Home, C64, and 3D, first decide whether the correct action is restoration rather than deletion. |
| X16 BASIC exporter | **Yes, with details** | ~370 | It is 294 JS lines plus a 70-line template and is gated by `SHOWUNFINISHED`. Remove it if there is no testable output contract or near-term exposure plan; this does not affect the active X16 assembly exporter. |
| 2D NES screen mode | **No** | 0 | It is a small gated branch of the maintained 2D color/screen system, not the dead NES emulator. Evaluate it as an export-format feature rather than runtime legacy. |
| Scripting API help | **No** | 0 | A hidden help link is a discoverability issue. The underlying global scripting panel is active. |
| Image effects | **No** | 0 | The standalone Tools entry is dead, but effects are actively used by image/video import and GIF/PNG export. Remove only the commented standalone entry. |
| GitHub/Gist/Google Drive legacy UI | **Yes, with details** | ~600-1,000 | Remove dormant provider-specific UI and callback-era paths in a dedicated refactor if these integrations will be rebuilt server-side. Retain the 134-line disabled facade until every caller has been removed; it currently provides deterministic and secure failure behavior. |
| `ProjectShare` construction | **Yes** | <10 | Delete the commented construction lines. No `ProjectShare` implementation exists in the current source tree. |

## Code-removal estimates

### Counting method

- Counts use `wc -l`, so they are physical lines rather than semantic lines of code.
- First-party JS, HTML, and directly associated templates are included.
- Shared palette, tile, Ace, Three.js, assembler, and C64 export code is excluded unless the entire shared capability is removed.
- Generated/minified JS, WebAssembly, ROM data, images, and third-party libraries are reported as payload where relevant, not converted into fictitious source-line counts.
- Integration edits in large shared files are ranges because a real removal patch must decide whether to delete, generalize, or preserve each branch.
- Expect approximately ±15% movement once removal tests and old-project fixtures identify hidden dependencies.

### Removal scenarios

| Scenario | Repository source removed | Production bundle inputs removed | Product effect |
| --- | ---: | ---: | --- |
| Low-risk legacy cleanup | ~7,100-7,600 lines | ~800-1,100 lines | Removes orphans, dead SpriteEditor/NES/X16/C64Interface wiring, assembly import, background image, gated X16 BASIC, and stale menu fragments. Keeps current 2D, sprites, C64, assembler, music, and 3D. |
| Low-risk cleanup plus 3D retirement | ~16,200-17,000 lines | ~9,900-10,500 lines | Also removes all 3D scene editing/export. Existing saved 3D records require an unsupported-record fallback or migration notice. |
| Low-risk cleanup plus music retirement | ~44,500-45,300 lines | ~38,200-38,800 lines | Also removes music editing/SID authoring. C64 exports must stop offering embedded project music, and old music records need compatibility handling. |
| Low-risk cleanup plus 3D and music retirement | ~53,500-54,700 lines | ~47,300-48,200 lines | Produces a substantially more focused 2D/C64-image application while retaining the C64 runtime and assembler. |
| Hypothetical C64 runtime retirement | Additional ~23,600 first-party lines plus ~2.4 MB runtime/export assets | Similar first-party input removal; asset savings require a build comparison | **Not recommended.** It breaks working file loading, debugger panels, assembler integration, and C64 HTML export. This estimate excludes shared image-editor C64 import/export code. |

The production byte reduction cannot be derived reliably from source lines because `main.js` is monolithic and the runtime includes compressed/minified JS and WebAssembly. Before approving a large removal, build the same revision with and without the feature and compare uncompressed, gzip, and Brotli artifacts.

## Unbundled backup and orphan candidates

These tracked files total exactly 6,354 physical lines. They are absent from the main build graph/runtime asset lists and a repository search found no filename references:

| File | Lines | Recommendation |
| --- | ---: | --- |
| `src/js/music/patternViewSave.js` | 2,526 | **Yes** - remove; source control already supplies history. |
| `src/js/music/sid/sidplayerbackup.js` | 1,274 | **Yes** - remove backup copy. |
| `src/js/music/sid/sidpatternplayerbackup` | 1,430 | **Yes** - remove extensionless backup copy. |
| `src/js/music/sid/sidplayernew` | 161 | **Yes** - remove extensionless experiment. |
| `src/js/c64/c64page.js` | 770 | **Yes** - remove; the shipped standalone exporter uses `src/c64page`, not this file. |
| `src/js/c64/c64pageimages.js` | 5 | **Yes** - remove with the unused old page source. |
| `src/js/sprite/spriteGridView2d.js` | 188 | **Yes** - remove; it is neither built nor referenced and current sprites use `TextModeEditor`. |
| `src/js/c64/c64Settings.js` | 0 | **Yes** - remove empty file. |

Filename-reference checks cannot prove semantic unreachability by themselves. The removal PR should still run build-graph validation, the production build, browser tests, and old-project import fixtures.

## Execution order

Use the prioritized checklist above as the source of truth. Complete P1 in small,
independently reviewable batches, then P2 after each task's named validation.
Treat `LEG-033` and `LEG-034` as separate projects; neither belongs in the
low-risk cleanup. Keep C64 runtime/debugging and assembler unless the product
intentionally abandons runnable Commodore workflows.

## Normal and alternate entry paths

The desktop start page visibly offers only New Project, Open Local File, and Import Image in [`src/html/startPage.html`](../src/html/startPage.html#L16). The ordinary New Project dialog creates a 2D screen and does not submit an `editor` selection, so `newProject()` defaults to `screen` in [`src/js/editor.js`](../src/js/editor.js#L2868).

The alternate routes are inconsistent rather than centrally governed:

- `?features=all` reveals Project Explorer and a few individual unfinished menu items.
- `?editor=3d`, `music`, `assembler`, `c64`, or `sprite` selects a special new-project path. Script, JSON, text, hex, standalone palette, and standalone tile-set modes have no equivalent URL branch.
- Saving persists both `currentPath` and Project Explorer visibility. Reopening a browser-saved project can therefore restore a hidden mode or visible Explorer on a normal URL; see [`src/js/file/document.js`](../src/js/file/document.js#L1330).
- Ace always registers Command/Control+P to toggle Project Explorer in [`src/js/codeEditor/codeEditor.js`](../src/js/codeEditor/codeEditor.js#L226), even when the normal Project-menu item was not created.
- The Create Template Link dialog emits `editor=assembly`, while `newProject()` expects `assembler`; that generated route appears stale/broken.

## Project document inventory

Desktop Project Explorer can create Folder, Screen, Sprite, Colour Palette, Tile Set, Music, Script, ASM, Binary, and 3D Scene records through [`src/html/project/newDocRecord.html`](../src/html/project/newDocRecord.html#L7). Its open dispatcher in [`src/js/file/projectNavigator.js`](../src/js/file/projectNavigator.js#L1387) maps records as follows:

| Project record | Editor/runtime | Production accessibility |
| --- | --- | --- |
| `graphic` in `/screens` | 2D editor | Normal default path. |
| `graphic` in `/sprites` | 2D editor with sprite context | File-, URL-, Explorer-, or restore-driven; no normal blank-sprite command. |
| `3d scene` | 3D editor | Hidden with Explorer, except direct URL/restore. |
| `color palette` | Standalone palette editor | Hidden with Explorer; embedded 2D palette tools remain available. |
| `tile set` | Standalone tile-set editor | Hidden with Explorer; embedded 2D tile tools remain available. |
| `music` | Music editor | Hidden with Explorer/direct URL/restore. |
| `asm` | Assembler IDE | Hidden with Explorer/direct URL/C64 route. |
| `script` | Script editor | Hidden with Explorer/restore. |
| `json` | JSON editor | Hidden with Explorer/restore; no New item. |
| `bin` | Hex editor | Hidden with Explorer/restore; build/export code can generate these records. |
| `prg` | C64 or missing X16 runtime according to `prgHandler` | Build-output driven; C64 works, X16 does not. |
| `cfg` and unknown extension-derived records | Generic text editor | Hidden with Explorer/restore. |
| Legacy `textmode` | 2D editor | Accepted for old project formats. |
| `folder`, `hiddenfile`, `block set`, `color map` | Structural/internal | Not intended as standalone editors. |

The desktop tree currently does not filter `hiddenfile` records, although the old filter remains in commented code. Consequently the unfinished Explorer can expose `/settings` and send it to the generic text editor. Mobile Explorer correctly filters it. This is an Explorer bug/risk, not a supported settings editor.

## C64 surface decomposition

“Commodore support” is not one component:

1. The full `C64Debugger` is a top-level runtime entered through file loading, a direct URL, or Explorer/build output.
2. The top-level assembler creates a compact `C64Debugger` alongside Ace and build output in [`src/js/assembler/assemblerEditor.js`](../src/js/assembler/assemblerEditor.js#L247).
3. The full C64 debugger creates another embedded assembler and exposes it through Assembler -> Show Assembler.
4. The 2D image editor directly exposes C64 Formats and C64 Sprite Formats import dialogs plus several C64 export formats. Those dialogs may run emulator code for preview/conversion without entering debugger mode.
5. The `c64page` bundle is an exported standalone HTML runtime, not an editor surface.
6. The older `C64Interface` construction is commented and there is no active mode using it; treat it as dead legacy integration.

Once the full C64 mode has been reached, its View menu exposes Disassembly, Scripting, BASIC, Colours, Memory, Character Set, Sprites, Bitmap, SID, Drive, Docs, and Calculator panels in [`src/js/editor.js`](../src/js/editor.js#L1491). Those components are working descendants of a conditionally reachable parent; they are not independently reachable from 2D.

## Other hidden, gated, or dormant user-facing pieces

These do not justify additional top-level modes, but they are relevant to a complete command and shortcut catalog:

- The 2D Background Image dialog and show/hide commands are implemented, but both View-menu items are commented. The similarly named Reference Image dialog is active and reachable, so the two should not be conflated; see [`src/js/editor.js`](../src/js/editor.js#L1297) and [`src/js/textMode/backgroundImage.js`](../src/js/textMode/backgroundImage.js#L1).
- Assembly import is constructed and has a live menu handler, but its Import-menu entry is commented in [`src/js/editor.js`](../src/js/editor.js#L1165).
- The advanced C64 PRG generator is still used internally by normal PRG exports, but its dedicated advanced menu entry and C64 PRG code-editing entry are hidden/commented.
- The old global Settings menu for Audio Options, C64 PRG Code, and C64 Effects Code is commented. Only the C64 PRG code handler remains visibly connected to an implementation.
- The old Tools menu entries for a standalone Image Effects surface and C64 Bytes Free are commented. Image effects themselves are still reachable within image/video import and GIF/PNG export, so they are not wholly inaccessible.
- X16 BASIC export, the 2D NES screen mode, and Scripting API help are gated by `SHOWUNFINISHED`. X16 assembly export remains visible.
- 3D OBJ and MagicaVoxel export commands are available after reaching 3D. Old OBJ/FBX import entries are commented, and no matching import implementation is present in the current source tree.
- The old `ui-menu-assembler-old` C64 menu is constructed but no active mode selects that menu class. The current assembler uses `ui-menu-c64-assembler` instead.
- `ProjectShare` construction is commented. GitHub, Gist, and Google Drive facades are deliberately disabled by [`src/js/modules/feature-adapters/legacyRemoteProviderFacades.mjs`](../src/js/modules/feature-adapters/legacyRemoteProviderFacades.mjs#L1); dormant and mobile controls fail through the disabled facade rather than providing a working integration.

## Components that may look hidden but are reachable

The following should not be counted as unreachable:

- View -> Scripting opens the global scripting side panel in normal 2D mode. This is separate from editing a project `script` record.
- Palette and tile-set management/editing are available inside 2D, even though the standalone project-document editors are hidden.
- C64 image/sprite import, C64 exports, Mega65/X16 source export, image effects in import/export, and the Reference Image dialog are ordinary 2D features.
- Sprite documents use the 2D editor by design in the current path; only the old standalone sprite editor is dead.
- Ace is an embedded code-editor library used by script/config/assembler/debugger surfaces, not a separate product mode.

## Mobile differences

Mobile Project Explorer is also gated by `SHOWUNFINISHED`. Even when enabled, it lists only screens, sprites, assembler/build records, and 3D scenes, and opens only graphic, 3D, ASM, binary, and PRG types in [`src/js/file/projectNavigatorMobile.js`](../src/js/file/projectNavigatorMobile.js#L575). Music, standalone palette/tile set, script, JSON, and generic text remain absent from mobile navigation.

## Shortcut-system implication

The configurable-shortcut work needs an explicit availability dimension in addition to activation context:

- Catalog commands for active production surfaces, including the file-driven C64 mode and current 2D sprite context.
- Catalog commands for implemented hidden modes only if those modes are intended to be exposed; otherwise hide them from the default keybindings UI behind an unavailable/experimental filter.
- Do not register commands for the legacy SpriteEditor, NES debugger, X16 debugger, old C64 interface, or stale menu fragments until their owning features are restored.
- Do not infer feature availability from bundled source or a leftover menu handler. Availability should come from the same feature/mode registry that navigation uses.
- Project Explorer and editor-mode exposure should be resolved before promising a complete VS Code-style shortcut list, because otherwise users will see commands for surfaces they cannot navigate to.
