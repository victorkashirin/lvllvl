# Changelog

## Unreleased

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
