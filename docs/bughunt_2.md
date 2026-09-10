# UI interaction bug hunt 2

Date: 2026-09-10

Scope: project-tree actions, New Project asset state, mobile project dialogs, export completion, clipboard actions, and history commands. This pass intentionally avoids the frame, layer, screen-mode, and core modal issues covered by `docs/bughunt_1.md`.

Method: focused source tracing through each control's visible state, submitted state, asynchronous completion, and resulting document/tab state. No broad codebase audit was performed.

Priority definitions:

- **P0** — a normal interaction can repeatedly throw or wedge the active UI loop.
- **P1** — a primary interaction can leave document, tab, or modal state contradictory, or can create malformed data.
- **P2** — an enabled control can silently no-op, fail without feedback, or accumulate avoidable state.

No new P0 issue was found in this pass.

## P1

### 1. Deleting an open document removes it from the tree but leaves its tab and editor alive — Completed

**Locations:** `src/js/file/projectNavigator.js:1387-1429`, `src/js/file/projectNavigator.js:1537-1552`, `src/js/ui/tabPanel.js:285-292`, `src/js/ui/tabPanel.js:360-364`

Document tabs are keyed by `record.id`, but `deleteRecord()` tries to close the tab with the document path. `TabPanel.closeTab()` requires an exact key and silently returns when the path is not found.

Reproduction: open a document, make its tab permanent, then delete it from Project Explorer. The tree hides the deleted record, while the tab and editor remain usable against the record that has been marked `deleted=true`.

**Fix:** capture the record before deletion and close `record.id`. If the deleted record is current, select a valid neighboring tab/document or an explicit empty state. Add an open → delete regression test that asserts both tree row and tab disappear.

### 2. Rename updates only the tree; tab, current path, and persistence bookkeeping keep the old identity — Completed

**Locations:** `src/js/file/projectNavigator.js:1423-1429`, `src/js/file/projectNavigator.js:1447-1451`, `src/js/file/projectNavigator.js:1557-1664`, `src/js/file/document.js:404-425`

`renameDocRecord()` assigns `record.name` and refreshes the tree, but does not update the open tab's `title`/`path`, `projectNavigator.currentPath`, or the document's modified-path bookkeeping. The dialog also accepts an empty name or a duplicate sibling name and closes unconditionally.

Result: the tree can show the new name while the tab and saved `currentPath` still show/reference the old path. A clean record is not marked modified by the rename, and duplicate names make path lookup resolve whichever sibling appears first.

**Fix:** make rename a document-level operation that validates a trimmed, non-empty, unique sibling name and atomically updates the record, modified path, current path, and tab data. Keep the dialog open with an inline error on rejection. Test renaming the current open document and reopening the saved project.

### 3. New Project can display one tile set while submitting a previously selected custom tile set — Completed

**Locations:** `src/js/file/newProjectDialog.js:46-65`, `src/js/file/newProjectDialog.js:77-109`, `src/js/file/newProjectDialog.js:122-137`, `src/js/file/newProjectDialog.js:283-313`

Choosing a custom tile set stores `tileSetCreated` and `tileSet`. Switching mode then changes the radio, label, ID, and name but never clears that custom object. On OK, the stale `args.tileSet` wins and also overrides `screenMode`, even though the dialog visibly advertises the mode's built-in tile set.

The chooser callbacks have a second state split: they assign `this.tileSetName` and `this.colorPaletteName` from ordinary callback functions instead of assigning `_this`. The visible labels update, but the `NewProjectDialog` names remain at their defaults and those stale names are submitted.

**Fix:** update the entire asset selection as one state object. Selecting a built-in mode must clear custom tile-set fields; chooser callbacks must update the dialog instance. Add custom tile set → switch mode → create and named preset → create tests that compare the visible selection with the created asset and metadata.

### 4. Background completion handlers blindly pop dialogs that may no longer belong to the operation

**Locations:** `src/js/textMode/export/exportImage.js:105-120`, `src/js/textMode/export/exportImage.js:1600-1602`, `src/js/textMode/export/exportImage.js:1749-1753`, `src/js/textMode/export/exportGif.js:77-89`, `src/js/textMode/export/exportGif.js:743-748`, `src/js/textMode/export/exportGif.js:1027-1031`, `src/js/textMode/export3d/export3dGif.js:76-89`, `src/js/textMode/export3d/export3dGif.js:1048-1051`, `src/js/file/projectNavigatorMobile.js:248-280`, `src/js/file/projectNavigatorMobile.js:403-503`

GIF/video completion closes the top two dialogs with unqualified `UI.closeDialog()` calls. The progress dialogs have normal close controls, so a user can dismiss one, open another dialog, and later have export completion close unrelated UI.

Mobile New has the same race in a different form: OK closes immediately, while screen/sprite/3D completion later calls another unqualified close. Whichever dialog is on top when creation finishes is removed.

**Fix:** close explicit dialog instances/IDs only when they are still open. Decide separately whether the parent should close. Make non-cancellable progress dialogs non-dismissible, or wire dismissal to real cancellation. Test dismiss/open-another-dialog while an async operation is pending.

### 5. Mobile New Document accepts blank names and non-finite or non-positive dimensions

**Locations:** `src/html/project/newDocRecordMobile.html:13-28`, `src/js/file/projectNavigatorMobile.js:248-261`, `src/js/file/projectNavigatorMobile.js:304-360`, `src/js/file/projectNavigatorMobile.js:370-450`

The size controls are `type="text"`; their `min="1"` attributes therefore provide no browser validation. OK forwards raw strings and closes the dialog. Screen and 3D width parse failures are not repaired, while zero and negative values pass for every dimension. A blank screen name also survives `getUniqueFilename()` and creates an empty tree label.

Downstream `createDoc()` accepts these values without a boundary check, so `NaN`, zero, or negative grid dimensions can enter document creation.

**Fix:** validate a trimmed non-empty name and bounded positive integers before starting creation. Use numeric inputs as an additional UI guard, but enforce the invariant in the creation API too. Keep the dialog open and identify the invalid field. Cover blank, text, zero, negative, and excessive dimensions.

## P2

### 6. Image “Copy To Clipboard” can fail as a silent no-op

**Locations:** `src/js/textMode/export/exportImage.js:355-359`, `src/js/textMode/export/exportImage.js:1477-1536`, `src/js/textMode/export/exportPng.js:179-183`, `src/js/textMode/export/exportPng.js:555-559`, `src/js/textMode/export/exportPngMobile.js:188-196`, `src/js/textMode/export/exportPngMobile.js:759-763`, `src/js/textMode/export/exportSpritePng.js:154-158`, `src/js/textMode/export/exportSpritePng.js:530-534`

The buttons are shown when `ClipboardItem` exists, but the code does not consistently require `navigator.clipboard.write`. Clipboard writes are not awaited or caught, and the one surrounding `try/catch` cannot catch an asynchronous rejection. Permission denial, an unsupported image type, or a null blob therefore leaves an enabled button that appears to do nothing.

**Fix:** expose one async clipboard helper that checks the complete capability, validates the blob, awaits `write()`, and reports success or a concise actionable error. Disable the button while the write is pending.

### 7. Mobile Project Explorer can highlight the current document without making Open functional

**Locations:** `src/js/file/projectNavigatorMobile.js:52-57`, `src/js/file/projectNavigatorMobile.js:560-579`, `src/js/file/projectNavigatorMobile.js:671-699`, `src/js/file/projectNavigatorMobile.js:783-793`

When no prior selection exists, `updateProjectList()` copies only the current document ID. That is enough to render the selected highlight, but it never initializes `selectedPath`. Pressing Open constructs `'/undefined'`, fails lookup, and then the button handler closes Project Explorer anyway.

**Fix:** restore selection through `selectDoc(id, path)` or store ID and path together. Have `openSelected()` return success and close the dialog only on success. Test opening the explorer and immediately pressing Open without first tapping a row.

### 8. Undo and Redo remain enabled at history boundaries and silently do nothing

**Locations:** `src/js/editor/editorInterface.js:171-179`, `src/js/modules/feature-adapters/legacyCommandCatalogAdapter.mjs:129-138`, `src/js/textMode/history.js:32-45`, `src/js/textMode/history.js:247-256`, `src/js/textMode/history.js:539-555`

Menu enablement reflects only the menu item's static `enabled`/`visible` flags. History mutations do not publish command-state changes, so Undo is active at position 0 and Redo is active at the history tail; both return without feedback.

**Fix:** add `canUndo()`/`canRedo()` predicates based on `historyPosition` and `historyLength`, bind command enablement to them, and invalidate command context after entry commit, undo, redo, clear, and project switch.

## Recommended fix order

1. Repair delete/rename as atomic document-and-tab operations.
2. Make asynchronous completion close only dialogs owned by that operation.
3. Make New Project asset selection a single coherent state object.
4. Validate document names and dimensions at the model boundary.
5. Add explicit success/failure state to clipboard actions.
6. Bind Open, Undo, and Redo enablement to actual state.
