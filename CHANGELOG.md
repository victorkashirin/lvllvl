# Changelog

## Unreleased

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
