# Rendering performance review

Reviewed: **2026-09-05**. Findings only; no application rendering code changed.

**Follow-up:** [Common workflow measurements after R1–R3](workflows.md) compare
fresh before/after production builds for clicks, pencil drags, onion skin,
rectangle previews, tile selection, and panning. That report includes an opt-in
harness, raw samples, operation counts, and correctness qualifications; the
method-call timings below remain historical.

## Summary

The main problem is **inconsistent invalidation**, not a complete absence of
optimization. Ordinary 2D pencil rendering already updates individual cells and
keeps cursor/selection graphics off the artwork canvas. Several adjacent paths
throw those savings away by rebuilding full images or synchronously updating
secondary UI.

Fix these first:

1. **Onion-skin caching never becomes valid:** editing one cell redraws the entire
   previous frame.
2. **Shape previews bypass dirty bounds:** moving a tiny rectangle redraws both
   the artwork and a full-document shape buffer.
3. **Layer thumbnails are on the synchronous drawing path:** a tiny edit downsamples
   the whole layer before returning.
4. **Tile animation invalidates every grid layer**, even when the animated tile
   does not appear in the artwork.

These are concrete, reproducible work-amplification bugs. Replacing Canvas 2D
with WebGL, introducing Workers, or converting the files to modules should not be
prerequisites for fixing them.

Priority definitions here: **P1** = fix first, demonstrated interactive cost;
**P2** = scaling problem or secondary path, optimize after the P1s. These are
performance priorities, not security/incident severities.

## Scope and evidence

- Traced the active 2D bitmap renderer, vector/palette paths, animation preview,
  3D scene handling, and export shader-effects path.
- Ran controlled browser probes against the production bundle in **headless
  Chromium 151.0.7922.34**, Apple M3, macOS kernel 23.6.0, 1280×800 viewport,
  DPR 1, no CPU throttling.
- Browser measurements cover **2D bitmap rendering only**. Vector, 3D, and shader
  recommendations below are static findings, not measured frame-rate claims.
- Fixtures contain one layer, 8×8 C64 PETSCII tiles, a repeating glyph, and the
  default palette. Tested 40×25, 160×100, and 320×200 **cells**, corresponding to
  320×200, 1280×800, and 2560×1600 artwork pixels. The artwork viewport remained
  858×656 CSS pixels. Onion-skin tests add a duplicate frame.
- Each case has three warmups and 25 synchronous calls. Timings run without
  method wrappers; a separate call counts real Canvas operations. Cases use the
  application's drawing methods, not simulated GPU operations.
- Timings are **diagnostic main-thread call durations**, not input-to-paint
  latency, sustained FPS, or GPU completion time. Cases run in a fixed order,
  share a page within each fixture, and can be affected by JIT, GC, canvas backend
  decisions, and host load. Small timing differences and p95 values need repeated
  runs before becoming budgets. Operation counts are the stronger evidence.

### Build qualification

The working tree already contained an in-progress import/export migration.
`npm run build` failed during this review with:

```text
Error: js/bootstrap.mjs bypasses the public entry point for
js/modules/feature-adapters/legacySvgExportAdapter.mjs
```

Rather than modify that unrelated work, the probes used the existing successful
`dist` build. Its source map was checked **byte-for-byte against 12 rendering
source files** before execution. The generated single-host probe and raw samples
were removed during the module-migration consolidation because they represented
that historical build, browser, and machine rather than a maintained release
baseline. Other in-progress application changes were not necessarily present in
that bundle; these measurements do not certify the current working tree.

### Measured results

Median milliseconds per call from the recorded run; parentheses contain p95.
The larger two documents are mostly outside the viewport at zoom 3.5.

| Operation | 40×25 cells | 160×100 cells | 320×200 cells |
| --- | ---: | ---: | ---: |
| One-cell pencil edit | 0.3 (0.4) | 0.9 (2.5) | 3.5 (6.0) |
| Same edit, thumbnail body disabled — diagnostic control | 0.3 (0.4) | 0.3 (0.6) | 0.3 (0.5) |
| Same edit, grid body disabled — diagnostic control | 0.3 (0.5) | 0.8 (2.4) | 3.1 (3.8) |
| Animate one tile absent from artwork | 1.8 (2.7) | 2.4 (4.7) | 4.7 (5.8) |
| One-cell edit with onion skin | 0.8 (1.0) | 7.0 (8.2) | 29.8 (86.3) |
| Move a small rectangle preview | 2.3 (6.5) | 11.1 (23.5) | 56.9 (140.0) |
| Render the same animation-preview frame | 0.6 (1.1) | 7.5 (7.9) | 43.7 (48.7) |
| One-cell pencil edit at zoom 8 | 0.4 (1.7) | 1.0 (2.4) | 4.3 (5.2) |

The disabled-body controls deliberately omit output. They isolate costs; they
are **not correctness-preserving fixes**. All fixtures reported zero uncaught
page errors. A one-second idle observation recorded 60 `GridView2d.render()`
calls and **zero `GridView2d.draw()` calls** for each fixture.

## Rendering paths that matter

```text
Input / Grid2d.redrawUpdatedCells
  -> Graphic.redraw                 (synchronous, not queued to the next RAF)
     -> GridView2d.draw
        -> Graphic.drawFrame
           -> LayerGrid.draw / drawVector
        -> artwork + clipped grid composite + overlay
     -> Layers.updateLayerPreview

UI RAF -> TextModeEditor.update -> Frames.update -> TileSet.update
  -> on tile change: invalidateAllCells -> Graphic.redraw

AnimationPreview.draw
  -> Grid2d.drawFrame                (still active despite g_newSystem = true)
     -> LayerGrid.draw

UI RAF -> UI.webGLRender -> GridView3d.render -> THREE renderer
```

Do not mistake all of `Grid2d.drawFrame` for dead code just because the main
viewport uses `Graphic.drawFrame`.

## Findings

### R1 — P1: the onion-skin cache is explicitly disabled

**Status: fixed.** `LayerGrid.drawPrevFrame()` now retains one raster per layer,
keyed by frame/data identity, shared tile/palette/block revisions, background and
render settings, and (for vectors) viewport/scale. Targeted cell edits invalidate
only the cached frame; bulk legacy invalidation remains conservative. Previous
frame rendering no longer consumes vector dirty state or current selections.
Source regression tests cover dependency invalidation and layer/frame switching;
Chromium and Firefox browser tests check zero `prevgrid` draws for warm
current-frame edits and pixel equivalence against a forced fresh composite for
bitmap and vector layers. The observations below describe the original bug,
not new timing measurements.

**Location:** [graphic.js:1374–1383](../../src/js/textMode/graphic.js#L1374-L1383),
[1634–1638](../../src/js/textMode/graphic.js#L1634-L1638).

`drawFrame()` checks `prevFrame !== this.lastDrawnPrevFrame`, then requests
`layerObject.draw({ allCells: true, draw: 'prevgrid' })`. At the end it assigns
`lastDrawnPrevFrame = false` in **both** branches instead of recording a valid
cache. A numeric frame index never equals that value under the strict comparison.

**Observed:** one 8×8-cell edit in the largest fixture reads/writes 64 pixels of
current artwork, **plus 4,096,000 pixels of unchanged previous-frame artwork**.
The previous-frame `ImageData` alone is 16,384,000 bytes per read, followed by a
same-sized `putImageData`. This happened on every measured edit. Those are logical
buffer sizes, not measured physical GPU-transfer bandwidth.

**Fix:** maintain a previous-frame cache per layer, keyed by frame identity and
content dependencies. Invalidate it when the previous frame, tile pixels, palette,
background, dimensions, or relevant render options change. Vector caching also
needs viewport/scale information. Do not merely store a frame number globally:
shared tile edits can change the previous frame without changing that number.

**Regression check:** after warming onion skin, repeated current-frame cell edits
must cause zero `prevgrid` rasterizations while preserving the composite. Editing
previous-frame dependencies must invalidate it.

### R2 — P1: a small shape preview does full-document work twice

**Status: fixed.** Shape cells now use sparse rows and a touched-cell list rather
than resetting/scanning the document. The main viewport keeps artwork unchanged
and renders previews separately: bitmap scratch storage is cropped to visible
shape bounds; vector storage is viewport-bounded to preserve the artwork's pixel
origin, with rasterization limited to shape bounds plus glyph/sampling padding.
Presentation clips to the union of old/new bounds. Endpoint cells remain
synchronous; presentation is RAF-batched, with explicit release/cancel flushes
and the pointer-release endpoint included in the commit. Preview-only updates
also avoid thumbnail generation. Temporary bitmap/vector renders neither borrow
nor consume the main canvas's dirty state, so animation-preview draws cannot hide
pending offscreen updates. Vector compositing partitions whole destination pixels
with identical blit origins, avoiding fractional-edge seams; full vector raster
redraws clear complete touched pixels to prevent low-zoom alpha accumulation.
Unchanged visible bitmap regions skip readbacks even when offscreen cells remain
dirty. R3's independent thumbnail rendering now also removes the former full
bitmap artwork flush on release for offscreen thumbnail correctness.

Source tests cover sparse work, batching, final commits, cancellation, mirrored
cells, disabled drawing channels, and visible bounds. Chromium/Firefox tests
compare bounded rendering against a full-visible-preview control for bitmap and
vector layers, including transparent backgrounds, shrink/move/cancel, low and
fractional zoom, odd-sized vector tiles, opacity/blending, pan, and undo/redo.
Interleaved animation-preview and shape draws preserve offscreen invalidation.
Source tests also cover same/other-frame scratch renders and failed renders.
Operation counts verify no artwork
rasterization during warm preview moves and bounded shape work as documents grow.
The observations below describe the original bug, not new timing measurements.

**Location:** [shapes.js:63–80](../../src/js/textMode/tools/shapes.js#L63-L80),
[336–386](../../src/js/textMode/tools/shapes.js#L336-L386);
[layerGrid.js:3445–3451](../../src/js/textMode/layers/layerGrid.js#L3445-L3451);
[graphic.js:1530–1550](../../src/js/textMode/graphic.js#L1530-L1550).

Each new rectangle endpoint calls `clearGrid()`, which resets every shape cell.
The `shapes` flag forces `LayerGrid.draw()` to use `allCells = true` for artwork.
`Graphic.drawFrame()` additionally draws the full-size shape canvas with
`allCells: true`. The destination viewport/clip does not constrain this upstream
CPU work.

**Observed:** moving a roughly 3–4-cell-wide rectangle on the largest fixture
causes **two 4,096,000-pixel read/write pairs**, one for artwork and one for shapes.
Median call duration was 56.9 ms. Increasing offscreen document dimensions, not
shape size, drives this cost.

**Fix:** retain a separate shape-preview layer and track the union of its old and
new bounds. Clear/rasterize only that union; keep untouched artwork cached. Use a
sparse touched-cell list or bounded scratch storage instead of resetting the
entire shape grid. Coalesce endpoint presentation to one update per RAF without
losing the final endpoint or the actual committed cells.

**Regression check:** shape work should scale with old/new shape bounds and
visible intersections, not total document area. Cover transparent backgrounds,
shape shrink/move/cancel, vectors, and mirroring.

### R3 — P1: thumbnail generation dominates otherwise cheap pencil edits

**Status: fixed.** `GridView2d.draw()` now requests a coalesced 100 ms thumbnail
batch instead of synchronously resampling. This shared boundary covers both
`Graphic.redraw()` and direct typing/palette-editor draws. Grid thumbnails are cached by current
frame/content, shared tile/palette/block revisions, dimensions, reference images,
and render settings; pan/zoom, selection overlays, and onion-skin presentation
are not thumbnail dependencies. The batch checks all grid layers, including
non-selected layers, without resampling unrelated reference-image layers.
Pointer/touch release, undo/redo, and explicit display callers flush final state;
frame changes enter the same scheduled batch. Document loading cancels pending
work, and batches resolve live layer objects to avoid drawing deleted layers.

A complete, current bitmap artwork raster can supply the thumbnail directly.
Otherwise, thumbnail cell damage is tracked independently of viewport dirtiness.
Warm edits repair whole thumbnail pixels using a cropped, shared scratch raster,
with filter/glyph padding and a world-aligned sampling origin. A shared
full-image scale transform preserves filter alignment across crops; independently
scaled destination rectangles caused the small onion-thumbnail mismatch found
in the workflow follow-up. Reference images also use the crop's world origin. Offscreen dirtiness, omitted backgrounds or
selections, and viewport-sized vector artwork no longer force repeated full-layer
thumbnail rasters. The fallback neither consumes viewport invalidation nor
includes transient previews, and removes R2's thumbnail-driven full-artwork redraw
on shape release. Only the small thumbnail is cached per layer. Cold caches,
frame changes, and bulk/shared dependency invalidation can still require a full
raster at the batch/flush boundary; ordinary cell edits do not.

Source tests cover batching, explicit flushes, disabled drawing, replaced/deleted
layers, dependency invalidation, cached-source reuse, scratch isolation, and
bounded repairs/retries after failures. Chromium/Firefox tests verify that 64
edits produce zero synchronous thumbnail updates and one scheduled update, with
full-layer pixel equivalence after offscreen edits, pan/zoom, release, undo/redo,
frame and shared-dependency changes. Real typing and palette-editor handlers
publish without manual redraw/flush calls. Warm one-cell repairs at 40×25,
160×100, and 320×200 cells count actual bitmap readback pixels/vector glyph visits
and bound scratch area, including onion skin and cropped reference images;
counting only thumbnail-update calls would miss full-raster regressions.
The observations below describe the original bug, not new timing measurements.

**Location:** [graphic.js:905–922](../../src/js/textMode/graphic.js#L905-L922);
[layers.js:1915–1930](../../src/js/textMode/layers/layers.js#L1915-L1930);
[layerGrid.js:2323–2397](../../src/js/textMode/layers/layerGrid.js#L2323-L2397).

Every `Graphic.redraw()` immediately calls `updateLayerPreview()`. That method
composites the thumbnail background and downsamples the layer canvas to at most
80×48 pixels, even if the caller only needs an interactive artwork update.
There is no thumbnail revision check, scheduling, or batching at this boundary.
The thumbnail's **dimension guard already works**; repeated resizing is not the
problem here.

**Observed:** every pencil call generated a thumbnail. Temporarily replacing just
`LayerGrid.updatePreview()` with a no-op reduced the largest fixture's median
from **3.5 ms to 0.3 ms**, while the artwork still read/wrote only 64 pixels.
Removing the grid instead left it at 3.1 ms. This is stronger evidence than
assuming the grid or pixel loops dominate ordinary pencil input.

**Fix:** mark a thumbnail dirty on content changes and update it on a lower-rate
schedule, on pointer release, or when needed for display/save. Flush final state
explicitly. Preserve a small cached thumbnail and skip updates for view-only
changes. Keep full-layer resampling out of each synchronous pointer update.

**Regression check:** many edits in one presentation interval should yield one
thumbnail update, with a correct final thumbnail after drawing/undo/frame changes.

### R4 — P1: tile animation discards the changed-tile information

**Status: fixed.** Each grid layer now keeps a lazy tile-to-cell region index per
frame, resolved through block definitions and C64 ECM glyph banks. Cell, frame,
dimension, blank-tile, mode, and block-revision changes invalidate the relevant
index. Disconnected uses remain separate coalesced regions. An animation tick
publishes its complete changed-tile set once, then invalidates only matching
current/onion-frame regions in layers that share the tile set. Offscreen-only
damage remains pending without repainting the visible canvas. Unused tiles cause
no artwork redraw. Per-frame tile revisions keep unrelated onion rasters and
layer thumbnails valid, while affected onion rasters are patched in place and
hidden-layer thumbnails are still scheduled. Pixel drawing, fills, and provisional
shape replacement use the same batched, targeted invalidation path.

Tile palettes, geometry, and the current brush are updated once for the full tick
rather than once per animated tile. Source regressions cover unused/used tiles,
separate layers/tile sets, usage-cache rebuilds, onion skin, block and ECM
resolution, cache-key changes, local and hidden preview dependencies, disconnected
regions, restored shape tiles, onion patching, and batching. Chromium and Firefox
tests instrument the real artwork canvas and verify zero artwork work for unused
and offscreen-only tiles plus separate one-cell raster/clip regions for distant
uses. The observations below describe the original bug, not new timing measurements.

**Location:** [tileSet.js:2991–3131](../../src/js/textMode/tileSet/tileSet.js#L2991-L3131),
[4009–4068](../../src/js/textMode/tileSet/tileSet.js#L4009-L4068);
[layerGrid.js:628–1068](../../src/js/textMode/layers/layerGrid.js#L628-L1068);
[graphic.js:863–1002](../../src/js/textMode/graphic.js#L863-L1002),
[1262–1443](../../src/js/textMode/graphic.js#L1262-L1443);
[gridView2d.js:3425–3439](../../src/js/textMode/gridView2d.js#L3425-L3439),
[3855–4051](../../src/js/textMode/gridView2d.js#L3855-L4051);
[pixelDraw.js:282–367](../../src/js/textMode/tools/pixelDraw.js#L282-L367).

`TileSet.update()` knows exactly which characters changed, but calls
`invalidateAllCells()` for all grid layers and
`redraw({ animatedTilesOnly: true })`. `GridView2d.draw()` sets its own
`animatedTilesOnly` to `false`; `Graphic.drawFrame()` also does not pass a useful
animated-cell restriction to the bitmap layer draw. The apparent optimization
flag does not limit the actual raster work.

**Observed:** blinking tile 255, unused by the artwork or current brush, caused
49,152 artwork pixels to be read/written in the larger fixtures on every update,
plus brush/palette rendering and a thumbnail update. No artwork pixels needed
to change. Rasterization is still viewport-bounded here; this is **not** a claim
that every animation tick rasterizes the entire offscreen document.

**Fix:** maintain tile-to-cell/chunk usage information per layer/frame. Use the
changed tile IDs to invalidate only dependent visible regions and relevant
previews. An unused tile should not invalidate artwork. Batch all tile changes
for a tick before drawing palettes or the current brush; see R7. The pixel-drawing
path formerly had the same broad invalidation and now publishes restored and new
shape tiles through one targeted batch.

The tile update loop also scans the complete tile set on each animation tick,
even when no tiles are animated. An active-animation set is a secondary, simpler
optimization; the redraw fan-out is the more consequential issue.

**Regression check:** an unused animated tile causes zero artwork rasterizations;
a tile used in one region invalidates that region, not unrelated layers.

### R5 — P2: animation preview rebuilds unchanged frames and resets scratch canvases

**Status: fixed.** `AnimationPreview` now keeps a three-entry least-recently-used
cache of full preview composites. Keys cover frame/content identity, per-frame
cell revisions, only the selective tile revisions used by that frame, palette
and block revisions, dimensions, background visibility, layer order/visibility,
opacity, compositing, and reference-image identity. This keeps the cache bounded
for long animations while allowing short loops to reuse completed composites.
One-frame ranges now skip unchanged duration ticks but still redraw when a
dependency changes. Preview rasters explicitly omit onion skin and editing
overlays and continue to use disposable layer canvases, so they do not consume
main-viewport invalidation.

The legacy `Grid2d.drawFrame` path now guards temporary-canvas dimensions and no
longer allocates or resets the disabled effect canvas. Source tests cover warm
cache hits, dependency refreshes, bounded eviction, one-frame ticks, and canvas
size writes. Browser coverage checks zero warm cell rasterizations/size resets
and pixel equivalence after a content change and forced fresh render. The
observations below describe the original bug, not new timing measurements.

**Location:** [animationPreview.js:240–405](../../src/js/textMode/animationPreview.js#L240-L405),
[416–469](../../src/js/textMode/animationPreview.js#L416-L469);
[grid2d.js:714–740](../../src/js/textMode/grid2d.js#L714-L740),
[796–827](../../src/js/textMode/grid2d.js#L796-L827).

`AnimationPreview.draw()` always requests all cells through the older
`Grid2d.drawFrame` path. That path unconditionally assigns both dimensions of
`effectCanvas` and `tempCanvas`. Assigning the existing canvas dimensions still
resets its bitmap/context state and may reallocate backing resources. The effect
canvas is reset despite its effect branch being disabled.

The non-main-playback branch calls `draw()` whenever the duration expires, even
when a one-frame range wraps back to the same unchanged frame.

**Observed:** each same-frame preview call resets **four unchanged dimensions**,
rasterizes all 4,096,000 artwork pixels in the largest fixture, and scales the
result onto a 320×200 output canvas. Median was 43.7 ms. This timing includes the
full redraw; it does **not** isolate the cost of the dimension assignments.

**Fix:** guard scratch dimensions and remove unused effect-buffer work from this
path. Cache preview frames by content/tile/palette revision and render options;
do not redraw an unchanged one-frame range. For long animations, use a bounded
cache rather than retaining every full-resolution frame. Keep preview rendering
from consuming the main viewport's invalidation state.

**Regression check:** repeated unchanged preview draws perform no cell rasterization
or size resets after warmup; changing a dependency refreshes the preview.

### R6 — P2: clipped grid painting still constructs offscreen grid paths

**Location:** [gridView2d.js:2428–2598](../../src/js/textMode/gridView2d.js#L2428-L2598),
[3913–3945](../../src/js/textMode/gridView2d.js#L3913-L3945).

The composite is clipped for pencil edits, but `drawGrid()` still loops over grid
lines for the document, not the clip. Its negative-origin adjustment has the
wrong sign: adding `-ceil(-gridXStart / gridCellWidth) * gridCellWidth` moves an
already negative start **farther offscreen**. The same pattern exists for Y and
block divisions. End coordinates are not clamped to the viewport either.

**Observed:** one-cell pencil edits at zoom 8 generated **783 / 3,411 / 6,921
`lineTo` calls** as document size grew, although the viewport size stayed fixed.
At zoom 3.5 the corresponding counts were 71 / 364 / 754. Browser clipping cannot
remove the JS loop iterations and path construction that already happened.

**Fix:** calculate the first/last line indices from the intersection of artwork,
viewport, and dirty bounds, with appropriate stroke padding. Alternatively use a
small, world-aligned repeating grid pattern. Preserve fractional zoom/DPR
alignment. Do not reintroduce an additional full-device-resolution grid canvas
just to cache unbounded geometry.

**Regression check:** for fixed viewport and dirty region, grid command count
must remain bounded when offscreen document dimensions grow. Preserve existing
fractional-scale grid-contrast tests.

### R7 — P2: a one-tile palette update scans and uploads whole palettes

**Location:** [tileSet.js:3063–3090](../../src/js/textMode/tileSet/tileSet.js#L3063-L3090);
[tilePaletteDisplay.js:955–960](../../src/js/textMode/tileSet/tilePaletteDisplay.js#L955-L960),
[1153–1250](../../src/js/textMode/tileSet/tilePaletteDisplay.js#L1153-L1250),
[1316–1344](../../src/js/textMode/tileSet/tilePaletteDisplay.js#L1316-L1344).

`updateCharacter()` redraws both palettes for each changed tile. Passing
`tiles: [character]` avoids most bitmap glyph rasterizations, but the display still
recreates `tileLocations`, visits all palette slots, does membership checks, and
uploads the entire `tilePaletteImageData`. For A animated tiles and T palette
slots, this creates roughly A full palette traversals/uploads per tick instead
of one batched update.

**Observed:** animating one tile uploaded 100,870 pixels to the bottom palette and
102,060 to the side palette, separately from artwork and brush updates.

**Static vector issue:** the vector branch at
[tilePaletteDisplay.js:1244–1315](../../src/js/textMode/tileSet/tilePaletteDisplay.js#L1244-L1315)
does not honor `drawTile`; the selective guard is only in the bitmap branch.
Vector palette updates therefore also repaint unchanged glyphs. No vector timing
was collected.

**Fix:** batch changed IDs once per tick/edit, retain layout maps until layout
changes, update only affected slot rectangles, and use dirty-region uploads or
tile blits. Honor the same restriction for vector glyphs and avoid drawing hidden
panels. Large change sets should use a set or direct tile-to-slot lookup instead
of repeated `indexOf` scans.

**Regression check:** one changed tile should not upload the whole palette;
multiple changed tiles should not each trigger separate full palette traversals.

### R8 — P2: bitmap rasterization mixes canvas readback with per-pixel JS work

**Location:** [layerGrid.js:3805](../../src/js/textMode/layers/layerGrid.js#L3805),
[4073–4238](../../src/js/textMode/layers/layerGrid.js#L4073-L4238).

Each nonempty bitmap draw reads the destination canvas into a new `ImageData`,
loops through cells/pixels in JavaScript, branches on screen mode and orientation,
then calls `putImageData`. Identical glyph/color/orientation combinations are
expanded again across cells. Indexed and NES paths perform palette lookup/channel
extraction inside the pixel loop.

The API calls and buffer sizes are measured above. **GPU stalls, allocation/GC
share, and the relative cost of inner-loop branches were not separately measured.**
`getImageData` can force synchronization depending on the browser's canvas backend;
there is no basis here to label all of it GPU readback.

**Fix after R1–R5:** choose a consistent representation for the hot path:

- Retain CPU pixel buffers/dirty chunks when CPU rasterization is needed, avoiding
  reading back pixels the renderer already owns.
- Or cache bounded tile rasters/atlases keyed by tile revision, colors, mode, and
  orientation, then blit repeated tiles. Invalidate palette/animation dependencies.
- Specialize mode loops and precompute RGBA palette lookup tables before considering
  lower-value arithmetic tweaks.

Reference-image compositing, transparency, and selections need explicit treatment;
blindly replacing `getImageData` with blank `ImageData` would lose content. Benchmark
`willReadFrequently` only on read-heavy scratch contexts, not on every visible
canvas. It can change backend trade-offs rather than universally improve speed.

### R9 — P2: 3D rendering scales with grid volume and object count while idle

**Static evidence; not browser-profiled in this review.**

**Locations:** [ui.js:1534–1560](../../src/js/ui/ui.js#L1534-L1560);
[gridView3d.js:1334–1372](../../src/js/textMode/gridView3d.js#L1334-L1372);
[grid3dLayer.js:689–811](../../src/js/textMode/grid3dLayer.js#L689-L811),
[1498–1569](../../src/js/textMode/grid3dLayer.js#L1498-L1569);
[gridView3d.js:1177–1203](../../src/js/textMode/gridView3d.js#L1177-L1203).

Unlike the 2D artwork path, each enabled 3D viewport renders every RAF. Before each
render it selects visibility using `showAll`, `showOnlyXY`, or `showOnlyXZ`. Those
methods walk **width × height × depth**, including empty cells, and rewrite mesh
visibility. Multiple views repeat the walks and mutate the same scene's state.

Each occupied cell has a mesh, with an extra foreground mesh when it has a
background. Geometry/materials are shared, but scene traversal and draw calls are
not batched. Perspective picking additionally tests every occupied-cell box on
pointer movement; it has no grid traversal/spatial broad phase.

**Fix:** introduce scene/camera/animation dirtiness, render idle views on demand,
and represent visibility with slice/chunk groups or camera masks rather than
full-volume rewrites. A per-view cache must account for shared scene state; simply
skipping a visibility reset after another viewport changed it is incorrect.
Evaluate instancing grouped by geometry/material and grid-DDA picking or a spatial
index. Iterate occupied cells rather than a dense mesh grid where possible.

**Validate before prioritizing a rewrite:** profile sparse and dense volumes with
one versus three views; record idle CPU, visibility visits, `renderer.info.render.calls`,
and picking time separately. This review does not claim a measured 3D FPS limit.

### R10 — P2: shader-effect previews round-trip through CPU memory

**Static evidence; not browser-profiled in this review.**

**Location:** [shaderEffects.js:100–138](../../src/js/shaderEffects/shaderEffects.js#L100-L138),
[183–216](../../src/js/shaderEffects/shaderEffects.js#L183-L216).
Active export call site:
[exportImage.js:1335–1338](../../src/js/textMode/export/exportImage.js#L1335-L1338).

`applyEffects()` copies the source into a texture canvas, requests a texture
upload, runs the GPU passes, synchronously calls `readRenderTargetPixels`, flips
the result with a nested per-pixel JavaScript loop, then uploads it to a 2D canvas.
That defeats much of the benefit of keeping an interactive preview on the GPU.

The source texture backing also starts at 1024×1024 and grows in square steps.
A 320×200 input therefore uses a source texture with **16.384× as many texels**;
wide, short inputs can be especially wasteful. This is a size calculation, not a
measured transfer cost.

**Fix:** display GPU output directly for live previews and read back only when a
CPU export/encoder actually requires pixels. Use appropriately sized textures
with compatible filtering/wrapping/mipmap settings rather than unconditional
square backing. If readback is necessary, replace the byte-by-byte vertical flip
with row copies or an appropriate final-pass orientation.

**Regression check:** slider/animated preview updates should not require CPU
readback; exported images must preserve orientation, alpha, and effect output.

## Optimizations already present — preserve them

- `g_newSystem` is enabled. `GridView2d.render()` checks artwork/overlay dirtiness
  before drawing. The browser idle probe confirms this; a claim of unconditional
  full 2D redraw every RAF would be wrong.
- Pencil updates already propagate cell dirty bounds, clip the artwork/grid
  composite, and use a separate transparent DOM overlay for transient UI.
- Bitmap layer drawing normally intersects dirty cell ranges with view bounds
  and skips empty updates. R1/R2/R4 describe paths that defeat those mechanisms.
- Layer thumbnails already avoid redundant dimension assignments; R3 concerns
  their scheduling/resampling, not canvas resizing.
- Vector glyph `Path2D`s are cached in
  [tileSet.js:301–316](../../src/js/textMode/tileSet/tileSet.js#L301-L316).
  Geometry and palette materials are shared in 3D. Neither needs to be invented
  as though it were absent.
- Existing [browser renderer tests](../../tests/browser-support.spec.mjs) cover
  dirty presentation, fractional scaling, contrast, and overlay separation;
  [thumbnail tests](../../tests/layer-thumbnail.test.mjs) cover sizing guards.
  Reuse those visual constraints when optimizing.

The perpetual global RAF and unconditional checkerboard under opaque artwork are
additional opportunities, but the measured full-frame/thumbnail paths warrant
attention first. An editor still needs scheduled ticks for animation, selection
marching ants, typing cursors, scripting, and active 3D camera motion.

## Recommended sequence and validation

1. **Cache/invalidation fixes:** R1, R3, and R5 dimension guards. Add operation-count
   tests alongside visual equivalence checks; these are narrower than changing
   render backends.
2. **Bounded work:** R2, R4, R6, and batched palette updates from R7. Introduce a
   render scheduler that unions pending dirty regions and presents once per RAF.
   Keep document commands/history lossless and provide explicit synchronous flushes
   for export/screenshots; do not drop input samples to reduce paint count.
3. **Representation changes:** profile again before implementing tile atlases,
   CPU-buffer ownership, Workers, 3D instancing, or GPU-only effects previews.
   Moving wasteful full-frame work into a Worker does not remove the work or the
   transfer cost.

Cross-profile browser tests guard user-visible startup time. The new opt-in
[workflow harness](workflows.md#reproduce) records same-host drawing diagnostics
and raw evidence, but does not establish a maintained cross-host timing budget.

A useful follow-up matrix includes ordinary/diagonal pencil strokes, pixel edits,
small/large shapes, onion skin, one/many animated tiles, preview playback, pan/zoom,
1/8/32 layers, raster/indexed/NES/vector modes, and DPR 1/2. Repeat on Firefox,
Safari, and a real lower-end mobile device; use throttled Chromium as an additional
signal, not a substitute. Record p50/p95 input-to-paint, long tasks, buffer bytes,
allocation/GC, and draw counts. Preserve undo/redo, transparency, layer blending,
reference images, offscreen edits revealed by panning, and export equivalence.

## Revalidation

Recreate measurements against a fresh production build before using these
historical numbers for a decision. A replacement harness should record its exact
commit, browser, host, viewport, source-map verification, raw samples, and canvas
operation counts. It should use isolated throwaway projects, block external
requests, and keep diagnostic controls separate from correctness-preserving
variants. Promote a result to a checked-in budget only when the environment and
the decision it gates have a maintained owner.
