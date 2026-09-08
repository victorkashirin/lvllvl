# UI review — HTML structure, CSS, colours

Method: built `dist` (v0.498.0), ran the app at 1440×900, inspected the live DOM
(2D project open + Keyboard Shortcuts dialog), measured computed styles/geometry,
and read `src/css/ui.css`, `src/css/main.css`, `src/css/old.css`,
`src/css/ui-mobile.css`, `src/js/ui/*.js`, `src/html/**/*.html`.
Screenshots: start page, main editor, shortcuts dialog (see `/tmp/ui-*.png`).

Legend: **P0** — broken/invalid or accessibility barrier. **P1** — visible
inconsistency users will notice. **P2** — dead code / maintenance hazard.

---

## P0 — HTML structure / accessibility

1. **Duplicate `id`s in the live DOM (invalid HTML).** Measured 16 duplicated
   id patterns on one screen: `toolsPanel:2`, `toolIconHolder:2`,
   `borderColor:2`, `backgroundColor:2`, `toolIconsScrollTop/Bottom:2`,
   `toolIconHolderMobile:2`, `cellForegroundColorMobile:2`,
   `tileEditorC64Color-background:3`, `pixelToolSettingsSubPaletteColor-0..3:2`,
   `pixelToolSettings-c64multicolor:2`, `colorPaletteEditorLoad:2`,
   `tileMaterialControls:2`. Breaks `label[for]`, `querySelector`, and AT.
   Source: panels rendered twice (desktop + mobile / main + dialog) reusing the
   same template ids instead of classes or suffixed ids.
2. **Icon-only buttons and images have no accessible names.** 37/196
   `button`/`.ui-button` with no text/title/aria-label; 182/187 `img` without
   `alt`. Tool palettes, panel close buttons and tile controls are invisible to
   screen readers.
3. **36/179 inputs without a label.** `input`/`select`/`textarea` reachable only
   by placeholder, `title`, or nothing (frame controls, palette numeric fields).
   Add `<label for>` or `aria-label`.
4. **Heading hierarchy is broken.** Live DOM order is roughly
   `H3×8 → H2×4 → H3 → H3 → H4×2 → H3 → H1(lvllvlplus, hidden start page) →
   H2 → H2 → H3`. Dialog titles (`.ui-dialog-titlebar-heading`) are `div`s, not
   headings; `H4 Filters/Instruments` sit outside any section.
5. **Menus/dialogs use opaque auto-ids and flat body placement.** ~30
   `.ui-menu` divs (`#ui216`…`#ui740`) and 5 hidden `.ui-dialog`s
   (`#ui761`…) are direct `body` children with no `role`/`aria-label`, and all
   dialogs stay mounted (zero-size) when closed. Give semantic ids, `role="menu/
   dialog"`, and mount on demand.
6. **Mode-specific menubar items are hidden, not removed.** DOM contains
   `Edit×3, Export×3, View×4, Tiles×2…`; hidden ones are `h:0` zero-height rows
   still in the tree. Filter per mode instead of `display:none` clones.
7. **`id=""` empty attribute** in `src/html/colorSubPalettePickerMobile.html:1`
   (`<h2 … id="">`). Remove it.
8. **Debug leftovers in `body`.** `TEXTAREA#debugBox`, `DIV#Stats-output`,
   `DIV#WebGL-output` ship in production DOM. Gate behind a debug flag.
9. **Buttons have no `:focus-visible` style** (inputs/checkboxes/range have
   `2px solid #80b8eb`, buttons have none). Keyboard users can't see focus on
   the most common control.
10. **Disabled/placeholder contrast fails.** `.ui-button-disabled` `#666` on
    `#333`, `input:disabled` `#777` on `#2b2b2b`, placeholder `#aaaaaa` on
    `#333` are all below WCAG AA. Lighten text or darken/lighten backgrounds.

## P0 — layout breakage (measured)

11. **Right sidebar control rows clip.** `.tile-palette-control-row`
    `scrollWidth 411/407` vs `clientWidth 340` with `scrollbar-width:none` —
    "Spacing", "Rearrange…" buttons are cut off (visible in screenshot). Either
    wrap, shrink, or expose the scroll affordance.
12. **Global `* { user-select:none }` + `*:hover { cursor:default }`.**
    Kills text selection everywhere (inputs re-enabled later — fragile) and
    fights `cursor:pointer` on buttons (compensated per-span — hack). Scope to
    toolbars/palettes.

## P1 — CSS spacing / type / components

13. **`h3` defined 4× with different sizes** (`ui.css:48` 16px → `ui.css:56`
    20px/300 → `main.css` margins/`#eaeaea` → `old.css` 16px/12px-margin).
    Same for `h2` (22px vs commented 20/21px). Winner depends on load order.
    Keep one definition per element.
14. **Control heights don't align.** Base `.ui-button`
    `height:20px + padding:2px 8px + line-height:18px` (content-box → ~24px
    actual); measured live: 12 (panel close), 18 (Fit/±), 20 (small), 24
    (default) px. `input`/`select` are exactly 24px. Standardise on 24px
    default / 20px small / 16px icon with `box-sizing:border-box`.
15. **Dialog titlebar math is off.** `.ui-dialog-titlebar` 16px tall but
    `-heading` is `height:20px + padding-top:2px`; content starts at `top:28px`
    leaving an 8px dead band. Set titlebar 24px, content `top:32px`.
16. **Font-size sprawl (19 distinct sizes).** Live counts: 12px×3279,
    13.33px×391, 10px×93, 11px×85, 16px×63, 9px×52… plus 8/14/15/18/19/20/22/
    26/32/40/54/80px. Panel titles 10px, menubar 12px, shortcuts table 11/13px,
    gridinfo 12px. Adopt a scale (e.g. 10/12/14/16/20/24) and delete the rest.
17. **Border-radius sprawl.** 2px (inputs/buttons), 3px (chips/breadcrumbs),
    4px (old buttons), 5px (dialog, range track), 25px (thumbs), 50% (radios).
    Pick 2px controls / 5px surfaces and stick to it.
18. **Two competing checkbox/radio systems.** Native-styled
    `input[type=checkbox]` (ui.css ~14px grid) **and** custom
    `.cb-container`/`.rb-container` are both live, with different padding
    (`1px 20px` vs `0 0 0 20px`), label colours (`#a0a0a0` vs inherited) and
    margins (4px vs 6px vs `.no-margin`). Keep the custom pair, remove the
    native styling (or vice versa).
19. **Tab colours use three near-identical greys + a stray blue.**
    `.ui-tab #1f1f1f` / `.ui-current-tab #171717` / hover `#111` /
    `.ui-tab-content #efefef`-comment vs `#111` real; active underline
    `#273fab` ≠ selection blue `#3377ff`. Unify to bg-1/bg-2 + one accent.
20. **`.ui-button-other:hover` darkens** (`#5d3c4c→#543343`) while every other
    variant lightens on hover. Inverted affordance — make it lighten.
21. **Icon `filter: invert()` has 5+ variants** — `invert(80%)`, `65%`, `0.8`,
    `70%`, `75%`-on-hover, `10%`-selected, plus a magic
    `invert(46%) sepia(78%)…` for mobile-side-selected. Centralise as
    `--icon-normal/--icon-selected` variables.
22. **Range inputs triplicate track/thumb rules** (`-webkit-`, `-moz-`, `-ms-`
    incl. dead `-ms-fill-*`), focus `outline-offset:2px` vs inputs `1px`.
    Drop `-ms-`, share one offset.
23. **Scrollbars are webkit-only, light-on-dark.** `6px darkgrey/slategrey`
    thumb on dark panels; no `scrollbar-width/scrollbar-color` for Firefox.
    Add the standard properties in the dark palette.
24. **Spelling mix: Colour vs Color.** Toolbar says "FG Colour/BG Colour",
    menubar "Colours", but dialogs "Choose Colours" vs "Color Palette…",
    "cellBackgroundColor" ids. Pick one (repo is otherwise US English → Color).
25. **`cursor: hand`** (non-standard, `main.css` `.popup-tool`,
    `.mobile-popup-tool`). Use `pointer`.
26. **Form grid wobbles.** `.formControlLabel/.controlLabel` 90px but
    `#chooseColorPaletteControls .controlLabel` 100px; `.formRow`
    `min-height:24 + margin:4 + padding-bottom:6` = 34px rows;
    `.imageControlEffect .formRow` re-overrides borders per instance. One row
    height, one label width.

## P1 — colour palette sprawl

27. **~60 distinct hexes; ≥10 greys for "background" and ≥7 blues for
    "accent".** Backgrounds: `#111 #171717 #191919 #1a1a1a #1d1d1d #1f1f1f
    #212121 #222 #262626 #2a2a2a #2b2b2b #333`; text: `#cdcdcd(body) #dddddd
    #bbbbbb #eeeeee #aaaaaa #888 #666 #555`; accents: `#2266aa(primary)
    #2f7fba(hover) #3377ff(selection) #3254ee(list-selected) #273fab(tab
    underline) #3f6f96(checkbox/range) #1a4b8e(assembler-selected)`;
    danger `#aa4433` vs assembler-error `#c93d22`; focus `#80b8eb` is the only
    consistent one. Collapse to ~8 tokens
    (`--bg-0..3, --text-1..3, --accent, --accent-hover, --danger, --focus`).
28. **Mobile selected states diverge from desktop.** Selected swatch border
    `#ff9999` mobile vs `#999` desktop; `.colorPickerTypeMobileSelected`
    `#e0e0e0` bg vs desktop `#dddddd`; mobile radios `#0a0a0a on #e0e0e0`.
    Share the tokens from (27).
29. **Light-theme strays in a dark app.** Bundled `style.css` includes the
    CodeMirror light theme (white bg, `#f7f7f7` gutters) and `.ui-breadcrumbs`
    (`#e5e5e5` bg, `#CCC` border); `old.css` ships light gradients
    (`#f9f9f9→#e3e4e6`, `#ebf3fd/#d9e8fb` ×60 occurrences). Remove or gate them.

## P2 — dead code / structural cleanup

30. **~40% of `ui.css` is commented-out code** (old resets, gradient stacks,
    typography system, progress bars). Same in `main.css`. Delete — git has it.
31. **Two empty stylesheets ship to `dist`.** `button-colors.css` and
    `glyphicons.css` are 0 bytes; `old.css` (806 lines, light-theme buttons)
    and `icons-halflings-old.css` (1021 lines) look superseded by
    `icons-halflings.css`/`icons.css`. Unreference and delete.
32. **Inline styles everywhere: 1816 styled elements live,** plus inline
    `position/cursor` resize handles generated in `dialog.js:516-587` and
    `style=` attributes across `src/html/music/**`. Move to classes; it will
    also fix most duplicate-id-adjacent specificity hacks.
33. **`z-index` has no scale.** Menubar 100, `.ui-menu` 600, `.ui-menu-item`
    1000, dialogs 1000, zen overlays 591–593, breakpoints 1000/1001. Menus can
    paint above dialogs. Define `--z-menu/--z-dialog/--z-overlay`.
34. ** brittle selectors.** `src/css/ui.css` still styles bare `div, table…`
    resets and `button` element selectors that leak into dialogs; prefer
    `.ui-*` classes.
35. **Mixed id naming** (`camelCase`, `kebab-case`, `uiNNN`, `snake`?) across
    `src/html` and generated panels. Adopt one convention for new code;
    codemodunno — at minimum stop minting `uiNNN`.

---

## Suggested fix order

Nothing omitted — all 35 items phased by impact/effort:

1. **P0 validity + barriers (1, 2, 3, 9, 10)** — duplicate ids, accessible
   names, input labels, button `:focus-visible`, disabled/placeholder
   contrast. Blocks AT/keyboard users; small diffs in panel templates
   (`pixelToolSettings*`, `tileEditorC64Color*`, `colorPaletteEditor*`,
   `toolsPanel` desktop/mobile split).
2. **P0 structural, mostly cheap (4, 5, 6, 7, 8, 11, 12)** — heading order +
   real dialog titles (4); menu/dialog `role`s, semantic ids, mount-on-demand
   (5); per-mode menubar filtering (6); empty `id=""` (7, one line); debug
   nodes behind a flag (8); sidebar row clipping (11, visible to every user);
   scope `user-select`/`cursor:default` (12).
3. **P1 visible consistency (13, 14, 15, 16, 17, 27, 19, 18, 20, 21, 26)** —
   one token pass: single `h2/h3` definitions (13), 24/20/16px control heights
   with `border-box` (14), dialog titlebar math (15), font-size scale (16),
   radius scale (17), colour tokens `--bg/text/accent/danger/focus` (27) which
   also fixes tab blues (19) and mobile selected states (28); then single
   checkbox system (18), `ui-button-other` hover (20), icon `invert()` vars
   (21), form-grid label/row (26).
4. **P1 small/polish (22, 23, 24, 25, 28, 29)** — range `-ms-` removal +
   shared focus offset (22); Firefox scrollbar props (23); Colour→Color (24);
   `hand`→`pointer` (25); mobile tokens reuse (28); CodeMirror/breadcrumbs
   light strays (29).
5. **P2 cleanup (30, 31, 32, 33, 34, 35)** — delete commented CSS (30),
   unreference empty/superseded stylesheets (31), move inline styles to
   classes (32), `z-index` scale (33), class-based selectors (34), id-naming
   convention (35).
