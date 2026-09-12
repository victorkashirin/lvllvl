# Main editor test scenarios

Date: 2026-09-12

## Goal

Add a small set of browser tests that protect the main 2D editor workflows as
users experience them. This pass is about coherent editing scenarios, not broad
line coverage or exhaustive testing of every format, device, or rendering mode.

The new tests should complement the existing focused tests for rendering,
fractional device-pixel ratios, keyboard shortcuts, persistence failures,
security, and individual PNG/GIF/SVG encoders.

## Scope

In scope:

- creating a default 2D project;
- drawing and undoing/redoing artwork;
- selecting, copying, pasting, moving, and clearing cells;
- adding, selecting, reordering, hiding, and deleting layers;
- duplicating, editing, navigating, and deleting frames;
- editing a glyph and a palette colour as part of a real project;
- saving and reopening a real editor document; and
- completing one image import and exporting the resulting artwork.

Out of scope for this pass:

- exhaustive import/export format matrices;
- 3D, music, assembler, debugger, and scripting workflows;
- browser-compatibility duplication outside Chromium desktop;
- performance, device-pixel-ratio, responsive-layout, security, and build-policy
  tests already covered elsewhere; and
- coverage-percentage targets for the legacy script graph.

## Completion tracker

- [x] Audit existing coverage and identify the main scenario gaps.
- [x] Scenario 1: create a project, draw artwork, and use undo/redo.
- [x] Scenario 2: copy, paste, move, and clear a selection.
- [x] Scenario 3: manage layers without losing or misrouting artwork.
- [ ] Scenario 4: duplicate, edit, navigate, and delete frames.
- [ ] Scenario 5: save and reopen a representative real project.
- [ ] Scenario 6: import a small image and export the resulting artwork.
- [ ] Run each scenario independently while implementing it.
- [ ] Run the complete new scenario spec in Chromium desktop.
- [ ] Run the existing source tests once after the scenario suite is complete.
- [ ] Record any product defect exposed by a scenario before weakening an
  assertion or adding a workaround.

## Test organization

Create `tests/editor-main-scenarios.spec.mjs` for the new browser scenarios.
Keep common setup local to that file unless another test file immediately needs
the same helper. Add a tiny deterministic image under `tests/fixtures/` only if
Playwright file input cannot cleanly use an in-memory file payload.

Run these scenarios only in the `chromium-desktop` project. Existing tests
already cover startup and selected compatibility contracts in other browsers and
device profiles; multiplying the stateful editor scenarios across those profiles
would add cost without addressing the gaps found in this audit.

Each test should:

1. start from a fresh default 2D project;
2. initiate the behavior through the visible UI, keyboard, or pointer where that
   interaction is part of the scenario;
3. use `page.evaluate()` only for deterministic fixture setup or precise state
   inspection, not to replace the production method being tested;
4. assert the resulting document data, not only that a dialog opened or a command
   was dispatched;
5. assert one visible or rendered outcome when practical; and
6. use condition-based Playwright waits rather than fixed sleeps.

## Scenario 1: create, draw, undo, and redo

### Purpose

Prove that the default project can receive a normal canvas edit and that the same
edit is tracked by the real document history.

### Implementation

- Start a default 2D project through the start page.
- Select a nonblank tile and foreground colour through the editor controls.
- Draw a short horizontal stroke on the main canvas with the pointer.
- Assert that each crossed grid cell contains the selected tile and colour.
- Assert that the document revision advanced and exactly one completed history
  entry represents the stroke.
- Undo with the keyboard and assert that every affected cell is restored.
- Redo through the Edit menu and assert that the stroke returns.
- Confirm that the canvas no longer reports an active pointer drag after release.

### Completion

- [x] Pointer coordinates are derived from the live canvas and grid geometry.
- [x] Cell data is asserted before editing, after editing, after undo, and after
  redo.
- [x] Revision and history behavior is asserted without replacing history
  methods.
- [x] Test passes independently with `--grep "create, draw, undo, and redo"`.

## Scenario 2: edit a selection

### Purpose

Protect the selection operations that currently have command-routing coverage
but little validation of their effect on artwork.

### Implementation

- Seed a small asymmetric cell pattern containing distinct tile, foreground,
  background, rotation, and flip values.
- Create a marquee selection around the pattern with the pointer.
- Copy and paste it at a new location using the normal shortcuts.
- Assert that the complete cell payload was preserved, not only the tile index.
- Move the pasted selection by one cell using the normal selection shortcut and
  assert that the source/destination behavior matches the requested move mode.
- Clear the active selection and assert that only selected cells become blank.
- Undo the clear and move, then redo them, asserting both selection bounds and
  cell contents at each boundary.

The scenario does not need to cover every transform in this pass. Horizontal and
vertical flips, rotation, colour replacement, inversion, and selection-to-pen can
be added later when those features change or expose defects.

### Completion

- [x] Marquee creation uses a real pointer drag.
- [x] Copy, paste, move, and clear use production commands or shortcuts.
- [x] Assertions include tile, foreground, background, rotation, and flip data.
- [x] Undo and redo restore both artwork and selection state.
- [x] Test passes independently with `--grep "edit a selection"`.

The scenario exposed and now covers a history-coalescing defect where undoing an
overlapping selection move restored the tiles but lost their original rotation
and flip values.

## Scenario 3: manage layers

### Purpose

Verify the normal layer lifecycle and ensure edits remain associated with the
correct layer while its order and visibility change.

### Implementation

- Draw a recognizable cell on the initial layer.
- Add a second grid layer through the Layers panel and give it a distinct name.
- Select the second layer and draw different content at the same coordinate.
- Toggle the second layer off and on and assert both its model visibility and the
  visible composite result.
- Reorder the layers and assert their IDs, labels, selected layer, and composite
  order.
- Delete the second layer through the UI and assert that the first layer and its
  artwork remain intact.
- Verify that the final-layer delete action remains disabled.

Layer merging, opacity/blend modes, reference-image layers, and layers-to-frames
conversion are not required in this main-scenario pass.

### Completion

- [x] Add, select, visibility, reorder, and delete actions use visible controls.
- [x] Assertions use stable layer IDs as well as labels and positions.
- [x] Overlapping artwork proves which layer is visible and on top.
- [x] Deleting one layer cannot remove or select the wrong surviving layer.
- [x] Test passes independently with `--grep "manage layers"`.

## Scenario 4: edit an animation across frames

### Purpose

Prove that frame duplication and navigation isolate frame content and preserve
the expected playback model.

### Implementation

- Draw a marker cell in frame 1.
- Duplicate the frame through the timeline controls.
- Change the marker in frame 2 and set a distinct valid frame duration.
- Navigate backward and forward with the visible frame controls, asserting the
  marker and duration for each frame.
- Start and stop playback and assert the active frame remains within the document
  range and the play control returns to its stopped state.
- Delete frame 2 and assert that frame 1 remains intact and single-frame controls
  become disabled.

Onion-skin raster correctness and cache invalidation remain covered by the
existing focused tests and should not be duplicated here.

### Completion

- [ ] Duplicate, navigate, play/stop, and delete use production controls.
- [ ] Frame content and duration are asserted independently.
- [ ] Deleting a frame preserves the surviving frame's artwork.
- [ ] Single-frame control state is asserted at the end.
- [ ] Test passes independently with `--grep "animation across frames"`.

## Scenario 5: save and reopen a real project

### Purpose

Exercise the actual editor serialization boundary. Existing persistence tests
strongly cover transactional storage behavior, but their synthetic document data
cannot prove that editor content survives a real save/reload cycle.

### Representative project state

Build one compact project containing:

- two frames with different cell contents and durations;
- two named layers with different order and visibility;
- one modified glyph pixel;
- one changed palette colour; and
- a non-default selected frame and layer before saving.

### Implementation

- Create the representative state through the editor.
- Save it to browser storage using the normal Save/Save As UI.
- Capture stable identifiers and expected serialized values before reload.
- Reload the application and reopen the project from the start page.
- Assert frame count/durations, layer count/order/visibility, cell payloads, glyph
  pixels, and palette colour.
- Assert that the reopened document is not dirty until a new edit is made.
- Make one edit after reopening and verify that Save updates the existing project
  rather than creating a duplicate.

### Completion

- [ ] The production `Document.getFiles()` and open-project paths are used.
- [ ] No persistence method or serialized file list is replaced by the test.
- [ ] Every representative project value is checked after a page reload.
- [ ] Dirty-state and subsequent-save behavior are checked.
- [ ] Test passes independently with `--grep "save and reopen"`.

## Scenario 6: import and export artwork

### Purpose

Cover one successful image-import path and connect it to the already well-tested
primary export path.

### Implementation

- Use a tiny image with a deterministic pattern and no interpolation ambiguity.
- Open Image / Video Import through the Import menu.
- Select the image through the real file input and wait for decoded-media state.
- Accept deterministic import settings, run Import, and wait for the dialog to
  close.
- Assert the resulting grid dimensions and representative tile/colour cells.
- Export the imported result as PNG through the visible dialog.
- Inspect the downloaded PNG signature, dimensions, and representative pixels.

Do not add successful tests for every legacy format in this pass. PNG, GIF, and
SVG already have focused encoder and browser tests; this scenario exists to prove
that a user can complete the import-to-export workflow with real editor data.

### Completion

- [ ] The import uses a real file payload and production decode path.
- [ ] The Import button becomes enabled from actual media readiness.
- [ ] Resulting document data is asserted after import.
- [ ] Export uses the visible UI and produces a valid PNG with expected pixels.
- [ ] Test passes independently with `--grep "import and export artwork"`.

## Implementation order

1. Add shared fresh-project, canvas-coordinate, and document-snapshot helpers.
2. Implement Scenario 1 to validate the helpers against the simplest mutation.
3. Implement Scenarios 2-4, keeping each scenario independent.
4. Implement Scenario 5 after the editor-state snapshots are stable.
5. Implement Scenario 6 last because media decoding introduces the most browser
   coordination.
6. Remove any helper used by only one scenario unless it materially improves that
   scenario's readability.

## Verification commands

During implementation, run only the scenario being changed:

```sh
npx playwright test tests/editor-main-scenarios.spec.mjs \
  --project=chromium-desktop --grep "<scenario title>"
```

After all scenarios are implemented:

```sh
npx playwright test tests/editor-main-scenarios.spec.mjs \
  --project=chromium-desktop
npm run test:source
```

Run the broader Playwright suite only when shared editor setup or production code
was changed while implementing the scenarios. Documentation and test-only changes
do not require a changelog entry.

## Definition of done

This pass is complete when all six scenarios pass independently and together in
Chromium desktop, the existing source suite remains green, and none of the new
tests substitutes stubs or method spies for the main production behavior it
claims to cover.
