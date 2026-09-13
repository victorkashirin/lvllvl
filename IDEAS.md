- shift + swipe to move around
- filter/search tilesets and palettes
- building tree view of tilesets to expose nested
- favorites in tilesets and palettes
- update dependencies
- sketch layer with pen

- grid on/off setting doesn't get saved
- select tiles/colors modal should show currently used tiles/map set, if unmodified
- add reference image as layer that can be reshaped

- select with m wand or marquee and change bg, fg, symbol
- feat: in color palette editor, if cell is empty, eydrop shoud place current color there. Also, enable copy/paste, or some way to duplicate

- in shortcuts modal change highlight color of input field and remove
- double click on grid removes character (but smart - don't remove background if it's not on affects)
- shift-command-drag eraser - draw selection rectangle and clean
- feat: magic wand
- feat: shift+enter in type mode gets to next line in alignment
- feat: snapshots
- feat: allow closing any modal with escape
- feat: show only used tiles/colors
- feat: show name of original tile palette and if it was modified
- feat: global save of palette
- bug: gif export custom animation frequency doesn't work
- bug: bucket should work on full selection

+ feat: monochrome tile palette in panel
+ navigate tile/color picker with arrows
+ BUG: switch from text mode to vector mode is destructive and can't be rolled back
+- replace native alert dialogs with styled + add 'save changes' on closing (alerts are by system)
+ stylise input fields to be true dark mode
+- Performance optimisation
+- Memory leaks tracking
+ custom keyboard shortcuts
+ Fix color editor, add oklch mode
+ in text mode backspace/delete don't remove characters
+ improve mobile mode
+ tab for preview mode
+ zen mode
+ cmd+right click for color palette
+ add export selection to svg
+ svg export doesn't populate name with project name
+ escape from text input with esc to pencil or something else