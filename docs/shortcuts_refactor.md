# Keyboard shortcuts refactoring plan

## Execution contract

Use this plan when implementing or reviewing the remaining shortcut refactor. It replaces `shortcut_issues.md` and `code_flaws.md`; historical `SC-*` and `CQ-*` IDs below provide traceability without separate work queues.

**Scope:** remaining P2 correctness/integration work and P3 maintenance, performance, and presentation work. Findings originated in static review. Subsequent changes may already satisfy individual requirements; inspect the linked symbols before editing. In particular, layout metadata and delayed-execution input-policy checks have already received follow-up changes. This consolidation does not certify runtime behavior.

**Preserve:** the domain/application/adapter separation, injected dependencies, application-owned commands, explicit unresolved conflicts, versioned overrides, existing global/local input policy, and the current dialog framework. Retain persisted command IDs and preference compatibility throughout the refactor.

### Working procedure

1. Start at the first unfinished phase in the table. Read its source locations and compare current behavior with its gate. Keep already-correct implementations and record the evidence.
2. Implement one root-cause change set at a time, including its related behavioral fixes. Finish the gate before advancing; change this order only with explicit user agreement. Phases 1–5 stabilize behavior; broad catalog extraction starts in phase 6.
3. Extend relevant existing tests instead of creating a broad matrix. Validation targets below are a plan, not authorization to execute tests.
4. Mark a phase complete only when its gate is met and validation evidence is recorded. If validation awaits approval, leave it unchecked and record the blocker. Distinguish static inspection, manual observation, and executed tests.
5. Update this plan's progress and source links after each phase. Update `CHANGELOG.md` for implemented fixes/features; documentation-only changes need no changelog entry. Preserve unrelated working-tree changes.

**Procedure gate:** each completed phase has a short record of changed symbols, validation performed/results, and any explicitly deferred work. This table is the sole completion checklist.

## Execution sequence

| Done | Phase | Priority | Consolidated findings |
| --- | --- | --- | --- |
| [x] | [1. Input ownership and modal migration](#phase-1--input-ownership-and-modal-migration) | P2 | SC-03, SC-04; CQ-03 |
| [x] | [2. Binding semantics, repeat, and aliases](#phase-2--binding-semantics-repeat-and-aliases) | P2 | SC-05, SC-06, SC-13; CQ-04, CQ-05 |
| [x] | [3. Dispatcher lifecycle](#phase-3--dispatcher-lifecycle) | P2 | SC-07, SC-08, SC-09; CQ-06 |
| [x] | [4. Atomic edits and observable outcomes](#phase-4--atomic-edits-and-observable-outcomes) | P2 | SC-12; CQ-07 service work, CQ-08 |
| [x] | [5. Recorder state, accessibility, and presentation](#phase-5--recorder-state-accessibility-and-presentation) | P2 / P3 | SC-10, SC-11, SC-16; CQ-07 dialog work |
| [x] | [6. Catalog ownership and legacy cleanup](#phase-6--catalog-ownership-and-legacy-cleanup) | P2 / P3 | SC-14; CQ-01, CQ-02 |
| [ ] | [7. API and data ownership](#phase-7--api-and-data-ownership) | P3 | CQ-09 |
| [ ] | [8. Derived-data caching](#phase-8--derived-data-caching) | P3 | SC-15; CQ-10 |
| [ ] | [9. Build boundary hardening](#phase-9--build-boundary-hardening) | P3 | CQ-11 |

## Phase 1 — Input ownership and modal migration

**Why first:** dispatcher lifecycle and catalog extraction need a reliable definition of which surface owns an event. Service availability currently substitutes for migration ownership in legacy handlers.

**Read:** [shared shortcut context](../src/js/modules/domain/shortcutContext.mjs#L1), [legacy context adapter](../src/js/modules/feature-adapters/legacyShortcutContextAdapter.mjs#L76), [keyboardPolicyAllows](../src/js/modules/application/commandService.mjs#L464), [menu contexts](../src/js/editor.js#L1682), [colour command registration](../src/js/editor.js#L1902), [palette key handling](../src/js/textMode/color/colorPaletteEdit.js#L2288), and [Tools.keyDown](../src/js/textMode/tools.js#L46).

**Remaining behavior:**

- **SC-03:** palette-local undo/redo and N/L/I/V/M are disabled whenever the service exists, while replacements target standalone `color palette` mode rather than the dialog's palette instance.
- **SC-04:** Alt+1…8 / Alt+Shift+1…8 colour selection inherits typing suppression, while the earlier handler that ran before character insertion is disabled.

**Actions, in order:**

1. Define a shared context type and one adapter for translating DOM/legacy state into it. Distinguish editable text, focusable controls, canvas typing, passive canvas focus, and modal identity. Treat unknown focus deliberately rather than assuming canvas; `tabindex` alone does not establish editing ownership.
2. Preserve the existing global/local protections while expressing colour-during-typing as a narrow exception. Separate action prerequisites from keyboard activation restrictions; menu invocation still needs valid prerequisites without inheriting text-entry suppression.
3. Assign ownership per surface/action. Either register modal palette commands against the actual instance or retain that modal's local handlers until a replacement exists. Keep one handler owner per event.
4. Replace partial context snapshots from the broad empty catch with a deliberate safe fallback and rate-limited diagnostics for unexpected failures.

**Validation target:** one focused browser workflow covering standalone versus modal palette tool selection and undo/redo, plus permitted colour changes during canvas typing without character insertion.

**Gate:** each affected surface has an explicit event owner; modal actions target the modal instance; permitted colour shortcuts work during typing; other input-boundary protections remain intact.

**Progress record (2026-09-07):** Added the shared `ShortcutContext`/
`ShortcutInputOwner` contract and `legacyShortcutContextAdapter`, with explicit
editable-text, focusable-control, canvas-typing, passive-canvas, unknown-focus,
and modal identity classification. Context read failures now return one safe
snapshot and emit rate-limited diagnostics. `CommandService.keyboardPolicyAllows`
keeps global/local boundaries and admits only registered Alt+1…8 colour actions
through canvas typing; direct/menu execution checks action prerequisites without
inheriting keyboard-only focus, modal, pointer, popup, or typing restrictions.
Editor action contexts no longer encode typing suppression. The palette-edit
dialog retains its local N/L/I/V/M and undo/redo owner against the actual modal
instance, while the standalone palette remains command-owned. Static validation
passed via targeted syntax checks, module
TypeScript checking, the production build, and the module-boundary and
legacy-graph policy checks. The focused Chromium workflow `palette surfaces and
canvas typing keep one shortcut owner` passed, covering standalone and modal
tool selection and undo/redo (including a modal opened from active canvas
typing), editable-field suppression, and both Alt+1 and Alt+Shift+1 during
canvas typing without character insertion. The adjacent focused menu check
also verifies that direct actions retain mode prerequisites without inheriting
input-boundary restrictions. That browser run exposed missing TanStack runtime
exports in the production build; the dependency export list was completed and
the rebuilt application passed the workflow. No Phase 1 work is deferred.

## Phase 2 — Binding semantics, repeat, and aliases

**Depends on:** phase 1's context contract. This phase defines event identity; phase 3 uses that identity for release tracking.

**Read:** [normalizeBinding](../src/js/modules/domain/keybindings.mjs#L111), [chordsCanCoincide](../src/js/modules/domain/keybindings.mjs#L220), [chordFromKeyboardEvent](../src/js/modules/domain/keybindings.mjs#L271), [eventMatchesChord](../src/js/modules/domain/keybindings.mjs#L305), [bindingFromEvent](../src/js/modules/application/commandService.mjs#L307), [chooseCandidate](../src/js/modules/application/commandService.mjs#L532), [bindingPrecedence](../src/js/modules/application/commandService.mjs#L697), [setBinding](../src/js/modules/application/commandService.mjs#L864), and [legacy overview zoom](../src/js/editor.js#L1148).

**Behavior to resolve:**

- **SC-05:** recorded bindings default to `repeat: false`; replacing a repeating movement/palette/frame binding can turn held navigation into a single action.
- **SC-06:** the original review found Option+1 recorded as `¡` could also match Alt+1 through layout fallback without a conflict warning. Current code retains `layoutCode`/`layoutKey` and adds fallback analysis. Verify and complete that implementation rather than duplicate it.
- **SC-13:** the replacement zoom binding omits the previously supported Ctrl/Cmd+Shift+= (`+`) variant, potentially letting browser zoom handle it.

**Actions, in order:**

1. Establish one event representation carrying semantic key, physical code, modifiers, repeat, and composition information. Keep TanStack behavior behind the keybinding boundary; specify dead-key and layout-change handling.
2. Align conflict/prefix analysis with dispatch equivalence, including recorded complementary layout metadata. Report uncertainty as layout-dependent instead of claiming definite independence. Share the precedence comparator between dispatch and conflict explanations; preserve explicit unresolved ties.
3. Separate captured shortcut identity from repeat/hold policy. Put capability on the command or define explicit inheritance for replacement bindings. Preserve the meaning of existing exported settings.
4. Restore the plus variant as a built-in alias of `view.zoomin`. A custom override or clear must replace the complete default alias set consistently.

**Validation target:** narrow unit cases for re-recording a repeating binding, layout-fallback collisions and ranking parity, plus the zoom alias under assign/clear/reset. Use realistic `key`/`code`/modifier values.

**Gate:** rebinding changes key identity without silently changing action behavior; dispatch and conflict explanations agree for the supported layout cases; uncertain collisions are identified; both default zoom variants belong to the same override lifecycle.

**Progress record (2026-09-07):** Added the canonical
`ShortcutKeyboardEvent` representation at the keybinding boundary, retaining
semantic key, physical code, modifiers, repeat, composition, dead-key, and
AltGraph state. Semantic bindings follow the active layout at dispatch;
physical bindings remain code-based; captured complementary identity is an
analysis snapshot; composition and AltGraph are ignored; and dead keys remain
dispatchable through TanStack fallback but cannot be recorded. Layout-aware
coincidence and prefix analysis now includes conservative warnings for imported
semantic or physical bindings that lack complementary layout metadata; those
uncertain relationships remain advisory and are never removed by Replace.
Runtime selection and conflict explanations share one precedence comparator
and retain unresolved ties. Repeatability is command-owned (while imported binding-level
`repeat` remains supported), so recording a new identity cannot disable held
movement, palette, or frame actions. `view.zoomin` again owns both Ctrl/Cmd+=
and Ctrl/Cmd+Shift+= defaults; assign or clear replaces the complete alias set,
and reset restores both. The approved focused Node tests passed (21 tests)
across `keyboard-shortcuts.test.mjs` and `editor-commands.test.mjs`, covering
repeat inheritance across persistence, recorded and uncertain layout fallback,
ranking/dispatch parity, realistic plus-key dispatch, and zoom assign/clear/
reset. Module TypeScript checking also passed. No Phase 2 work is deferred.

## Phase 3 — Dispatcher lifecycle

**Depends on:** phase 1's context ownership and phase 2's event identity.

**Read:** [executeKeyboardCandidate](../src/js/modules/application/commandService.mjs#L594), [releaseActiveCommands and keyup matching](../src/js/modules/application/commandService.mjs#L656), [handleKeyDown](../src/js/modules/application/commandService.mjs#L768), and [Preview blur handling](../src/js/editor.js#L485).

**Remaining behavior:**

- **SC-07:** binding Preview to Shift+1 (`!`), then releasing Shift before 1, can leave Preview held because keyup reports `1` rather than `!`.
- **SC-08:** releasing/repressing Ctrl between imported Ctrl+K, Ctrl+C chords can cancel the sequence on the modifier-only keydown and trigger its fallback.
- **SC-09:** pending timers and held-command bookkeeping need explicit lifecycle cancellation. The newer delayed-execution input-policy recheck is useful but does not replace cleanup on focus/window/editor transitions; the earlier unchecked-focus example is not the current contract.

**Actions, in order:**

1. Make idle, pending sequence, recording, and held-command transitions explicit in a small internal state helper. Capture the actual activating physical key, including for delayed fallback bookkeeping; release against that identity rather than reconstructing it from the stored shortcut.
2. Ignore modifier-only events while waiting for a continuation. Define cancellation for Escape, composition, binding changes, and relevant focus/context invalidation.
3. Wire focus loss, window blur, visibility loss, mode/modal changes, recording start, and teardown through dispatcher cleanup. Cancel pending work without executing fallback; release successful held activations exactly once and make repeated cleanup harmless.
4. Keep stale timers unable to act on later state. Preserve supported imported sequences; if sequence support is deliberately deferred, obtain agreement and reject unsupported imports explicitly rather than discarding preferences.

**Validation target:** extend the existing timer/held-command harness for modifier repress, shifted-key release order, cancellation before timeout, delayed fallback release, and repeated cleanup.

**Gate:** every successful held activation has one release; cancelled pending work cannot fire later; modifier-only events preserve valid sequences; service state and visible editor state remain synchronized after lifecycle transitions.

**Progress record (2026-09-07):** Added the internal
`CommandDispatcherState` to own recording, pending-sequence timers, and held
activations. Held commands and delayed fallbacks now retain the physical
`KeyboardEvent.code` that activated them (with a semantic fallback for
code-less events), so releasing Shift before a shifted printable key still
ends the command. Modifier-only keydowns no longer cancel a pending imported
sequence or execute its fallback. Escape, composition, binding changes,
recording start, focus loss, window blur, visibility loss, application and
text-editor mode, device type, modal/popup and input-policy changes, and page
teardown now converge on an idempotent dispatcher cleanup that discards
pending fallbacks and releases held activations once. A lifecycle revision
also pairs an activation immediately when its handler triggers cleanup before
held-state registration. Timer callbacks verify pending-state identity before
acting, so cancelled callbacks cannot affect a later sequence. The focused
Node shortcut suite passed (18 tests), covering modifier repress, shifted-key
release order, delayed fallback release, cancellation before timeout, stale
callbacks, binding changes, repeated cleanup, and cleanup triggered during a
held command's execution. Module TypeScript checking,
the module-boundary and legacy-graph policy checks, and the production build
and deterministic build-artifact verification passed. The focused Chromium
Preview workflow also passed, including window blur and device-type
synchronization of the held-command state and visible overview, plus pending
sequence cancellation on text-editor mode changes. No Phase 3 work is deferred.

## Phase 4 — Atomic edits and observable outcomes

**Depends on:** stable binding semantics and lifecycle behavior. Define the mutation/result contract here before restructuring recorder control flow.

**Read:** [persist and notify](../src/js/modules/application/commandService.mjs#L487), [execute](../src/js/modules/application/commandService.mjs#L682), [editBindings](../src/js/modules/application/commandService.mjs#L1321), [importConfiguration](../src/js/modules/application/commandService.mjs#L1445), [storage adapter](../src/js/modules/infrastructure/keybindingStorageAdapter.mjs#L8), and [commitRecording](../src/js/modules/feature-adapters/keyboardShortcutsDialog.mjs#L498).

**Problem:** conflict replacement removes bindings and saves/notifies before assignment performs another save/notify. Observers see an intermediate configuration. **SC-12:** persistence errors are logged or silently skipped while the UI announces a successful save. Execution booleans also blur acceptance, handler rejection, and asynchronous completion.

**Actions, in order:**

1. Expose one edit operation that computes replacements, validates the complete next configuration, applies it coherently, attempts persistence once, and emits one change notification. Include assign, clear, reset, and import in the result contract.
2. Distinguish durable success, session-only application, and rejection. Prefer usable session-only changes with an explicit warning when storage is unavailable; make any rollback policy deliberate. Ensure subscribers receive the complete state and persistence outcome.
3. Have dialog status messages consume these results immediately; reserve “saved” for durable success.
4. Define command execution as acceptance versus completion explicitly. Normalize legacy false/Promise results in adapters, surface rejection/failure, and keep keyboard event consumption synchronous. Diagnose enabled-predicate failures without flooding logs.

**Validation target:** focused service/storage cases proving one complete replacement update, one persistence attempt/notification, unavailable/quota-failing storage outcomes, and the intended sync/async command result contract.

**Gate:** no observer sees half a conflict-replacement edit; every preference operation exposes persistence status; callers distinguish action acceptance from rejection/completion; the UI never labels session-only changes as durably saved.

**Progress record (2026-09-07):** Added the application-owned
`ShortcutEditResult` contract and `editBindings`/`commitEdit` path for assign,
clear, reset, reset-all, conflict replacement, and import. Edits are now built
against a complete draft, normalized and validated before application, then
persisted once and delivered to subscribers in one notification containing the
complete override snapshot and persistence outcome. Conflict removal and the
replacement assignment therefore cannot expose an intermediate state. Storage
unavailability and quota failures deliberately retain a usable session-only
configuration, while invalid edits are rejected without mutation; the browser
storage adapter now reports absence explicitly. Dialog messages consume the
result immediately and reserve “saved” for durable changes. Command execution
now returns a synchronous acceptance decision plus an awaitable completion;
legacy synchronous `false`, resolving `false`, thrown errors, and rejected
promises have distinct rejected or failed outcomes while keyboard consumption
remains synchronous. Enabled-predicate exceptions are rejected safely and
reported once per predicate to avoid diagnostic flooding. The focused shortcut
unit suite passed (23 tests), covering one-save/one-notification atomic
replacement, complete subscriber state, durable/session-only/rejected edits,
unavailable and quota-failing storage, synchronous and asynchronous execution,
subscriber exception isolation, and predicate diagnostics. Module TypeScript
checking, module-boundary and legacy-graph policy checks, and the production
build passed. All 9 focused
Chromium shortcut workflows passed, including durable replacement and an
injected quota failure that the dialog correctly labels session-only. No Phase
4 work is deferred.

## Phase 5 — Recorder state, accessibility, and presentation

**Depends on:** phase 4's complete edit/result operation.

**Read:** [render](../src/js/modules/feature-adapters/keyboardShortcutsDialog.mjs#L345), [cancelRecording](../src/js/modules/feature-adapters/keyboardShortcutsDialog.mjs#L443), [startRecording and commitRecording](../src/js/modules/feature-adapters/keyboardShortcutsDialog.mjs#L478), [handleRecordingKeyDown](../src/js/modules/feature-adapters/keyboardShortcutsDialog.mjs#L673), [dialog markup](../src/html/keyboardShortcuts.html), and [table header CSS](../src/css/main.css#L1744).

**Remaining behavior:**

- **SC-10:** synchronous rerender removes the recording anchor and calls `cancelRecording(false)` during commit, losing the command ID needed for focus restoration.
- **SC-11:** capture takes focus immediately and records Tab/Shift+Tab, blocking reliable keyboard access to physical-key options.
- **SC-16, P3:** sticky styling applies to every `th`, including body command cells and group headings that compete with column headers. Fix this locally while changing the dialog rather than waiting for broader cleanup.

**Actions, in order:**

1. Keep recorder state and its intended command/focus target independent of DOM nodes. Rendering consumes state; explicit controller transitions handle commit, cancel, or command removal.
2. Complete commit/cancel state changes using phase 4's result, then restore focus to the replacement row control after rendering. Apply the same rule to ordinary and conflict-replacing commits.
3. Expose options before capture, with an explicit keyboard-accessible transition into capture. Allow deliberate Tab recording while preserving navigation outside capture mode.
4. Scope column-header stickiness to `thead th`; use separate offsets only if sticky groups are intentionally retained. Preserve semantic row headers and existing safe text rendering.

**Validation target:** one focused keyboard-only browser flow for selecting physical mode, capture/cancel, ordinary and conflict-replacing commits, row focus, and success/error announcements. Include a manual scroll check for header alignment.

**Gate:** keyboard users can choose options, record, cancel/commit, and return to the edited row; rendering cannot silently cancel an in-progress mutation; scrolling keeps labels aligned with their action cells.

**Progress record (2026-09-07):** Replaced the recorder's DOM-anchor
bookkeeping with `ShortcutRecorderState`, keyed by stable command identity and
holding capture, binding, and conflict state independently of rendered nodes.
`renderRecorder` now projects that state into the current DOM, while explicit
controller transitions end recording after commit or cancel and when a command
is removed. Ordinary and conflict-replacing commits both finish from the
complete Phase 4 edit result, rerender, retain the edited command through any
active search or filter, and resolve the replacement row control by command ID
before restoring focus; rejected edits remain open with an error announcement.
The retained row returns to normal filtering on the next filter or search
change. The physical-key option now precedes an explicit Start Recording
control. Tab traverses those controls outside capture mode, while Tab and
Shift+Tab are deliberately recordable after capture starts. Sticky presentation
is limited to `thead th`; the shortcut root now fits the legacy dialog content
so the table holder owns scrolling and body row/group headers no longer compete
with the column labels. Targeted syntax checks, module TypeScript checking, and
the production build passed. Two focused Chromium workflows passed, including
keyboard-only physical-mode selection, capture and Escape cancellation,
physical Shift+Tab assignment, ordinary and conflict-replacing commits, fresh
row focus (including a commit that stops matching the active conflict filter),
durable and rejected announcements, and actual scrolled-position checks. A
manual screenshot inspection of the scrolled table confirmed header and
action-column alignment. No Phase 5 work is deferred.

## Phase 6 — Catalog ownership and legacy cleanup

**Depends on:** phases 1–5. Extract stable behavior instead of combining a large move with dispatcher redesign.

**Read:** [legacy command catalog adapter](../src/js/modules/feature-adapters/legacyCommandCatalogAdapter.mjs#L1), [Editor setup and action host](../src/js/editor.js#L2172), [command definition and activation](../src/js/modules/application/commandService.mjs#L523), [shared tool metadata and legacy defaults](../src/js/styles.js#L1), and [DrawTools.getTools](../src/js/textMode/tools/drawTools.js#L283).

**Problem:** `Editor` mixes catalog definitions, actions, context inference, menu discovery, and label synchronization. **SC-14:** tool names/defaults/label maps have multiple owners. Persisted identity is inferred from menu names; duplicate registrations merge contexts/predicates while retaining the first handler and metadata.

**Actions, in order:**

1. Define stable command IDs, titles/categories, default alias sets, and actions once. Attach explicit menu/tool aliases so presentation renames cannot rename preference keys.
2. Separate command definition from adding activations/UI bindings. Reject incompatible duplicate definitions and consolidate redundant context/enabled representations while preserving the input/action distinction from phase 1.
3. Move catalog registration and legacy action callbacks into focused feature adapters; isolate menu enumeration and label synchronization. Keep `CommandService` as the public facade and `Editor` as setup/action host. Extract cohesive responsibilities rather than introducing many trivial classes or rewriting the entire legacy menu switch.
4. Generate label/default mappings from shared metadata. Remove a legacy implementation only after all remaining consumers and surfaces are accounted for; explicitly retain independent systems that are outside the migration.

**Validation target:** existing representative command/menu/label tests plus a targeted alias-registration and preference-ID compatibility check. Use real action results where dispatch-only stubs would hide routing errors.

**Gate:** adding a tool binding has one metadata owner; menu renames preserve overrides; additional UI aliases cannot silently change handlers; each removed fallback has a documented replacement or no remaining consumers.

**Progress record (2026-09-07):** Added
`legacyCommandCatalogAdapter` as the single configurable editor catalog and
legacy integration boundary. Pure domain metadata explicitly defines the stable
ID, title, category, default aliases, and canonical action for all 115 current
configurable menu commands plus three conditional commands. Menu discovery now
supplies only activation state: display labels, traversal order, and legacy UI
shortcut objects cannot redefine behavior, and an unknown configurable alias is
rejected. Text, pixel, and colour-palette metadata owns command IDs, titles,
defaults, action targets, and UI aliases together; tool/menu/ARIA labels are
generated from effective bindings through the same adapter.
`CommandService.defineCommand` now owns immutable definition behavior,
`addCommandActivation` adds contextual UI availability separately, and duplicate
definitions fail instead of silently retaining the first handler or merging
metadata. `registerCommand` remains the public convenience facade for one
definition plus one activation. `Editor` now only connects the catalog and
continues as the legacy action host; its former ID/context inference,
registration, and label synchronization methods were removed and replaced by
the adapter. The per-tool label/default maps in `DrawTools`, `PixelDrawTools`,
`PixelDraw`, and `ColorPaletteEdit` were removed in favor of catalog-generated
presentations. The retained `keys.textMode.tools*` compatibility values and
guarded classic no-service labels now derive from that same frozen metadata.
Existing command IDs and version-1 overrides remain unchanged. Music, Ace,
C64/debugger, assembler, joystick, and the modal colour-palette owner remain
explicitly outside this catalog. Targeted module type and syntax checks passed,
as did 36 focused command/editor unit tests. The production module graph passes
at 20 modules and 22 edges, and the protected 304-input legacy graph has no new
input or exception. The production build and artifact verification passed. Two
focused Chromium workflows passed, covering a real tool rebinding and label
update plus preference survival across reload/reset. The added unit coverage
verifies aliased menus retain one persisted ID and canonical action when labels,
alias order, or UI defaults change; unsupported configurable aliases fail; shared
tool presentations keep classic fallback labels/defaults; and a second command
definition cannot replace metadata or behavior. No Phase 6 work is deferred.

## Phase 7 — API and data ownership

**Depends on:** phase 4's mutation API and phase 6's registration model.

**Read:** [readOverrides](../src/js/modules/application/commandService.mjs#L104), [setBinding/removeBinding](../src/js/modules/application/commandService.mjs#L864), [normalizeBinding](../src/js/modules/domain/keybindings.mjs#L111), and [dialog JSDoc types](../src/js/modules/feature-adapters/keyboardShortcutsDialog.mjs#L1).

**Problem:** one custom shortcut per command is exposed through ignored indexes and collection operations that truncate input. Broad/duplicated types and shallow ownership allow callers to misunderstand or bypass the intended model. These are maintenance risks, not demonstrated external-mutation bugs.

**Actions, in order:**

1. Make the public override API express assign, clear, reset, and atomic replace-conflicts; keep built-in alias collections internal. Remove ignored indexes after updating callers.
2. Reuse shared JSDoc context/summary/conflict/recording types. Validate supported context conditions at registration/import boundaries; normalize and own data once, exposing safe views instead of mutable internal maps. A TypeScript conversion is unnecessary.
3. Distinguish tolerant startup recovery from interactive import diagnostics. Report skipped/invalid entries and truncation; define unknown-command handling and migration so registration order cannot silently delete preferences.

**Validation target:** narrowly cover invalid imports, unknown IDs, existing preference round trips, and the intended public mutation boundary; reuse earlier transaction coverage.

**Gate:** public APIs match the single-custom-shortcut model; import outcomes explain discarded input; shared data cannot bypass mutation notifications/persistence; existing preference semantics survive.

## Phase 8 — Derived-data caching

**Depends on:** stable ownership and mutation invalidation from phases 6–7.

**Read:** [matchingCandidatesForEvent](../src/js/modules/application/commandService.mjs#L556), [getCommands](../src/js/modules/application/commandService.mjs#L823), [groupedRows](../src/js/modules/feature-adapters/keyboardShortcutsDialog.mjs#L227), and [render](../src/js/modules/feature-adapters/keyboardShortcutsDialog.mjs#L345).

**Problem — SC-15:** search/filter changes recompute all-pairs conflicts and rebuild rows; dispatch repeatedly clones/normalizes bindings and signatures. The unnecessary work is visible statically; user-visible latency has not been measured.

**Actions, in order:**

1. Cache normalized effective bindings/signatures and static conflict summaries by catalog/override revision. Include relevant platform/layout inputs in invalidation.
2. Filter cached summaries for search. Recompute focus/mode availability separately and keep dynamic enabled predicates current.
3. Reduce unnecessary row/label replacement while preserving phase 5's focus/scroll guarantees. Measure before adding tries, workers, virtualization, or other indexing infrastructure.

**Validation target:** a small cache-invalidation check showing search does not rebuild conflicts, edits do invalidate them, and context/availability changes remain live. Measure affected paths rather than asserting an unobserved performance gain.

**Gate:** search leaves the static conflict graph unchanged; binding/catalog/layout changes invalidate the correct derived data; mode/focus changes update availability without stale enablement or rebuilding preference data.

## Phase 9 — Build boundary hardening

**Depends on:** the settled domain exports/imports from earlier phases; perform this as a separate build-only change set.

**Read:** [dependency mapping](../scripts/build-config.mjs#L7), [bundleModuleDependencies](../scripts/build.mjs#L383), [external module allowance](../scripts/build-graph.mjs#L418), and [verification import rewriting](../scripts/verify-build.mjs#L293).

**Problem:** all `UNRESOLVED_IMPORT` warnings are suppressed for a known optional dependency case; package allowances are broader than the intended importer; dependency mapping/rewrite knowledge is spread across build paths. The self-contained chunk check is valuable, and this review does not establish a broken bundle.

**Actions, in order:**

1. Narrow the warning exception to the known optional dependency/importer, or use a supported entry that avoids irrelevant re-exports. Keep unexpected unresolved imports visible and retain the self-contained-output check.
2. Centralize specifier/output mapping and relative import rewriting, while retaining sufficiently independent verification to detect a wrong transformation.
3. Restrict TanStack imports to the intended keybinding boundary where architecture tooling permits.

**Validation target:** the relevant dependency-bundle/build-boundary verification only; obtain approval for any test execution and use existing checks where sufficient.

**Gate:** valid bundles remain self-contained; unexpected unresolved imports surface; architectural exceptions cover only intended consumers; dependency updates require one authoritative mapping change.

## Validation reference

Start with [keyboard-shortcuts.test.mjs](../tests/keyboard-shortcuts.test.mjs) for normalization, ranking, persistence, repeat, sequences, and timers; use [keyboard-shortcuts.spec.mjs](../tests/keyboard-shortcuts.spec.mjs) for real focus, modal ownership, and recorder workflows. Inspect current test names/scripts when preparing an approval request rather than copying commands into this plan.

Some existing browser tests stub handlers and blur the active element. Those establish dispatch parity, not real editing results or focus ownership. Select checks by the phase's contract, use actual focus where it matters, and keep the test scope proportional to the risk.

**Final completion gate:** all phase gates are satisfied with recorded evidence or explicitly accepted deferrals. The consolidated outcome is consistent keyboard semantics, explicit lifecycle/input ownership, coherent preference edits, accessible recording, and a maintainable catalog—not merely fewer files or passing dispatch-only tests.
