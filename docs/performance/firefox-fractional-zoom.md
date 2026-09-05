# Glyph jitter at fractional zoom

## Reproduction and cause

The remaining jitter after `60e480117cab67767a23551d6ddce17d1d02dfe7`
is **inside repainted glyphs**, not movement of the grid or accumulation of the
cursor overlay. Reproduced with Playwright Firefox 153 on macOS using 8×8 bitmap
tiles at 225%. The 250% control stayed stable in that reproduction.

The rendering path is:

```
layer pixels -> nearest-neighbour zoom into CSS-sized back buffer
             -> integer device-ratio enlargement into base + grid
             -> 1:1 copy to front canvas
```

At fractional scales, destination pixel centres can fall exactly on source-pixel
boundaries: at 225%, destination centre 4.5 maps to source coordinate 2. Native
`drawImage()` sampling can resolve these ties differently depending on backend,
clipping, and intermediate image geometry. Identical source pixels, zoom, camera,
and destination coordinates can therefore produce different glyph edges on a
full versus dirty redraw. Disabling smoothing does not prescribe tie handling.

The initial 8×8/225% reproduction was specific to Firefox's accelerated Canvas 2D
path. Hiding the grid and cursor did not remove it; disabling
`gfx.canvas.accelerated`, requesting `willReadFrequently`, or using headless
Firefox did. Editor-canvas pixel readback also masked that accelerated case.

Review demonstrated why a backend-only workaround was incomplete:

- 9×9 tiles at 350%, cell `(21,12)`, DPR 2 still changed **24 device pixels** on
  an unchanged dirty redraw, including in headless/software Firefox.
- 9×9 tiles at 250% with camera X=1, and 8×8 tiles at 75% with camera X=101,
  also exposed dirty-clip sampling differences.
- Moving cursor scaling into a small scratch canvas introduced a **two-pixel**
  mismatch at 75%, DPR 1, in Chromium with GPU acceleration disabled. Merely
  matching the number of scaling stages does not ensure identical native sampling.

These controls locate the problem in native nearest-neighbour sampling rather
than document mutation. They do not establish a particular upstream shader/cache
implementation or Firefox bug number.

## Fix

`GridView2d.drawRasterImage()` explicitly chooses the source pixel for each CSS
pixel centre. Editor zooms are quarter steps, plus the 10% minimum, so their
coordinates can be represented as integer numerators over 4 or 10. Source-boundary
ties consistently choose the pixel to the right/below. The mapping uses the
original image origin, not a coordinate system rebased to the dirty rectangle.

Artwork and bitmap cursor previews share this sampler, including reductions,
odd tile sizes, cropped sources, and translated/panned origins. The callback
also covers bitmap onion skins, shapes, selections, and clipboard previews in
`Graphic.drawFrame()`. Other callers, including exports, keep native drawing.
Vector glyph rasterization retains its existing path.

The sampled RGBA image is composited in **one integer-positioned blit**, preserving
layer opacity, blending, transparency, and the dirty clip. Bitmap cursor previews
then receive the same integer device-ratio enlargement as the artwork. Offscreen
sources still retain native clearing semantics for modes such as `copy` and
`destination-in`.

The `willReadFrequently` workaround has been removed. Context allocation hints
are not a correctness requirement. Integer magnification with integer placement
uses a native fast path with no source readback or raster allocation: its pixel
centres cannot coincide with source boundaries.

### Work and memory bounds

Fractional zooms trade native resampling for explicit pixel selection. Source
readback is intentional production work, not a test mechanism to force a backend.
Only the visible dirty source footprint is read, in bands of at most 64 source
rows, avoiding a second full-source `ImageData` when zoomed out. Repeated sampled
rows are copied within the output buffer. The reusable output canvas and RGBA
buffer are bounded by the CSS viewport/dirty region, shared with cursor drawing;
large brushes cannot allocate a whole offscreen zoomed brush. Existing cached
artwork, dirty updates, and device-resolution compositing remain intact.

## Regression checks

- `tests/grid-raster.test.mjs`: independent pixel-centre oracle across zooms from
  10% through 350%, device ratios 1/2/3, fractional origins, source cropping,
  translated contexts and dirty bounds; bounded source reads and scratch storage;
  native integer fast path and offscreen/empty handling.
- `tests/browser-support.spec.mjs`: real pencil press/drag/release and unchanged
  full/dirty repaints at 75/225/250/275/350%, 8px and 9px tiles, panning and DPR 1/2,
  on Firefox and Chromium. Separate pixel tests cover multi-cell cursors and RGBA
  compositing with translations, clipping, opacity and nonlocal blend modes.

Run acceleration-sensitive screenshots on a GPU-capable desktop as well as CI:

```sh
npm run build
node --test tests/grid-raster.test.mjs
npx playwright test tests/browser-support.spec.mjs \
  --project=firefox-desktop --project=chromium-desktop \
  --grep 'repainted glyphs' --headed
```

There is no test-side readback of editor canvases before these screenshots.
Headless CI can now exercise the independent sampler oracle and the software-path
regressions too, but should not replace the headed browser check. The older 350%
untouched-region test remains useful for ensuring drawing does not disturb other
cells; it could not detect instability inside the cell being repainted.
