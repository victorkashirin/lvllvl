# Configurable keyboard shortcuts

Status: research and implementation recommendation. No implementation has been started.

## Executive summary

The application should not add rebinding directly to the existing menu shortcut objects or the global `keys` object. Keyboard input is currently split across several unrelated systems, so doing that would make only a subset of shortcuts configurable and would preserve the existing precedence, focus, and conflict bugs.

The recommended route is:

1. Introduce an application-owned command catalog and keybinding service as the single source of truth.
2. Model activation context explicitly so the same binding can be valid in mutually exclusive modes while genuine conflicts are reported.
3. Route menu activation and keyboard activation through the same commands.
4. Persist only versioned user overrides, leaving defaults in code.
5. Build a VS Code-inspired editor with the application's existing `UI.Dialog` and `UI.HTMLPanel` components.
6. Migrate discrete application actions first, then mode-specific shortcuts incrementally.

There is no maintained library that provides a drop-in VS Code-like keybindings editor. [TanStack Hotkeys](https://tanstack.com/hotkeys/latest) is the best headless dependency candidate because it provides recording, normalization, formatting, scopes, sequences, held keys, and basic conflict handling. Its documentation currently marks it as alpha, so it should be pinned and isolated behind a narrow adapter. If that risk or its build integration is unacceptable, [tinykeys](https://github.com/jamiebuilds/tinykeys) is the conservative alternative, at the cost of implementing more behavior locally.

The command catalog, context model, conflict analysis, persistence format, settings UI, and migration plan must remain application-owned regardless of the low-level keyboard library.

## Goals

- Let users add, replace, remove, and reset application shortcuts.
- Present conflicts at edit time instead of resolving them silently by registration order.
- Allow the same key to be reused in contexts that cannot be active together.
- Use one binding definition for dispatch, menu labels, tooltips, help, and accessibility metadata.
- Preserve platform-appropriate display and behavior for Command on macOS and Control elsewhere.
- Support non-US keyboard layouts deliberately.
- Permit incremental migration without rewriting all editor modes at once.
- Keep defaults in code while storing only user customizations.

## Non-goals for the first implementation

The first version should not mechanically convert every `keydown` handler into a configurable application command. These input domains have different semantics and should remain separate initially:

- Typing and intrinsic navigation inside inputs and widgets.
- Ace's internal editing commands.
- Emulated-machine keyboard input.
- Joystick mappings.
- Pointer gestures combined with held or released keys.
- Temporary keys whose meaning is private to a modal tool operation.

They may later reuse the same key normalizer, recorder, and platform formatter where useful.

## Current implementation

### Global event entry point

Document-level keyboard listeners call `UI.keyDown`, `UI.keyUp`, and `UI.keyPress` in [`src/js/ui/ui.js`](../src/js/ui/ui.js#L1156). `UI.keyDown` is the central seam, but it is not currently a central resolver. It invokes several systems in order:

1. Browser-edit-operation handling.
2. Menu shortcut matching.
3. Popup handling.
4. Dialog handling.
5. The single application `keydown` callback, which reaches `Editor.keyDown`.

The relevant routing is in [`src/js/ui/ui.js`](../src/js/ui/ui.js#L719). `UI.on` stores only one handler for each global keyboard event type in [`src/js/ui/ui.js`](../src/js/ui/ui.js#L133).

`Editor.allowKeyShortcuts` is initialized in [`src/js/editor.js`](../src/js/editor.js#L95) and gates only downstream mode routing in [`src/js/editor.js`](../src/js/editor.js#L448). It does not govern the complete shortcut pipeline. For example, menu processing has already happened by then, and the Control/Command+Y redo path is evaluated before that gate.

### Menu shortcuts

The main menu is constructed in [`src/js/editor.js`](../src/js/editor.js#L987). Roughly sixty menu items declare inline shortcut objects such as:

```js
{ cmd: true, shift: true, key: "Z" }
```

`UI.MenuItem` fills missing modifier fields, destructively changes `cmd` to `ctrl` on non-macOS platforms, prepares a lowercase character only for one-character keys, and adds the binding to its parent menu bar. See [`src/js/ui/menuBar.js`](../src/js/ui/menuBar.js#L46).

`UI.MenuBar` keeps every accelerator in one flat array in [`src/js/ui/menuBar.js`](../src/js/ui/menuBar.js#L378). Its `keyDown` method converts legacy `event.keyCode` values with `String.fromCharCode` plus handwritten punctuation cases, then searches the array from the beginning. The first enabled and currently available exact match clicks its menu item and returns. See [`src/js/ui/menuBar.js`](../src/js/ui/menuBar.js#L549).

Menu availability is inferred from menu-item enabled/visible state and the rendered layout of its parent menu in [`src/js/ui/menuBar.js`](../src/js/ui/menuBar.js#L219). `Editor.setMode` indirectly scopes shortcuts by showing and hiding menus with CSS classes in [`src/js/editor.js`](../src/js/editor.js#L623). Thus context is encoded in DOM visibility rather than represented as data.

The clicked menu item emits its UI ID, which reaches the large `Editor.menuClick` switch in [`src/js/editor.js`](../src/js/editor.js#L1544). This switch is already close to a command dispatcher, but its commands do not have stable command metadata and keyboard paths outside the menu do not consistently go through it.

### Text-mode shortcuts

Text-mode defaults are stored in the global `keys.textMode` object in [`src/js/styles.js`](../src/js/styles.js#L18). The object mixes modern `{ key }` values with legacy numeric `{ keyCode, shift }` values.

`Editor.keyDown` routes by editor mode in [`src/js/editor.js`](../src/js/editor.js#L448). Text mode passes through `TextModeEditor.keyDown` in [`src/js/textMode/textModeEditor.js`](../src/js/textMode/textModeEditor.js#L1819) and then into tools, palettes, selection, frames, and related components.

`DrawTools.keyDown` in [`src/js/textMode/tools/drawTools.js`](../src/js/textMode/tools/drawTools.js#L1579) mixes:

- `event.key` checks.
- `String.fromCharCode(event.keyCode)` checks.
- Global `keys.textMode` values.
- Current tool, layer, selection, and screen-mode conditions.
- Calls directly into editor actions.

The tile and color palettes independently interpret the same globals in [`src/js/textMode/tools/tilePalette.js`](../src/js/textMode/tools/tilePalette.js#L930) and [`src/js/textMode/color/colorPalettePanel.js`](../src/js/textMode/color/colorPalettePanel.js#L256).

These local conditions are meaningful activation contexts, but a settings screen cannot inspect them and therefore cannot determine whether two shortcuts overlap.

### Other independent shortcut systems

- Music mode hardcodes Delete, Space, Control/Command+A, Z, and Y and forwards other events in [`src/js/music/music.js`](../src/js/music/music.js#L490).
- The C64 debugger hardcodes F5, F6, F9, F10, and F11 with focus and panel conditions in [`src/js/c64/c64Debugger.js`](../src/js/c64/c64Debugger.js#L3783).
- Ace registers its own F-key and Control/Command bindings through its command registry in [`src/js/codeEditor/codeEditor.js`](../src/js/codeEditor/codeEditor.js#L181).
- Many dialogs and editors manually toggle focus flags, `UI.browserEditOperations`, or `Editor.allowKeyShortcuts`.

A repository scan found dozens of non-library files inspecting keyboard modifier/key properties and many separate `keyDown`, `keyUp`, and `keyPress` methods. This is an incremental migration problem rather than a single call-site change.

### Existing limited rebinding

The C64 joystick settings dialog is the closest existing precedent. It:

- Loads per-action values from preferences in [`src/js/c64/c64Joystick.js`](../src/js/c64/c64Joystick.js#L129).
- Makes cells focusable and records `event.key` in [`src/js/c64/c64Joystick.js`](../src/js/c64/c64Joystick.js#L470).
- Uses Backspace/Delete to clear a value.
- Stages changes until OK and saves them in [`src/js/c64/c64Joystick.js`](../src/js/c64/c64Joystick.js#L566).
- Compares lowercased `event.key` values at runtime in [`src/js/c64/c64Joystick.js`](../src/js/c64/c64Joystick.js#L780).

This establishes a useful dialog and preference flow, but its recorder supports only one key. It has no modifiers, sequences, physical-key identity, platform formatting, validation, or conflicts.

### Shortcut display is fragmented

- Menu labels are rendered from inline menu shortcut objects in [`src/js/ui/menuBar.js`](../src/js/ui/menuBar.js#L82).
- Tool labels are generated from the global `keys` object in [`src/js/textMode/tools/drawTools.js`](../src/js/textMode/tools/drawTools.js#L279).
- Popup labels render separately in [`src/js/textMode/tools/drawToolsPopup.js`](../src/js/textMode/tools/drawToolsPopup.js#L52).
- Some toolbar titles are hardcoded in [`src/html/textMode/drawTools.html`](../src/html/textMode/drawTools.html#L18).
- The keyboard shortcut help is static HTML in [`src/docs/keyboard-shortcuts.html`](../src/docs/keyboard-shortcuts.html#L28).

Changing a shortcut in only one place would therefore leave stale labels and documentation elsewhere.

### Persistence and settings UI

Global preferences are currently flat synchronous `localStorage` entries accessed by [`src/js/editor.js`](../src/js/editor.js#L202). They are loaded before UI construction in [`src/js/editor.js`](../src/js/editor.js#L123).

Project documents have a separate hidden `/settings` record in [`src/js/file/document.js`](../src/js/file/document.js#L189), and project restoration reads it in [`src/js/file/fileManager.js`](../src/js/file/fileManager.js#L665). That store is project-specific and is not appropriate for application-wide user bindings.

Project persistence uses LocalForage/IndexedDB through [`src/js/utils/storageManager.js`](../src/js/utils/storageManager.js#L108), [`src/js/modules/infrastructure/browserStorageAdapter.mjs`](../src/js/modules/infrastructure/browserStorageAdapter.mjs#L31), and [`src/js/modules/application/persistenceService.mjs`](../src/js/modules/application/persistenceService.mjs#L25). There is currently no active account/server preference synchronization path.

The application has suitable UI primitives:

- `UI.Dialog` supports modal stacking, responsive sizing, scrolling, and footer buttons in [`src/js/ui/dialog.js`](../src/js/ui/dialog.js#L91).
- `UI.HTMLPanel` loads cached, sanitized templates in [`src/js/ui/htmlPanel.js`](../src/js/ui/htmlPanel.js#L31).
- Templates under `src/html` are included by [`scripts/build.mjs`](../scripts/build.mjs#L133).
- Complex dialogs already compose Dialog, SplitPanel, TabPanel, Panel, and HTMLPanel, for example [`src/js/textMode/color/colorPaletteChoosePreset.js`](../src/js/textMode/color/colorPaletteChoosePreset.js#L70).

There is no reusable data-grid or search-list component. Existing searchable lists are hand-built from inputs and DOM lists/tables, for example [`src/js/assemblerUtils/mos6502Opcodes.js`](../src/js/assemblerUtils/mos6502Opcodes.js#L15).

A global Settings menu exists but is commented out in [`src/js/editor.js`](../src/js/editor.js#L1334). It is the natural location for a global **Keyboard Shortcuts...** command. The active Interface menu is tile-mode-specific and should not own application-wide preferences.

### Architecture constraints

The project combines an ordered legacy global-script bundle with governed native modules. `bootstrap.mjs` is the composition root in [`src/js/bootstrap.mjs`](../src/js/bootstrap.mjs#L55).

Governed modules may not directly use browser globals, local storage, or jQuery; dependencies must be supplied through ports/adapters. The relevant checks are in [`scripts/module-boundaries.mjs`](../scripts/module-boundaries.mjs#L12). Bare external module imports are also currently rejected, so adding an npm runtime dependency requires an explicit build/boundary decision rather than only adding an import.

Strict CSP and Trusted Types are enabled in [`src/index.html`](../src/index.html#L7), with sanitization policy support in [`src/js/security/htmlPolicy.js`](../src/js/security/htmlPolicy.js#L88). A large third-party settings component would conflict with both the current UI and these boundaries.

The best architectural fit is a small, pure domain/application service created at bootstrap, an injected storage/event adapter, and thin adapters for the legacy menu and editor objects.

## Concrete defects and design hazards

### Active hard conflict

Control/Command+I is assigned to both:

- **Copy as Image To Clipboard** in [`src/js/editor.js`](../src/js/editor.js#L1053).
- **Set Reference Image...** in [`src/js/editor.js`](../src/js/editor.js#L1225).

Both are available in tile mode. The flat menu-array resolver picks the first match, so the latter is silently shadowed.

Control/Command+I is also used for **Mouse Info** in debugger mode in [`src/js/editor.js`](../src/js/editor.js#L1416). That reuse is potentially valid because debugger and tile mode are mutually exclusive. This demonstrates why string equality alone is not sufficient: conflict detection must consider whether activation contexts overlap.

### Advertised but non-functional special key

**Clear All** declares `Del` in [`src/js/editor.js`](../src/js/editor.js#L1055). `MenuItem` only derives `keyLowerCase` for a one-character key in [`src/js/ui/menuBar.js`](../src/js/ui/menuBar.js#L69), while dispatch requires `keyLowerCase` to match. The advertised shortcut is therefore not handled by the normal menu path.

### Duplicate defaults overwrite each other

`drawCharacter`, `drawFGColor`, and `drawBGColor` are first assigned C, F, and G and then redefined with `key: false` in [`src/js/styles.js`](../src/js/styles.js#L36). The later object properties silently replace the earlier values.

### Incomplete modifier comparison

`MenuBar.setShortcutEnabled` normalizes and compares Command, Control, and Shift but omits Alt in [`src/js/ui/menuBar.js`](../src/js/ui/menuBar.js#L405). Its behavior can therefore affect a different binding than intended.

### Modal and focus state is not authoritative

Dialogs set `UI.canProcessMenuKeys` while the dialog stack changes in [`src/js/ui/ui.js`](../src/js/ui/ui.js#L371), but focus suppression is spread among several booleans and handlers. `UI.canProcessKeyEvents` is not consistently honored by the keydown path. A recorder added as another local handler could allow the shortcut being recorded to execute simultaneously.

The new dispatcher needs one explicit capture/modal state and one authoritative input-focus policy.

## Library research

No evaluated package supplies the full user-facing editor, application command catalog, context-overlap analysis, persistence, and menu synchronization required here.

### 1. TanStack Hotkeys

[TanStack Hotkeys](https://tanstack.com/hotkeys/latest) is the closest functional match. Its core supports:

- Normalized and platform-aware bindings.
- `Mod` abstraction.
- Scopes and target filtering.
- Single chords and ordered sequences.
- Keydown, keyup, repeat/reset, and held-key behavior.
- Recording and display formatting.
- Metadata on registrations.
- Exact-registration conflict policies such as warn, error, replace, and allow.

Its [recording guide](https://tanstack.com/hotkeys/latest/docs/framework/react/guides/hotkey-recording) documents modifier-only handling, Escape cancellation, Backspace/Delete clearing, input filtering, portable `Mod` conversion, and a basic settings-screen example. The React adapter is not appropriate for this repository, but the recorder is backed by core classes rather than requiring the UI to be React.

Limitations:

- The project is currently marked alpha.
- It does not provide a finished keybindings editor component.
- Its registration conflict handling does not determine whether application-specific contexts overlap.
- The application still needs stable command IDs, user override semantics, context data, conflict presentation, storage, and menu integration.
- The current build rules require a deliberate way to package/import it.

Recommendation: perform a small integration spike, pin the chosen version, and hide it behind an application-owned adapter. It must not become the source of truth for commands or saved preferences.

### 2. Lumino Commands

[`@lumino/commands`](https://lumino.readthedocs.io/en/latest/api/classes/commands.CommandRegistry-1.html) offers a mature command registry with stable command IDs, multi-step chords, platform accelerators, selector-based context, and deterministic precedence. It is used by the JupyterLab/Lumino ecosystem.

Limitations:

- No recorder or configuration UI.
- Activation context is expressed primarily through CSS selectors rather than a VS Code-like context-key model.
- It introduces a broader dependency family and a larger architectural commitment.

It is a useful design reference but not the best fit for this application.

### 3. tinykeys

[`tinykeys`](https://github.com/jamiebuilds/tinykeys) is a small, maintained, framework-independent dispatcher. It supports:

- `KeyboardEvent.key` and explicit `KeyboardEvent.code` matching.
- A portable `$mod` modifier.
- Sequences and timeouts.
- Keydown/keyup and capture options.
- Input-ignore predicates and AltGraph handling.

It has no command registry, metadata model, recorder UI, formatter, application context language, or meaningful conflict model. It is the conservative fallback if TanStack's alpha status or packaging is undesirable and the application is willing to own nearly everything.

### 4. GitHub Hotkey

[`@github/hotkey`](https://github.com/github/hotkey) is maintained, small, and declarative. It uses `data-hotkey` attributes, supports `Mod`, sequences, and form-field scope, and activates DOM elements by click or focus.

Its DOM-action model is not a good match for the application's mode/tool commands. It has no editor, recorder, command registry, or conflict reporting.

### 5. hotkeys-js

[`hotkeys-js`](https://github.com/jaywcjlove/hotkeys-js) is maintained and provides named scopes, input filters, unbinding, and keydown/keyup behavior.

It retains legacy key-code-oriented machinery, has a limited active-scope model, and lacks the recording, metadata, ordered sequence, and conflict facilities needed to materially simplify this migration.

### Older and adjacent options

Mousetrap, KeyboardJS, and similar older dispatchers do not improve the editor/conflict story enough to justify choosing them. A small utility such as `keyux` could help keep `aria-keyshortcuts` synchronized, but it is not a command/keybinding engine.

### VS Code and Monaco

VS Code's [keyboard shortcuts documentation](https://code.visualstudio.com/docs/configure/keybindings) is the product-design reference. Its useful behaviors include:

- Searchable command list.
- Change, remove, and reset operations.
- User modifications stored separately from defaults.
- Keybinding rules containing a key, command, and optional `when` condition.
- Context keys.
- “Show Same Keybindings” conflict discovery.
- Keyboard-layout-aware display and scan-code bindings.
- Runtime troubleshooting/logging.

The implementation is internal workbench code rather than a reusable package:

- [Keybindings editor](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/preferences/browser/keybindingsEditor.ts)
- [Recording widgets](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/preferences/browser/keybindingWidgets.ts)
- [Resolver](https://github.com/microsoft/vscode/blob/main/src/vs/platform/keybinding/common/keybindingResolver.ts)
- [Registry](https://github.com/microsoft/vscode/blob/main/src/vs/platform/keybinding/common/keybindingsRegistry.ts)

Monaco does not expose the complete VS Code editor and resolver as a standalone shortcut-settings component. Copying the workbench implementation would import substantially more architecture than the feature requires.

## Recommended design

### Command catalog

Each configurable action should have a stable command descriptor:

```js
{
  id: "textMode.tool.pencil",
  title: "Pencil Tool",
  category: "Text Mode",
  execute: commandHandler,
  isEnabled: enabledPredicate
}
```

Stable IDs, rather than menu IDs or translated labels, are required for persistence and future renames. Suggested naming groups include:

- `project.*`
- `edit.*`
- `view.*`
- `textMode.*`
- `frames.*`
- `music.*`
- `debugger.*`

The descriptor owns command metadata and execution. It should not own mutable user binding state.

### Keybinding rules

A keybinding rule should contain:

```js
{
  command: "textMode.tool.pencil",
  sequence: [/* normalized key press definitions */],
  when: {
    editorMode: "tile",
    focus: "canvas",
    modal: false
  },
  source: "default"
}
```

The exact serialization can be chosen during design, but it should support from the start:

- More than one binding per command.
- Explicitly unbound commands.
- Single presses and future multi-press sequences.
- A portable primary modifier (`Mod`).
- Semantic and physical key identity.
- Platform-specific defaults where necessary.
- Default versus user source.
- Repeat/key-up behavior where genuinely required.

### Semantic versus physical keys

`KeyboardEvent.key` describes the key's interpreted value under the active keyboard layout. `KeyboardEvent.code` describes the physical key position. The distinction is specified by W3C UI Events in [key values](https://www.w3.org/TR/uievents-key/) and [code values](https://www.w3.org/TR/uievents-code/).

Recommended policy:

- Use semantic `key` bindings for most menu and application commands.
- Allow an explicit physical `code` binding for movement, drawing, or layout-independent controls.
- Record both values temporarily so the editor can create either representation.
- Do not depend on `Keyboard.getLayoutMap()`; it can enhance physical-key labels where supported but is not universally available.
- Treat dead keys, composition, AltGraph, and modifier-only input explicitly.

### Context keys

Use a deliberately small structured context model rather than opaque JavaScript callbacks. Initial context keys should include only values required by migrated commands, such as:

- `editorMode`: tile, sprite, music, debugger, assembler, etc.
- `focus`: canvas, textInput, codeEditor, palette, timeline, debuggerPanel, etc.
- `modal`: none or the active modal class.
- `popupOpen`.
- `recorderActive`.
- `textTool` or another coarse active-tool identifier where needed.
- `selectionActive`.
- `screenMode`.

Simple equality, inequality, and boolean conjunction are sufficient initially. A complete VS Code-style expression language is not required for the first release.

Structured contexts have two benefits:

1. The runtime resolver can apply deterministic precedence.
2. The settings editor can determine whether two bindings can be active simultaneously.

If a binding uses an arbitrary predicate, the conflict checker cannot reliably prove whether it overlaps another binding.

### Conflict model

The editor should classify at least:

- **Hard conflict:** same normalized sequence with overlapping contexts.
- **Context-separated reuse:** same sequence in mutually exclusive contexts.
- **Prefix conflict:** one multi-step sequence begins with another complete sequence.
- **Reserved/risky:** likely intercepted by the browser, operating system, or assistive technology.
- **Shadowed:** a more-specific or higher-priority binding always wins.
- **Duplicate command binding:** the same command has equivalent effective bindings.

On capture, show affected commands and contexts immediately. For a hard conflict, offer Replace and Cancel; keeping both should be an explicit advanced action and must reveal which command will be shadowed. Context-separated reuse should remain allowed and visible rather than reported as an error.

Runtime resolution should be deterministic. A reasonable order is:

1. Recorder/modal handling.
2. More specific focus or panel context.
3. Active editor-mode context.
4. Global context.
5. Explicit priority only where the context model cannot express the difference.

User overrides replace or augment defaults before resolution. Array registration order and DOM layout must never decide a tie silently.

### Event normalization and dispatch

The service should receive keyboard events at one integration seam and return a clear result such as handled, pending sequence, ignored, or unmatched. It should centrally decide whether to call `preventDefault` and `stopPropagation`.

Normalization should cover:

- Canonical modifier ordering.
- `Mod` to Command/Control mapping without mutating the saved definition.
- Named special keys such as Delete, Backspace, Escape, arrows, and function keys.
- Shifted punctuation and non-US layouts.
- AltGraph.
- `event.repeat` policy.
- `event.isComposing` and dead keys.
- Keydown versus keyup behavior.
- Sequence timeout/cancellation if multi-step bindings are enabled.

Menus, keyboard dispatch, tooltips, help output, and accessibility labels should all request the effective binding from this service.

### Recorder behavior

When a row enters recording mode:

1. Set an authoritative `recorderActive` context before focusing the recorder.
2. Suspend normal command dispatch.
3. Capture at the appropriate event phase.
4. Ignore modifier-only presses until a non-modifier key arrives.
5. Ignore composition events.
6. Show a live, platform-formatted representation.
7. Normalize and analyze conflicts before committing.
8. Restore focus and normal dispatch on commit or cancel.

Escape should cancel by default. Clearing should have an explicit button so Delete and Backspace remain available as bindable keys; keyboard clearing can also be provided if the interaction makes the trade-off clear. If multi-step sequences are supported, Enter cannot always be reserved as the only commit key.

### Settings UI

Implement a resizable `UI.Dialog` with an `UI.HTMLPanel` template. The main view should have fixed search/filter controls and a scrollable semantic table or list.

Recommended columns and controls:

- Command name and category.
- Effective shortcut or shortcuts.
- Activation context.
- Default/user source.
- Conflict or warning indicator.
- Record/add binding.
- Remove binding.
- Reset command.
- Reset all.
- Modified-only filter.
- Conflicts-only filter.
- “Show commands using this shortcut.”

Use semantic buttons, inputs, table/list roles, visible focus, and screen-reader labels rather than clickable focusable `div` elements. Generate `aria-keyshortcuts` for command controls where meaningful.

Menu accelerator labels and tooltips must subscribe to binding changes or be regenerated when overrides change. The static help page should eventually be generated from the same catalog or replaced by a registry-backed view.

### Persistence

Bindings are global browser-local user preferences initially. Do not store them in project `/settings`.

Store one versioned JSON document behind an injected persistence port, for example conceptually:

```js
{
  version: 1,
  overrides: {
    "edit.undo": [/* user bindings */],
    "textMode.tool.pencil": []
  }
}
```

An empty list can represent an intentionally unbound command; absence means use the code default. Deleting an override resets that command to its default.

Persisting only overrides ensures that new or corrected defaults can ship without rewriting every user's saved document. Loading must validate the schema, ignore or quarantine malformed entries, and support migrations. Storage failure or unavailability should not prevent the application from starting with defaults.

Account synchronization can be added later without changing the command or override model if persistence remains behind a port.

### Architectural placement

The precise filenames should follow the repository's module naming conventions when implementation begins, but responsibilities should be separated as follows:

- **Pure domain:** key press/sequence representation, parser/normalizer, contexts, overlap checking, resolution rules.
- **Application service:** command catalog, effective default/override merge, execution, subscriptions, conflict queries.
- **Infrastructure adapter:** versioned browser-local persistence and optional third-party hotkey-library wrapper.
- **Legacy/UI adapters:** menu integration, settings dialog, labels, current-editor context updates.
- **Composition root:** construct services, inject browser capabilities, and connect them to the legacy `Editor`/`UI` graph.

The low-level library adapter should be replaceable without changing stored command IDs or the UI-facing service API.

## Migration plan

### Phase 1: inventory and characterization

- Produce a command inventory containing current binding, handler, scope/context, display locations, and repeat/key-up needs.
- Separate application commands from text entry, emulator input, joystick input, and transient interaction keys.
- Add characterization tests for important existing shortcuts.
- Add regression cases for the active Control/Command+I conflict and the non-functional Delete accelerator.
- Decide whether first release includes multi-step sequences or only reserves them in the schema.
- Spike TanStack Hotkeys packaging and core API use under the current build rules.

### Phase 2: core service

- Add the pure key/sequence and context model.
- Add command registration and execution.
- Add default/override merge and versioned persistence.
- Add deterministic resolution and conflict indexing.
- Integrate at the single global keyboard seam while retaining fall-through to unmigrated handlers.

### Phase 3: menu commands

- Give existing discrete menu actions stable command IDs.
- Replace the giant menu switch incrementally with command handlers or a thin legacy command map.
- Route both menu clicks and keyboard accelerators through command execution.
- Make menu accelerator labels query effective bindings.
- Remove migrated entries from the old flat shortcut array.

Migrating menus first gives broad visible value and removes the current first-match conflict behavior without immediately rewriting every editor mode.

### Phase 4: settings editor

- Add the global Settings/Keyboard Shortcuts entry.
- Build search, filtering, recording, add/remove/reset, and conflict presentation.
- Apply changes live to dispatch and labels.
- Persist and restore overrides.
- Add accessibility and responsive-layout coverage.

### Phase 5: text-mode and mode-local commands

- Migrate text tools, selection operations, palette navigation, and frame commands in small groups.
- Replace hardcoded toolbar and popup labels with catalog data.
- Move locally encoded activation conditions into structured contexts where practical.
- Keep held/released interaction state separate unless the command engine explicitly supports it.

### Phase 6: other modes and generated help

- Migrate music and debugger application commands.
- Decide which Ace commands should remain internal and which global application commands must operate while Ace has focus.
- Reuse the recorder for joystick mapping only if its semantics are extended without coupling joystick input to command dispatch.
- Generate or replace static keyboard help from the effective registry.

## Test strategy

### Unit tests

- Parsing and canonical normalization.
- Command/Control `Mod` behavior across platforms.
- Special keys, punctuation, AltGraph, dead keys, and composition.
- Semantic `key` versus physical `code` bindings.
- Sequence matching, prefix ambiguity, timeout, and cancellation if supported.
- Repeat and keyup behavior.
- Context evaluation and deterministic precedence.
- Hard conflicts versus mutually exclusive contexts.
- Default and user-override merging.
- Unbind and reset semantics.
- Persistence round-trip, corrupt data, unknown command IDs, and version migration.
- Command enabled/disabled behavior and execution results.

The in-memory persistence-port pattern in [`tests/persistence-services.test.mjs`](../tests/persistence-services.test.mjs#L7) is a suitable precedent.

### Browser tests

- Open and navigate the settings editor entirely by keyboard.
- Record, cancel, clear/unbind, add, replace, and reset bindings.
- Show a hard conflict and a context-separated reuse correctly.
- Apply a changed binding immediately without reload.
- Update menu labels and other generated labels immediately.
- Persist changes across reload.
- Preserve ordinary typing in inputs and editing inside Ace.
- Suppress normal dispatch while recording.
- Respect modal and popup precedence.
- Verify macOS Command and non-macOS Control display/dispatch.
- Verify representative non-US-layout behavior.
- Warn on risky browser/OS-reserved combinations.
- Cover responsive dialog sizing and Trusted Types/CSP requirements.

Existing useful precedents include:

- Keyboard/menu/mobile command parity: [`tests/editor-commands.spec.mjs`](../tests/editor-commands.spec.mjs#L18).
- Local preference live effects: [`tests/tile-palette-fit.spec.mjs`](../tests/tile-palette-fit.spec.mjs#L128).
- Responsive dialogs: [`tests/browser-support.spec.mjs`](../tests/browser-support.spec.mjs#L1012).
- Security and Trusted Types: [`tests/security.spec.mjs`](../tests/security.spec.mjs#L220).

There are currently no shortcut-focused normalization, context, precedence, or conflict tests.

## Important product decisions

These decisions should be made before implementation expands beyond the core service:

1. Whether multi-step sequences ship in the first UI or are only supported by the data model.
2. Whether physical-key bindings are user-selectable initially or only supported internally.
3. Whether hard conflicts may be kept with an explicit precedence warning or must be replaced/resolved.
4. Which browser/OS-reserved combinations are blocked versus merely warned about.
5. Whether users may assign multiple bindings to every command.
6. Whether import/export of user bindings is required before account synchronization exists.
7. Whether the static help page shows defaults or the user's effective bindings.

Recommended defaults are: reserve sequence support in the model, allow multiple bindings, use semantic keys by default, make physical keys an advanced option, warn rather than claim exhaustive blocking of reserved combinations, and show effective user bindings wherever the application presents shortcut help.

The inventory of hidden, conditional, and legacy application surfaces has moved to [`docs/legacy_code.md`](legacy_code.md).

## Final recommendation

Build the command, context, conflict, and persistence model inside the application. Use TanStack Hotkeys only if a short integration spike confirms that its alpha API and the repository's packaging constraints are acceptable; otherwise use tinykeys or a focused internal normalizer behind the same adapter boundary.

The first production migration should cover discrete menu actions, because they already have identifiable actions and visible labels, and because it removes real first-match conflicts. The VS Code-inspired settings editor should be built immediately after that foundation. Text-mode and other specialized handlers can then move incrementally without forcing a risky all-at-once keyboard rewrite.
