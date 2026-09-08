/** @typedef {{key: string, cmd?: boolean, ctrl?: boolean, alt?: boolean, shift?: boolean}} LegacyShortcut */
/** @typedef {{id: string, title: string, category: string, legacyAction: string, defaultShortcuts: readonly LegacyShortcut[]}} EditorCommandDefinition */

/** @param {string} key @param {Omit<LegacyShortcut, "key">} [modifiers] */
const shortcut = (key, modifiers = {}) => Object.freeze({ key, ...modifiers });

/**
 * @param {string} category
 * @param {Array<[string, string, string, {shortcuts?: LegacyShortcut[]}?]>} rows
 * @returns {Readonly<EditorCommandDefinition>[]}
 */
function commandGroup(category, rows) {
  return rows.map(([id, title, legacyAction, options = {}]) => Object.freeze({
    legacyAction,
    category,
    defaultShortcuts: Object.freeze([...(options.shortcuts || [])]),
    id,
    title,
  }));
}

// This is pure canonical metadata for every menu action owned by CommandService.
// Menus declare these IDs directly and supply activation/enabled state only.
// legacyAction is a temporary call into Editor.menuClick, not an identity alias.
const definitions = Object.freeze([
  ...commandGroup("Project", [
    ["project.new", "New Project...", "file-new"],
    ["project.save", "Save", "file-save", { shortcuts: [shortcut("S", { cmd: true })] }],
    ["project.saveas", "Save As...", "file-saveas", { shortcuts: [shortcut("S", { cmd: true, shift: true })] }],
    ["project.download", "Download Project...", "file-download", { shortcuts: [shortcut("D", { cmd: true, shift: true })] }],
    ["project.templateLink", "Create A Template Link...", "file-templateLink"],
  ]),
  ...commandGroup("Edit", [
    ["edit.undo", "Undo", "edit-undo", {
      shortcuts: [shortcut("Z", { cmd: true })],
    }],
    ["edit.redo", "Redo", "edit-redo", {
      shortcuts: [shortcut("Z", { cmd: true, shift: true }), shortcut("Y", { cmd: true })],
    }],
    ["edit.cut", "Cut", "edit-cut", { shortcuts: [shortcut("X", { cmd: true })] }],
    ["edit.copy", "Copy", "edit-copy", { shortcuts: [shortcut("C", { cmd: true })] }],
    ["edit.copyimage", "Copy as Image To Clipboard", "edit-copyimage", { shortcuts: [shortcut("I", { cmd: true })] }],
    ["edit.paste", "Paste", "edit-paste", { shortcuts: [shortcut("V", { cmd: true })] }],
    ["edit.clearall", "Clear All", "edit-clearall", { shortcuts: [shortcut("Del")] }],
    ["edit.clear", "Clear...", "edit-clear"],
    ["edit.selectAll", "Select All", "edit-selectall", { shortcuts: [shortcut("A", { cmd: true })] }],
    ["edit.deselect", "Deselect", "edit-deselect", { shortcuts: [shortcut("D", { cmd: true })] }],
    ["edit.fliph", "Flip H", "edit-fliph"],
    ["edit.flipv", "Flip V", "edit-flipv"],
    ["edit.replaceColor", "Replace Color...", "edit-replaceColor"],
    ["edit.replaceCharacter", "Replace Tile...", "edit-replaceCharacter"],
    ["edit.clearHiddenTiles", "Clear Hidden Tiles...", "edit-clearHiddenTiles"],
  ]),
  ...commandGroup("Export", [
    ["export.image", "GIF / PNG...", "export-image"],
    ["export.png", "Sprite Sheet (PNG)...", "export-png"],
    ["export.svg", "SVG...", "export-svg"],
    ["export.prg", "C64 PRG / D64...", "export-prg"],
    ["export.c64assembly", "C64 Assembly Source...", "export-c64assembly"],
    ["export.mega65assembly", "Mega65 Assembly Source...", "export-mega65assembly"],
    ["export.x16assembly", "X16 Assembly Source...", "export-x16assembly"],
    ["export.seq", "SEQ...", "export-seq"],
    ["export.petsciic", "PETSCII C...", "export-petsciic"],
    ["export.pet", ".PET...", "export-pet"],
    ["export.charpad", "CharPad V5...", "export-charpad"],
    ["export.spritepad", "SpritePad...", "export-spritepad"],
    ["export.x16basic", "X16 Basic...", "export-x16basic"],
    ["export.json", "JSON...", "export-json"],
    ["export.binary", "Binary Data...", "export-binary"],
    ["export.txt", "TXT...", "export-txt"],
    ["export.3d-gif", "GIF...", "export-3d-gif"],
    ["export.obj", "OBJ...", "export-obj"],
    ["export.magicavoxel", "MagicaVoxel...", "export-magicavoxel"],
  ]),
  ...commandGroup("Import", [
    ["import.image", "Image / Video...", "import-image", { shortcuts: [shortcut("I", { alt: true, shift: true })] }],
    ["import.c64formats", "C64 Formats...", "import-c64formats"],
    ["import.c64spriteformats", "C64 Formats...", "import-c64spriteformats"],
    ["import.spriteimage", "Image...", "import-spriteimage"],
  ]),
  ...commandGroup("Screen", [
    ["project.dimensions", "Dimensions...", "file-dimensions"],
    ["textMode.screen.crop", "Crop To Selection", "screen-crop"],
    ["textMode.mode.textmode", "Text / Monochrome Mode", "mode-textmode"],
    ["textMode.mode.c64standard", "C64 Standard Character Mode", "mode-c64standard"],
    ["textMode.mode.c64multicolor", "C64 Multicolor", "mode-c64multicolor"],
    ["textMode.mode.c64ecm", "C64 Extended BG Color Mode", "mode-c64ecm"],
    ["textMode.mode.vector", "Vector Mode", "mode-vector"],
    ["textMode.mode.indexed", "Indexed Color", "mode-indexed"],
    ["textMode.mode.rgb", "RGB Color", "mode-rgb"],
    ["textMode.mode.nes", "NES", "mode-nes"],
    ["textMode.mode.tileflip", "Allow Tile Flip", "mode-tileflip"],
    ["textMode.mode.tilerotate", "Allow Tile Rotate", "mode-tilerotate"],
    ["textMode.mode.tilematerials", "Has Tile Materials", "mode-tilematerials"],
    ["textMode.mode.blockmode", "Meta Tile Mode", "mode-blockmode"],
    ["textMode.mode.blocksize", "Meta Tile Size...", "mode-blocksize"],
    ["textMode.colorMode.cell", "Color Per Cell", "colorpermode-cell"],
    ["textMode.colorMode.character", "Color Per Tile", "colorpermode-character"],
    ["textMode.colorMode.block", "Color Per Meta Tile", "colorpermode-block"],
    ["textMode.referenceImage", "Reference Image", "screen-referenceimage", {
      shortcuts: [shortcut("I", { alt: true, cmd: true })],
    }],
  ]),
  ...commandGroup("Layers", [
    ["textMode.layers.new", "New Layer...", "layers-new", { shortcuts: [shortcut("L", { cmd: true })] }],
    ["textMode.layers.properties", "Layer Properties...", "layers-properties"],
    ["textMode.layers.delete", "Delete Layer", "layers-delete"],
    ["textMode.layers.moveUp", "Bring Forward", "layers-moveUp", { shortcuts: [shortcut("]", { cmd: true })] }],
    ["textMode.layers.moveDown", "Send Backward", "layers-moveDown", { shortcuts: [shortcut("[", { cmd: true })] }],
    ["textMode.layers.toggle", "Toggle Layer Visibility", "layers-toggle", { shortcuts: [shortcut("\\", { cmd: true })] }],
    ["textMode.layers.selectAbove", "Select Above", "layers-selectAbove", { shortcuts: [shortcut("]", { alt: true })] }],
    ["textMode.layers.selectBelow", "Select Below", "layers-selectBelow", { shortcuts: [shortcut("[", { alt: true })] }],
  ]),
  ...commandGroup("Tiles", [
    ["textMode.tiles.edit", "Show Tile Editor", "charactersets-edit", { shortcuts: [shortcut("E", { cmd: true })] }],
    ["textMode.tiles.preset", "Choose A Tile Set...", "charactersets-preset"],
    ["textMode.tiles.load", "Load / Import Tile Set...", "charactersets-load"],
    ["textMode.tiles.save", "Save Tile Set...", "charactersets-save"],
    ["textMode.tiles.new", "Create a Tile Set...", "tileset-new"],
  ]),
  ...commandGroup("Colors", [
    ["application.color-edit", "Show Color Editor", "color-edit", { shortcuts: [shortcut("E", { cmd: true, shift: true })] }],
    ["textMode.colors.preset", "Choose A Color Palette...", "colors-preset"],
    ["application.color-editcolorpalette", "Edit Color Palette...", "color-editcolorpalette"],
    ["textMode.colors.load", "Load Color Palette...", "colors-load"],
    ["textMode.colors.save", "Save Color Palette...", "colors-save"],
    ["textMode.colors.new", "Create a Color Palette...", "colorpalette-new"],
  ]),
  ...commandGroup("View", [
    ["view.zoomin", "Zoom In", "view-zoomin", {
      shortcuts: [shortcut("=", { cmd: true }), shortcut("=", { cmd: true, shift: true })],
    }],
    ["view.zoomout", "Zoom Out", "view-zoomout", { shortcuts: [shortcut("-", { cmd: true })] }],
    ["view.fitonscreen", "Fit On Screen", "view-fitonscreen", { shortcuts: [shortcut("0", { cmd: true })] }],
    ["view.actualpixels", "Actual Pixels", "view-actualpixels", { shortcuts: [shortcut("1", { cmd: true })] }],
    ["view.grid", "Grid", "edit-showgrid", {
      shortcuts: [shortcut("G", { cmd: true })],
    }],
    ["edit.showborder", "Border", "edit-showborder", { shortcuts: [shortcut("H", { cmd: true })] }],
    ["edit.showbackground", "Background", "edit-showbackground", { shortcuts: [shortcut("B", { cmd: true })] }],
    ["application.cursor-tile-transparent", "Cursor Tile Is Transparent", "cursor-tile-transparent"],
    ["edit.scripting", "Scripting...", "edit-scripting", { shortcuts: [shortcut("R", { cmd: true })] }],
    ["view.projectExplorer", "Project Explorer", "view-project-explorer", {
      shortcuts: [shortcut("P", { cmd: true })],
    }],
  ]),
  ...commandGroup("Interface", [
    ["view.zenmode", "Zen Mode", "view-zenmode", { shortcuts: [shortcut("Z", { alt: true, shift: true })] }],
    ["view.tools", "Tools Panel", "view-tools"],
    ["view.layerspanel", "Layers Panel", "view-layerspanel"],
    ["view.tilepalettepanelside", "Tile Palette Panel Side", "view-tilepalettepanelside"],
    ["view.metatilepalettepanelside", "Meta Tile Palette Panel Side", "view-metatilepalettepanelside"],
    ["view.palettepanel", "Color Palette Panel", "view-palettepanel"],
    ["view.tilepalettepanelbottom", "Tile Palette Panel Bottom", "view-tilepalettepanelbottom"],
    ["view.metatilepalettepanelbottom", "Meta Tile Palette Panel Bottom", "view-metatilepalettepanelbottom"],
    ["view.animationpanel", "Animation Panel", "view-animationpanel"],
    ["view.performanceStats", "Performance Stats", "view-perfstats"],
    ["export.gif", "Export GIF / Video (old version)...", "export-gif"],
    ["export.c64", "Export C64 (new)...", "export-c64"],
    ["settings.mobilemode", "Mobile Mode", "settings-mobilemode"],
  ]),
  ...commandGroup("Help", [
    ["help.commonActions", "Common Actions", "help-commonactionshortcuts"],
    ["help.keyboardReference", "Keyboard Shortcuts", "help-keyboardshortcuts"],
    ["help.scriptingapi", "Scripting API...", "help-scriptingapi"],
    ["help.about", "About lvllvl plus...", "help-about"],
  ]),
]);

/** @type {Map<string, Readonly<EditorCommandDefinition>>} */
const definitionsById = new Map();
for (const definition of definitions) {
  if (definitionsById.has(definition.id)) {
    throw new Error(`Duplicate editor command definition ${definition.id}`);
  }
  definitionsById.set(definition.id, definition);
}

/** @param {string} commandId */
export function getEditorCommandDefinition(commandId) {
  return definitionsById.get(commandId) || null;
}

export const editorCommandDefinitions = definitions;
