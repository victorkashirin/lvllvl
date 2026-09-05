# Architecture migration

lvllvl is moving from one ordered global-script bundle to native ES modules one
feature seam at a time. The remaining legacy graph is declared in
`scripts/build-graph.mjs`; new application code belongs in a governed module
source root.

## Automatic module governance

`src/js/bootstrap.mjs` and every `.mjs` file below `src/js/modules/` are discovered
automatically. The same discovered set drives source verification, production
copying, required-output checks, artifact goldens, and the dependency report. A
new file therefore cannot be hidden by omitting it from a separate manifest:
unreachable files, imports outside the governed roots, and production omissions
all fail the normal checks.

`node scripts/module-boundaries.mjs` parses the graph and prints each module's
layer and direct dependencies. It rejects:

- browser or storage globals outside designated composition/infrastructure
  adapters;
- reverse layer imports;
- cross-package imports that bypass a declared public entry point;
- non-literal dynamic imports and imports outside governed roots;
- unreachable modules; and
- dependency cycles without a specific documented exception.

The layer direction is:

```text
bootstrap/composition
        |
        +--> feature adapters --> application services --> domain modules
        |                              |
        +--> infrastructure adapters --+
```

The source locations are `modules/feature-adapters/`, `modules/application/`,
`modules/domain/`, and `modules/infrastructure/`. `src/js/bootstrap.mjs` is the
composition root and selects concrete adapters. Public entry points and allowed
layer directions live in `moduleGraph`; the module file list does not.

Production imports receive the release query only while being copied to `dist/`,
so source imports remain statically resolvable while deployed modules retain cache
busting.

## Feature lifetime

Every feature declares one of three scopes:

- `application` creates one application-wide instance;
- `context` creates one instance for each editor, document, or route context; and
- `per-use` creates a fresh instance for every activation.

Code loading is single-flight independently of scope. Context activations are
single-flight only for the same context; simultaneous different contexts cannot
receive one another's state. Failed loading and activation remain retryable.
Context and per-use definitions must provide disposal, and the registry exposes
both targeted `dispose()` and `disposeAll()` operations.

The image importer is context-scoped. Disposal releases an optional importer
cleanup hook and restores the editor's compatibility facade, allowing later
reactivation without reloading its code.

## UI routing and activation

`modules/application/uiRouteService.mjs` owns stable route identifiers and the
loading, ready, failed, retrying, and disposed lifecycle. Navigation is
single-flight for repeated loading requests to the same route and context. A ready
route cleans up before reactivation unless its definition explicitly guarantees
that the same scoped instance can safely transfer ownership. Changing routes
aborts an in-flight activation, ignores stale completion, and runs the registered
route cleanup. Replacement activation waits for asynchronous teardown, while
overlay routes preserve and restore their underlying ready route. Route definitions
receive an abort signal and an idempotent close action instead of reaching into
global UI state.

The composition root registers legacy editor modes and the context-scoped image
importer through `modules/feature-adapters/legacyUiRoutes.mjs`. Menu selection,
the keyboard shortcut, mobile menu, drag-and-drop, start-page action, and direct
`?route=feature:image-import` startup all call that same route contract. The
adapter alone creates loading and error DOM, owns the retry control, moves focus
to the visible chooser in a ready route, and restores the invoking element when
the route closes. Image-import activation rolls back partial dialog creation, and
cleanup closes any nested dialogs above the importer before closing the importer.

## Boundary contracts

Public module ports use checked JSDoc contracts. `tsc -p jsconfig.modules.json`
checks only the governed module graph and its composition declarations; the legacy
tree is intentionally outside this first type-checking boundary. The contract
check, graph check, and legacy-growth check run together through
`npm run architecture:check` and as part of source tests.

`FeatureRegistry.register()` returns a typed feature handle whose activation
context, instance, facade, and disposal target are inferred from the registered
definition. New module callers should retain that handle instead of using the
string-based compatibility methods exposed to the legacy editor.

## Persistence and document sessions

Persistence is an eager core service assembled in `src/js/bootstrap.mjs`; it is
not a feature and is never lazy-loaded. The composition root injects the clock,
identifier generator, error reporting, and the infrastructure storage adapter.
Only `modules/infrastructure/browserStorageAdapter.mjs` knows about the legacy
`BrowserStorage`/localForage host. Application and domain modules do not read
`g_app`, browser storage, `Date`, or randomness directly.

`modules/application/persistenceService.mjs` is the persistence contract used by
the legacy `FileManager` adapter. It owns immutable blobs, versioned manifests
and pointers, the save journal, project catalog and thumbnail metadata, autosave,
recovery, and cleanup. A normal project save has one publication protocol:

```text
serialize + dirty snapshot
        -> journal
        -> immutable blobs
        -> immutable manifest
        -> active-version pointer
        -> thumbnail + project catalog
        -> stale-data cleanup
        -> journal removal
```

Until the pointer changes, recovery removes unreachable staged data and retains
the previous project. After the pointer changes, recovery finishes metadata and
cleanup. Save, recovery, deletion, and catalog mutations share one application
queue because the journals are application-wide; a concurrent list or second
document session therefore cannot recover a transaction that is still running.
There is no second legacy write path.

Project deletion has its own resumable journal. It records the pointer, active
manifest, thumbnail, and blob keys, removes the project from the catalog first,
then cleans up those records and removes the journal. If catalog publication
fails, the project and all data remain available until recovery retries. If later
cleanup fails, the project stays hidden from the catalog and recovery resumes the
idempotent cleanup, so the catalog never advertises a partly deleted project.

`modules/application/documentSession.mjs` coordinates that protocol with
`modules/domain/documentRevisionState.mjs`. Each `Document` receives a fresh
session from `Editor.createDocument()`. The session owns the active persisted
revision, monotonically increasing dirty revisions, and save-in-flight state. It
publishes a completed save only after the full persistence protocol succeeds,
and clears a dirty record only when the saved revision still matches, so edits
made during an in-flight save remain dirty.

The legacy `Document` and `FileManager` globals are compatibility adapters while
their UI and serialization callers remain in the ordered graph. Project open,
ordinary save, autosave, Save As, recovery, catalog updates, repository metadata,
and delete now cross the injected service boundary. The Download As safety action
remains a direct local export and therefore stays available when persistence is
unavailable. Contract coverage lives in `tests/persistence-services.test.mjs`
and `tests/persistence.spec.mjs`.

## Authentication and remote providers

GitHub, Gist, and Google Drive are disabled in production. The previous browser
implementations, Firebase startup/authentication/Firestore code, retained Google
API loader, provider HTML dialogs, and provider-facing controls have been removed.
The CSP permits neither provider network endpoints nor provider frames, and the
build verifier rejects the retired GitHub and Google runtime artifacts. This is a
security posture, not a feature flag: a live provider cannot be enabled without a
new reviewed infrastructure adapter, a separate provider-UI registration, and the
operational revocation/cleanup gate recorded in `docs/01_probems.md`.

`modules/application/remoteProviderService.mjs` is the provider-neutral contract.
It exposes stable provider identifiers, credential-free session state, explicit
capabilities, sign-in/out, list, load, save, and publish operations, progress and
cancellation inputs, and normalized errors. The service owns the capability
required by each operation and validates a strict request envelope before invoking
an adapter. Opaque editor content is not classified by property name; reusable
credentials are unavailable to this layer by construction and may exist only
inside a future reviewed server-side adapter. Session objects are schema-checked,
raw adapter errors are replaced by stable application errors, and the underlying
adapter registry is not exposed to application callers. A future live adapter
must add a reviewed application result contract rather than returning
provider-specific response objects.

At the composition root, GitHub, Gist, and Google Drive are registered separately
through `modules/infrastructure/disabledRemoteProviderAdapter.mjs`. Each returns a
frozen `disabled` session with its declared capabilities and fixed reason.
Provider UI has a separate empty production registration, so replacing an
infrastructure adapter alone cannot expose the dormant legacy controls.
`modules/feature-adapters/legacyRemoteProviderFacades.mjs` keeps dormant
callback-era paths failure-safe while callers are retired: every attempted
operation still crosses the application service, reports the normalized error,
and cannot start a successful login callback. The facade is a temporary migration
adapter, not a location for future OAuth logic.

Repository address validation remains independently testable in
`modules/domain/githubRepositoryAddress.mjs`. Contract coverage in
`tests/remote-providers.test.mjs` covers disabled sessions, request-envelope
validation, operation-owned capabilities, cancellation, offline behavior,
authentication expiry, rate limiting, sanitized session/error state, port
validation, and every direct legacy-facade caller in the production graph.
Production browser security tests verify disabled adapter and UI registrations,
missing provider controls/SDK globals, retired-link fallback, fixed-text error
presentation, and CSP denial of provider endpoints.

## Commands, history, and editor state

Text-mode commands are an eager, per-editor service assembled in
`src/js/bootstrap.mjs`. `modules/application/editorCommandService.mjs` selects a
separate `HistoryService` timeline for each active document, so changing frame,
layer, tool, or mode cannot redirect undo or redo to another document. The
timeline and its grouping rules live in `modules/domain/historyState.mjs`; it
retains the existing entry and action object shapes and the legacy
`startEntry`, `addAction`, `endEntry`, `undo`, and `redo` surface.

History no longer stores the broad text-mode editor. At the composition root,
`modules/feature-adapters/textModeHistoryAdapter.mjs` converts the legacy editor
into the narrow replay capabilities and maps stable action names onto cell, tile,
selection, frame, layer, cursor, color, and invalidation operations. Rendering
remains outside the history service and is requested through replay callbacks.
The former global `History` constructor and its ordered build entry have been
removed.

`modules/application/editorStateService.mjs` is the minimal DOM-free state
boundary for active document, selection, frame, layer, tool, and mode. State is
kept per document and snapshots clone selection values, preventing callers from
mutating stored state by reference.

Character-pixel changes are the first complete mutation slice. Every pointer,
keyboard, desktop-menu, and mobile-menu operation that reaches
`TileSet.setPixel()` uses `EditorCommandService.executeTilePixelEdit()` for the
mutation, stable `setCharPixel` history action, selected pixel state, document
dirty revision, and render invalidation. Undo and redo come back through the same
tile mutation path with history recording disabled. Focused contract coverage is
in `tests/editor-commands.test.mjs`; existing browser routes continue to converge
on `Editor.undo()` and `Editor.redo()`.

## Legacy graph non-growth

`tests/fixtures/legacy-main-graph.json` records the current ordered `js/main.js`
inputs. Removing migrated files requires shrinking that baseline. Adding an input
requires a named entry in `legacyGraphExceptions` with a review reason and an
expiry date; missing, stale, invalid, and expired exceptions fail CI. This keeps
the compatibility graph explicit while allowing a time-bounded emergency bridge.
CI compares the fixture with the pull request's base revision (or the preceding
revision on a direct push), so adding a file to both the graph and fixture cannot
bypass the exception policy. The checkout must retain full history for this check.

## Performance baselines

`npm run performance:baseline` builds the production application and records
`docs/performance-baseline.json` on representative Chromium desktop and a
four-times CPU-throttled minimum-mobile profile. The report contains:

- raw and gzip bytes for every initially requested JavaScript and CSS chunk;
- JavaScript parse and execution time through the visible start page;
- start-page and editor-ready timings;
- cold and warm activation time, request count, and request bytes for each measured
  lazy feature; and
- diagnostic heap retention after feature disposal.

Heap retention is marked diagnostic-only because garbage collection and browser
internals make small run-to-run differences unreliable as a hard gate. Existing
global startup and payload budgets remain enforced; per-feature budgets should be
added only after repeated baseline runs establish stable variance.
Activation request bytes include every local resource type and repeated transfers;
the initial chunk table remains limited to unique JavaScript and CSS chunks.

## First migrated feature

The image importer is emitted as `js/features/image-import.js` instead of being part
of the initial `js/main.js` payload. User-facing menu, keyboard, mobile,
drag-and-drop, start-page, and deep-link callers enter through the UI route
service. The first activation loads the feature code once and creates one
`ImportImage` for that text-mode editor. A narrow compatibility facade remains
only for legacy update paths that inspect importer state. Failed activation is
retryable through the central route adapter.

Use the same sequence for later migrations: identify one host interface, add a
layered module adapter, keep the legacy surface narrow, split the ordered
implementation when justified, add failure and browser activation coverage, then
move internals behind the interface without expanding global access.
