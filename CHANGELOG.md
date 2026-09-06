# Changelog

## Unreleased

### Added

- Add 1x, 2x, and 4x intrinsic sizing with a live dimensions readout,
  document or transparent canvas backgrounds, and direct clipboard copying to
  SVG export.
- Let SVG exports target the current canvas selection when one is active.
- Let PNG and GIF exports target the current canvas selection and optionally
  omit the document background, while preserving layer, border, scale, effect,
  preview, download, and clipboard behavior.
- Let Escape finish an active Type-tool session without changing the selected
  tool or artwork, restoring editor shortcuts until the canvas is clicked or
  Type is selected again. Start Type at the current 2D or 3D grid cursor when
  selected with the T shortcut—including after tools that use their own cursor—
  hide the insertion cursor when finished, and show the current typing state
  alongside the on-screen keyboard.

### Fixed

- Preserve pixel-mode selection bounds in PNG/GIF exports and reserve GIF
  transparency as a dedicated palette entry so opaque colours cannot disappear
  during quantization. Respect transparent export backgrounds in the shared NES
  sprite renderer as well.
- Increase the GIF/PNG export controls pane height so its standard options fit
  without scrolling.
- Populate the SVG export filename from the current project name, including
  project renames made after the export dialog was first opened.
- Remove the P1 legacy-code backlog: delete unreferenced backup sources, the
  superseded standalone sprite editor, the broken NES/X16 runtime shells, dormant
  NES assembler/build targets, the unused assembly-import and old C64-menu paths,
  and obsolete commented entry points while preserving current 2D sprite editing,
  C64 debugging, assembler output, old `textmode` records, and X16 assembly-source
  export.
- Fix new 2D sprite projects by loading their default C64 colours as a palette
  preset instead of treating the preset name as raw palette data.

## 0.497.7 - 2026-09-06

### Added

- Add an improvements sidebar and GitHub link to the landing page, identify the
  maintained edition as lvllvl plus with its current version, and add an About
  dialog with generated release version and build-date information.

## 0.497.6 - 2026-09-06

### Fixed

- Keep startup and runtime mobile layouts cohesive with a compact 46-pixel app
  bar, consistent tool and palette dimensions, working accessible menu controls,
  on-demand expanded controls, and lossless desktop restoration of enabled
  panels, custom split sizes, resize affordances, and Interface-menu checks
  across repeated mode switches and mobile tool changes. Use a smaller
  responsive application drawer with correctly aligned tool and Save controls,
  contained keyboard focus,
  prompt touch actions, mouse-scrollable mobile tile palettes, mouse-operable
  tile choosers with synchronized selection outlines, single-choice mobile
  palette dialogs that dismiss after selection, and clean project tabs when
  returning to desktop mode.
- Prevent hidden, zero-sized mobile tile palettes from causing canvas exceptions
  during device and layout changes.
- Replace bitmap-layer destination readback and repeated per-cell pixel expansion
  with a bounded, revision-aware tile atlas. Cache mode-specialized text, indexed,
  RGB, C64, and NES rasters while preserving orientation, transparency, reference
  images, selections, scratch rendering, and selective animation invalidation.
- Batch animated, edited, transformed, and history-restored tile IDs before
  refreshing tile palettes. Reuse tile-to-slot layouts, redraw bitmap/vector
  glyphs through direct slot lookups, restrict bitmap uploads to dirty tile
  rectangles, clip vector glyphs to their slots, and route all desktop palette
  redraw entry points through coalesced hidden-panel deferral.
- Bound pixel, tile, and block-grid line selection to the artwork/viewport/
  dirty-region intersection, preserving world alignment and clipped stroke edges
  at fractional zoom and device ratios instead of visiting offscreen grid lines.
- Cache animation-preview composites in a bounded three-frame LRU keyed by cell,
  used-tile, palette, block, layer, background, dimension, and reference-image
  dependencies. Skip unchanged one-frame ticks, keep preview rendering isolated
  from viewport state and editing overlays, guard scratch-canvas dimensions, and
  remove resets of the disabled legacy effect buffer.
- Limit animated-tile and pixel-edit redraws to layers and cell regions that use
  the changed tiles. Reuse per-frame usage indexes, retain disconnected and
  offscreen damage, patch affected onion-skin regions, refresh hidden-layer
  thumbnails, preserve unrelated caches, and batch animation and pixel-shape
  updates without advancing the global tile-set render revision. Normalize C64
  ECM aliases, invalidate scripting placement caches, and union scaled damage
  before blended compositing.
- Keep dialogs centred and within the current viewport without permanently
  shrinking them, make image/video import use the available height, and keep
  tile-set and colour-palette metadata from displacing visible controls.
- Run Chromium, Firefox, and WebKit checks as independent GitHub Actions jobs,
  keeping one Playwright worker per runner while removing the serial browser
  bottleneck from Pages deployments.
- Keep image import available through its CPU conversion path when the browser
  cannot allocate the importer's optional WebGL effects renderer.
- Isolate shape-preview rendering measurements from independently scheduled
  layer-thumbnail refreshes on slower browsers.

## 0.497.5 - 2026-09-05

### Documentation

- Rewrite the README around the fork's visitor-facing improvements and move build,
  architecture, browser-support, and dependency-maintenance details into a linked
  development guide.

### Added

- Add an opt-in production-build rendering workflow benchmark with isolated
  projects, source-map qualification, raw input/RAF/main-thread measurements,
  separate Canvas operation counts, and final document/thumbnail checks. Record
  a same-host before/after comparison of R1–R3 for drawing, drag strokes, onion
  skin, rectangle previews, tile selection, and panning in `docs/performance`.

### Fixed

- Keep the home logo and Help documentation within repository subdirectory
  deployments, and publish the documentation pages and their assets.
- Restore frame playback after the image importer became a lazy module, while
  continuing to prevent playback during an active image import.
- Preserve full-image sampling when repairing cropped layer thumbnails. Apply
  one world-aligned scale instead of independently scaling each crop rectangle,
  fixing small pixel discrepancies after onion-skin drawing in Chromium and
  Firefox without increasing raster work or scratch storage.
- Batch dirty layer thumbnails on a 100 ms schedule instead of resampling on
  every pencil redraw, with explicit release/history/display flushes. Cache by
  content dependencies and skip view-only changes. Repair warm offscreen/vector
  thumbnails from cropped cell damage, retaining sampling alignment and reference
  images without consuming artwork dirtiness or rerasterizing the whole layer.
  Schedule direct typing and palette-editor draws too. Remove the thumbnail-driven
  full-artwork redraw on shape release.
- Keep shape previews out of cached artwork, store only touched cells, and bound
  preview rasterization and dirty presentation to shape/viewport intersections.
  Batch endpoint presentation once per animation frame while preserving final
  release cells, mirroring, cancel, and undo/redo. Preserve vector pixel alignment
  at fractional zoom and avoid unchanged bitmap readbacks with offscreen dirtiness.
- Keep animation/export scratch renders from consuming or reusing the main
  viewport's dirty state, so panning during shape drawing reveals current artwork.
- Remove fractional vector preview seams with pixel-aligned composite clips and
  matching blit origins; fully clear touched raster pixels to prevent low-zoom
  alpha accumulation in reused vector buffers, including Firefox.
- Honor disabled character/color channels in single-cell shape previews.
- Cache onion-skin rasters per layer so current-frame cell edits no longer redraw
  the unchanged previous frame. Refresh on frame/content, shared tile animation,
  palette/block, background, dimension, and render-option changes; key vector
  caches by viewport/scale without consuming current-frame dirty state.
- Keep current-frame selections out of onion-skin rasters and use the previous
  frame's C64 ECM background colors when rendering it.
- Stop fractional-zoom glyph jitter with a shared, deterministic pixel-centre
  sampler for bitmap artwork and previews, including Firefox at 225%, odd-sized
  tiles during dirty redraws, and Chromium cursor previews below 100% zoom.
- Keep bitmap cursor previews aligned with committed artwork at all device ratios,
  while preserving dirty-cell updates, blending, bounded raster storage, and a
  native no-readback fast path for integer magnification.

## 0.497.4 - 2026-09-05

### Added

- Add a rendering performance review with prioritized bottlenecks and summarized
  Chromium observations in `docs/performance`.
- Add detached SVG document snapshots and a pure deterministic encoder behind
  the classic SVG export dialog.
- Add injected persistence and document-session contracts for immutable blobs,
  versioned manifests, journals, catalog metadata, active revisions, dirty state,
  and save-in-flight publication, with lifecycle and per-stage failure coverage.
- Add automatic native-module discovery, layered public-entry and cycle checks,
  a legacy ordered-graph non-growth policy, and checked JSDoc contracts for the
  governed module graph.
- Add context-scoped image-import loading with focused open/close coordination,
  retry UI, stale-open cancellation, and focus restoration.

### Changed

- Adopt a stable hybrid architecture: retain boundaries that improve data safety,
  security, deterministic encoding, or lazy-feature lifetime while leaving stable
  editor and format controllers in the classic ordered graph.
- Emit image import as a retryable ESM feature entry and resolve its active
  context instance through a feature handle instead of a global constructor or
  editor-owned importer.
- Temporarily disable GitHub, Gist, and Google Drive, remove their provider-facing
  controls and runtime artifacts, and tighten CSP to the remaining Lospec network
  dependency until a reviewed server-side credential design is available.
- Consolidate disabled-provider behavior into one hard-disabled policy plus
  deterministic callback-era stubs instead of retaining a provider framework.
- Keep text-mode mutations on the per-document classic `History` path and remove
  the parallel command, replay, history-state, and editor-state abstractions.
- Keep stable import/export formats on their direct classic construction paths;
  remove the generic registry, values, capability membrane, and mass caller
  rewiring.
- Route project open, ordinary save, autosave, Save As, recovery, catalog and
  repository metadata, delete, and cache persistence through the eager
  application service and its browser-storage adapter.
- Create every legacy `Document` with an isolated revision session and generate
  identifiers and timestamps through composition-root dependencies.
- Keep ordinary editor mode changes synchronous and route only image-import entry
  points through its narrow coordinator.
- Replace the phase-by-phase extraction roadmap with the preserved hybrid endpoint
  and criteria for any future boundary.
- Allow local browser tests to select an unused preview port when another project
  already owns the default port.

### Fixed

- Keep generated SVG path and transform data inside escaped attributes.
- Keep Vite's development transform from rewriting the retryable image-import
  module URL into an unsupported variable-import glob.
- Require computed dynamic imports to retain an exact graph-declared module path,
  preventing a declared generated entry from masking unrelated runtime imports.
- Consume shader-import activation failures after showing the error banner,
  avoiding an unhandled promise rejection from the menu command.
- Allow image-import retry to recover after a failed ESM request by giving each
  attempt a distinct release-scoped URL, avoiding the browser's cached failed
  module-map entry.
- Declare image-conversion loop state locally so the former classic-script code
  retains its behavior under the strict semantics of its new ESM entry.
- Make retired GitHub, Gist, and Google Drive links return to the start page and
  keep remaining callback-era provider callers failure-safe.
- Prevent a failed or disabled Google Drive save from changing the project name,
  destination, or new-project state and then reporting success.
- Stop requesting broad GitHub OAuth scopes or persisting reusable provider
  tokens as Firestore application data by removing the browser credential flow;
  historical deployed tokens still require operational revocation and deletion.
- Restore the prior history position and enabled state when classic undo or redo
  replay fails, compensate earlier actions in a partially failed replay, and
  avoid dirtying, redrawing, or recording unchanged tile pixels.
- Serialize project save, recovery, and catalog mutations so a second session or
  project listing cannot mistake a live transaction for an interrupted save.
- Journal browser-project deletion, remove its catalog entry before data cleanup,
  and resume either an interrupted catalog update or cleanup on the next access.
- Remove the active immutable manifest record when deleting a browser project,
  avoiding an orphaned version after its pointer is removed.
- Serialize feature activation with disposal, retain instances after failed
  cleanup for retry, and preserve feature-specific types through registration
  handles.
- Prevent cache-version rewriting from modifying comments or string content, and
  version valid imports containing comments through parsed source locations.
- Enforce the legacy graph baseline against its Git predecessor so editing the
  fixture cannot bypass reviewed exceptions.
- Roll back incomplete image-import opens, close nested dialogs safely, serialize
  asynchronous teardown, and focus the visible chooser.
- Close partially opened image-import UI when importer startup throws, and retire
  failed import state when the editor changes mode.
- Observe browser-test request failures on the configured preview origin instead
  of assuming the default port.
- Compare legacy-graph policy against the complete pre-push revision so a
  multi-commit push cannot hide baseline growth.
- Ignore image-import shortcuts while their menu is hidden, and keep the mobile
  import action from blocking adjacent start-page controls.
- Serialize animated mobile image-import teardown, keep repeated opens idempotent,
  and prevent stale activations from replacing active UI.

## 0.497.3 - 2026-09-05

### Added

- Add a phased P1.4 module-migration plan with necessity ratings, measurable
  phase gates, testing requirements, and legacy-removal criteria.
- Add a centralized sanitized-HTML policy, Trusted Types enforcement, strict
  repository-address validation, and an opaque capability sandbox for music
  scripts.
- Add independent Fit-to-width modes for the bottom and side tile palettes,
  dynamically resizing tiles with their panels while retaining precise manual
  percentage entry and 50% zoom controls.

### Changed

- Replace raw button-markup inputs with explicit image and text properties,
  reuse music-script wrappers within command batches, and remove obsolete UI
  implementations that contained legacy dynamic code and inline handlers.

### Fixed

- Restore saved-project thumbnails on the landing page, preserve formatted layer
  metadata without exposing HTML source, and publish DOMPurify's source map with
  its package sources embedded so development tools emit no missing-source warnings.
- Remove application-origin dynamic code execution, replace assembler expression
  evaluation with a bounded parser, and enforce a restrictive production CSP.
- Route label assignments and byte directives through the complete bounded
  assembler grammar, rejecting trailing syntax instead of accepting a numeric
  prefix, keep repeated label-placeholder offsets independent, and avoid
  duplicate sanitization at Trusted Types sinks.
- Authenticate delegated shared-UI actions, use prototype-safe maps for imported
  identifiers, reject protocol-relative sanitized URLs, and bound queued music
  scripts so forged markup and stalled sandboxes cannot retain privileged work.
- Keep the development server available after atomic rebuild publication by
  following the stable `dist` symlink across Vite restarts.
- Keep layer thumbnails contained vertically within their layer rows and visible
  at extreme canvas ratios without repeatedly resetting their drawing contexts.
- Preserve fractional tile-palette scales such as 25%, 50%, and 150% instead of
  truncating them to integer scale factors.
- Snap tile-palette scaling to pixel-aligned steps so spacing remains even across
  every row and column.
- Keep tile spacing stable and Fit within the panel for large, coprime, and
  sub-25% tile scales.
- Render C64 multicolor tiles correctly at fractional palette scales.
- Enable Fit by default when no explicit Fit preference has been saved, cap
  manual scaling at 1000%, and allow Fit to use the full panel width independently.
- Keep both tile-palette control rows accessible when the side panel is narrow.
- Keep the Fit label vertically centered and display the percent suffix inside
  the tile-palette scale field using the same color as its number, with the
  minus and plus buttons flush against the field and the original surrounding
  control spacing preserved without an extra pixel after the plus button.
- Dim the scale value and percent suffix while Fit is enabled.
- Keep tile-palette selection outlines aligned with non-square tiles.

## 0.497.2 - 2026-09-04

### Fixed

- Keep Firefox's 2D editor rendering stable by confining pencil updates to edited
  cells, flattening artwork and grid pixels into one opaque cached base without a
  second full-size grid buffer, and painting cursor and marquee graphics on a
  separate transparent overlay.

## 0.497.1 - 2026-09-04

### Fixed

- Vertically align grid information values and colour swatches, and center native
  and custom checkboxes with their adjacent labels.

## 0.497.0 - 2026-09-04

### Added

- Export text-mode, C64 standard, and C64 ECM graphics as SVG geometry generated
  from their binary tile pixels, including cell colors, backgrounds, flips, and
  rotations.

### Fixed

- Size SVG exports from the selected layer instead of assuming a 40 by 25 grid,
  preserve transparent backgrounds, and use the standard SVG MIME type.

## 0.496.10 - 2026-09-04

### Added

- Add a close control and a persistent Interface menu toggle for the bottom
  animation panel, reclaiming its workspace when hidden.

## 0.496.9 - 2026-09-04

### Fixed

- Keep the web app manifest, install scope, and start URL relative so deployments
  work from repository subpaths such as `example.com/lvllvl/`.
- Skip Playwright's incompatible bundled WebKit revision on macOS 14 while
  retaining WebKit coverage on supported CI hosts.
- Override JSHint's vulnerable Lodash and Minimatch transitive dependencies with
  patched compatible releases so the production security audit can pass.
- Correct the SID export build input's filename casing and validate every build
  input case-exactly so macOS catches errors that would otherwise fail Linux CI.
- Parse colorized development-server output reliably in CI, and leave license
  exception enforcement to the repository's exemption-aware dependency policy
  while OSV Scanner remains responsible for known-vulnerability detection.
- Include page state and observed browser failures when production startup
  checks time out, making engine-specific CI failures actionable.
- Keep the 2D interface available when WebGL initialization fails instead of
  aborting startup on GPU-less systems such as GitHub-hosted Linux runners.

## 0.496.8 - 2026-09-04

### Fixed

- Associate form labels with their controls, or remove invalid empty targets from
  group and spacer labels, to prevent Firefox's misleading empty
  `getElementById()` warning.
- Regenerate the Glyphicons Halflings WOFF2 with corrected glyph bounds and side
  bearings, removing Firefox font warnings without changing glyph outlines or
  character mappings.
- Remove obsolete unreachable implementations and redundant control statements
  from the first-party bundle while preserving reachable local bindings, and
  reject new unreachable or undefined statements during source tests and new
  first-party Firefox console issues in the default-project browser flow.

### Documentation

- Add a cross-browser console snapshot for the default new-project flow,
  including Firefox warning classifications and historical source-map
  locations for the formerly unreachable code.

## 0.496.7 - 2026-09-04

### Changed

- Add a native ES-module composition root and single-flight feature registry with
  parser-enforced dependency boundaries, retryable activation, and narrow adapters
  for the remaining legacy globals.
- Move the roughly 380 KB image-import subsystem out of the initial application
  bundle and load it once on first use while preserving existing menu, mobile,
  drag-and-drop, animation, and tile-palette callers through a compatibility facade.

### Fixed

- Keep failed lazy feature loads retryable and show an actionable persistent error
  instead of leaving image-import callers with an unhandled load failure.
- Limit Vite's development dependency scan to the primary HTML entry so the
  C64 entry's base-relative bootstrap URL is not mistaken for a package import,
  give each local rebuild a fresh asset revision, and disable caching for locally
  rebuilt assets so stale HTML fragments and styles cannot survive a reload.
- Close icon elements explicitly in image-import and frame HTML fragments so
  icon-font styling cannot leak into dialog labels and controls.
- Make ES-module boundary checks distinguish unresolved globals from local
  bindings and property names, and include `.mjs` modules plus module-relative
  `import.meta.url` references in runtime and asset request discovery.

## 0.496.6 - 2026-09-04

### Changed

- Replace the drifting source/template build inputs with one production HTML
  entry point and a declarative, ordered legacy-script graph consumed by Rollup;
  derive the release version exclusively from `package.json` and publish
  embedded-source release maps beside both JavaScript bundles.
- Split source, build-artifact, and browser verification into explicit test
  commands and add reviewed SHA-256 golden records for the principal generated
  artifacts.

### Fixed

- Remove raw textual constant, identifier, and property rewriting from the
  production build so JavaScript names are changed only by parser-aware Terser
  mangling.
- Publish complete builds through an atomic `dist` version-pointer switch so
  failed builds leave the last good artifact continuously available.
- Generate C64-specific social and icon metadata from the shared HTML entry
  point and protect the nested C64 entry with artifact golden tests.
- Prevent the development server from rebuilding indefinitely when macOS emits
  unchanged `package.json` events after the atomic `dist` pointer is updated,
  and restart Vite after real rebuilds so it follows the newly published target.

## 0.496.5 - 2026-09-04

### Changed

- Define the supported desktop, phone, and tablet browser matrix in Browserslist,
  emit and verify ECMA 2020 JavaScript, exercise production startup across
  Chromium, Firefox, and WebKit CI profiles, and enforce initial-payload and
  start-page performance budgets.

### Fixed

- Make browser-policy verification fail when its explicit Browserslist contract
  is missing, exercise the 360 by 640 minimum phone viewport and genuine provider
  outages, and run browser tests before the independent production audit gate.

## 0.496.4 - 2026-09-04

### Fixed

- Make browser project saves and autosaves propagate storage failures, retain
  dirty in-memory edits across every in-flight timing window, publish immutable
  versioned commits, and recover interrupted metadata or cleanup through a save
  journal instead of reporting success or deleting the previous Save As copy
  prematurely. Save As and GitHub workflows now also stop when their local
  persistence prerequisites fail.

## 0.496.3 - 2026-09-04

### Changed

- Move 15 additional browser-library families to exact npm dependencies while
  preserving their legacy public URLs, and remove their checked-in copies.
- Reduce `src/lib` to 16 intentionally retained files with immutable revisions,
  reproduction metadata, ownership, review deadlines, checksums, and focused
  browser compatibility coverage.
- Replace the custom Modernizr build with a first-party CSS-scrollbar capability
  check and enforce the retained-source policy in the dependency inventory.
- Reclassify the initial dependency inventory work as a mitigation and complete
  the remaining migration or formal-retention work tracked by P1.6.

## 0.496.2 - 2026-09-04

### Changed

- Reclassify dependency inventory work as a mitigation and track migration or
  formal retention of the remaining 24 vendored runtime components as P1.6.
- Upgrade the browser runtimes to jQuery 3.7.1, JSZip 3.10.1, and CodeMirror
  5.65.21 through exact npm dependencies while preserving their legacy URLs.
- Upgrade the production Firebase compatibility SDK from 7.6.0 to 10.9.0.
- Self-host a checksum-tracked snapshot of the Google API loader instead of
  executing its mutable provider-managed entry point.
- Scan the generated runtime SBOM for vulnerabilities and disallowed licenses on
  pull requests, deployments, and a weekly schedule, with expiring documented
  exemptions for artifacts that have no advisory-supported package identity.
- Include package URLs, locked transitive browser dependencies, and SPDX
  `DEPENDS_ON`/`CONTAINS` relationships in the generated inventory artifacts.
- Add a validated third-party dependency inventory, generated SPDX SBOM, and
  production third-party notices covering every reachable `src/lib` entry point
  and external production dependency URL.
- Source Perfect Scrollbar 1.4.0 from an exact npm dependency while preserving
  its legacy browser URLs and verified browser API.
- Remove 1,833 unreachable vendored library files, reducing `src/lib` from
  approximately 62 MB to 5 MB.
- Audit npm-managed runtime packages before deployment and enable weekly
  Dependabot updates.

### Fixed

- Replace the vulnerable bundled GitHub.js/axios client with a tested first-party
  Fetch adapter that preserves the legacy GitHub client contract.
- Generate a content-addressed SPDX document namespace so distinct SBOM revisions
  cannot reuse the same identifier.

## 0.496.1 - 2026-09-03

### Changed

- Adopt the MIT License for contributions and material the current maintainers
  have authority to license, while documenting the unresolved license status of
  the inherited upstream code.

### Fixed

- Bundle the Perfect Scrollbar and CodeMirror styles required by production UI
  panels and the music scripting editor.
- Make runtime dependency discovery preserve comment markers inside JavaScript
  strings, and exercise lazy workers, WebAssembly modules, and editors in a
  production-browser smoke test.
- Return an explicit failure from the Exomizer worker instead of leaving callers
  waiting indefinitely when compression reports an error.
- Include the runtime workers, WebAssembly modules, and lazy-loaded editor
  scripts needed by GIF export, CA65 assembly, music scripting, and Ace, plus
  the missing mobile start-page icon.
- Load CA65 and LD65 in production and use the deployed Exomizer worker path.
- Verify the reviewed runtime dependency closure as part of `npm test`.

## 0.496.0 - 2026-09-03

### Changed

- Replaced the PHP build scripts with a Node.js ESM build using Terser and
  html-minifier-terser.
- Added a Vite development server with source watching and automatic reload via
  `npm run dev`.
- The build now recreates `dist/` so deleted source assets cannot remain in the
  deployment output.
- Removed generated `dist/` output from version control.
- GitHub Pages now installs Node dependencies, builds, and verifies the site before
  deployment.

### Fixed

- Include the dynamically loaded Ace editor themes in the deployment output.
- Exclude macOS `.DS_Store` metadata from generated files.
