# Modernization review: critical problems

Review date: 2026-09-03

Last status update: 2026-09-04

## Behavior

Once one item is fixed, mark it as such.

## Executive summary

At the time of the review, the Node migration had replaced the old build entry
point but had modernized the build host rather than the application architecture.
The browser application remains a large, global-script codebase, but the custom
text transforms, drifting production entry points, and lack of behavioral and
build coverage identified here have since been addressed.

The first modernization milestone should protect user data and credentials and make releases trustworthy. In particular:

1. **Fixed:** the production build omitted files loaded dynamically at runtime while the build verifier still passed.
2. **Fixed:** IndexedDB/localForage write failures were ignored in important save paths, so the UI could report success after data was not persisted.
3. A broad GitHub OAuth token is stored in Firestore and reused by the browser client.
4. User- and server-controlled strings are inserted as HTML, while music scripting
   and assembler expressions use main-origin dynamic code execution.
5. **Fixed:** there was no first-party behavioral test suite or pull-request CI gate to make a large refactor safe.

These are higher priority than converting files to classes, TypeScript, or ES modules. Those structural changes should follow a small but meaningful regression suite.

## Baseline review scope and evidence

The following evidence records the original 2026-09-03 baseline: a static
repository review, a clean production build, and the checks defined at that time.

- `npm run check` passed, but it only syntax-checks the three build scripts.
- `npm run build` passed and generated 541 files, approximately 19 MB.
- `npm test` passed, but it only verifies selected build artifacts; it does not exercise the application in a browser.
- `npm audit` reported no issues among the 63 npm-managed packages. It does not cover the 1,900+ files under `src/lib`.
- The main generated payloads are approximately 3.4 MB for `main.js`, 4.3 MB for `libs.js`, 243 KB for CSS, and 376 KB for the HTML cache, before transfer compression.
- The first-party `src/js` tree is approximately 237,000 lines. Its scripts use global state rather than an ES module graph.
- Backend configuration and Firestore security rules are not present, so their protections could not be verified.

Priority meanings used below:

- **P0:** credible data-loss, credential, code-execution, or broken-release risk; address before broad refactoring.
- **P1:** blocks safe, reproducible modernization or sustainable open-source maintenance.
- **P2:** important engineering quality and operating improvements after the safety baseline exists.

## P0: make the current application safe to change and ship

### P0.1 The build does not contain all runtime dependencies

**Status: Fixed on 2026-09-03.** Runtime-only files now live in a reviewed build
manifest shared by the copier and verifier. GIF export, CA65/LD65, music
scripting, Ace themes/workers, ACME, Exomizer, and C64 runtime requests are
checked as a dependency closure, and the Exomizer URL now matches its deployed
source path.

**Original finding (2026-09-03):** The build treated HTML as a partial dependency
manifest, concatenated selected scripts, then copied an explicit asset allowlist.
Runtime-created URLs were outside that model.

Confirmed examples after a successful build:

- GIF export requests `lib/gif/gif.worker.js` from `src/js/textMode/export/exportGif.js`, `exportImage.js`, `exportGifMobile.js`, and `src/js/textMode/export3d/export3dGif.js`, but that worker is absent from `dist`.
- `src/js/assembler/ca65Assembler.js` loads `lib/ca65/ca65.js` and `lib/ca65/ld65.js`; neither is copied.
- `src/js/music/musicScripting.js` loads CodeMirror, JavaScript mode, lint helpers, and JSHint from `lib`; these files are absent.
- `src/js/assembler/assemblerEditor.js` requests `lib/exomizer/exomizerWorker.js`, but the source worker is located at `src/c64/exomizer/exomizerWorker.js`.
- Ace is configured with a dynamic base path, while the build copies only two theme files. Any required modes, workers, or themes need to be represented explicitly.

The verifier at review time checked only a small fixed set of files, placeholders,
WASM equality, and cached HTML counts. It therefore passed even when
feature-specific resources would return 404.

**Impact:** GIF export, CA65 assembly, music scripting, and other lazy-loaded features can fail only after deployment. A green build is not evidence that the artifact is complete.

**Recommended change:**

- Define runtime assets as an explicit build graph or a reviewed `public` asset set rather than relying on string conventions.
- Correct the Exomizer URL/source mismatch.
- Add an automated closure check for every worker, script, WASM file, font, image, and other URL constructed by application code.
- Add browser smoke tests for each lazy-loaded feature and fail on unexpected network 404s.
- Avoid copying all 62 MB of `src/lib` as a permanent workaround; inventory what is actually used.

**Exit criteria:** a clean build is self-contained, every tested application request resolves, and removing a required worker makes CI fail.

### P0.2 Save operations can silently lose data

**Status: Fixed on 2026-09-04.** Browser persistence now goes through one
Promise-based error boundary. Project files are written as immutable blobs and
published through a version pointer only after every blob succeeds; a save
journal completes committed metadata after reload or rolls back an interrupted
staging attempt. Documents are marked clean only after the project manifest,
thumbnail, and project catalog all commit, with per-edit revisions preserving
changes made during an in-flight save. Autosaves use the same versioned commit
scheme, Save As no longer deletes the previous project first, and failures leave
work dirty while showing a persistent message with retry and local-backup
guidance. Revision snapshots are captured before asynchronous work, recovery
cleans superseded storage generations, and Save As and GitHub callers propagate
their local persistence failures. Browser tests inject file, manifest, catalog,
cleanup, lookup, and autosave failures and cover recovery, retry, and in-flight
edit behavior.

Important persistence callbacks discard their error arguments:

- `src/js/file/fileManager.js` writes file content with `localforage.setItem(...)` and calls back with `{ success: true }` regardless of the write result.
- `src/js/file/document.js` marks records saved before the final project metadata write and ignores that write's error.
- Autosave and several other localForage writes also ignore failures.

IndexedDB writes can fail because of quota limits, private browsing restrictions, browser eviction, corruption, or serialization problems. An editor must never convert those failures into a success message.

**Impact:** users can close or reload the application believing their work is safe when it was never committed.

**Recommended change:**

- Put persistence behind one Promise-based service with consistent error propagation.
- Only mark a document clean after every required write has committed.
- Make file blobs and the project manifest transactional where possible; otherwise use a journal/versioned commit record that can recover an interrupted save.
- Show a durable, actionable error and preserve the unsaved in-memory document.
- Test quota rejection, unavailable IndexedDB, partial writes, reload recovery, and retry behavior.
- Keep an explicit local export/backup escape hatch.

**Exit criteria:** injected storage failures cannot produce a success state or clear the dirty flag, and interrupted saves recover to a known version.

### P0.3 GitHub credentials are handled as application data

`src/js/file/githubClient.js` asks for the broad `repo` and `gist` scopes, obtains the provider access token in the browser, stores it as `token` in the user's Firestore document, and later reads it back for reuse.

Firebase client configuration values in source are public identifiers, not secrets by themselves. The OAuth access token is different: it grants repository access and is a high-value credential. Client-side Firestore rules are not included in this repository, so the access boundary cannot be reviewed or reproduced.

**Impact:** an XSS flaw, incorrect Firestore rule, account-sharing mistake, or database exposure can become access to private repositories and gists.

**Recommended change:**

- Stop storing reusable provider access tokens in Firestore documents readable by the client.
- Revoke/delete existing stored tokens as part of the migration and inspect access logs where available.
- Prefer a server-side OAuth flow or GitHub App using short-lived, least-privilege tokens and narrowly selected repositories.
- Reduce scopes to the minimum required for each operation.
- Version, review, and test Firebase/Firestore rules and deployment configuration alongside the application, or document their separately controlled source of truth.
- Add an authentication and credential threat model before changing this subsystem.

**Exit criteria:** no long-lived GitHub token is persisted as ordinary user data, access is least-privilege, and backend authorization policy has automated tests.

### P0.4 Unsafe HTML and dynamic code execution create a same-origin XSS risk

There are many calls to `.html(...)` and assignments to `innerHTML` using filenames, repository metadata, error messages, and other non-constant values.

A concrete path exists in `src/js/file/github.js`: a user-supplied repository address is placed into an error-message HTML string after only slash removal, then assigned with `.html(message)`. Markup in an invalid address can therefore reach the DOM. Other sites insert repository names, response messages, project names, and filenames similarly.

This risk compounds the credential issue because GitHub and Google Drive integrations run in the same origin.

Two direct `eval` boundaries add to the same-origin execution risk and prevent a
strict Content Security Policy:

- `src/js/music/musicScripting.js` executes editor content with `eval(content)`.
  This is intentional scripting functionality, but it runs with the page's full
  lexical context and origin privileges. A shared or imported music script can
  therefore access application state, browser storage, and provider credentials.
- `src/js/assembler/assembler.js` uses `eval(param)` for label and arithmetic
  expressions. Its surrounding validation narrows expected input, but a dedicated
  expression parser would provide a smaller and auditable grammar without dynamic
  code execution.

Rollup reports both calls during every build because direct `eval` also obstructs
static analysis and can make identifier transformation unsafe. Replacing them with
`new Function` would silence that specific warning without removing the execution
or CSP risk.

**Recommended change:**

- Use `textContent` or jQuery `.text()` for all plain text.
- Build UI elements with DOM APIs rather than HTML string concatenation.
- Where rich HTML is genuinely required, use a single reviewed sanitizer with a narrow allowlist.
- Validate repository identifiers against their real grammar rather than deleting selected characters.
- Add adversarial tests for names and remote error strings containing HTML, SVG, event attributes, and malformed markup.
- Replace assembler `eval` with a parser that accepts only the required numeric,
  label, unary-byte, addition, and subtraction expressions.
- Run intentional music scripting in a sandboxed Worker or iframe behind an
  explicit capability API; treat imported script content as untrusted.
- After removing inline and main-origin dynamic-code blockers, enforce a Content
  Security Policy and Trusted Types.

**Exit criteria:** untrusted values have no raw HTML sink, no direct `eval` runs in
the application origin, intentional scripting is isolated behind a tested capability
boundary, security regression tests cover the shared UI helpers, and a restrictive
CSP is enforced.

### P0.5 There is no behavioral safety net or PR quality gate

**Status: Fixed on 2026-09-04.** Pull requests now run a reproducible clean build,
source-level failure tests, dependency and artifact verification, and production
browser tests before deployment can proceed. The suite covers application startup,
offline providers, persistence failures and recovery, runtime dependencies, workers,
assemblers, and C64 initialization across the declared browser and device matrix.
The `test:source`, `test:build`, and `test:e2e` commands keep those layers explicit.

**Original finding (2026-09-03):** The repository had no first-party application
tests. The only discovered JavaScript test file was vendored with CodeMirror. The
`test` command verified selected output files, and `check` only parsed build scripts.
The GitHub workflow deployed on pushes to `main` but did not validate pull requests.

**Impact:** a migration can preserve syntax and artifact names while breaking document behavior, rendering, persistence, export, emulation, or authentication. Failures are found after merge or deployment.

**Recommended change:**

- Add pull-request CI that installs from the lockfile, builds from an empty `dist`, runs artifact checks, and executes browser tests.
- Start with characterization tests for boot, create/open/edit/save/reload, undo/redo, import/export, and storage failure.
- Add targeted smoke tests for GIF export, C64/emulator startup, CA65, music scripting, and other dynamically loaded subsystems.
- Mock external authentication by default and keep a small separately controlled integration suite.
- Make `npm test` self-contained, or split commands clearly into `test:source`, `test:build`, and `test:e2e`.
- Test supported browsers and the declared Node version rather than only the deploy runner.

**Exit criteria:** every pull request gets a reproducible build and representative browser tests before merge, and failures block deployment.

## P1: remove modernization blockers

### P1.1 Runtime dependencies are vendored, duplicated, and outside auditing

`src/lib` contains more than 1,900 files across roughly 32 library families and is about 62 MB. Runtime libraries are copied into the repository rather than declared in `package.json`, so the clean `npm audit` result covers the build toolchain but not the code delivered to users.

Examples include jQuery 3.3.1, localForage 1.7.3, JSHint 2.9.4, legacy JSZip code, Ace source distributions, and multiple Firebase versions. Some directories include minified, unminified, source, no-conflict, or backup variants.

**Recommended change:** create a dependency/SBOM inventory with version, purpose, source, license, modification status, and reachable entry points. Move active libraries into the package manager one at a time, protected by compatibility tests. Delete unused duplicates, enable automated advisory/license scanning, and pin or self-host any unavoidable external runtime resource.

**Status: Mitigated on 2026-09-04; remaining migration tracked in P1.6.** The
production dependency closure is now validated and published as a content-addressed
SPDX SBOM with package URLs, checksums,
license expressions, reachable entry points, and bundled dependency relationships.
jQuery, JSZip, CodeMirror, and Perfect Scrollbar are exact npm dependencies covered
by browser compatibility tests; the vulnerable GitHub.js/axios bundle was replaced
with a first-party Fetch adapter; unused vendored duplicates were deleted; and the
Google API loader is self-hosted as a checksum-tracked snapshot. CI blocks deployment
on npm and OSV vulnerability checks, enforces an SPDX license allowlist, and runs on
pull requests and weekly. Components without a resolvable advisory identity require
a documented, expiring exemption that is rejected once stale. This establishes
control and auditability, but it does not yet remove every active vendored library.

### P1.2 The custom build is fragile and has two drifting entry points

**Status: Fixed on 2026-09-04.** Production now has one HTML entry point and an
explicit ordered graph for the legacy JavaScript, CSS, copied scripts, workers,
WASM, and assets. Rollup consumes the legacy-script graph before Terser performs
parser-aware identifier mangling, without textual constant, identifier, or
property substitution. The release version comes only from `package.json`.
Builds complete in versioned sibling directories and publish through an atomic
`dist` pointer switch, so a failed build leaves the last good artifact available.
Release source maps ship beside both JavaScript bundles with embedded sources,
while static checks validate the graph, entry point, maps, C64 metadata, and
reviewed golden hashes before the cross-browser behavior suite runs.

**Original finding (2026-09-03):** `scripts/build.mjs` used regular expressions to
scrape exact `script` and stylesheet attribute forms from `src/index.html`, but
published `src/indexTemplate.html`. Those files already disagreed: the manifest
page referenced Firebase 9.6.6 while the production template loaded Firebase 7.6.0.

The build also performed global string replacement for selected constants and
variable names. Textual replacement was not JavaScript-aware and could modify
property names, longer identifiers, or string data. This made ordinary refactoring
risky. Version data was duplicated as `0.496.0` in `package.json` and `0.496` in
`scripts/build-config.mjs`.

**Recommended change:**

- Establish one production entry point and one source of release version data.
- Represent JavaScript, CSS, workers, WASM, and assets in a real module/build graph.
- Replace textual identifier rewriting with standard parser-aware bundling and minification.
- Add golden artifact and behavioral tests before retiring the legacy transforms.
- Build into a temporary directory and atomically publish it so a failed build does not destroy the last good artifact.
- Generate useful release sourcemaps with an explicit publication policy.

### P1.3 MIT adoption does not resolve inherited licensing provenance

**Status: Partially addressed on 2026-09-03.** MIT now covers new contributions
and other material the current maintainers have authority to license. The status
of inherited upstream material remains unresolved.

The maintained project now adopts the MIT License for new contributions and material that current contributors have authority to license. The repository includes a root `LICENSE`, identifies MIT in `package.json`, and explains the scope in the README.

The inherited source still has an unresolved legal provenance issue. The original repository did not contain an explicit project license. [Upstream issue #1](https://github.com/jaammees/lvllvl/issues/1) records that the original author, James, passed away and a community member's understanding that he intended others to use, host, and continue the project. That discussion is useful evidence of intent, but it is not a formal license grant from the copyright holder or estate. Current contributors can license their own work, but an MIT declaration cannot retroactively grant rights they do not hold.

The repository also embeds many third-party libraries, fonts, character data, emulator/assembler components, and WASM artifacts without a consolidated attribution and provenance inventory.

**Recommended change:** retain the README caveat and avoid representing the provenance question as settled. If practical, seek a formal grant from the relevant rights holder or estate. Add copyright/SPDX metadata to newly controlled work, produce a third-party notices file from the dependency inventory, and audit redistribution compatibility before a new release. Preserve all existing third-party notices and do not retroactively assign MIT to material whose ownership or license is unclear.

### P1.4 Global architecture makes every change high-risk

`src/index.html` references hundreds of scripts in a manually significant order. First-party code does not define an ES module graph, and shared mutable globals are pervasive; `g_app` alone is referenced throughout the application. Several individual files exceed 4,000 lines.

The production build eagerly bundles approximately 7.7 MB of JavaScript before considering feature usage. Heavy editors, exporters, assemblers, emulators, and integrations are paid for up front or loaded through ad hoc paths.

**Recommended change:** avoid a big-bang rewrite. After the safety tests exist, introduce explicit interfaces around these seams first:

1. persistence and document lifecycle;
2. command/history and editor state;
3. import/export workers;
4. authentication and remote providers;
5. emulator/assembler integration;
6. UI routing and feature activation.

Convert one bounded feature at a time to ES modules, keep adapters for legacy globals during the transition, and lazy-load large optional subsystems. Add dependency-boundary rules so new modules cannot silently restore global coupling.

### P1.5 “Modern Node” does not define the browser target

**Status: Fixed on 2026-09-04.** The supported current stable Chrome, Edge,
Firefox, Safari, iOS Safari, and Chrome for Android families are now encoded in
Browserslist and documented with desktop, phone, and tablet device classes. All
emitted JavaScript is checked against the ECMA 2020 ceiling, and CI boots the
production application across Chromium, Firefox, and WebKit desktop and touch
profiles, including the minimum 360 by 640 phone viewport and provider-offline
startup. Release checks enforce 9.25 MB raw/2.10 MB gzip initial first-party
payload limits and a five-second start-page budget.

The build requires Node 20.19 or later, while Terser is configured to emit ECMA5. This leaves the server-side build runtime modern but the browser support contract implicit.

**Recommended change:** document the browsers and device classes the project supports, encode that policy in tooling, test it in CI, and only then retire obsolete syntax transforms and polyfills. Add bundle and startup performance budgets appropriate to those targets.

### P1.6 Remaining active runtime libraries are still vendored

**Status: Closed on 2026-09-04.** Nineteen direct browser components are now exact,
lockfile-resolved npm dependencies, the externally delivered Firebase scripts are
version-pinned, and `src/lib` has been reduced from 72 files to 16 files belonging to
nine intentionally retained components. No component has an uninvestigated version.

Ace, Babel Standalone, chroma.js, download.js, GIF.js, Hammer.js, jquery-mousewheel,
jsfeat, JSHint, JSZipUtils, localForage, RGBQuant, Three.js, stats.js, and tween.js
now come from exact npm packages while retaining their legacy public URLs. The custom
Modernizr build was removed in favor of a first-party CSS-scrollbar capability check.

The remaining custom modes, assembler WebAssembly artifacts, inherited helpers,
provider snapshot, interpreter, audio helper, and font parser are pinned to immutable
Git revisions. Their inventory records retention category, reproduction command,
toolchain status, patch list, checksum, license status, owner, review deadline, and
named browser compatibility coverage. The schema rejects unknown versions, expired
exceptions, unpinned retained sources, package assets outside their declared package,
and missing compatibility tests. The nine remaining advisory exemptions exist because
the retained components have no package identity in a supported advisory ecosystem,
not because their versions were left uninvestigated.

**Recommended change:**

- Classify every remaining component as package-managed, reproducibly built from a
  pinned upstream revision, replaced or removed, or intentionally retained.
- Prioritize compatible migrations for Ace, Three.js, localForage, JSHint, chroma.js,
  Hammer.js, and other recognizable published artifacts.
- Preserve legacy public URLs through the build asset mapping and add a focused
  browser compatibility test before removing each vendored copy.
- For modified or binary-only dependencies, record the immutable source revision,
  patches, build commands, toolchain version, checksum, license, and review owner.
- Do not convert an unresolved version into a guessed package URL merely to satisfy
  scanning; replace it or retain a time-limited, documented exception.

**Exit criteria:** every active runtime dependency is either resolved by the lockfile
or reproducibly derived from an immutable upstream revision. `src/lib` contains only
intentional local modifications or artifacts that cannot reasonably be package-managed,
each with provenance, license, checksum, owner, review date, and compatibility coverage;
no exemption remains solely because a version was never investigated.

## P2.1: improve maintenance

- Add static analysis incrementally: formatting, lint rules that prevent new globals and unsafe HTML sinks, and type checking at module boundaries. Avoid formatting the whole legacy tree in the same changes that alter behavior.

## P2.2: improve operations
- Complete release diagnostics beyond the existing source maps: add build metadata,
  actionable client-side error reporting, and checks that the deployed version
  matches the package version.
- Expand the README with architecture, data-storage behavior, browser support, backend setup, and troubleshooting.
- Add `CONTRIBUTING.md` and `SECURITY.md`, including a private vulnerability-reporting route and the validation commands contributors should run.
- Remove dead code and unused vendor files only after reachability and browser tests exist.
- Define privacy and retention behavior for local documents and optional cloud integrations.

## Recommended execution order

1. **Contain immediate risk:** correct the missing build resources, stop false save success, remove stored OAuth tokens, and replace confirmed unsafe HTML sinks.
2. **Install a safety net:** add PR CI and a focused browser characterization suite, including failure injection and request/404 monitoring.
3. **Establish ownership:** document the MIT license scope and inherited provenance, add a third-party inventory and security policy, and establish a backend-rule source of truth and browser support policy.
4. **Make the build conventional:** converge on one entry point and dependency graph, package active runtime libraries, and remove textual rewrites with golden comparisons.
5. **Modernize by feature seam:** introduce modules and typed interfaces around persistence, document state, providers, workers, and optional subsystems; lazy-load as boundaries become explicit.
6. **Tighten continuously:** expand static checks, security headers, dependency scanning, performance budgets, and observability without blocking all progress on a complete rewrite.

The modernization is ready for broad feature refactoring when releases are artifact-complete, storage failures are honest and recoverable, privileged credentials are isolated, untrusted strings cannot execute as markup, and representative browser workflows gate every merge.
