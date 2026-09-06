# P1.4 module-boundary consolidation

Decision date: 2026-09-05

Related finding: [P1.4 Global architecture makes every change high-risk](01_probems.md#p14-global-architecture-makes-every-change-high-risk)

## Decision

The migration stops at a stable hybrid architecture. The objective is not to
convert every classic script or eliminate every `g_app` reference. The objective
is to put boundaries around code whose lifetime, side effects, or failure modes
benefit from an explicit contract, while leaving cohesive and stable editor code
in its existing form.

The consolidation keeps:

- automatic module discovery and layer enforcement;
- a non-growth policy for the ordered classic graph;
- checked contracts for the governed module graph;
- transactional browser persistence and document revision sessions;
- the credential-free, hard-disabled remote-provider release posture;
- context-scoped, retryable image-import loading and its focused UI coordinator;
- the image-import strict-mode and close/reopen fixes; and
- detached SVG snapshots with a pure SVG encoder behind the classic export UI.

It removes abstractions that duplicated stable legacy behavior without reducing
the application's actual coupling:

- the parallel command, history, and editor-state services;
- the general application/feature route service;
- the generic import/export service, values, and capability membrane;
- the provider registry and disabled-adapter framework;
- the SVG feature/controller lifecycle; and
- generated startup baselines whose measurements were already stale.

## Resulting baseline

`js/main.js` has 304 ordered inputs. The governed production graph has 12 native
modules and 13 dependency edges. Textual `g_app` references are expected in the
classic application and are not a migration score.

Those counts are guardrail inputs, not completion targets. The ordered graph may
shrink when a justified extraction removes real coupling, but an extraction is
not valuable merely because it changes a count. Likewise, moving a reference
through a generic facade does not make the underlying dependency smaller.

## Preserved phases

### Phase 0: module governance

Status: **preserved and simplified**.

The build discovers governed modules, verifies layer and public-entry rules,
rejects forbidden browser/global access, reports dependencies, and prevents the
ordered classic graph from growing without a reviewed temporary exception. The
feature registry now implements only the context-scoped lifetime the application
actually uses. Its loading, activation, disposal, failure, and retry behavior is
covered by source tests.

The deleted performance baseline was not a release budget: it recorded one host
and became stale as soon as the branch changed. Browser startup remains covered
by the existing cross-profile Playwright budget. A future performance baseline
should be added only with a maintained measurement owner and a decision it gates.

### Phase 1: persistence and document lifecycle

Status: **preserved**.

Browser storage remains behind an infrastructure adapter. `PersistenceService`
owns immutable blobs, manifests, pointers, journals, catalog publication,
recovery, cleanup, autosave snapshots, and serialized mutations. Each document
owns a `DocumentSession` for revision, dirty, save-in-flight, and Save As
semantics while delegating durable publication to `PersistenceService`.

This boundary solves a correctness problem: interrupted writes and concurrent
mutations can be tested without the UI. It remains eager because saving is a core
application capability rather than an optional feature.

### Phase 2: commands, history, and editor state

Status: **consolidated into the classic implementation**.

The classic per-document `History` object remains the single undo/redo path. Its
failure handling compensates actions applied before a later replay action
throws, then restores the prior history position and enabled state. Unchanged
tile pixels do not dirty the document, redraw, or create history.
Keyboard, pointer, desktop-menu, and mobile-menu behavior is covered through the
same classic history object.

The parallel command service, replay adapter, history state, and editor-state
service were removed. They reproduced existing action shapes and required broad
capability forwarding without establishing a simpler ownership model.

### Phase 3: authentication and remote providers

Status: **preserved as a hard-disabled security policy**.

GitHub, Gist, and Google Drive controls, credential SDKs, provider
implementations, and their network allowances remain absent from production.
One small policy reports those providers as disabled. Minimal callback-era stubs
fail dormant callers deterministically; they do not constitute a provider
framework.

Re-enabling a provider is a new security-reviewed feature. It requires a
server-side, short-lived, least-privilege credential design and separate UI and
network review. It is not enabled by registering a client adapter.

### Phase 4: image-import activation

Status: **preserved as a focused coordinator**.

Image import is the application's one justified lazy feature. Its module code is
loaded once, while importer instances are scoped to an editor context. The
coordinator owns only image-import concerns: loading and retry UI, focus,
single-flight opening, serialized closing, and stale-open cancellation.

All existing launchers use `openImageImport`: menu, keyboard, start page, mobile
menu, and drag-and-drop. Ordinary editor modes remain synchronous and do not pass
through a general route state machine. Image-import URLs are not application
deep links.

### Phase 5: import and export boundaries

Status: **partially preserved where the boundary is concrete**.

The image importer remains a strict ESM build entry and receives a focused set of
editor capabilities. Its loading failures are retryable, repeated opens are
idempotent, nested UI closes safely, mobile close/reopen is serialized, and
invalid layers are rejected before playback state changes.

SVG export keeps a detached data snapshot and pure deterministic encoder. The
classic `ExportSvg` controller receives a narrow port from the composition root
for generation, download, alerts, and error reporting.

All other stable import/export controllers remain classic. They construct their
existing collaborators directly. The generic import/export registry, values,
recursive membrane, constructor table, and mass caller rewiring were removed.
Those abstractions made the code indirect but did not make individual formats
meaningfully independent.

### Phase 6: remove transitional machinery

Status: **completed by consolidation**.

Phase 6 does not extract every format. It removes the transitional frameworks
that had no retained consumer and updates the build graph, tests, documentation,
and changelog to the hybrid endpoint. The SVG dialog remains classic because its
UI lifetime did not benefit from another feature registration; only its pure
encoding boundary remains modular.

## Rules for future extractions

Add a new module boundary only when the slice meets all of these conditions:

1. It has a clear owner and a smaller dependency contract than the code it
   replaces.
2. It removes an old execution path in the same change.
3. It improves independently testable correctness, security, lifecycle, or
   measured loading behavior.
4. It does not require a generic registry or facade for hypothetical future
   consumers.
5. Its tests assert user behavior and boundary invariants, not migration counts.

Good future candidates are independently loaded subsystems, security-sensitive
browser integrations, and pure parsers or encoders reused outside their current
controller. Stable UI controllers and tightly coupled editor mutations should
remain classic until a concrete change demonstrates otherwise.

## Verification

The hybrid endpoint is guarded by:

- `npm run architecture:check` for module layers, checked contracts, and classic
  graph non-growth;
- `npm run test:source` for persistence, feature lifetime, remote policy, classic
  history rollback, image-import boundaries, and SVG encoding;
- `npm run test:build` for artifact and production graph integrity; and
- Playwright coverage for startup, persistence, image-import entry points and
  close/reopen behavior, remote-provider absence, classic undo/redo, and SVG
  output.

This document is a record of the chosen endpoint. It is no longer a mandate to
continue phase-by-phase extraction.
