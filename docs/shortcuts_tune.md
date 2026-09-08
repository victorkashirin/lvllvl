# Shortcut integration tune-up

## Goal

Make the new shortcut system identify commands directly, while keeping the
remaining legacy application bridge explicit and small. This is an integration
cleanup, not a rewrite of `Editor.menuClick` or `CommandService`.

Expected effort: two to three focused days, including targeted tests and build
verification.

## Direction 1: put command identity on menu items

1. Extend `UI.MenuItem` to accept an optional `commandId` during construction.
   Keep `uiID` as the DOM identifier and temporary legacy action identifier.
2. Add the canonical command ID to every command-owned menu declaration. Give
   equivalent entries the same ID; for example, `edit-showgrid` and
   `view-3dgrid` both use `view.grid`.
3. Change menu catalog collection to consume `menuItem.commandId` directly.
   Stop inferring persisted identity from `uiID`, menu order, labels, or menu
   classes. Menu classes may still supply activation context.
4. Remove the `Editor.menuClick -> alias lookup -> CommandService -> menuClick`
   redirect once command-owned menu items dispatch through `MenuItem.click`.
5. Fail startup validation when an explicit `commandId` has no definition.
   Leave menu items without a `commandId` on their existing non-configurable
   path.

Do not add compatibility aliases for old shortcut IDs. Command IDs are still
pre-production; change the persistence schema version if an ID must change.

## Direction 2: clarify module ownership

- Rename `legacyMenuCommandDefinitions.mjs` to
  `editorCommandDefinitions.mjs`. It should own stable IDs, titles, categories,
  and default bindings. Retain a clearly named `legacyAction` only while a
  command still delegates to `Editor.menuClick`; remove alias lookup data after
  Direction 1.
- Keep shortcut context resolution separate and rename
  `legacyShortcutContextAdapter.mjs` to `shortcutContextProvider.mjs`. It is the
  boundary that translates DOM focus and current editor state into a validated
  shortcut context; it should not register or execute commands.
- Reduce `legacyCommandCatalogAdapter.mjs` to the remaining integration work:
  registering definitions, deriving menu activation/enabled state, temporarily
  invoking `legacyAction`, and updating legacy labels. Rename it only after its
  responsibilities are settled.
- If the catalog remains large, extract only cohesive blocks: native editor
  command registration and shortcut-label projection. Do not create one module
  per command category.

The intended dependency direction is:

```text
UI/editor state -> shortcut context provider -> CommandService
menu command IDs -> command catalog           -> CommandService
CommandService  -> temporary legacy action    -> Editor.menuClick
```

## Deferred work

Do not migrate all command-owned `Editor.menuClick` cases in this pass. Move
those handlers feature by feature later, when the owning feature is already
being changed. Once no command delegates through `legacyAction`, remove that
field and rename or delete the final legacy catalog bridge.

## Validation gates

- Every explicit menu `commandId` resolves to exactly one immutable command
  definition.
- Duplicate menu surfaces share one command ID, binding, handler, and
  preference entry.
- A menu click executes once; it must not re-enter command dispatch.
- Existing mode, focus, modal, typing, popup, and enabled-state behavior is
  unchanged.
- Cover representative 2D/3D aliases, screen/sprite aliases, palette tools, and
  a non-configurable menu item with targeted unit tests.
- Run the focused shortcut browser workflows, module-boundary checks,
  production build, and artifact verification.

## Completion criteria

The tune-up is complete when runtime command identity no longer depends on
legacy menu-ID lookup, the context provider has a single input-boundary role,
and the only remaining `legacy` behavior is the explicit temporary call into
`Editor.menuClick`.
