# Half-block drawing

## Recommendation

Implement half-block painting as a Pencil brush mode in Text Mode:

```text
Pencil: Tile | Half-block
```

Internally, it should be a separate `HalfBlockDraw` strategy. It should not
become another document/editor mode, and it should not use the existing Pixel
tool. Pixel mode edits glyph bitmap data shared by every cell using that glyph;
half-block painting composes ordinary text cells.

This follows the model used by Moebius: its half-block brush stores normal
`{code, fg, bg}` cells and translates a doubled Y coordinate into upper- and
lower-half block characters.

References:

- <https://github.com/blocktronics/moebius>
- <https://github.com/blocktronics/moebius/blob/master/app/document/doc.js#L805-L880>

## Storage

No new per-cell fields are needed.

| Appearance | Tile | Foreground | Background |
| --- | --- | --- | --- |
| Top A, bottom B | `▀` | A | B |
| Top B, bottom A | `▄` | A | B |
| Both A | `█` | A | transparent or neutral |
| Both empty | blank | arbitrary | transparent or background |

In CP437 these are normally `▀ = 223`, `▄ = 220`, and `█ = 219`.

This fits lvllvl's existing cell representation:

```js
{ t, fc, bc, rz, fh, fv }
```

Writing through `LayerGrid.setCell()` automatically provides rendering,
project persistence, dirty-region invalidation, and undo. History already
coalesces repeated writes to the same cell during one stroke.

Do not add `topColor` and `bottomColor` fields or double the stored grid
height. Apart from breaking text-art compatibility, frame-copying and
exporters currently understand only the standard cell fields.

If explicit role mappings are ever persisted, they belong to tile-set metadata
such as `blockCharacters.upperHalf`, not to individual artwork cells.

## Painting algorithm

For a pointer coordinate:

1. Convert it to `(cellX, halfY)` using `GridView2d.xyToCellPixel(x, y, 1, 2)`.
2. Decode the current cell into `{topColor, bottomColor}`.
3. Replace the clicked half with the active foreground color.
4. Re-encode the two colors as `▀`, `▄`, `█`, or blank.
5. Call `layer.setCell()` with rotation and flips reset to zero.

Conceptually:

```text
cellY = floor(halfY / 2)
isTop = halfY % 2 == 0

halves = decode(layer.getCell(cellX, cellY))
halves[isTop ? "top" : "bottom"] = paintColor
layer.setCell(encode(halves))
```

### Decoding existing cells

- Blank glyph: both halves use the cell background.
- Full block: both halves use the foreground.
- Upper half block: top uses foreground, bottom uses background.
- Lower half block: top uses background, bottom uses foreground.
- Any glyph whose foreground equals its background can be treated as a solid
  cell.
- For any other glyph, painting replaces the glyph and preserves its background
  as the untouched half. This matches Moebius's behavior.

Transparent/no-color background values can be retained as a half color. This
allows a half block to remain transparent over lower layers.

Flipped or rotated recognized glyphs should be decoded according to their
visual orientation. Writing a half block should produce a canonical,
untransformed block glyph.

### Dragging and sampling

Dragging needs Bresenham interpolation in the doubled-height coordinate space.
The current whole-cell line routine cannot be reused directly; otherwise fast
vertical strokes can leave holes.

Alt-click should sample the decoded color of the clicked half rather than the
complete cell's foreground/background pair.

Right-click is currently reserved for character and color pickers. The first
version can therefore paint with the active foreground color and rely on the
existing color-swap command to paint with the other swatch.

## Integration points

### `src/js/textMode/tools/drawTools.js`

- Add `penMode = "tile" | "halfblock"`.
- Instantiate the half-block drawing strategy.
- Add capability checks when the selected layer or tile set changes.
- Keep the existing Pencil command and shortcut.

### `src/html/textMode/toolSettings.html`

- Add a Tile/Half-block selector shown only for the Pencil.
- Hide or disable the Affects Tile/FG/BG switches while Half-block is active.
  A half-block operation necessarily rewrites the tile and both color
  attributes.

Add the equivalent control to `toolSettingsMobile.html`.

### `src/js/textMode/gridView2d.js`

- Route Pencil start, move, and end events to `HalfBlockDraw` when active.
- Pass raw pointer coordinates so the tool can identify the selected half.
- Draw a half-height overlay cursor.
- Track the last position in half-cell coordinates for drag and Shift-line
  behavior.

### `src/js/textMode/layers/layerGrid.js`

No storage changes should be necessary. The half-block strategy should write
normal cells through `setCell()`.

### `scripts/build-graph.mjs`

Add the new classic-script source file if `HalfBlockDraw` is implemented as a
separate file under `src/js/textMode/tools/`.

## Tile-set capability detection

Do not hardcode CP437 indices globally. Custom lvllvl tile sets can reorder or
omit the required glyphs.

Resolve the blank, full, upper-half, and lower-half roles using this order:

1. Optional explicit tile-set metadata, for example
   `blockCharacters.upperHalf`.
2. Otherwise scan bitmap glyphs with `TileSet.getPixel()` for exact blank,
   full, top-half, and bottom-half silhouettes.
3. Cache the result until the tile set changes.
4. Disable the mode with a clear explanation if the required glyphs are not
   available.

For duplicate matches, prefer explicit metadata, then the tile set's configured
blank/full glyphs, then the first exact match. Animated glyphs should not be
selected by automatic detection.

Vector tile sets could later use Unicode metadata for U+2580, U+2584, and
U+2588, but bitmap silhouette matching is sufficient for the initial version.

## Supported modes

The first release should enable Half-block only when:

- the selected layer type is `grid`;
- screen mode is ordinary `TextModeEditor.Mode.TEXTMODE`;
- colors are stored per cell;
- meta-tile/block mode is off; and
- the current tile set contains the required glyphs.

Meta-tile mode should initially be rejected because editing a character within
a block can modify shared block data and follows different history semantics.

C64 Standard could later support a constrained variant where the untouched
half must use the global background. C64 multicolor, C64 ECM, NES, indexed/RGB,
and color-per-character modes have different color semantics and should
initially be rejected.

## Mirroring and selection

Mirroring must operate on half-cell coordinates. The existing whole-cell
`Grid2d.setMirrorCells()` routine cannot be reused unchanged.

- Horizontal mirror changes X and leaves the selected half unchanged.
- Vertical mirror transforms the doubled Y coordinate and therefore naturally
  swaps top and bottom halves.
- Combined mirroring should generate the fourth reflected coordinate without
  relying on glyph flip flags.

Existing selections may remain whole-cell aligned for the first release.
Painting should continue to respect their cell boundaries, and copying/pasting
those cells will preserve half-block artwork naturally.

## Export implications

Native project storage and normal rendered image exports need no new format
work because the result is ordinary glyph and color data.

Format-specific exports still need auditing:

- `ExportTxt` emits only tile codes, so it already loses foreground and
  background colors.
- There is currently no active ANSI `.ANS` exporter.
- Some generic binary exports emit foreground color but not per-cell
  background color.
- Hardware-specific formats may restrict which colors can be backgrounds.

Half-block painting and ANSI interchange should therefore be separate
features. A future ANSI exporter will already have the correct glyph/color
representation to work from, but it may need to swap `▀` and `▄` so restricted
colors remain in the foreground attribute. If both halves require background
combinations that a target format cannot encode, export should warn rather
than silently alter the artwork.

## Testing

Use a small set of targeted tests:

1. Pure decode/paint/encode cases covering blank, upper, lower, full, equal
   colors, transparency, and painting over a non-block glyph.
2. Tile-set capability detection, including missing and animated glyphs.
3. One history integration test proving that multiple changes to the same cell
   during a stroke undo as one operation.
4. One pointer-drag smoke test crossing a cell's midpoint and multiple rows.
5. A focused mirror-coordinate test if mirroring ships in the first version.

## Suggested delivery phases

### Phase 1: production MVP

- Tile/Half-block Pencil selector on desktop and mobile.
- Capability detection and unsupported-mode messaging.
- Single-half painting, interpolated dragging, Shift-line, Alt sampling, and
  half-height cursor.
- Undo/redo and selection-boundary behavior through existing cell APIs.
- Correct half-coordinate mirroring, or explicitly disabled mirror controls
  until that support lands.
- Targeted tests.

Estimated effort: roughly three to five focused development days.

### Phase 2: Moebius-style parity

- Brush sizes.
- Half-block fill.
- Half-block line, rectangle, and ellipse tools.
- Custom tile-set mapping UI.
- ANSI import/export and target-format validation.

