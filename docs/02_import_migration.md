# P1.4 incremental module migration plan

Plan date: 2026-09-05

Related finding: [P1.4 Global architecture makes every change high-risk](01_probems.md#p14-global-architecture-makes-every-change-high-risk)

## Recommendation

Continue the P1.4 migration, one bounded vertical slice at a time. The primary
reason is maintainability: explicit dependencies, smaller change surfaces, and
testable lifecycle boundaries reduce the risk of modifying a 238,000-line
global-script application. Reduced startup cost is a useful secondary outcome,
but only for code and dependencies that are genuinely optional.

Do not perform a big-bang conversion and do not make “all files use ES modules”
the objective. The target state is:

- new application code cannot introduce undeclared global coupling;
- persistence, document state, history, providers, and feature activation have
  explicit contracts and focused behavioral tests;
- optional-feature dependencies are reachable only through declared public
  boundaries, whether they remain eager or become lazy;
- legacy globals exist only in documented composition adapters; and
- each migrated seam removes at least as much compatibility code as it adds once
  all callers have moved.

P0.3, the reusable GitHub credential formerly stored as client-readable
application data, was contained on 2026-09-05 by disabling GitHub, Gist, and Google
Drive and removing their browser credential implementations. This is the selected
release posture until a reviewed server-side, short-lived, least-privilege design
exists. Historical token revocation and Firestore cleanup remain deployment-owner
actions; module boundaries alone would not have made the former design safe.

## Current implementation target

The current implementation tranche covers **Phase 5 and Phase 6 only**: contain
the remaining import/export systems behind explicit document contracts and remove
the legacy paths made obsolete by each completed slice. It is a maintainability
and stability change. It has no payload-size, chunk-count, or startup-time target,
and it should preserve the current eager or lazy loading behavior unless changing
that behavior is required to remove a superseded path safely.

Deliver the tranche as a sequence of format-family vertical slices rather than as
one pull request. Across those slices, the target is:

- import code receives validated bytes or text and a narrow set of destination
  document operations instead of a mutable editor or `g_app`;
- export code receives an immutable document snapshot and returns a generated
  artifact instead of owning file pickers, downloads, or arbitrary DOM access;
- pure parsers and encoders are ordinary stateless module functions, stateful
  conversion operations are `per-use`, UI controllers are `context` scoped, and
  shared application services hold no per-operation mutable state;
- characterization and golden fixtures preserve successful, malformed-input,
  cancellation, timeout, and retry behavior before old paths are removed;
- the image-import seam stops publishing a global constructor once its remaining
  callers can use the module entry point; and
- every completed slice performs the applicable Phase 6 cleanup immediately,
  including build-graph, facade, global, test, architecture, and changelog cleanup.

Completing this tranche does **not** by itself close P1.4. The specialized subsystem
boundaries in Phase 7 remain necessary for that overall finding.

### Deferred from the current implementation

- Music, emulator, debugger, and assembler containment in Phase 7.
- New lazy loading, dependency relocation for payload reduction, prefetching,
  chunk tuning, or startup-size budgets.
- Wholesale conversion of stable legacy internals to native modules or TypeScript.
- Worker migration or changes to existing Worker, sandbox, emulator, or execution
  models unless required to fix a separately demonstrated correctness or security
  defect.
- Redesign of formats, document data structures, command semantics, or UI flows.
- Removal of every remaining historical global after it has been confined to a
  documented, non-growing composition adapter.
- Live remote-provider work, which remains subject to the separate P0.3 security
  re-enable gate.

## Necessity scale

| Score | Meaning |
| --- | --- |
| **Necessary** | Required to make future changes materially safer or to consider P1.4 addressed. |
| **Good to have** | Delivers substantial clarity, maintenance, or measured performance value, but is not required for the next safe change. |
| **Optional** | An optimization or cleanup that should be done only after measurement or when nearby code is already changing. |

The score describes necessity for the architecture migration, not implementation
order across all project risks. Unresolved P0 security or data-safety work still
takes precedence.

## Current baseline

As of this plan:

- `js/main.js` is assembled from 311 manually ordered source files.
- There are approximately 1,207 textual `g_app` references across 113 files.
- The enforced native module graph contains three files: the composition root,
  feature registry, and image-import adapter.
- `js/main.js` and `js/libs.js` are approximately 3.31 MB and 4.44 MB raw.
- The completed image-import seam moved about 380 KB of source into a 145 KB
  minified optional bundle, approximately 29 KB gzip.
- Compared with the preceding build, that seam reduced the two large initial
  JavaScript bundles by about 144 KB raw. After adding roughly 5 KB of module
  infrastructure, the net raw reduction was about 139 KB, or 1.8% of those two
  bundles.
- Large candidates still present in the main source graph include roughly 974 KB
  of music code, 678 KB of C64/debugger code, 418 KB of export code, 157 KB of
  non-image import code, and 96 KB of assembler code. These are source sizes, not
  predicted transfer savings.

The image-import implementation proves that a compatibility facade can preserve
existing menu, mobile, and drag-and-drop behavior while loading code once and
retrying a failed request. It does not yet prove that the feature internals are
modular: they are still concatenated classic scripts that publish a global
`ImportImage` constructor.

## Delivery principles

Every migration slice must follow the same sequence:

1. Characterize existing behavior, including failure and cancellation paths.
2. Define the smallest host-facing contract needed by current callers.
3. Introduce an adapter at the composition root and preserve existing behavior.
4. Migrate callers and implementation internals behind the contract.
5. Measure startup and first-use behavior where loading changes.
6. Remove superseded globals, ordered build entries, and compatibility code.
7. Update architecture documentation and the changelog in the same change.

Keep behavioral changes, formatting changes, and module movement in separate
commits whenever practical. A migration commit should be easy to compare against
the behavior it replaces.

Core and optional code need different treatment:

- Core services such as persistence and document lifecycle should gain explicit
  interfaces but remain eagerly available.
- Optional features such as exporters, music tools, and emulator tooling may be
  lazy-loaded when measurements show a startup benefit.
- Shared libraries should not be moved into an optional chunk until all eager
  consumers have been identified.

Migration means behavior-preserving extraction, not subsystem redesign. The first
step at each seam is to put the existing behavior and data structures behind a
narrow interface. Replacing persistence semantics, introducing a new command
model, or otherwise redesigning the subsystem is separate follow-up work and must
be justified independently.

## Phase 0: strengthen the migration foundation

Overall score: **Necessary**

Status: **Completed 2026-09-05.** Module coverage is source-root driven, the
ordered legacy graph has a non-growth baseline and expiring exception policy,
feature loading is separated from application/context/per-use instances and
disposal, layer/public-entry/cycle rules are enforced, module ports are checked
from JSDoc, and desktop/minimum-mobile measurements are recorded in
`docs/performance-baseline.json`. See `docs/architecture.md` for the operational
contracts and commands.

The current foundation is suitable for one application-wide singleton feature,
but it should be hardened before many features depend on it.

### 0.1 Make module coverage automatic — Necessary

- Discover module files from the module source roots or derive them from the
  build tool's actual import graph instead of relying only on a manually updated
  `moduleGraph.files` list.
- Fail verification when a module under a governed source root is undeclared,
  unreachable, or omitted from the production artifact.
- Continue rejecting direct access to `g_app`, `globalThis`, `window`, `document`,
  storage hosts, and dynamic code execution outside designated adapters.
- Add a check that new first-party application code cannot be appended to the
  legacy ordered graph without an explicit, reviewed exception.
- Produce a concise dependency report in CI so unexpected new edges are visible
  in review.

Exit criterion: adding an ungoverned module or new legacy global dependency makes
the source test fail without requiring a reviewer to notice a manifest omission.

### 0.2 Define feature instance scope — Necessary

The existing registry caches the first activated instance. If the same feature is
later activated for another editor, document, or route, it receives the first
context's instance.

- Separate code loading, which should normally be single-flight, from instance
  creation, which may be application-singleton, context-scoped, or per-use.
- Require each feature definition to declare its scope.
- Define disposal for scoped instances, event subscriptions, workers, object URLs,
  timers, and other resources.
- Test simultaneous loads, simultaneous activations for different contexts,
  disposal, failed activation, and retry.

Exit criterion: feature lifetime is explicit and tests prove that one context
cannot accidentally receive another context's state.

### 0.3 Define layer rules — Necessary

The current `modules/ -> modules/` rule prevents access to the composition root but
allows every feature module to import every other feature module.

Adopt a small layer model:

```text
bootstrap/composition
        |
        +--> feature adapters --> application services --> domain modules
        |                              |
        +--> infrastructure adapters --+
```

- Domain modules contain state transitions and calculations without browser or
  provider access.
- Application services coordinate domain operations through injected ports.
- Infrastructure adapters own IndexedDB, network, Worker, iframe, and browser API
  access.
- Feature adapters connect legacy callers and UI activation to application
  services.
- The composition root is the only place that selects concrete implementations.
- Reject reverse imports and domain-to-domain shortcuts that bypass public entry
  points. Detect dependency cycles unless a specific reviewed cycle is documented.

Exit criterion: each new module has one clear layer, and forbidden reverse or
cross-feature imports fail CI.

### 0.4 Add boundary contracts — Good to have

- Describe public ports with JSDoc checked by TypeScript, TypeScript declaration
  files, or an equivalent static checker.
- Type-check only the module graph initially; do not require conversion or
  reformatting of the legacy tree.
- Keep runtime validation at external boundaries such as persisted data, provider
  responses, messages, and imported files.

Exit criterion: incorrect method names, arguments, and result shapes fail a fast
source check before browser tests.

### 0.5 Establish performance baselines — Necessary

Record, on representative desktop and minimum mobile profiles:

- initial raw and gzip bytes by chunk;
- JavaScript parse and execution time through the visible start page;
- start-page and editor-ready timing;
- cold and warm first activation time for each lazy feature;
- number and size of requests caused by activation; and
- memory retained after a feature is closed, where reliable automation permits.

Keep the existing global payload budgets and add per-feature regression budgets
only after a stable baseline exists. A lazy migration must not be accepted solely
because a new chunk was created.

Exit criterion: every later lazy-loading proposal can state its measured startup
saving and cold first-use cost.

## Phase 1: isolate persistence and document lifecycle

Overall score: **Necessary**

Status: **Completed 2026-09-05.** Browser storage is isolated behind an
infrastructure adapter and an eager application persistence service; document
revision, dirty, and save-in-flight state is owned by a per-document session.
The legacy `Document` and `FileManager` surfaces now adapt their callers to the
injected contracts, and focused service plus browser contract tests cover the
publication and recovery protocol. Project mutations share a serial queue, and
deletion is journaled and catalog-first so recovery cannot expose a partly
deleted project. See `docs/architecture.md` for the operational boundary and save
sequence.

This is a correctness and maintainability phase, not a lazy-loading phase. Saving,
recovery, revision tracking, and dirty-state decisions must be available whenever
a document is open.

### Work

- Define a persistence port for immutable file blobs, project manifests, version
  pointers, journals, catalog metadata, and cleanup.
- Define a document-session service that owns the active revision, dirty state,
  save-in-flight state, and the rule for publishing a completed save.
- Inject storage, clock, identifier generation, and error reporting rather than
  reading them through `g_app`.
- Put legacy `Document`, `FileManager`, and localForage behavior behind adapters
  before moving implementation details.
- Preserve their existing division of responsibility, data structures, and save
  protocol during extraction. Any redesign is a separate change after the new
  boundary has equivalent behavioral coverage.
- Migrate one caller path at a time: open, ordinary save, autosave, Save As,
  recovery, catalog update, and local export fallback.
- Preserve the failure-safe behavior delivered by P0.2 throughout the migration.
- Remove old write paths as soon as their callers have moved; do not maintain two
  persistence implementations.

### Required tests

- Create, open, edit, save, reload, and delete/recover behavior.
- Quota, unavailable storage, partial blob, manifest, pointer, catalog, and cleanup
  failures.
- Edits made during an in-flight save.
- Interrupted staging and committed-metadata recovery after reload.
- Autosave isolation and Save As preservation of the source project.
- Contract tests that run against both the legacy adapter and the new service
  while the transition is in progress.

Exit criterion: document and application-service modules do not read `g_app` or
browser storage directly, all writes go through the injected storage port, and the
browser failure suite remains green. The infrastructure storage adapter remains
the intentional browser-storage boundary.

## Phase 2: isolate commands, history, and editor state

Overall score: **Necessary**

Status: **Completed 2026-09-05.** History stack ownership and grouping now live
in a document-scoped native command service, while the composition root injects
the narrow capabilities needed to replay the unchanged legacy action shapes. A
DOM-free editor-state service tracks active document, selection, frame, layer,
tool, and mode. Character-pixel edits provide the representative vertical slice
through state selection, dirty revision, history, mutation, and invalidation,
and every existing text-mode action family replays through the same adapter. See
`docs/architecture.md` for the command and replay boundary.

The goal is to make state mutation discoverable and testable without requiring a
complete rewrite of rendering or input handling.

### Work

- Put the existing `History` operations—`startEntry`, `addAction`, `endEntry`,
  `undo`, and `redo`—behind a narrow injected interface without changing their
  semantics or stored action shapes.
- Preserve the current ownership of undo/redo stacks and grouping rules while
  replacing the broad editor dependency with only the capabilities required to
  replay existing actions.
- Define a minimal editor-state interface for active document, selection, frame,
  layer, tool, and mode changes.
- Migrate a representative vertical slice first, such as a tile edit including
  selection, dirty-state notification, undo, and redraw.
- Expand by mutation family rather than by file so old and new behavior do not
  modify the same state through different semantics.
- Keep rendering callbacks behind an injected notification or invalidation port.
- Treat a new command-object architecture as **Good to have**, not as a requirement
  for completing this phase. Converting every action to command classes is
  **Optional**.

### Required tests

- Record/replay/undo/redo identity for every migrated action family.
- Grouped edits and empty/no-op commands.
- Redo invalidation after a new command.
- Document dirty-state and persistence revision integration.
- Switching document, frame, layer, and mode without leaking history.
- Keyboard, pointer, and menu routes invoking the same command behavior.

Exit criterion: migrated state changes have one history recording and replay path,
history is not reached through `g_app`, and focused tests can exercise mutations
without a DOM.

## Phase 3: isolate authentication and remote providers

Overall score: **Necessary**

Status: **Completed for the disabled-provider posture on 2026-09-05.** The unsafe
credential flow was removed rather than moved. A provider-neutral application
service now owns remote operation contracts, three independently registered
infrastructure adapters report a credential-free disabled session, and callback-era
callers are contained behind temporary facades. Provider UI, Firebase, the Google
API loader, and the GitHub client/API implementations are absent from the startup
graph and production artifact. The legacy graph shrank from 310 to 305 entries.
The recorded representative-desktop startup payload fell by 66,333 raw bytes and
14,808 gzip bytes versus the preceding baseline. Timing changes are retained as
diagnostic measurements, not claimed as an improvement because of run-to-run noise.

Re-enabling a provider is a new security-gated slice, not a configuration toggle.
It requires historical token cleanup plus an approved server-side OAuth or
provider-app design before a live adapter or provider UI can be registered.

### Work

- The production composition root selects disabled GitHub, Gist, and Google Drive
  adapters; no browser credential flow remains. A future live adapter must use a
  reviewed server-side OAuth or provider-app design with short-lived,
  least-privilege credentials unavailable to ordinary client storage.
- Provider UI has its own empty production registration, so replacing a disabled
  infrastructure adapter cannot reactivate dormant callback-era controls. A live
  adapter and reviewed provider-neutral UI must be registered independently.
- `RemoteProviderService` defines provider-neutral ports for sign-in state,
  repository/file listing, load, save/publish, progress, cancellation, capabilities,
  and normalized errors.
- GitHub, Gist, and Google Drive have separate registrations and disabled session
  state. Session metadata and errors are validated and sanitized before they
  enter application code; raw adapter failures cannot expose response details.
- Eager identity/session state is the small application service; optional provider
  templates, controls, and SDK code are absent while providers are disabled.
- Requests use a strict content/capability/progress/cancellation envelope, and the
  service enforces the capability required by each operation. Opaque editor content
  is not interpreted by key name; reusable credentials are unavailable to the
  application layer by construction. Providers do not locate mutable state through
  `g_app`.
- A future live adapter must translate operation results into an explicitly
  reviewed application result contract before registration; no provider-specific
  response objects are accepted as session or error state.
- Strict repository-address validation moved to a domain module, and the only
  user-visible disabled-provider message is fixed text. Retired provider links
  report that message and fall back to the usable start page.
- Temporary callback facades keep dormant legacy paths failure-safe. Remove each
  facade when its remaining caller family moves to a provider-neutral UI adapter.

### Required tests

- Source and production-browser tests verify that no credential SDK/global,
  provider control, provider endpoint permission, or retired provider artifact is
  present. The removed code can no longer write new tokens to Firestore or browser
  storage; historical deployed data requires operational cleanup.
- Focused contract tests cover operation-owned capability and request-envelope rejection,
  authentication expiry, cancellation, offline, rate-limit, provider-error, and
  disabled state behavior, including credential-bearing session and error data.
- Disabled adapters share the same contract and return stable sessions without
  credentials. Browser tests exercise the production-disabled registration and
  every retired deep-link parameter, while a source test inventories every direct
  legacy-facade caller in the production graph.
- Real-provider integration coverage is deferred until a live provider design is
  approved; it must be separately controlled and mocked by default when introduced.

Disabled-posture exit criterion: remote operations use explicit provider ports,
editor code does not handle credentials, production contains no active provider
implementation or action, and the repository-side P0.3 criteria are met. Re-enable
criteria remain the historical revocation/deletion and reviewed backend controls
documented in `01_probems.md`.

## Phase 4: centralize UI routing and feature activation

Overall score: **Necessary**

Status: **Completed 2026-09-05.** Stable route and feature identifiers now feed a
single activation service with observable lifecycle states, single-flight repeat
navigation, stale-activation cancellation, cleanup, and retry. A UI adapter owns
load/error DOM and focus behavior. Editor modes plus image-import menu, keyboard,
mobile, drag-and-drop, start-page, and deep-link entry points use the same route
contract. Modal routes retain their underlying editor route, serialize teardown,
and roll back partial activation. Unit and desktop/touch browser coverage exercises
the production entry-point handlers and nested-dialog cleanup.

### Work

- Define stable route and feature identifiers rather than dispatching through
  constructors or properties found on `g_app`.
- Give the activation layer explicit loading, ready, failed, retrying, and disposed
  states.
- Standardize user-visible load errors, retry actions, focus restoration, and
  cancellation when the user changes route during activation.
- Make menu, keyboard, mobile, drag-and-drop, and deep-link entry points call the
  same activation contract.
- Keep DOM creation and focus behavior in UI adapters; application feature modules
  should expose state and actions rather than query arbitrary DOM nodes.
- Add route-level cleanup so event handlers and feature resources do not accumulate
  after repeated navigation.

### Required tests

- Every entry point reaches the same feature instance or scoped instance.
- Rapid repeated activation and route changes.
- Failed load, visible retry, successful retry, and focus restoration.
- Desktop and supported touch profiles.
- Direct/deep-link startup for routes that support it.

Exit criterion: activation behavior is defined in one place, no migrated UI route
requires knowledge of a global constructor, and repeated navigation does not leak
subscriptions or feature state.

## Phase 5: migrate remaining import and export systems

Overall score: **Mixed**

- Containing imports and exports behind narrow document boundaries is
  **Necessary** to close P1.4.
- Converting implementation files to native modules is **Good to have** only when
  it removes a global boundary, makes dependencies enforceable, or materially
  simplifies the migrated format family.
- Introducing new lazy loading or moving dependencies for payload reduction is
  **Deferred** from the current implementation.
- Moving conversion work into Workers is **Optional** unless measurements show an
  existing responsiveness problem.

This phase is valuable because it prevents format implementations from reaching
through broad mutable editor state. Payload savings are not an objective of the
current implementation.

### Work

- Define import contracts around validated bytes/text plus explicit destination
  document operations. Define export contracts around immutable snapshots and
  generated artifacts.
- Keep each format or closely related format family as a separate vertical slice.
  Do not turn stateless parsers or encoders into registry features merely to move
  files; use `per-use` scope only for stateful operations and `context` scope for
  editor- or document-owned UI controllers.
- Optionally move CPU-heavy conversion into Workers where measurements show UI
  stalls and the message boundary can remain small and deterministic.
- Use transferable buffers for large binary payloads when Worker migration is
  selected.
- Preserve existing progress, cancellation, timeout, malformed-input, and failure
  behavior at the new boundary.
- Keep current loading behavior during this tranche. Dependency relocation and
  chunk changes require a separate measured proposal.
- Finish the image-import seam by replacing its global constructor with module
  exports and removing the compatibility facade after all callers migrate.

### Required tests

- Golden import and export fixtures for every supported format.
- Round-trip tests where the formats permit lossless round trips.
- Malformed, oversized, truncated, and unsupported input.
- When Worker migration is selected: Worker unavailable/crashed, cancellation,
  and repeated invocation.
- Pixel or byte equality for deterministic outputs.

Necessary exit criterion: migrated format families access document state only
through their explicit import/export contracts. Stable legacy internals may remain
behind an adapter, but the adapter must expose only the narrow contract, must be
the sole legacy access path for that family, and must not permit new callers to
depend on its globals.

## Phase 6: retire import/export adapters and tighten the default path

Overall score: **Necessary** for the current implementation tranche

Phase 6 follows Phase 5 directly. Its cleanup is performed after every completed
format-family slice rather than being postponed until all importers and exporters
have moved. The same cleanup pattern continues during Phase 7 later.

### Work

- Remove global constructors and facade properties when their last caller moves.
- Remove migrated files from `js/main.js` and its manually ordered graph when no
  stable legacy implementation still requires them.
- Delete unused compatibility methods from `Editor` instead of retaining permanent
  aliases.
- Make module boundaries the default for all new application code; require an
  explicit expiring exception for additions to the legacy graph.
- Confine any remaining `g_app` access for a migrated format family to its named
  composition adapter and document every exposed operation.
- Re-run global-reference and build-graph inventories after each slice and require
  the counts to move downward or have an explained exception. Payload measurements
  are required only when loading behavior changes.
- Update `docs/architecture.md` and `CHANGELOG.md` to describe the actual state
  delivered by the slice.

### Current implementation exit criteria

The Phase 5–6 tranche is complete when:

- every remaining import/export format family reaches document state through its
  explicit import or export contract;
- stateful operations and context-owned UI have explicit lifetime and disposal,
  with no mutable operation state shared accidentally between invocations;
- stable classic-script internals that remain are accessible only through named,
  documented adapters and cannot gain new direct callers;
- the image-import global constructor and compatibility facade are removed after
  their last callers migrate;
- superseded globals, facade methods, ordered build entries, and duplicate paths
  have been removed; and
- focused contract, fixture, and production-browser coverage passes without an
  intentional change to current user-visible behavior.

Passing these criteria completes the current implementation tranche, but P1.4
remains open until the Phase 7 specialized subsystem boundaries are complete.

## Phase 7: migrate music, emulator, debugger, and assembler integrations

Overall score: **Mixed** and **deferred from the current implementation**

- Containing these subsystems behind narrow editor capabilities is **Necessary**
  to close P1.4.
- Converting internals to native modules is **Good to have** when it improves
  enforceable ownership or removes a global boundary.
- New lazy loading and payload-oriented resource movement are **Deferred** unless
  separately approved from measurements.
- Reworking existing Worker, sandbox, or execution models is **Optional** unless
  required to preserve security or correct a demonstrated defect.

These are large, specialized subsystems with high regression risk. They form a
separate implementation milestone after Phase 5–6 and should be migrated only
with subsystem owners or strong characterization coverage.

### Work

- Define capability interfaces for emulator control, memory/register inspection,
  assembly, build output, audio, and music scripting.
- Keep ROMs, WASM, workers, editor modes, and subsystem-exclusive libraries behind
  their owning feature boundary without changing their current loading behavior
  solely for this migration.
- Preserve the opaque music-script sandbox and restrictive CSP. Do not reintroduce
  main-origin evaluation to simplify module loading.
- Normalize worker/sandbox messages and validate every message at the boundary.
- Separate emulator lifecycle from debugger UI lifecycle so opening or closing a
  panel does not implicitly recreate machine state.

### Suggested order

1. Assembler facade and worker/resource boundary.
2. Emulator lifecycle and machine control.
3. Debugger panels and inspection services.
4. Music editor support and sandbox client.

Choose the actual order from defect history, available fixtures, and subsystem
ownership, not source size.

### Required tests

- Existing assembler, C64 startup, debugger, and music-script browser coverage.
- Existing Worker/WASM/ROM missing, corrupt, timeout, cancellation, and retry
  behavior must remain covered; add new cases only when their lifecycle changes.
- Repeated open/close and route switching without duplicate workers or audio
  contexts.
- Deterministic assembler output and representative emulator smoke fixtures.
- CSP and sandbox security regressions.

Necessary exit criterion: editor and UI code use explicit capabilities and no
migrated subsystem obtains application state through `g_app`. Stable internals may
remain behind named adapters that cannot acquire new direct callers.

### P1.4 completion criteria

P1.4 can be marked fixed when all of the following are true:

- persistence/document lifecycle, command/history, provider operations, and UI
  activation are governed by explicit tested module contracts;
- import/export and emulator/assembler boundaries no longer expose broad mutable
  editor state, even if some stable legacy internals remain behind adapters;
- optional-feature dependencies are reachable only through declared public
  boundaries, regardless of whether loading remains eager or becomes lazy;
- new modules and new application source cannot bypass dependency enforcement;
- `g_app` and legacy constructors are confined to documented composition adapters;
  and
- the ordered legacy graph is materially smaller and cannot grow silently.

Eliminating every historical global, meeting a particular payload size, or
converting every implementation file is not required to close P1.4. Confining and
freezing the remaining compatibility surface is sufficient if new code cannot
depend on it.

## Phase 8: follow-up optimizations

Overall score: **Optional**

Perform these only when telemetry or local measurements justify them:

- Prefetch a likely feature on idle, hover, menu-open, or route intent while
  retaining normal on-demand fallback.
- Tune chunk boundaries to balance cache reuse against request and compression
  overhead.
- Generate an interactive dependency graph for maintainers.
- Convert stable module internals to TypeScript after their interfaces have stopped
  changing.
- Remove the feature compatibility registry if direct module routing eventually
  makes it redundant.
- Eliminate the final composition-root `g_app` alias after all external or desktop
  integrations have an alternative entry point.

## Priority summary

| Work item | Score | Main benefit |
| --- | --- | --- |
| Automatic module coverage and legacy-growth guard | **Necessary** | Prevents architectural regression. |
| Explicit feature scope and disposal | **Necessary** | Prevents shared-state and lifecycle defects. |
| Layer-specific dependency rules | **Necessary** | Keeps the future module graph understandable. |
| Boundary type checking | **Good to have** | Detects contract drift earlier. |
| Performance and activation baselines | **Completed prerequisite** | Supports any later, separately approved loading change. |
| Persistence/document lifecycle isolation | **Necessary** | Protects user data and makes save behavior testable. |
| Command/history/editor-state isolation | **Necessary** | Gives state mutation one auditable path. |
| Secure provider/authentication boundary | **Necessary** | Prevents credentials and provider details leaking into editor code. |
| Central UI routing and activation lifecycle | **Necessary** | Unifies desktop, mobile, menu, keyboard, and deep-link behavior. |
| Import/export boundary containment | **Necessary** | Prevents broad document-state coupling. |
| Selective import/export module conversion | **Good to have** | Removes global boundaries and makes useful dependencies enforceable. |
| New import/export lazy loading | **Deferred** | Payload optimization is outside the current implementation target. |
| Import/export Worker migration | **Optional** | Helps only when measured conversion work stalls the UI. |
| Music/emulator/debugger/assembler boundary containment | **Necessary** | Contains specialized access to editor state. |
| Specialized-subsystem implementation | **Deferred Phase 7** | Required later, after the Phase 5–6 tranche. |
| Full specialized-subsystem conversion | **Good to have** | Useful only where it clarifies ownership or removes globals. |
| New specialized-subsystem lazy loading | **Deferred** | Requires a separate performance proposal. |
| Worker, sandbox, or execution-model redesign | **Optional** | Not required merely to introduce a module boundary. |
| Legacy adapter removal and non-growth enforcement | **Necessary** | Converts temporary seams into lasting simplification. |
| Intent prefetching and chunk tuning | **Optional** | Improves first-use latency after measurement. |
| Full TypeScript conversion | **Optional** | Useful after boundaries stabilize; not required for modularity. |
| Removal of every final global | **Optional** | Confinement is sufficient if the compatibility surface cannot grow. |

## Pull-request sizing and phase gates

A migration pull request should normally contain one contract or one complete
vertical slice. It should include:

- characterization tests added before or alongside movement;
- the adapter and migrated implementation/callers;
- removal of the superseded path;
- source, build, and relevant production-browser tests;
- before/after `g_app` references and build-graph entries;
- before/after payload and activation measurements when loading changed; and
- changelog and architecture-document updates.

Phase 0 is the shared prerequisite. After it passes, bounded migrations may proceed
independently when their direct dependencies are ready: Phase 2 builds on the
document boundary from Phase 1; Phase 5 needs the relevant document and activation
contracts from Phases 1 and 4; Phase 6 cleanup accompanies every Phase 5 slice; and
the deferred Phase 7 needs the activation contract from Phase 4. Phase 3's
disabled-provider slice is complete. A future live-provider slice is blocked on
the P0.3 re-enable gate.

Do not advance a particular slice merely because files were moved. Its exit
criteria must pass in CI and its compatibility adapter must have a named removal
condition.

## Stop and reassess conditions

Pause a slice and revisit its boundary if any of these occurs:

- the adapter needs most of `g_app` rather than a narrow capability set;
- the new and old implementations must both mutate the same state;
- a separately approved loading change noticeably harms a common workflow without
  a viable prefetch or eager-loading fallback;
- a separately approved chunk change duplicates a shared dependency across
  multiple large chunks;
- browser or recovery behavior cannot be characterized before movement; or
- compatibility code grows for several changes without a credible deletion point.

These are signals that the chosen seam is too broad, too narrow, or in the wrong
layer. They are reasons to resize the slice, not reasons to abandon the incremental
migration.
