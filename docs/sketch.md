# Sketch layers

Status: UX proposal

Updated: 2026-09-10

## Recommendation

Add a third 2D layer type, **Sketch**, for loose freehand guides that can be
traced with symbols on a grid layer. A sketch is editable, saved in the project,
ordered in the existing Layers panel, and deliberately excluded from normal
output.

The intended workflow is:

1. Choose **New Layer → Sketch Layer**.
2. Draw an outline without being constrained to the tile grid.
3. Add or select a text/grid layer above the sketch.
4. Trace the outline with the existing tile tools.
5. Hide the sketch, or hold **Tab** to preview the clean artwork.
6. Export normally; the sketch is not included.

This should feel like tracing paper inside lvllvl, not like a small general
purpose painting application.

## Why this shape fits lvllvl

The current layer system already has most of the correct mental model:

- layers have order, visibility, opacity, blend mode, names, and thumbnails;
- a new layer is inserted above the selected layer;
- grid layers contain the output artwork and reference-image layers provide a
  non-grid visual source;
- grid layers are frame-aware while reference images are document-wide; and
- the renderer already composites layer canvases in order.

However, neither current type has the right behavior for a sketch:

- Drawing on a grid layer snaps every mark to a tile and changes the artwork.
- A reference-image layer can display a drawing made elsewhere, but cannot be
  drawn on or erased in lvllvl. Aseprite makes the same useful distinction:
  its [reference layers](https://www.aseprite.org/docs/reference-layer/) are
  visible but cannot be drawn on or edited.
- Treating the sketch as a generic image layer would make export behavior and
  editability ambiguous.

A separate type lets the UI state a strong promise: a sketch helps construct
the artwork but is not the artwork.

## Core UX

### Creating a sketch

Turn **New Layer** into a menu rather than adding another permanent button to
the already narrow Layers panel:

```text
+ New Layer
  ├─ Text/Tile Layer…
  ├─ Sketch Layer
  └─ Reference Image…
```

**Text/Tile Layer…** opens the existing properties dialog. **Sketch Layer** is
a quick action with useful defaults and no modal dialog. **Reference Image…**
can initially remain in its current location, but placing the existing action
here eventually makes all layer creation discoverable in one place.

On mobile, use the same choices in a bottom sheet after tapping **New Layer**.
Do not squeeze three small targets into the layer dialog.

Creating a sketch should:

- insert it directly above the selected layer, consistent with existing layer
  creation;
- name it `Sketch 1`, `Sketch 2`, and so on;
- select it;
- select the Sketch Pencil tool; and
- show one dismissible, anchored hint: “Draw your guide here. Add a text layer
  above it when you are ready to trace. Sketches are not exported.”

The hint should contain an **Add text layer above** action. It teaches the main
workflow without making that special-purpose action permanent UI.

### Identifying a sketch

In the Layers panel, a sketch row should retain the normal visibility eye,
thumbnail, label, drag ordering, and selection state. Add two small signals:

- a pencil badge next to the name; and
- a blue accent on the thumbnail or row edge.

Do not tint the whole row blue; the existing selected-layer blue must remain
unambiguous. The accessible name should include the type, for example
“Sketch 1, sketch layer, visible”.

Opacity remains in the existing Layers panel and is the main way to fade a
guide while tracing. Default layer opacity should be **50%**. The blend-mode
control should be disabled at **Normal** for the first version; blend modes add
little to tracing and can make a supposedly harmless guide hard to reason
about.

### Tools while a sketch is selected

Selecting a sketch layer changes the active editing context. Replace tile-only
tool controls with a compact Sketch tool set in the existing tool area:

```text
[Pencil] [Eraser]   Size [ 2 px ]   Color [blue]   Smoothing [10%]
```

Keep **Hand**, **Zoom**, undo, redo, and view controls available. Tile palette,
tile orientation, foreground/background cell color, fill, type, marquee, and
shape controls should be visibly unavailable while the sketch is selected.
Prefer replacing or collapsing their content to leaving enabled-looking
controls that silently do nothing. Avoid moving the canvas when the context
changes.

Use the existing contextual shortcuts where possible:

- the current Pencil shortcut selects Sketch Pencil;
- the current Eraser shortcut selects Sketch Eraser;
- Hand and Zoom keep their current shortcuts; and
- undo and redo operate on complete strokes.

The toolbar label must say **Sketch Pencil**, not only **Pencil**, because the
existing Pencil stamps symbols on a grid layer.

### Drawing behavior

The drawing surface is the artwork rectangle, independent of the tile grid.
Marks are clipped at the artwork bounds and move and zoom with the artwork.

Recommended initial behavior:

- Draw one continuous stroke from pointer down to pointer up.
- Show the stroke with minimal latency while it is being drawn.
- Make each completed stroke one undoable history action. Never create one
  history action per pointer movement.
- Use round caps and joins so quick outlines do not have broken corners.
- Offer brush sizes from 1–32 artwork pixels, with 2 px as the default.
- Use one solid color per stroke. Default to a visible sketch blue, such as
  `#5ab0ff`; remember the last chosen sketch color and size for the user.
- Apply light smoothing by default. Too much stabilization makes a planning
  stroke lag behind the pointer and stops it feeling like a pencil.
- If pressure is available, map it conservatively to width (roughly 50–100% of
  the chosen size). Mouse and touch input use a constant width.
- The eraser removes only sketch content. Its cursor shows its effective size.
- Panning or zooming must not accidentally leave a dot or short stroke.

Krita describes no smoothing as the fastest and best for detail, with stronger
stabilization useful for shaky or long lines; Procreate similarly notes that
heavy motion filtering can remove expression. The suitable default here is
therefore a small amount of smoothing with an obvious off position, not a
delayed “rope” stabilizer. See the
[Krita freehand brush documentation](https://docs.krita.org/en/reference_manual/tools/freehand_brush.html)
and [Procreate stabilization settings](https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings).

For pen and touch input:

- use the browser Pointer Events model for mouse, pen, and touch;
- retain pointer capture for the duration of a stroke;
- process coalesced points when available, falling back to ordinary pointer
  moves; and
- ignore touch drawing while a pen is active and briefly after pen-up to reduce
  palm marks.

The Pointer Events specification explicitly provides normalized pressure and
coalesced samples; the latter improve the fidelity of fast drawing strokes.
See the [W3C Pointer Events specification](https://www.w3.org/TR/pointerevents/).

### Moving from sketch to symbols

When the user selects or creates a grid layer, lvllvl restores the last tile
tool and its settings. The sketch stays visible underneath at its chosen
opacity, but receives no input because it is not selected.

If the newly selected grid layer is below a visible sketch, show a small
non-modal notice in the Layers panel: “This layer is below Sketch 1” with a
**Move above** action. Do not automatically reorder existing layers; the order
may be intentional.

The normal eye icon is enough to hide the guide. Holding **Tab** should also
temporarily hide every sketch layer because Tab is the clean artwork preview.
This makes checking the final result immediate without changing persistent
visibility.

### Saving, previewing, and export

Sketch strokes are project content and must participate in normal project save,
autosave, undo/redo, layer duplication, layer deletion, and layer ordering.

Sketches should be excluded by default from:

- PNG, GIF, SVG, sprite, assembly, binary, and other artwork exports;
- copy-as-image;
- animation preview and playback output;
- Tab’s clean artwork preview;
- fill, eyedropper, selection, and color-reduction sampling; and
- merge-layers operations.

This is a deliberate semantic rule, not an incidental consequence of exporters
currently checking only for `grid` and `image`. Clip Studio’s
[draft layers](https://help.clip-studio.com/en-us/manual_en/180_layers/Draft_layers.htm)
establish a useful precedent: the guide can remain visible in the editor while
being excluded from fills, selections, printing, and export.

The project file should preserve sketches even though ordinary artwork exports
omit them. A later **Export sketches** option can be added to a dedicated
workflow if users need it; adding an “Include sketches” checkbox to every
export dialog would create noise and weaken the safe default.

## Frames and animation

For the first version, a sketch is **document-wide and shown on every frame**,
matching the current reference-image behavior. This serves the proposed use
case—a structural outline beneath text art—with the least surprise and the
least timeline UI.

Make this scope visible in the layer tooltip and properties: “Guide shown on
all frames.” Creating, deleting, or duplicating an animation frame does not
alter the sketch.

Frame-local rough animation is a worthwhile later feature, but it needs a
complete design for blank versus held cels, frame duplication, onion skinning,
timeline indication, and conversion between global and per-frame scopes. It
should not be approximated by silently attaching a sketch to whichever frame
was active at creation time.

## Layer properties

Double-clicking a sketch row opens a small properties dialog with:

- name;
- layer opacity;
- visibility;
- a read-only first-version scope, “All frames”; and
- **Clear sketch…**, separated from ordinary properties because it is
  destructive.

Brush size, brush color, smoothing, and pressure response are tool preferences,
not layer properties. A layer contains strokes with the values that were active
when each stroke was made. Changing the current brush must not retroactively
change earlier marks.

Do not add a special “finished” or automatic lock state. Users commonly return
to adjust a guide. A general layer lock feature may be useful later, but should
apply consistently to grid, image, and sketch layers.

## Canvas and document changes

- **Canvas resize:** apply the same origin/offset rule as artwork content and
  clip strokes outside the new bounds. Do not silently stretch the sketch.
- **Tile-set or tile-size change:** keep stroke coordinates in artwork pixels;
  the relationship to the resized grid changes in the same way as other visual
  content.
- **Layer reorder:** the sketch composites at its exact list position; it is not
  forced to the top or bottom.
- **Layer duplicate:** copy the strokes and append “copy” to the name.
- **Delete layer:** use the normal confirmation and history behavior.
- **Project open in an older build:** unknown layer types should be preserved in
  the project data if possible and ignored for rendering, rather than discarded
  on the next save.

## Suggested representation and rendering

Store completed strokes, not a full PNG snapshot after every change. A minimal
shape is:

```js
{
  type: "sketch",
  visible: true,
  opacity: 0.5,
  scope: "document",
  strokes: [
    {
      tool: "pencil", // or "eraser"
      color: "#5ab0ff",
      size: 2,
      points: [{ x: 12.5, y: 8.25, pressure: 0.6 }, /* ... */]
    }
  ]
}
```

Coordinates and brush size are in artwork pixels, not screen pixels or tile
coordinates. Render strokes into a cached, transparent layer canvas and
composite that canvas through the existing ordered layer path. While drawing,
render only the active stroke into the interactive overlay; commit it to the
layer cache at pointer-up. Invalidate the thumbnail after the stroke completes,
not on every pointer sample.

This representation supports:

- one history entry per stroke;
- deterministic redraw after zoom, device-pixel-ratio, and project reload;
- efficient eraser replay without copying a full canvas into every undo entry;
- future pressure and frame-local scopes; and
- compact persistence after point simplification or delta encoding.

Keep a conservative upper bound on points per stroke and project-wide sketch
data. Simplify only after pointer-up with an error tolerance smaller than the
visible brush radius. Never make the rendered line jump when the stroke is
committed.

The implementation should use an explicit `sketch` branch in load, render,
preview, history, persistence, and export policy. It should not depend on the
fact that several current rendering and export paths whitelist only `grid` and
`image`; that would make future refactors prone to exporting guides by accident.

## States and edge cases

| State | Behavior |
| --- | --- |
| Empty sketch selected | Show Sketch Pencil and an unobtrusive “Draw a guide” empty-state hint. |
| Hidden sketch selected | Keep it selected, but block drawing and show “Layer is hidden” with **Show layer**. |
| Non-sketch tool active when sketch selected | Restore the last sketch tool; never stamp a tile into another layer. |
| Sketch tool active when grid selected | Restore the last grid tool; never add a sketch stroke to a grid layer. |
| Pointer leaves canvas mid-stroke | Pointer capture completes or cancels the stroke predictably. |
| Pointer cancellation / lost capture | Commit the valid sampled portion only if it exceeds a tap; otherwise discard it. |
| Single tap | Create a round dot of the selected brush size. |
| Undo during an active stroke | Cancel the active stroke, then undo the previous completed action. |
| Project switches while drawing | Cancel the active stroke and release pointer capture before disposing the editor context. |
| Export with visible sketch | Export remains clean; no warning is needed because exclusion is the contract. |
| 3D editor | Sketch-layer creation is unavailable; existing sketches are preserved for return to 2D. |

## MVP and follow-ups

### MVP

- Sketch layer creation, naming, ordering, visibility, opacity, thumbnail, save,
  duplicate, delete, undo, and redo.
- Freehand Pencil and Eraser with mouse, touch, and pen input.
- Size, color, light smoothing, and conservative pressure support.
- Document-wide scope.
- Explicit exclusion from output, sampling, merge operations, animation preview,
  and clean preview.
- Desktop and mobile creation/tool surfaces with accessible names and visible
  keyboard focus.

### Later, only after observing real use

- Layer locking.
- Straight line, rectangle, and ellipse sketch tools.
- Move/transform selected sketch strokes.
- Frame-local sketch cels and sketch onion skinning.
- A dedicated sketch export or rasterize-to-image command.
- Optional alternate sketch colors for multi-pass construction.

### Non-goals

- Automatic conversion or tracing from freehand lines to text symbols.
- Painting, fill, texture brushes, brush libraries, or blend-mode authoring.
- Editing individual vector nodes.
- Replacing reference images.
- Making sketch marks part of standard artwork exports.

## Validation plan

Before committing to the full implementation, test a clickable or thin working
prototype with these tasks:

1. “Make a rough house outline, then trace it using symbols on another layer.”
2. “See only the finished artwork, then return to editing the guide.”
3. “Export a PNG without the guide.”
4. “Correct the last two pencil strokes and fade the guide.”
5. On a tablet: “Draw, erase, pan, and zoom without accidental marks.”

Success signals:

- most new users find Sketch Layer from the Layers panel without instruction;
- users understand that a grid layer must be selected to place symbols;
- nobody expects a visible sketch to appear in a normal export;
- switching between sketch and grid layers does not cause accidental edits;
- a fast stylus stroke stays visually attached to the pointer and the canvas
  remains responsive; and
- undo removes exactly one perceived stroke at a time.

Instrument only coarse, local development measurements such as samples per
stroke, cache rebuild time, and frame time. No product telemetry is required to
answer the initial UX questions.

## Main risks

1. **Tool ambiguity.** Two tools called Pencil do different things. Solve this
   with layer-context switching and explicit “Sketch Pencil” labeling.
2. **Accidental output.** A guide unexpectedly appearing in an export would
   break trust. Make exclusion an explicit central policy and test it.
3. **Input latency.** A technically correct line that trails the stylus feels
   broken. Render the live stroke directly and smooth lightly.
4. **Project size.** Raw pointer streams grow quickly. Simplify completed
   strokes, cache raster output, and establish measured size limits.
5. **Feature creep.** General painting features would compete with lvllvl’s
   tile-art purpose. Keep the first version centered on rough outline, erase,
   fade, trace, and hide.
