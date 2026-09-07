# Canvas scaling issues and consolidation plan

Updated: 2026-09-07

## Purpose and status

This document records the canvas-scaling investigation, the fix committed as
`b180a63` (`Fix fractional canvas and tile palette scaling`), the remaining
risky canvas paths, and a proposed architecture for making scaling predictable
and maintainable.

The main 2D editor and `TilePaletteDisplay` fixes are implemented. The remaining
inventory is based on static inspection and should be treated as a work queue,
not as proof that every listed surface visibly fails on every browser. The
highest-priority paths use the same known-bad mechanisms as the original bug and
are expected to reproduce at fractional display pixel ratios.

This work concerns display canvases. Export canvases whose dimensions define the
actual file resolution are intentionally different and must not automatically
be multiplied by the display pixel ratio.

## What we observed

The initial report was that bitmap glyphs in the main canvas looked deformed at
some zoom levels. The effect was most visible when an artwork pixel needed to
cover a non-integer number of physical display pixels. Columns or rows that
should have had a stable pattern could receive different widths, making glyphs
look stretched, compressed, or inconsistent as the zoom changed.

The investigation found several related symptoms:

- Bitmap glyphs were not always sampled on the final backing-store pixel grid.
  Some paths first rendered a CSS-resolution intermediate and then enlarged it
  for the display.
- `imageSmoothingEnabled = false` did not make those paths correct. It selects
  nearest-neighbour filtering, but it does not decide which physical pixel
  centres belong to each source pixel or eliminate a second resampling step.
- `UI.devicePixelRatio` was rounded down. A real ratio of `1.25` or `1.5`
  became `1`; `2.5` became `2`. The browser then performed the missing
  compositor scaling after application rendering.
- Several display canvases mixed CSS sizes, backing-store sizes, artwork sizes,
  and zoom values in the same variables. This made it easy to apply DPR twice,
  omit it, or crop a physical canvas using logical dimensions.
- Some components compared a numeric width with `canvas.style.width`, whose
  value is a string such as `"640px"`. Those comparisons are always unequal,
  so a resize call could reset and clear the backing store even when no size had
  changed.
- Some caches did not include DPR in their dimensions or cache keys. Moving the
  application between displays, or changing browser/OS scaling, could therefore
  reuse a raster created for the previous ratio.
- Repeated `context.scale(...)` calls after canvas setup risked accumulating a
  transform when the backing store was not reset. A deterministic
  `setTransform(...)` is safer.
- Scroll zoom was quantized for display and the quantized value was fed back as
  the next input value. Small wheel or trackpad deltas were discarded rather
  than accumulated, so zoom could appear stuck until a stronger gesture was
  made.

The tile palette had the same root problem: its glyph cache was built in logical
pixels and then scaled again while copying to a DPR-sized display canvas.

## The coordinate spaces that must remain distinct

Every canvas path should name and preserve these spaces explicitly:

1. **Source pixels** are intrinsic bitmap pixels in a tile, sprite, frame, or
   imported image. They are not CSS pixels and do not have a DPR.
2. **World units** are editor coordinates such as cells, tiles, and artwork
   positions before viewport zoom and camera translation.
3. **CSS pixels** describe layout, pointer events, scrolling, camera placement,
   and the visible size of a canvas element.
4. **Backing pixels** are integer pixels in `canvas.width` and `canvas.height`.
   They are normally derived from CSS size and the exact DPR.

The core relationship for a display canvas is:

```text
backingWidth  = round(cssWidth  * devicePixelRatio)
backingHeight = round(cssHeight * devicePixelRatio)
physicalArtworkScale = displayZoom * devicePixelRatio
```

DPR belongs only at the CSS-to-backing boundary. Pointer hit testing should
normally remain in CSS coordinates. Artwork zoom should remain independent of
DPR until rendering is mapped to backing pixels.

For adjacent pixel-art rectangles, calculate both physical edges from the same
mapping instead of rounding a position and width independently:

```text
left  = round(cssLeft * dpr)
right = round((cssLeft + cssWidth) * dpr)
width = right - left
```

This partitions the backing store without gaps or overlaps, even when the
physical scale is fractional.

## Root causes

### 1. Rendering on the wrong lattice

The old main-canvas path chose source pixels on a CSS-pixel lattice, wrote that
result into an intermediate canvas, and relied on a later DPR transform or
browser composition to reach physical size. At fractional combinations such as
`350% * 1.25 DPR`, the final physical pixel centres did not necessarily select
the same source pixels as a direct render.

Pixel art must be sampled at the centres of the final backing pixels. A
CSS-resolution intermediate is insufficient unless the final scale is an exact
integer and its origin is aligned.

### 2. Treating DPR as an integer quality setting

`Math.floor(devicePixelRatio)` changes the geometry; it is not merely a quality
reduction. At `1.5 DPR`, allocating a 1x backing store and displaying it at 1.5x
forces another scale outside the application's coordinate model. It can also
make an otherwise integral physical artwork scale fractional.

The exact finite DPR must be retained. Only backing dimensions are rounded,
because the canvas width and height are integer properties.

### 3. Ambiguous offscreen canvas semantics

The codebase uses offscreen canvases for several different purposes:

- intrinsic source rasters;
- logical/CSS-resolution caches;
- final backing-resolution caches; and
- file export surfaces.

Those roles are not encoded in the API or naming. A caller can therefore copy a
logical cache 1:1 as if it were physical, or enlarge it a second time. The tile
palette bug was an example of this ambiguity.

### 4. Distributed sizing and lifecycle ownership

Many controllers write all four of these independently:

```text
canvas.style.width
canvas.style.height
canvas.width
canvas.height
```

They also cache their own `canvasScale`, decide whether to redraw, and sometimes
listen for resize or DPR changes. The same policy is repeated with small but
important differences. This creates stale caches, implicit numeric truncation,
and backing-store resets that are hard to reason about.

### 5. Conflating continuous gesture state with displayed zoom

The view exposes quarter-step zoom levels, but wheel and trackpad deltas can be
smaller than a quarter step. The continuous requested scale and quantized
display scale must be separate. Quantization is a presentation decision, not a
reason to discard input state.

## What has already been fixed

### Exact DPR and display-canvas lifecycle

[UI DPR management](../src/js/ui/ui.js) now keeps the exact finite display pixel
ratio and watches for changes. A ratio change refreshes UI layout so display
canvases can rebuild their backing stores and dependent caches.

[CanvasPanel](../src/js/ui/canvasPanel.js) now:

- derives rounded backing dimensions from CSS dimensions and exact DPR;
- compares CSS strings with CSS strings and backing integers with backing
  integers;
- records the exact ratio returned by `getScale()`; and
- avoids resetting an unchanged backing store.

This is the current reference behavior for generic display-canvas sizing.

### Main 2D canvas raster sampling

[GridView2d](../src/js/textMode/gridView2d.js) now samples bitmap artwork at
backing-pixel centres. It retains a native fast path when physical magnification
and physical origin are integral, and uses the deterministic sampler only when
fractional geometry makes native `drawImage` behavior ambiguous.

The same physical mapping is used for full draws, dirty regions, and cursor or
clipboard previews. Overlay transforms are reset with `setTransform(...)`
instead of incrementally scaled.

[Graphic](../src/js/textMode/graphic.js) now receives logical canvas bounds and
the viewport pixel ratio explicitly. It maps layer and previous-frame rasters to
logical destinations while using the correct physical source extents.

[LayerGrid](../src/js/textMode/layers/layerGrid.js) now renders vector viewport
caches at `display scale * DPR`, keeps their offsets in logical viewport units,
and includes DPR in the cache state.

[Shapes](../src/js/textMode/tools/shapes.js) now builds vector shape previews at
backing resolution and reports their logical placement separately.

### Main tile palette

[TilePaletteDisplay](../src/js/textMode/tileSet/tilePaletteDisplay.js) now:

- preserves fractional DPR;
- keeps palette layout and hit testing in CSS pixels;
- renders bitmap and vector glyphs directly into a backing-resolution cache;
- records physical tile locations separately from logical palette locations;
- copies the cache to the visible canvas 1:1 instead of enlarging it again;
- draws selection, highlight, drag, and scrollbar overlays in backing pixels;
- explicitly rounds display backing dimensions; and
- invalidates and redraws when DPR changes.

The main [tile-palette wrapper](../src/js/textMode/tools/tilePalette.js) now uses
correct CSS/backing comparisons and exact DPR for its small current-character
preview.

### Scroll zoom sensitivity

`GridView2d.zoom(...)` now retains the continuous input scale while exposing the
quantized display scale. Repeated small wheel or trackpad deltas accumulate until
they cross the next visible zoom step, instead of repeatedly snapping back to
the current displayed value.

### Validation already added

The committed tests cover the critical contracts rather than every canvas:

- [canvas-panel.test.mjs](../tests/canvas-panel.test.mjs) checks fractional DPR,
  rounded backing dimensions, DPR changes, and idempotent sizing.
- [grid-raster.test.mjs](../tests/grid-raster.test.mjs) compares raster output
  with a backing-pixel-centre oracle across fractional zoom and DPR values.
- [onion-skin-cache.test.mjs](../tests/onion-skin-cache.test.mjs) verifies that
  DPR affects vector cache storage and invalidation.
- [shape-preview.test.mjs](../tests/shape-preview.test.mjs) verifies DPR-aware
  vector preview dimensions.
- [tile-palette-display.test.mjs](../tests/tile-palette-display.test.mjs) checks
  direct fractional-DPR glyph rendering and a 1:1 palette blit.
- [browser-support.spec.mjs](../tests/browser-support.spec.mjs) covers scroll
  zoom accumulation and the HiDPI bitmap cursor/artwork relationship.
- [tile-palette-fit.spec.mjs](../tests/tile-palette-fit.spec.mjs) verifies the
  real palette's fractional-DPR backing stores, glyph scale, and blit geometry.

During the original fix, 17 targeted unit tests passed. Four focused Chromium
tests also passed using an isolated scaling-only build; the combined working
tree at that time had an unrelated module-boundary build failure.

## Remaining work

### Priority 0: direct repeats of the known visual bug

These paths either floor DPR, omit DPR, or render a low-resolution intermediate
that is later enlarged. They should be migrated first.

#### Tile editor grid

[tileEditorGrid.js](../src/js/textMode/tileSet/tileEditorGrid.js) floors DPR in
both initial setup and `setSize`. It enlarges an intrinsic character canvas into
that undersized backing store. It also uses backing dimensions when calculating
CSS `left` and `top` positions for surrounding controls, which mixes coordinate
spaces at DPR values above 1.

Required change:

- size the visible canvas through the shared display-surface API;
- keep editor layout and control positions in CSS pixels;
- render the tile grid on the physical lattice;
- keep pointer input in CSS coordinates and convert CSS-to-world independently
  of DPR; and
- rebuild grid/cursor caches when DPR changes.

#### Block palette

[blockPalette.js](../src/js/textMode/tools/blockPalette.js) floors DPR and draws
glyphs using `palette scale * floor(DPR)`. Its block widths are physical while
some spacing increments remain unscaled, so layout, selection bounds, and
wrapping do not share one coordinate space.

Required change:

- perform wrapping and store block positions in CSS pixels;
- map each block/tile edge to backing pixels only while rendering;
- render bitmap/vector glyphs at exact physical scale; and
- derive selection outlines and hit testing from the same logical block model.

#### Animation preview

[animationPreview.js](../src/js/textMode/animationPreview.js) floors DPR, renders
the cached frame at intrinsic resolution, and scales it into the visible
backing store using `preview zoom * floor(DPR)`. Its size check also compares
numbers with CSS strings.

Required change:

- migrate visible sizing to the shared helper;
- keep the frame cache explicitly source-native;
- use the shared physical bitmap sampler for the final preview mapping; and
- include DPR and preview zoom in any backing-resolution cache key.

#### Legacy mobile tile palette

[tilePaletteMobile.js](../src/js/textMode/tools/tilePaletteMobile.js) gives the
main visible canvas CSS-sized backing dimensions with no DPR multiplication.
The complete palette is therefore browser-upscaled on HiDPI mobile displays.
Its current-tile preview separately floors DPR.

Required change:

- decide whether this legacy palette should be replaced by
  `TilePaletteDisplay` or migrated to the same surface/cache contract;
- preserve horizontal scrolling and selection geometry in CSS pixels;
- render the visible result at exact backing resolution; and
- migrate the current-tile preview to the common preview renderer.

Replacing this implementation with the maintained `TilePaletteDisplay` is
preferable if touch interaction and horizontal layout can be expressed without
forking its rendering logic.

#### Sprite frame/timeline surface

[spriteFrames.js](../src/js/textMode/frames/spriteFrames.js) fixes its visible
canvas scale at 1 and relies on browser composition for HiDPI display. It also
uses the number-versus-CSS-string resize comparison.

Required change:

- size the visible canvas at exact DPR;
- keep timeline layout and pointer coordinates logical;
- choose explicitly whether frame thumbnails are source-native inputs or
  backing-resolution caches; and
- copy/draw them once into the final backing grid.

### Priority 1: glyph previews and dialogs

The following live paths floor DPR and can show the same deformation at smaller
sizes:

- [info.js](../src/js/textMode/info.js) uses `floor(DPR)` for the current
  character. Migrate it to a shared single-glyph preview renderer.
- [blockEditor.js](../src/js/textMode/blockSet/blockEditor.js) floors DPR for
  its character preview, while its embedded palette wrapper also owns canvas
  sizing. Use the shared glyph preview and palette-host sizing paths.
- [replaceCharacter.js](../src/js/textMode/tools/replaceCharacter.js) uses
  `floor(DPR)` for both replacement previews. Use the shared glyph preview.
- [tilePaletteChooserMobile.js](../src/js/textMode/tools/tilePaletteChooserMobile.js)
  floors DPR for the selected-tile preview and then enlarges a native tile
  canvas. Use the shared glyph preview while retaining `TilePaletteDisplay` for
  the palette itself.
- [drawTools.js](../src/js/textMode/tools/drawTools.js) floors DPR for its mobile
  current-tile preview. Use the shared glyph preview.
- [exportPngMobile.js](../src/js/textMode/export/exportPngMobile.js) floors DPR
  for the display preview. Use the shared preview surface and physical sampler
  without changing the separate export output canvas.
- [exportGifMobile.js](../src/js/textMode/export/exportGifMobile.js) has the same
  preview issue and should use the same preview path as PNG.

These should not each receive a bespoke DPR fix. A small reusable tile/glyph
preview component can own sizing, colors, bitmap/vector rendering, transform,
and DPR invalidation for all of them.

### Priority 1: debugger coordinate mismatch

[dbgC64CharEditor.js](../src/js/debugger/dbgC64CharEditor.js) and
[dbgC64SpriteEditor.js](../src/js/debugger/dbgC64SpriteEditor.js) allocate their
visible canvases with exact `UI.devicePixelRatio`, but multiply pointer
coordinates by `floor(UI.devicePixelRatio)`. Rendering and hit testing therefore
use different coordinate systems at fractional DPR.

Required change:

- keep pointer positions in CSS pixels;
- express the grid rectangle in CSS pixels for hit testing;
- convert to tile/sprite pixels from logical grid geometry, not from backing
  dimensions; and
- use exact DPR only for rendering.

This is primarily an editing-accuracy bug rather than the same visual blur, but
it comes from the same mixed-coordinate design.

### Priority 2: non-glyph display canvases

[ColorPaletteDisplay](../src/js/textMode/color/colorPaletteDisplay.js) and
[ParamGraph](../src/js/utils/paramGraph.js) floor DPR. Their content is mostly
solid shapes and lines, so glyph deformation is less likely, but they lose
resolution and can produce inconsistent line placement. Migrate them after the
pixel-art surfaces, using logical drawing with a deterministic DPR transform.

[colorPaletteEdit.js](../src/js/textMode/color/colorPaletteEdit.js) also contains
image and palette canvases whose CSS and backing dimensions are identical. They
are low-resolution on HiDPI displays. Export-only canvases in that file should
remain intrinsic-resolution surfaces.

The `Math.floor(UI.devicePixelRatio)` occurrence in
[clearHiddenTiles.js](../src/js/textMode/tools/clearHiddenTiles.js) is inside a
commented-out block and is not a live defect. Remove the dormant code during
cleanup rather than building a migration around it.

### Priority 2: fragile sizing even where exact DPR is used

Several components use exact DPR but still assign a fractional expression
directly to integer canvas properties or compare a number with a `"px"` style
string. The browser implicitly coerces the dimensions, and repeated resize calls
can clear the canvas unnecessarily.

Known hosts include:

- [canvasScrollPanel.js](../src/js/ui/canvasScrollPanel.js);
- [tilePaletteEditor.js](../src/js/textMode/tileSet/tilePaletteEditor.js), which
  passes `resizeCanvas: false` and therefore remains responsible for the
  `TilePaletteDisplay` backing store;
- [tilePickerPopup.js](../src/js/textMode/tileSet/tilePickerPopup.js);
- [chooseCharactersDialog.js](../src/js/textMode/tileSet/chooseCharactersDialog.js);
- the embedded palette sizing in
  [blockEditor.js](../src/js/textMode/blockSet/blockEditor.js);
- [frameTimeline.js](../src/js/textMode/frames/frameTimeline.js); and
- desktop PNG, GIF, sprite PNG, image, and 3D GIF preview canvases under
  `src/js/textMode/export` and `src/js/textMode/export3d`.

These may currently redraw immediately enough to hide the reset, but they should
use the same idempotent sizing contract as `CanvasPanel`. Preview canvases should
be migrated without changing the pixel dimensions of their export canvases.

## Proposed consolidated architecture

### 1. Introduce one display-canvas surface abstraction

Add a small UI-layer abstraction, for example `UI.CanvasSurface`, and use it for
every canvas whose visible size is defined in CSS pixels. Keep it in the UI
layer because it owns DOM canvas state and browser DPR lifecycle.

Its sizing API should accept logical dimensions and return immutable metrics:

```js
var metrics = surface.resize({
  cssWidth: width,
  cssHeight: height,
  pixelRatio: UI.devicePixelRatio
});

// metrics:
// cssWidth, cssHeight, pixelRatio
// backingWidth, backingHeight
// resized, ratioChanged
```

The abstraction should be the only normal display path that writes CSS and
backing dimensions. It should:

- validate finite, positive dimensions and DPR;
- explicitly round backing dimensions;
- avoid assigning `canvas.width` or `canvas.height` when unchanged;
- expose whether backing storage was reset;
- reset context state deterministically after a real resize;
- provide logical and physical contexts without cumulative transforms; and
- react to a central DPR revision/change notification.

`CanvasPanel` and `CanvasScrollPanel` should delegate to this object rather than
implementing parallel policies.

Do not make export surfaces use this API by default. Provide an explicitly named
intrinsic/export constructor or leave export allocation separate so file output
does not accidentally depend on the user's monitor.

### 2. Centralize coordinate and edge conversion

The surface metrics should provide named operations rather than encouraging raw
`* dpr` and `/ dpr` arithmetic throughout controllers:

```js
metrics.backingEdge(cssPosition)
metrics.backingRect(cssX, cssY, cssWidth, cssHeight)
metrics.cssPointFromEvent(event, element)
```

`backingRect` should map both edges and subtract them, guaranteeing a complete,
non-overlapping partition. Callers should not reuse it for pointer hit testing;
events are already expressed in CSS pixels.

Variables crossing a boundary should carry a suffix such as `Css`, `World`,
`Source`, or `Backing`. Avoid generic names such as `scale`, `width`, and
`offsetX` when more than one coordinate space is in scope.

### 3. Give offscreen canvases explicit roles

Create factories or wrappers with three named roles:

- **SourceRaster**: intrinsic bitmap dimensions; never multiplied by DPR.
- **BackingRaster**: physical dimensions tied to a display surface and invalid
  when that surface's DPR revision changes.
- **ExportRaster**: intrinsic output dimensions controlled by the document or
  export settings, never by display DPR.

A logical/CSS-resolution bitmap cache should be avoided for pixel art. If one is
required for a non-pixel-art effect, it must be named as such and its final
resampling policy must be explicit.

Every cache key for a `BackingRaster` should include at least:

```text
source revision
logical viewport bounds
display zoom
pixel ratio or DPR revision
render mode and relevant color state
```

### 4. Consolidate pixel-art sampling

Keep one `RasterSampler`/`PixelArtBlitter` implementation for mapping an
intrinsic source raster to a final backing surface. `GridView2d` currently
contains the reference physical-pixel-centre algorithm; move it behind a small
reusable contract once another production consumer is migrated.

The contract should receive source and destination rectangles plus a complete
surface transform. It should:

- use native `drawImage` only when physical scale and origin make the mapping
  unambiguous;
- otherwise sample at final backing-pixel centres;
- clip in the declared coordinate space;
- replace transparent pixels correctly when reusing scratch storage; and
- avoid an intermediate CSS-resolution enlargement.

Do not prematurely generalize it to arbitrary rotations or affine transforms.
The current editor requirement is axis-aligned positive scaling and translation.
Other transforms can deliberately fall back to browser drawing until they have
a defined pixel-art policy.

### 5. Consolidate tile and glyph previews

Introduce a reusable `GlyphPreview` for the repeated 16–100 CSS-pixel tile
previews. It should accept:

```text
tile or tile matrix
foreground/background mode
flip and rotation state
CSS bounds
fit policy (integer fit, contain, or explicit zoom)
```

It should own a `CanvasSurface`, render bitmap or vector content directly at
backing resolution, and redraw on tile, palette, transform, size, or DPR change.
This would replace the duplicated implementations in info, block editing,
replacement, mobile tools, and mobile tile chooser code.

### 6. Keep zoom state independent from DPR

Use explicit zoom fields:

- `requestedZoom`: continuous state updated by wheel, trackpad, pinch, or direct
  input;
- `displayZoom`: clamped/quantized value visible to the user; and
- `physicalScale`: derived render-only value, `displayZoom * DPR`.

Camera anchoring and scroll calculations should use world and CSS coordinates.
DPR must not affect how far a gesture zooms or where its focal point remains.

If multiple surfaces need the same zoom rules, extract pure functions for
clamping, quantization, and zoom-around-point. Do not create another mutable zoom
service unless more than one controller truly owns the same zoom state.

### 7. Make DPR changes an explicit invalidation event

Replace independent `canvasScale` snapshots with one central pixel-ratio source
that exposes the current exact ratio and a monotonically increasing revision.
`UI.watchDevicePixelRatio` is the starting point.

On a revision change:

1. resize visible display surfaces;
2. invalidate backing-resolution caches;
3. preserve CSS/world camera and scroll state;
4. redraw from source data; and
5. leave source and export rasters unchanged.

The application should produce the same logical view before and after moving
between displays; only backing resolution should change.

## Migration sequence

Migrate by root cause and canvas family, not by globally replacing every
occurrence of `scale`. Many export and effect canvases use scale for legitimate
intrinsic-resolution work.

### Phase 1: establish the shared primitives

- Extract the idempotent sizing behavior from `CanvasPanel` into
  `UI.CanvasSurface`.
- Add pure edge/rectangle conversion helpers.
- Move `CanvasPanel` and `CanvasScrollPanel` onto the shared sizing path.
- Add the DPR revision/invalidation contract.

Gate: two generic panels use the same implementation; unchanged resizes do not
reset backing stores; a simulated DPR change resizes once and reports cache
invalidation.

### Phase 2: migrate high-impact pixel-art surfaces

- Tile editor grid.
- Block palette.
- Animation preview.
- Mobile tile palette or its replacement with `TilePaletteDisplay`.
- Sprite frame/timeline display.

Move the physical sampler out of `GridView2d` only when the first additional
consumer proves the reusable API. Avoid an abstraction that merely forwards a
large list of existing arguments.

Gate: no Phase 2 surface floors or omits DPR; bitmap cells partition backing
pixels deterministically; layout and hit testing remain stable at `1`, `1.25`,
`1.5`, `2`, and `2.5` DPR.

### Phase 3: consolidate small glyph previews

- Build `GlyphPreview` from one migrated preview.
- Replace info, block editor, replace-character, mobile current-tile, and tile
  chooser previews.
- Use the same preview surface for mobile export previews where appropriate,
  while retaining separate intrinsic export canvases.

Gate: one bitmap and one vector test exercise the shared preview; individual
hosts need only interaction/lifecycle tests, not duplicate pixel matrices.

### Phase 4: fix debugger input and remaining UI canvases

- Convert C64 debugger editors to CSS-space hit testing.
- Migrate color palette, parameter graph, color-edit image previews, timeline,
  popup/dialog palette hosts, and desktop export preview surfaces.
- Remove dormant scaling code.

Gate: all live display canvases use exact DPR and shared sizing; no pointer path
multiplies a CSS event coordinate by a separately floored ratio.

### Phase 5: enforce the architecture

- Document the three canvas roles near the shared API.
- Add a narrow source-policy check after migration that rejects
  `Math.floor(...devicePixelRatio...)` in live code.
- Where practical, reject direct display-canvas backing assignments outside the
  shared UI implementation. Explicit export/source raster factories are exempt.
- Remove obsolete per-component `canvasScale` fields and duplicated smoothing
  setup.

Gate: newly added display surfaces must choose a declared role and cannot
silently reintroduce floored DPR or number-versus-style-string comparisons.

## Testing strategy

Testing should concentrate on shared contracts and one representative from each
rendering family. Avoid a full Cartesian matrix of every component, DPR, zoom,
mode, and browser.

### Pure unit tests

Test canvas metrics at odd CSS dimensions and representative ratios:

```text
DPR: 1, 1.25, 1.5, 2, 2.5
CSS sizes: include odd widths/heights and a zero/hidden transition
```

Critical assertions:

- backing dimensions are explicitly rounded;
- adjacent edge-mapped rectangles have no gaps or overlaps;
- an unchanged resize performs no width/height write;
- a DPR change performs exactly one reset and changes the revision;
- CSS layout dimensions do not change with DPR; and
- invalid/zero hidden sizes do not trigger illegal image-data operations.

Keep the existing physical pixel-centre oracle as the main sampler test. Extend
it only for a newly supported transform or clipping behavior, not for each UI
consumer.

### Component contract tests

Use one focused test per shared component:

- `CanvasSurface`: sizing and invalidation;
- `PixelArtBlitter`: physical sampling and transparent replacement;
- `GlyphPreview`: bitmap and vector physical dimensions;
- `TilePaletteDisplay`: logical layout plus backing-resolution cache and 1:1
  final blit; and
- zoom functions: accumulation, clamping, quantization, and focal-point
  preservation.

Hosts that delegate to these components should test lifecycle and arguments, not
repeat the renderer's pixel-level suite.

### Browser tests

Maintain a small set of end-to-end checks:

1. Main 2D artwork and cursor agree at one fractional reduction and one
   fractional enlargement on a fractional DPR.
2. Tile palette bitmap/vector glyphs use the expected physical scale and remain
   stable after a runtime DPR change.
3. Tile editor or block palette hit testing selects the cell that is visibly
   under the pointer at fractional DPR.
4. Mobile tile palette/preview has DPR-sized backing dimensions and stable touch
   selection.
5. Four small trackpad deltas accumulate to one displayed zoom step.

Prefer `getImageData` and geometry assertions over screenshot goldens for pixel
mapping. Screenshot tests are more sensitive to browser, font, and host
differences and should be reserved for layout behavior that cannot be expressed
numerically.

### Manual checks

For each migrated family, perform one manual pass that:

- changes browser zoom or moves the window between displays with different DPR;
- checks `100%`, a fractional zoom such as `125%`, and an exact physical scale
  such as `350%` at 2x;
- pans and scrolls to exercise non-zero origins;
- checks selection/cursor alignment; and
- confirms that reopening or resizing does not briefly blank the canvas.

## Definition of done

The scaling consolidation is complete when:

- no live display path floors `devicePixelRatio`;
- every display canvas uses one idempotent CSS/backing sizing policy;
- source, backing, and export rasters have explicit roles;
- pixel-art paths sample on the final backing-pixel lattice without an
  accidental CSS-resolution intermediate;
- pointer hit testing is expressed in CSS/world coordinates rather than backing
  coordinates;
- backing-resolution caches include DPR or its revision in invalidation state;
- changing DPR preserves the logical camera, scroll, and selection state;
- continuous zoom input is independent of quantized display zoom;
- component tests cover shared math and cache lifecycle; and
- a small browser suite covers the main canvas, tile palette, one editor/palette
  input surface, mobile display, and scroll-zoom accumulation.

## Implementation cautions

- Do not globally replace every use of `scale`; many values describe artwork,
  vector, effect, or export scale rather than DPR.
- Do not multiply export dimensions by monitor DPR.
- Do not assume disabling smoothing fixes incorrect geometry.
- Do not round DPR itself. Round only integer backing dimensions and mapped
  edges.
- Do not assign canvas width/height merely to clear it; use `clearRect` so sizing
  stays idempotent and context state is not unexpectedly reset.
- Preserve CSS scroll and camera positions across backing-store rebuilds.
- Migrate one canvas family at a time and extend only the closest existing tests.
- Preserve unrelated working-tree changes while implementing this plan.
