# UI interaction bug hunt 1

Date: 2026-09-10

Scope: frame playback/controls, modal lifecycle, screen-mode settings, and state-dependent editor commands. This intentionally excludes broad styling and static accessibility issues already covered by `docs/ui_review.md`.

Method: focused source review plus runtime checks in a local development build with a new 2D project. Runtime probes were used to verify internal state where the visible symptom was ambiguous.

Priority definitions:

- **P0** — a normal interaction can repeatedly throw or wedge the active UI loop.
- **P1** — a primary interaction enters a wrong, contradictory, or sticky state.
- **P2** — an enabled control is a no-op, produces an avoidable error path, or is a near-term state-management hazard.

## P0

### 1. “Once” playback throws at the terminal frame and remains in playing state

**Location:** `src/js/textMode/frames/frames.js:1310-1314`

When Once playback advances past the last frame, it calls `this.editor.animationTools.stop()`. No `animationTools` property is created anywhere in the source tree; the active controller is `this.editor.frames`, which already has a `stop()` method.

Runtime check at the last of three frames produced:

```text
TypeError: Cannot read properties of undefined (reading 'stop')
playing=true, frame=2
```

Because the exception occurs before `gotoFrame()` and `lastFrameTime` are updated, the animation update path can throw again on every scheduled UI frame. The button can continue to advertise Pause while the animation is stuck.

**Fix:** call `this.stop()` and keep the final frame selected. Return immediately after stopping so the terminal state cannot wrap to frame 1. Add a three-frame Once playback regression test that asserts: no exception, `playFrames === false`, button says Play, and current frame remains the last frame.

## P1

### 2. Showing the same dialog twice leaves a hidden modal entry after one close

**Locations:** `src/js/ui/ui.js:421-453`, `src/js/ui/dialog.js:635-680`

`UI.showDialog()` pushes onto `UI.dialogStack` before `Dialog.show()` checks `isOpen`. A repeated show therefore creates two central stack entries while the dialog opens only once. Closing once hides the dialog but leaves one stale stack entry, disables menu-key processing, and routes keydown events to a hidden dialog.

Runtime reproduction with the New Project dialog:

```text
after show twice: stack=2, open=true,  canProcessMenuKeys=false
after close once: stack=1, open=false, canProcessMenuKeys=false
```

This can be reached by duplicate event dispatch, asynchronous callbacks, or future callers even if ordinary double-clicks are often swallowed by the overlay.

**Fix:** make `UI.showDialog()` idempotent by checking `isOpen`/stack membership before pushing. Make close remove the requested dialog rather than blindly removing the last entry, and make `Dialog.close()` a no-op when already closed.

### 3. Ping Pong playback runs forward once, jumps to frame 1, then freezes there

**Location:** `src/js/textMode/frames/frames.js:1297-1309`

`toFrame` is an exclusive frame count. On the forward boundary, the code changes direction to `-1` but also resets the frame to `fromFrame`. On the next tick it computes `fromFrame - 1`, clamps back to `fromFrame`, and never flips direction because the direction check happens before the clamp.

For a three-frame document the effective sequence is `1 → 2 → 3 → 1 → 1…`. Runtime testing confirmed the UI still showed Pause while the current frame remained 1 and `playDirection` remained `-1`.

**Fix:** bounce from the last valid frame (`toFrame - 1`) and reverse only at inclusive endpoints. Cover one-, two-, and three-frame documents plus sprite frame ranges.

### 4. Cancelled Screen Mode checkbox edits reappear and can be applied later

**Location:** `src/js/textMode/textModeEditor.js:1953-2004`

The first dialog load hydrates mode, Tile Flip, and Tile Rotate. Every later open refreshes only the mode select. Cancel merely closes the dialog, so edited checkbox DOM state survives and is presented on the next open even though the model was never changed.

Runtime check: the model retained `hasTileFlip=true`; after unchecking, closing, and reopening, the checkbox was still `false`. Pressing OK at that point would apply a value the user had previously cancelled. The same stale state can cross layer/project changes.

**Fix:** hydrate all three controls immediately before every show, or keep edits in a disposable draft model. Add an edit → Cancel → reopen test for both checkboxes.

### 5. An empty frame duration stores `NaN` and can permanently stall playback

**Locations:** `src/js/textMode/frames/frames.js:210-219`, `src/js/textMode/graphic.js:745-756`

The `change` handler always forwards `parseInt(value)`, including `NaN`. The model setter stores any value without a finite/range check. A runtime change event with an empty field stored `NaN` in the active frame.

Playback later evaluates `elapsed > duration * FRAMERATE`; with `NaN`, that condition is always false, so Play can remain active without ever advancing. Programmatic callers can also store zero, negative, or out-of-range values despite the HTML `min`/`max` attributes.

**Fix:** enforce an integer range of 1–255 at the model boundary, reject or clamp invalid UI input, and restore the displayed value after rejection. Test blank, zero, negative, decimal, 256, and non-numeric input.

## P2

### 6. The Play button’s accessible name remains “Play” while it visibly says “Pause”

**Locations:** `src/js/ui/htmlPanel.js:72-95`, `src/js/textMode/frames/frames.js:1207-1221`, `src/html/textMode/frames.html:8`

The HTML panel assigns `aria-label="Play"` once during load. Playback later replaces only `innerHTML`. Runtime accessibility inspection during playback exposed a button named Play with visible child text Pause, so voice control and screen readers announce the opposite action.

**Fix:** update visible text, `aria-label`, and `aria-pressed` from one state-sync function. Prefer a native `<button>` over the current clickable `<div>`.

### 7. Single-frame and boundary frame controls remain enabled but cannot succeed

**Locations:** `src/html/textMode/frames.html:8-49`, `src/js/textMode/frames/frames.js:303-325`, `src/js/textMode/frames/frames.js:1068-1125`

In a new one-frame project, Play, Previous, Next, and Delete all retain the active `ui-button` class. Previous and Next silently restore the same frame, Delete raises `alert('Unable to delete frame')`, and Play has no meaningful animation to perform. At multi-frame boundaries, Previous/Next remain enabled and silently no-op in the same way.

**Fix:** centralize frame-control state updates: disable Previous at the first frame, Next at the last frame, Delete at one frame, and Play below two frames. Re-run this sync after insert, duplicate, delete, navigation, project load, and mode changes.

### 8. Delete Layer asks for confirmation even when the only possible outcome is an alert

**Locations:** `src/js/textMode/layers/layers.js:573-576`, `src/js/textMode/layers/layers.js:1640-1643`, `src/js/editor/editorMenuCommands.js:454-458`

The desktop Layers panel and menu leave Delete enabled for a one-layer document. They first ask for destructive confirmation, then `deleteLayer()` rejects the operation with “Cannot delete last layer.” The default new-project UI exposes this contradictory path immediately.

**Fix:** disable the panel button and menu command while `getLayerCount() <= 1`. Keep the model guard, but do not route an impossible action through confirm plus alert.

### 9. Crop To Selection is enabled with no selection and silently does nothing

**Locations:** `src/js/editor/editorInterface.js:300-302`, `src/js/editor/editorMenuCommands.js:25-27`, `src/js/textMode/tools/select.js:316-319`

The Screen menu always presents Crop To Selection as active. With the default empty selection, the command reaches `cropToSelection()` and immediately returns with no feedback.

**Fix:** bind command enablement to a non-empty active selection and refresh it when selection state, mode, or project changes. Retain the model guard for safety.

## Recommended fix order

1. Repair Once and Ping Pong playback together and add a playback-mode test matrix.
2. Make dialog show/close bookkeeping idempotent.
3. Validate frame duration at the model boundary.
4. Rehydrate Screen Mode controls on every open.
5. Add shared state-sync methods for frame, layer, and selection-dependent controls.
