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
- optional features and their exclusive dependencies are absent from the initial
  payload;
- legacy globals exist only in documented composition adapters; and
- each migrated seam removes at least as much compatibility code as it adds once
  all callers have moved.

P0.3, the reusable GitHub credential stored as client-readable application data,
remains a higher-priority security issue. Its remediation must happen before or as
part of the remote-provider phase; module boundaries alone do not make the current
credential design safe.

The numbered phases below express architectural dependencies, not permission to
defer P0.3. Schedule and complete the credential remediation before beginning the
P1.4 migration campaign. Phase 3 later moves the already-safe provider design
behind the new architectural boundary.

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

This phase depends on an approved P0.3 credential design. Moving the current token
storage into a module would preserve the vulnerability and is not completion.

### Work

- Adopt the server-side OAuth or GitHub App design selected for P0.3, with
  short-lived, least-privilege credentials unavailable to ordinary client storage.
- Define provider-neutral ports for sign-in state, repository/file listing, load,
  save/publish, progress, cancellation, and normalized errors.
- Keep GitHub, Gist, and Google Drive implementations in separate infrastructure
  adapters. Provider-specific response objects must not escape into editor code.
- Separate eager identity/session state from optional provider UI and SDK code.
- Lazy-load a provider adapter only when it is both optional and safe for offline
  startup; otherwise keep it eager behind the same interface.
- Pass document content and requested capabilities explicitly. Providers must not
  locate mutable application state through `g_app`.
- Preserve strict repository-address validation and sanitized error presentation.

### Required tests

- No reusable provider token appears in Firestore, IndexedDB, localStorage,
  sessionStorage, logs, URLs, or error markup.
- Scope, repository selection, token expiry, revocation, cancellation, offline,
  rate-limit, and provider-error behavior.
- Contract tests shared by provider adapters.
- Mocked provider browser tests by default, with separately controlled integration
  coverage for real provider environments.

Exit criterion: remote operations use explicit provider ports, editor code does
not handle provider credentials, and the P0.3 exit criteria are independently met.

## Phase 4: centralize UI routing and feature activation

Overall score: **Necessary**

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
- Converting every implementation file to native modules and lazy-loading feature
  code or exclusive dependencies is **Good to have**.
- Moving conversion work into Workers is **Optional** unless measurements show an
  existing responsiveness problem.

This is a high-value source of isolated features and potential payload savings,
but it should follow the core lifecycle contracts that imports and exports consume.

### Work

- Define import contracts around validated bytes/text plus explicit destination
  document operations. Define export contracts around immutable snapshots and
  generated artifacts.
- Where further conversion is justified, keep each format or closely related
  format family as a separate feature when independent loading is practical.
- Optionally move CPU-heavy conversion into Workers where measurements show UI
  stalls and the message boundary can remain small and deterministic.
- Use transferable buffers for large binary payloads when Worker migration is
  selected.
- Preserve existing progress, cancellation, timeout, malformed-input, and failure
  behavior at the new boundary.
- Move feature-exclusive parsers, encoders, and rendering libraries out of the
  initial library bundle. Do not duplicate a shared dependency across many chunks
  without measuring the result.
- Finish the image-import seam by replacing its global constructor with module
  exports and removing the compatibility facade after all callers migrate.

### Required tests

- Golden import and export fixtures for every supported format.
- Round-trip tests where the formats permit lossless round trips.
- Malformed, oversized, truncated, and unsupported input.
- When Worker migration is selected: Worker unavailable/crashed, cancellation,
  and repeated invocation.
- Pixel or byte equality for deterministic outputs.
- When lazy loading is selected: absence from startup requests and successful cold
  activation in production.

Necessary exit criterion: migrated format families access document state only
through their explicit import/export contracts. If full module conversion or lazy
loading is selected, global constructors must also be removed, exclusive
dependencies must be absent from startup, and first-use latency must stay within
its recorded budget.

## Phase 6: migrate music, emulator, debugger, and assembler integrations

Overall score: **Mixed**

- Containing these subsystems behind narrow editor capabilities is **Necessary**
  to close P1.4.
- Converting all internals to native modules and lazy-loading optional resources is
  **Good to have**.
- Reworking existing Worker, sandbox, or execution models is **Optional** unless
  required to preserve security or correct a demonstrated defect.

These are large, specialized subsystems with good isolation and performance
potential, but also high regression risk. Migrate them only with subsystem owners
or strong characterization coverage.

### Work

- Define capability interfaces for emulator control, memory/register inspection,
  assembly, build output, audio, and music scripting.
- Keep ROMs, WASM, workers, editor modes, and subsystem-exclusive libraries behind
  their owning feature boundary.
- Preserve the opaque music-script sandbox and restrictive CSP. Do not reintroduce
  main-origin evaluation to simplify module loading.
- Normalize worker/sandbox messages and validate every message at the boundary.
- Separate emulator lifecycle from debugger UI lifecycle so opening or closing a
  panel does not implicitly recreate machine state.
- Lazy-load only resources not needed for the user's selected startup route. A C64
  deep link may legitimately make the emulator an initial dependency for that
  route.

### Suggested order

1. Assembler facade and worker/resource loading.
2. Emulator lifecycle and machine control.
3. Debugger panels and inspection services.
4. Music editor support and sandbox client.

Choose the actual order from usage data, defect history, and available fixtures,
not source size alone.

### Required tests

- Existing assembler, C64 startup, debugger, and music-script browser coverage.
- Existing Worker/WASM/ROM missing, corrupt, timeout, cancellation, and retry
  behavior must remain covered; add new cases only when their lifecycle changes.
- Repeated open/close and route switching without duplicate workers or audio
  contexts.
- Deterministic assembler output and representative emulator smoke fixtures.
- CSP and sandbox security regressions.

Necessary exit criterion: editor and UI code use explicit capabilities and no
migrated subsystem obtains application state through `g_app`. If lazy loading is
selected, optional resources must also be route-aware and satisfy their activation
budgets.

## Phase 7: retire legacy adapters and tighten the default path

Overall score: **Necessary** to close P1.4

This phase occurs continuously after each slice and finishes after the major seams
are migrated.

### Work

- Remove global constructors and facade properties when their last caller moves.
- Remove migrated files from `js/main.js` and its manually ordered graph.
- Delete unused compatibility methods from `Editor` instead of retaining permanent
  aliases.
- Make module boundaries the default for all new application code; require an
  explicit expiring exception for additions to the legacy graph.
- Confine the remaining `g_app` access to a named legacy adapter at the composition
  root and document every exposed operation.
- Re-run global-reference and bundle inventories after every phase and require the
  counts to move downward or have an explained exception.
- Update `docs/architecture.md` to describe the actual current state, not the
  intended end state.

### P1.4 completion criteria

P1.4 can be marked fixed when all of the following are true:

- persistence/document lifecycle, command/history, provider operations, and UI
  activation are governed by explicit tested module contracts;
- import/export and emulator/assembler boundaries no longer expose broad mutable
  editor state, even if some stable legacy internals remain behind adapters;
- optional feature code and exclusive dependencies are not in the default startup
  payload;
- new modules and new application source cannot bypass dependency enforcement;
- `g_app` and legacy constructors are confined to documented composition adapters;
- the ordered legacy graph is materially smaller and cannot grow silently; and
- startup and cold-activation budgets pass on the supported browser/device matrix.

Eliminating every historical global is not required to close P1.4. Confining and
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
| Performance and activation baselines | **Necessary** | Makes lazy-loading decisions evidence-based. |
| Persistence/document lifecycle isolation | **Necessary** | Protects user data and makes save behavior testable. |
| Command/history/editor-state isolation | **Necessary** | Gives state mutation one auditable path. |
| Secure provider/authentication boundary | **Necessary** | Prevents credentials and provider details leaking into editor code. |
| Central UI routing and activation lifecycle | **Necessary** | Unifies desktop, mobile, menu, keyboard, and deep-link behavior. |
| Import/export boundary containment | **Necessary** | Prevents broad document-state coupling. |
| Full import/export module conversion and lazy loading | **Good to have** | Provides payload and internal-clarity opportunities. |
| Import/export Worker migration | **Optional** | Helps only when measured conversion work stalls the UI. |
| Music/emulator/debugger/assembler boundary containment | **Necessary** | Contains specialized access to editor state. |
| Full specialized-subsystem conversion and lazy loading | **Good to have** | May reduce startup work and global internals. |
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
contracts from Phases 1 and 4; and Phase 6 needs the activation contract from Phase
4. Phase 3 can proceed independently once P0.3 has been remediated. Phase 7 cleanup
happens after every completed slice rather than waiting for all other phases.

Do not advance a particular slice merely because files were moved. Its exit
criteria must pass in CI and its compatibility adapter must have a named removal
condition.

## Stop and reassess conditions

Pause a slice and revisit its boundary if any of these occurs:

- the adapter needs most of `g_app` rather than a narrow capability set;
- the new and old implementations must both mutate the same state;
- cold activation noticeably harms a common workflow without a viable prefetch or
  eager-loading fallback;
- a shared dependency becomes duplicated across multiple large chunks;
- browser or recovery behavior cannot be characterized before movement; or
- compatibility code grows for several changes without a credible deletion point.

These are signals that the chosen seam is too broad, too narrow, or in the wrong
layer. They are reasons to resize the slice, not reasons to abandon the incremental
migration.
