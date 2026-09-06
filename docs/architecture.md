# Application architecture

Updated: 2026-09-05

lvllvl uses a deliberate hybrid architecture: a large ordered classic-script
application plus a small governed native-module graph around boundaries that
benefit from explicit ownership. See [the consolidation decision](02_import_migration.md).

## Composition and module governance

`src/js/bootstrap.mjs` is the composition root. It creates the application,
selects concrete browser adapters, registers the image-import feature, and
injects the retained services into the classic application.

Production modules under `src/js/modules` are discovered from imports rather
than a hand-maintained allowlist. `scripts/module-boundaries.mjs` verifies that
each discovered module is reachable, emitted, and follows these layers:

```text
bootstrap
  -> feature adapters
  -> application services
  -> domain
  -> infrastructure adapters
```

Domain code cannot read browser or application globals. Application services
coordinate injected ports. Infrastructure adapters own browser storage or
module loading. Feature adapters connect one classic UI seam to those contracts.
Only bootstrap selects concrete implementations.

JSDoc contracts for the governed graph are checked with TypeScript. This check
does not attempt to type-check or convert the classic tree.

## Classic graph policy

`scripts/build-graph.mjs` remains the source of truth for classic script order.
The current `js/main.js` graph has 304 inputs. Its fixture is a non-growth and
ordering baseline: new entries require an explicit, reviewed, expiring exception.
Removing entries is allowed when a real slice no longer needs them.

The count is not a target. Existing classic files and `g_app` references can stay
when they express the application's actual ownership more clearly than an adapter
chain. Governed modules may not add global access to make a count appear smaller.

## Feature lifetime

`FeatureRegistry` supports the lifetime the application uses today:
context-scoped instances with single-flight code loading. Image-import code loads
once, while each editor context receives its own importer instance.

Activation waits for in-flight disposal. Failed loads and activations can be
retried. Failed disposal retains the instance so cleanup can be retried. The
registry also supports disposing all active contexts for the feature.

No application-singleton or per-use feature abstraction is retained because no
production feature needs one.

## Persistence and document sessions

Persistence is an eager application boundary because data safety must be
available whenever a document is open.

`browserStorageAdapter.mjs` is the browser-host boundary. `PersistenceService`
owns immutable file blobs, versioned manifests, active-version pointers,
transaction journals, catalog metadata, cleanup, and recovery. Project mutations
are serialized so a live transaction cannot be mistaken for an interrupted one.

A save publishes in stages:

```text
write journal
  -> write immutable blobs
  -> write manifest
  -> publish active pointer
  -> publish catalog metadata
  -> cleanup journal and obsolete data
```

Failures before pointer publication leave the previous project active. Failures
after pointer publication recover metadata on the next access. Deletion is also
journaled and removes catalog visibility before data cleanup.

Each classic `Document` owns a `DocumentSession`. The session tracks revision,
dirty state, save-in-flight state, and Save As semantics. `PersistenceService`
owns autosave snapshots alongside durable project publication. An edit made
while a save is running remains dirty after the older revision is published.

## History and editor state

Text-mode documents use the classic `History` object. It remains the single
recording and replay path for classic action shapes and is scoped per document.
Undo and redo compensate actions already applied when a later replay action
throws, then restore their prior position and enabled state. No-op tile pixel
writes do not add history or dirty/redraw side effects.

Editor mode, frame, tool, layer, and selection state remain owned by their
existing classic controllers. There is no parallel command or editor-state
service.

## Remote-provider security posture

Browser GitHub, Gist, and Google Drive integrations are hard-disabled. Their
credential SDKs, provider implementations, controls, startup requests, and CSP
allowances are absent from production.

Bootstrap exposes one small disabled policy and minimal callback-era facades so
dormant legacy branches fail predictably. The facades do not store sessions,
forward credentials, load SDKs, or enable UI. A future provider requires a new
server-side credential design and security review.

## Image import

Image import is emitted as `js/features/image-import.js`, a strict ESM feature
entry. The entry does not publish `ImportImage` globally. A feature adapter gives
the importer a frozen, named set of editor capabilities; the importer does not
receive the mutable editor object itself.

`imageImportCoordinator.mjs` is a narrow UI boundary, not an application router.
It owns:

- single-flight open and serialized close/reopen;
- cancellation of stale activation results;
- loading, failure, and retry UI;
- focus transfer to the visible file chooser and restoration on close; and
- cleanup when the desktop dialog or mobile panel closes itself.

Menu, keyboard, start-page, mobile-menu, and drag-and-drop entry points all call
the same coordinator. Ordinary `setMode` behavior remains synchronous.

## SVG export

SVG retains a small data boundary because deterministic encoding is independent
of UI ownership.

`legacySvgExportAdapter.mjs` captures the selected grid layer into a detached
snapshot. `domain/svgExport.mjs` converts that snapshot into SVG text without DOM
or application globals. The classic `ExportSvg` dialog receives a port from
bootstrap for data generation, download, alerts, and error reporting.

Other import and export formats remain classic and construct their existing
controllers directly. There is no general import/export registry or capability
membrane.

## Performance policy

Cross-profile Playwright startup tests enforce the maintained user-visible
budget. One-off generated startup snapshots are not committed as architectural
baselines because they become stale when the branch, browser, or host changes.
Add a new benchmark only when its environment is reproducible and it gates a
specific decision.

## Change criteria

A new boundary should remove an old path and improve independently testable
correctness, security, lifecycle, or measured loading behavior. Avoid generic
registries for hypothetical consumers and avoid treating module, input, or
global-reference counts as delivery metrics.
