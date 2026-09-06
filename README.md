# lvllvl

lvllvl is a browser-based editor for tile-based graphics, text-mode art, and
retro-computer formats. It provides tools for drawing tile maps, editing character
sets and colour palettes, building frame animations, importing images, and
exporting artwork or data for further use.

This community-maintained fork continues the
[original lvllvl project](https://github.com/jaammees/lvllvl) with a focus on
modernizing the application, fixing long-standing problems, and adding practical
features without disrupting established creative workflows.

## What this fork improves

- **SVG export:** export text-mode, C64 standard, C64 ECM, and vector artwork as
  scalable geometry, with correct layer dimensions and transparent backgrounds.
- **Faster, smoother editing:** focused redraws, cached onion-skin frames, batched
  thumbnails, and lighter shape previews reduce unnecessary work while drawing,
  selecting tiles, panning, and animating. The large image importer is loaded only
  when it is needed, improving initial startup.
- **Crisp rendering at more zoom levels:** artwork, cursors, shape previews, and
  C64 tiles stay aligned at fractional zoom and across different display pixel
  ratios, with specific stability fixes for Firefox.
- **Tile palettes that fit the workspace:** the bottom and side palettes have
  independent Fit-to-width modes, precise percentage controls, fractional scales,
  and stable spacing for narrow panels, large tile sets, and non-square tiles.
- **More reliable browser projects:** saves and autosaves preserve in-memory edits
  when storage fails, publish versioned project data safely, and recover
  interrupted save, catalogue, and cleanup operations.
- **More dependable image importing:** retryable loading, safe cancellation,
  coordinated dialogs, and restored animation playback make import failures less
  disruptive.
- **Momentary artwork preview:** hold **Tab** with the pointer over the 2D canvas
  to hide panels, grids, and editing guides and see the complete artwork centred.
- **Zen Mode and a more flexible interface:** choose **Interface → Zen Mode** or
  press **Alt+Shift+Z** to hide editor chrome while keeping shortcuts active.
  Hover the top, left, right, or bottom edge to reveal stacked menus, tools, side
  panels, and the timeline without moving the canvas.
- **A safer, better-tested web app:** current browser coverage, production startup
  and performance budgets, stricter content security, and audited runtime
  dependencies make releases more predictable across desktop, phone, and tablet.

See the [changelog](CHANGELOG.md) for the complete release history and detailed
fixes.

## Project status

Modernization is ongoing. GitHub, Gist, and Google Drive integrations are
temporarily disabled pending a reviewed server-side credential design.

## Development

Want to run lvllvl locally or contribute? See the
[development guide](docs/development.md) for setup, build and test commands,
architecture notes, browser support, and dependency-maintenance procedures.

## License

This maintained version of lvllvl adopts the [MIT License](LICENSE) for new
contributions and for material that the current contributors have authority to
license.

The inherited project has an important licensing caveat. The original repository
did not include an explicit project license, and its original author, James, passed
away before the [license question](https://github.com/jaammees/lvllvl/issues/1) was
resolved. That discussion records the community's understanding that he intended
the published source to be used, hosted, and continued, but it is not itself a
formal license grant. The licensing provenance of inherited code therefore remains
unresolved. Third-party components also retain their own license terms and notices.
See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the reviewed inventory.
