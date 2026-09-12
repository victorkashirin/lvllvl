# UI interaction bug hunt 3

Date: 2026-09-11

Scope: palette/tile export dialogs, document and MetaTile dimension dialogs, template-link generation, background-image setup, and C64 sprite-data export. This pass intentionally avoids the project lifecycle, frame controls, core modal stack, clipboard-image export, history, and other paths covered by `docs/bughunt_1.md` and `docs/bughunt_2.md`.

Method: focused source tracing from visible controls through submitted values and downstream mutations. The deliberate UI-freeze path below was not executed. No broad codebase audit or full test suite was run.

Priority definitions:

- **P0** — a normal interaction can wedge the active UI loop.
- **P1** — a primary interaction can produce wrong output, throw, or leave persistent model/UI state contradictory.
- **P2** — an enabled interaction can silently preserve stale output or otherwise misrepresent what will happen.

## P0

### 1. Palette PNG export can enter an infinite loop when Colors Across is zero

**Locations:** `src/html/textMode/colorPaletteSave.html:34-36`, `src/js/textMode/color/colorPaletteSave.js:108-123`, `src/js/textMode/color/colorPaletteSave.js:138-152`, `src/js/textMode/color/colorPalette.js:355-369`

The control has `min="1"`, but its `keyup` handler accepts every parsed number without checking the range. After selecting a calculated sort such as Hue, entering `0` calls `getColorMap(..., 0)`. That computes `colorsDown` as `Math.ceil(colorCount / 0)`, which is `Infinity`, and starts `for (y = 0; y < Infinity; y++)` on the UI thread.

Reproduction: open Save Color Palette, select Hue (or another calculated sort order), focus Colors Across, and enter `0`. Browser constraint validity does not suppress the JavaScript key handler, so the app can freeze before the user even presses OK.

**Fix:** enforce a finite integer range before calling `setColorsAcross()`, and enforce the same invariant in `ColorPalette.getColorMap()`. Reject or clamp invalid transient input without rebuilding the map. Add a focused input test for blank, zero, negative, over-maximum, and valid values.

## P1

### 2. Custom Tiles Across can truncate a tile-set PNG or add the wrong number of rows

**Locations:** `src/html/textMode/tileSetSave.html:18-20`, `src/js/textMode/tileSet/tileSetSave.js:49-53`, `src/js/textMode/tileSet/tileSetSave.js:84-96`, `src/js/textMode/tileSet/tileSet.js:1439-1465`

`TileSet.exportPng()` calculates `tilesDown` using the hard-coded default of 16 columns, then applies the user's `tilesAcross` value without recalculating the row count. The canvas height and render loop therefore continue to use the 16-column layout.

For a 256-tile set, choosing 8 across exports only 16 rows, so tiles 128–255 never reach the image. Choosing 32 across produces 16 rows instead of 8, leaving a large blank tail. The dialog closes normally and provides no indication that the downloaded PNG disagrees with the requested layout.

**Fix:** validate `tilesAcross` as a positive bounded integer, assign it first, then calculate `tilesDown = Math.ceil(tileCount / tilesAcross)`. Test at least 8, 16, 32, and a non-divisor.

### 3. Dimensions accepts blank, zero, and negative sizes and commits them to an existing document

**Locations:** `src/html/textMode/dimensionsDialog.html:4-51`, `src/js/textMode/tools/gridDimensionsDialog.js:94-137`, `src/js/textMode/tools/gridDimensionsDialog.js:192-229`, `src/js/textMode/graphic.js:827-866`, `src/js/textMode/tileSet/tileSet.js:445-482`

Every field is parsed and submitted without checking finiteness or range. Native `min` constraints do not protect the custom UI button because no form validation is invoked. Blank values become `NaN`; zero and negative values remain valid JavaScript numbers. The preview already divides by these values, and OK forwards them to every grid layer and writes the resulting pixel dimensions into the document.

Sprite documents are more destructive: invalid tile width/height is sent to `setTileDimensions()`, which rebuilds every tile's pixel array at that size. The change guard compares nonexistent `args.tileWidth`/`args.tileHeight` properties, so this mutation runs even when the visible tile dimensions are unchanged.

**Fix:** validate positive bounded integers for grid and tile dimensions before preview or commit; validate finite bounded offsets separately. Keep the dialog open with field-level errors. Correct the sprite comparison to use `args.width` and `args.height`, and repeat validation at the model boundary.

### 4. MetaTile Size can store `NaN`/zero dimensions and create an empty block

**Locations:** `src/html/textMode/blockSizeDialog.html:1-10`, `src/js/textMode/blockSet/blockSetManager.js:89-105`, `src/js/textMode/blockSet/blockSetManager.js:131-159`, `src/js/textMode/layers/layerGrid.js:1406-1467`

The width and height controls are `type="text"`, making their `min="1"` attributes ineffective. OK passes raw strings to the callback and closes unconditionally. Empty or non-numeric input can create a block with empty data and is then stored as `NaN`; zero is stored as zero. Later block coordinate calculations use modulo by these values and return `NaN`.

This is reachable both while enabling MetaTile mode and through its size command, so a typo in a small settings dialog can leave the active layer in a malformed persistent state.

**Fix:** require finite positive bounded integers before invoking the callback, keep the dialog open on rejection, and guard `LayerGrid.setBlockDimensions()` as the model invariant. Do not create or resize a block until validation succeeds.

### 5. Grid edits in Create Template Link do not update the link that Copy Link uses

**Locations:** `src/html/project/createTemplateLink.html:51-59`, `src/html/project/createTemplateLink.html:79-85`, `src/js/file/createTemplateLink.js:74-107`, `src/js/file/createTemplateLink.js:210-244`

The generated URL includes width and height, but neither grid input has a `change`, `input`, or `keyup` handler. Editing `40 × 25` to another size leaves the readonly URL unchanged. Copy Link then copies the old dimensions while the dialog visibly shows the new ones. Touching a different option later regenerates the URL, making the behavior appear intermittent.

The fields are also `type="text"`, so if another option does trigger regeneration after invalid input, the link can contain `width=NaN` or `height=NaN`.

**Fix:** regenerate from validated state on both dimension inputs, and disable Copy Link while either value is invalid. Test edit dimension → copy without touching another control.

### 6. Background Image has no safe empty or cancelled state

**Locations:** `src/js/textMode/backgroundImage.js:55-92`, `src/js/textMode/backgroundImage.js:96-119`, `src/js/textMode/backgroundImage.js:197-220`, `src/js/textMode/backgroundImage.js:206-210`, `src/js/textMode/grid.js:770-783`

On a fresh dialog, OK is enabled before an image is selected. Pressing it forwards `null` plus zero dimensions to `CanvasRenderingContext2D.drawImage()`, which throws instead of applying or cleanly rejecting the operation.

The opposite path leaks cancelled draft state: selecting an image mutates the long-lived `BackgroundImage` instance, while Cancel only closes the dialog. Reopening in the same project reuses and previews that cancelled image; pressing OK can therefore apply a file from a previous cancelled attempt.

**Fix:** keep draft image/transform state local to each dialog session, initialize it from the actual applied background on every open, discard it on Cancel, and disable OK until a loaded image and finite transform are available. Guard `Grid.setBackgroundImage()` against invalid input.

### 7. Returning to PNG format ignores the visible Colors Across value

**Locations:** `src/js/textMode/color/colorPaletteSave.js:108-123`, `src/js/textMode/color/colorPaletteSave.js:133-151`, `src/js/textMode/color/colorPaletteSave.js:195-228`

The PNG branch calls `setColorsAcross(colorsAcross)`, but `colorsAcross` is declared only in the `else` branch. Because `var` is function-scoped, the PNG call receives `undefined`. `getColorMap()` then silently falls back to the palette's default column count.

Reproduction: in PNG format enter a custom count such as 4, switch to JSON, then switch back to PNG. The input still displays 4, but the preview and downloaded map use the palette default (commonly 8). This makes the visible export settings disagree with the file produced.

**Fix:** read and validate `#saveColorPaletteColorsAcross` when entering PNG mode, or preserve one typed state value explicitly. Ensure the preview, internal map, and visible input are updated atomically across format changes.

## P2

### 8. Invalid C64 sprite-data ranges leave old output enabled for copy/download

**Locations:** `src/html/c64/exportC64SpriteData.html:3-19`, `src/js/debugger/exportC64SpriteData.js:72-109`, `src/js/debugger/exportC64SpriteData.js:114-131`, `src/js/debugger/exportC64SpriteData.js:147-172`

After generating valid data, clearing either address or making To smaller than From causes `exportData()` to return without clearing the Ace editor, marking the values invalid, or disabling Copy/Download. The controls now describe one range while both enabled actions still operate on output from the previous range.

The first open begins with blank range fields but the same active Copy and Download controls, allowing an empty export with no explanation.

**Fix:** represent the generated output as valid only for the exact current inputs. On invalid or incomplete input, clear/mark the output stale, show a concise validation message, and disable both actions. Initialize sensible range defaults if the feature has a canonical sprite-memory range.

## Recommended fix order

1. Guard palette map dimensions first to remove the UI-thread freeze.
2. Centralize finite positive dimension validation for grid, tile, and MetaTile model boundaries.
3. Correct both PNG layout state bugs and add small export-dimension tests.
4. Make Background Image use a disposable dialog draft and a disabled empty-state OK action.
5. Regenerate template links directly from validated input state.
6. Tie C64 sprite Copy/Download enablement to the validity and freshness of generated output.
