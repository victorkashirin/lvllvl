/** @typedef {import("../application/commandService.mjs").CommandService} CommandService */
/** @typedef {import("../domain/shortcutContext.mjs").ShortcutContextClause} ShortcutContextClause */
/** @typedef {{id: string, title: string, category: string, key?: string, keys?: string[], modifiers?: Record<string, boolean>, contexts: ShortcutContextClause[], allowDuringCanvasTyping?: boolean, execute: (details?: {source?: string}) => unknown, isEnabled?: () => boolean, release?: (details?: {source?: string}) => unknown, repeat?: boolean}} NativeCommandRegistration */

const baseTextContext = Object.freeze({
  editorMode: ["2d", "3d"],
  focus: "canvas",
  modal: "none",
  popupOpen: false,
  shortcutsAllowed: true,
});

/**
 * Register commands whose handlers already belong to editor features, with no
 * menu-action bridge. Called once when the editor UI is ready.
 *
 * @param {{app: any, commands: CommandService, toolMetadata: any}} dependencies
 */
export function registerNativeEditorCommands({ app, commands, toolMetadata }) {
  const { editorTools: editorToolDefinitions, pixelSubtools: pixelSubtoolDefinitions } = toolMetadata;
  /** @param {string} key @param {Record<string, boolean>} [modifiers] */
  const binding = (key, modifiers = {}) =>
    commands.bindingFromLegacyShortcut({ key, ...modifiers });
  /** @param {ShortcutContextClause} [values] @returns {ShortcutContextClause[]} */
  const context = (values = {}) => [{ ...baseTextContext, ...values }];
  const activePaletteEdit = () => {
    const modalPaletteEdit = app.textModeEditor?.colorPaletteEdit;
    if (modalPaletteEdit?.visible === true) return modalPaletteEdit;
    return app.mode === "color palette"
      ? app.colorPaletteEditor?.colorPaletteEdit || null
      : null;
  };
  const activeBlockEditor = () => {
    const blockEditor = app.textModeEditor?.blockEditor;
    return blockEditor?.visible === true ? blockEditor : null;
  };
  /** @param {NativeCommandRegistration} definition */
  const register = (definition) => {
    const keys = Array.isArray(definition.keys)
      ? definition.keys
      : (typeof definition.key === "string" ? [definition.key] : []);
    const defaultBindings = keys.map((key) => {
      const defaultBinding = binding(key, definition.modifiers);
      return defaultBinding && definition.repeat
        ? { ...defaultBinding, repeat: true }
        : defaultBinding;
    }).filter((defaultBinding) => defaultBinding !== null);
    commands.registerCommand({
      allowDuringCanvasTyping: definition.allowDuringCanvasTyping === true,
      category: definition.category,
      contexts: definition.contexts,
      defaultBindings,
      execute: definition.execute,
      id: definition.id,
      isEnabled: definition.isEnabled,
      release: definition.release,
      repeatable: definition.repeat === true,
      title: definition.title,
    });
  };

  const textMode = app.textModeEditor;
  if (!textMode) return;

  register({
    id: "textMode.preview.hold", title: "Preview Artwork", category: "View", key: "Tab",
    contexts: context({ deviceType: "desktop", editorMode: "2d", pointerCanvas: true }),
    execute: () => app.setOverviewMode(!app.overviewMode),
  });
  register({
    id: "textMode.canvas.placeSelectedTile", title: "Place Selected Tile", category: "Canvas",
    keys: ["Enter", "Insert"],
    contexts: context({ textEditorMode: "tile", textTool: ["pen", "block"] }),
    execute: () => textMode.grid.grid2d.setCursorCells(),
  });

  const cursorDirections = [
    { id: "left", title: "Move Grid Cursor Left", key: "ArrowLeft", dx: -1, dy: 0 },
    { id: "right", title: "Move Grid Cursor Right", key: "ArrowRight", dx: 1, dy: 0 },
    { id: "up", title: "Move Grid Cursor Up", key: "ArrowUp", dx: 0, dy: -1 },
    { id: "down", title: "Move Grid Cursor Down", key: "ArrowDown", dx: 0, dy: 1 },
  ];
  for (const direction of cursorDirections) {
    register({
      id: `textMode.canvas.cursor.${direction.id}`,
      title: direction.title,
      category: "Canvas",
      contexts: context({ textEditorMode: "tile", textTool: ["pen", "block"], selectionActive: false }),
      key: direction.key,
      repeat: true,
      execute() {
        let stepX = 1;
        let stepY = 1;
        const layer = textMode.layers.getSelectedLayerObject();
        if (layer && layer.getType() === "grid" && layer.getBlockModeEnabled()) {
          stepX = layer.getBlockWidth();
          stepY = layer.getBlockHeight();
        }
        textMode.grid.grid2d.moveCursor(direction.dx * stepX, direction.dy * stepY);
        textMode.grid.grid2d.setCursorEnabled(true);
      },
    });
  }

  const getSelectionTool = () => textMode.getEditorMode() === "pixel"
    ? textMode.tools.drawTools.pixelSelect
    : textMode.tools.drawTools.select;
  /** @param {number} dx @param {number} dy @param {Record<string, boolean>} args */
  const nudgeSelection = (dx, dy, args) => {
    const selectTool = getSelectionTool();
    if (textMode.getEditorMode() === "pixel") selectTool.nudgeSelection(dx, dy, args);
    else selectTool.nudgeSelection(dx, dy, 0, args);
  };
  register({
    id: "textMode.selection.clear", title: "Clear Selection Contents", category: "Selection",
    contexts: context({ textEditorMode: ["tile", "pixel"], selectionActive: true }),
    keys: ["Delete", "Backspace"],
    execute: () => getSelectionTool().clear(),
  });
  for (const direction of cursorDirections) {
    register({
      id: `textMode.selection.nudge.${direction.id}`,
      title: `Nudge Selection ${direction.title.replace("Move Grid Cursor ", "")}`,
      category: "Selection",
      contexts: context({ textEditorMode: ["tile", "pixel"], selectionActive: true }),
      key: direction.key,
      repeat: true,
      execute: () => nudgeSelection(direction.dx, direction.dy, {}),
    });
    register({
      id: `textMode.selection.move.${direction.id}`,
      title: `Move Selection Contents ${direction.title.replace("Move Grid Cursor ", "")}`,
      category: "Selection",
      contexts: context({ textEditorMode: ["tile", "pixel"], selectionActive: true }),
      key: direction.key,
      modifiers: { cmd: true },
      repeat: true,
      execute: () => nudgeSelection(direction.dx, direction.dy, { moveCut: true, moveCopy: false }),
    });
    register({
      id: `textMode.selection.copy.${direction.id}`,
      title: `Copy Selection Contents ${direction.title.replace("Move Grid Cursor ", "")}`,
      category: "Selection",
      contexts: context({ textEditorMode: ["tile", "pixel"], selectionActive: true }),
      key: direction.key,
      modifiers: { alt: true },
      repeat: true,
      execute: () => nudgeSelection(direction.dx, direction.dy, { moveCut: false, moveCopy: true }),
    });
    for (const operation of ["move", "copy"]) {
      register({
        id: `textMode.canvas.${operation}Contents.${direction.id}`,
        title: `${operation === "move" ? "Move" : "Copy"} Canvas Contents ${direction.title.replace("Move Grid Cursor ", "")}`,
        category: "Canvas",
        contexts: context({ textEditorMode: ["tile", "pixel"], selectionActive: false }),
        key: direction.key,
        modifiers: operation === "move" ? { cmd: true } : { alt: true },
        repeat: true,
        execute() {
          const selectTool = getSelectionTool();
          const args = { moveCut: operation === "move", moveCopy: operation === "copy" };
          if (textMode.getEditorMode() === "pixel") {
            selectTool.nudgeSelection(direction.dx, direction.dy, args);
            return;
          }
          selectTool.selectAll();
          selectTool.nudgeSelection(direction.dx, -direction.dy, 0, args);
          selectTool.unselectAll();
        },
      });
    }
  }

  for (let colorIndex = 0; colorIndex < 16; colorIndex++) {
    register({
      id: `textMode.color.select.${colorIndex + 1}`,
      title: `Select Color ${colorIndex + 1}`,
      category: "Palettes",
      contexts: context({ textEditorMode: ["tile", "pixel"] }),
      allowDuringCanvasTyping: true,
      key: String((colorIndex % 8) + 1),
      modifiers: { alt: true, shift: colorIndex >= 8 },
      execute: () => textMode.currentTile.setColor(colorIndex),
    });
  }
  register({
    id: "textMode.playback.toggle", title: "Play / Pause Animation", category: "Animation",
    contexts: context(), key: "Space", execute: () => textMode.frames.play(),
  });

  for (const tool of editorToolDefinitions) {
    const supportsPixelMode = typeof tool.pixel === "string";
    const supportsPalette = typeof tool.palette === "string";
    const supportsBlockEditor = typeof tool.block === "string";
    register({
      id: tool.id,
      title: tool.title,
      category: "Tools",
      contexts: context({ textEditorMode: supportsPixelMode ? ["tile", "pixel"] : "tile" }),
      key: tool.key,
      execute() {
        const blockEditor = supportsBlockEditor ? activeBlockEditor() : null;
        if (blockEditor) {
          blockEditor.setTool(tool.block);
          return;
        }
        if (supportsPalette && (app.mode === "color palette" ||
            app.textModeEditor?.colorPaletteEdit?.visible === true)) {
          const paletteEdit = activePaletteEdit();
          if (!paletteEdit) return false;
          paletteEdit.setColorPaletteTool(tool.palette);
          return;
        }
        if (textMode.getEditorMode() === "pixel" && supportsPixelMode) {
          if (tool.pixel === "shape") textMode.tools.pixelDrawTools.toggleShape();
          else textMode.tools.pixelDrawTools.setDrawTool(tool.pixel);
          return;
        }
        if (tool.tile === "shape") textMode.tools.drawTools.toggleShape();
        else {
          if (tool.tile === "type") textMode.tools.drawTools.setTypingCursorToCurrentCursor();
          textMode.tools.drawTools.setDrawTool(tool.tile);
        }
      },
    });
    if (supportsPalette || supportsBlockEditor) {
      /** @type {ShortcutContextClause[]} */
      const actionContexts = [];
      /** @type {ShortcutContextClause[]} */
      const keyboardContexts = [];
      if (supportsPalette) {
        actionContexts.push(
          { editorMode: "color palette" },
          { modal: "editColorPaletteDialog" },
        );
        keyboardContexts.push(
          {
            editorMode: "color palette",
            focus: ["canvas", "palette"],
            modal: "none",
            popupOpen: false,
            shortcutsAllowed: true,
          },
          {
            focus: ["canvas", "palette"],
            modal: "editColorPaletteDialog",
            popupOpen: false,
            shortcutsAllowed: true,
          },
        );
      }
      if (supportsBlockEditor) {
        actionContexts.push({ modal: "blockEditor" });
        keyboardContexts.push({
          focus: ["canvas", "palette"],
          modal: "blockEditor",
          popupOpen: false,
          shortcutsAllowed: true,
        });
      }
      commands.addCommandActivation(tool.id, {
        actionContexts,
        contexts: keyboardContexts,
      });
    }
  }
  for (const tool of pixelSubtoolDefinitions) {
    register({
      id: tool.id,
      title: tool.title,
      category: "Tools",
      contexts: context({ textEditorMode: "tile", textTool: "pixel" }),
      key: tool.key,
      modifiers: tool.modifiers,
      execute() {
        if (tool.tool === "shape") textMode.tools.drawTools.pixelDraw.toggleShape();
        else textMode.tools.drawTools.pixelDraw.setTool(tool.tool);
      },
    });
  }

  const drawingTools = ["pen", "erase", "fill", "eyedropper", "line", "rect", "oval"];
  register({
    id: "textMode.tile.flipHorizontal", title: "Flip Current Tile Horizontally", category: "Tile", key: "F",
    contexts: context({ textEditorMode: "tile", textTool: drawingTools }),
    execute: () => textMode.currentTile.flipH2d(),
  });
  register({
    id: "textMode.tile.flipVertical", title: "Flip Current Tile Vertically", category: "Tile", key: "G",
    contexts: context({ textEditorMode: "tile", textTool: drawingTools }),
    execute: () => textMode.currentTile.flipV2d(),
  });
  register({
    id: "textMode.lineSegment.horizontal", title: "Horizontal Line Segment", category: "Tools", key: "F",
    contexts: context({ textEditorMode: "tile", textTool: "linesegment" }),
    execute: () => textMode.tools.drawTools.lineSegmentDraw.setMode("horizontal"),
  });
  register({
    id: "textMode.lineSegment.vertical", title: "Vertical Line Segment", category: "Tools", key: "G",
    contexts: context({ textEditorMode: "tile", textTool: "linesegment" }),
    execute: () => textMode.tools.drawTools.lineSegmentDraw.setMode("vertical"),
  });

  const selectionCommands = [
    {
      id: "drawWithSelection", title: "Draw Using Selection", key: "D",
      execute() {
        const drawTools = textMode.tools.drawTools;
        drawTools.select.selectionToPen();
        drawTools.select.unselectAll();
        drawTools.setDrawTool("pen");
      },
    },
    { id: "flipHorizontal", title: "Flip Selection Horizontally", key: "F", execute: () => textMode.tools.drawTools.select.flipH() },
    { id: "flipVertical", title: "Flip Selection Vertically", key: "G", execute: () => textMode.tools.drawTools.select.flipV() },
    { id: "fill", title: "Fill Selection", key: "C", execute: () => textMode.tools.drawTools.select.fill() },
  ];
  for (const command of selectionCommands) {
    register({
      id: `textMode.selection.${command.id}`,
      title: command.title,
      category: "Selection",
      contexts: context({ textEditorMode: "tile", textTool: "select" }),
      key: command.key,
      execute: command.execute,
    });
  }

  register({
    id: "textMode.picker.tiles", title: "Show Tile Picker", category: "Palettes", key: "/",
    contexts: context({ textEditorMode: "tile" }), execute: () => textMode.gridView2d.showCharacterPicker(),
  });
  register({
    id: "textMode.picker.colors", title: "Show Color Picker", category: "Palettes", key: "?",
    modifiers: { shift: true }, contexts: context({ textEditorMode: "tile" }),
    execute: () => textMode.gridView2d.showColorPicker(),
  });
  register({
    id: "textMode.colors.switch", title: "Switch Foreground and Background Colors", category: "Palettes", key: "X",
    contexts: context({ textEditorMode: "tile" }), execute: () => textMode.currentTile.switchColors(),
  });

  const paletteDirections = [
    { id: "left", title: "Move Palette Selection Left", key: "A", dx: -1, dy: 0 },
    { id: "right", title: "Move Palette Selection Right", key: "D", dx: 1, dy: 0 },
    { id: "up", title: "Move Palette Selection Up", key: "W", dx: 0, dy: -1 },
    { id: "down", title: "Move Palette Selection Down", key: "S", dx: 0, dy: 1 },
  ];
  for (const direction of paletteDirections) {
    register({
      id: `textMode.tilePalette.${direction.id}`, title: direction.title, category: "Palettes", key: direction.key,
      contexts: context({ focus: ["canvas", "palette"], spriteFramesVisible: false, textEditorMode: "tile", textTool: drawingTools }),
      repeat: true,
      execute() {
        const blockEditor = activeBlockEditor();
        const paletteDisplay = blockEditor?.tilePaletteDisplay ||
          textMode.tools.drawTools.tilePalette.tilePaletteDisplay;
        paletteDisplay.moveSelection(direction.dx, direction.dy);
      },
    });
    commands.addCommandActivation(`textMode.tilePalette.${direction.id}`, {
      actionContexts: [{ modal: "blockEditor" }],
      contexts: [{
        focus: ["canvas", "palette"],
        modal: "blockEditor",
        popupOpen: false,
        shortcutsAllowed: true,
      }],
    });
    register({
      id: `textMode.blockPalette.${direction.id}`,
      title: direction.title.replace("Palette", "Meta Tile Palette"),
      category: "Palettes",
      contexts: context({ focus: ["canvas", "palette"], spriteFramesVisible: false, textEditorMode: "tile", textTool: "block" }),
      key: direction.key,
      repeat: true,
      execute() {
        const drawTools = textMode.tools.drawTools;
        drawTools.blockPalette.moveSelection(direction.dx, direction.dy);
        if (textMode.sideTilePalette?.tilePaletteDisplay) {
          textMode.sideTilePalette.tilePaletteDisplay.moveSelection(direction.dx, direction.dy);
        }
      },
    });
    register({
      id: `textMode.colorPalette.${direction.id}`,
      title: direction.title.replace("Palette", "Color Palette"),
      category: "Palettes",
      contexts: context({ focus: ["canvas", "palette"] }),
      key: direction.key,
      modifiers: { shift: true },
      repeat: true,
      execute: () => textMode.colorPalettePanel.moveSelection(direction.dx, direction.dy),
    });
  }
  register({
    id: "textMode.tilePalette.recentNext", title: "Next Recent Tile", category: "Palettes", key: "E",
    contexts: context({ focus: ["canvas", "palette"], spriteFramesVisible: false, textEditorMode: "tile", textTool: drawingTools }),
    repeat: true, execute: () => textMode.tools.drawTools.tilePalette.selectRecent(1),
  });
  register({
    id: "textMode.tilePalette.recentPrevious", title: "Previous Recent Tile", category: "Palettes", key: "Q",
    contexts: context({ focus: ["canvas", "palette"], spriteFramesVisible: false, textEditorMode: "tile", textTool: drawingTools }),
    repeat: true, execute: () => textMode.tools.drawTools.tilePalette.selectRecent(-1),
  });
  register({
    id: "textMode.tile.rotate", title: "Rotate Current Tile", category: "Tile", key: "R",
    contexts: context({ focus: ["canvas", "palette"], spriteFramesVisible: false, textEditorMode: "tile", textTool: drawingTools }),
    execute() {
      const blockEditor = activeBlockEditor();
      if (blockEditor) blockEditor.rotateCharacter();
      else textMode.tools.drawTools.tilePalette.rotateCharacter();
    },
  });
  commands.addCommandActivation("textMode.tile.rotate", {
    actionContexts: [{ modal: "blockEditor" }],
    contexts: [{
      focus: ["canvas", "palette"],
      modal: "blockEditor",
      popupOpen: false,
      shortcutsAllowed: true,
    }],
  });
  register({
    id: "textMode.colorPalette.recentNext", title: "Next Recent Color", category: "Palettes", key: "E",
    modifiers: { shift: true }, contexts: context({ focus: ["canvas", "palette"] }), repeat: true,
    execute: () => textMode.colorPalettePanel.selectRecent(1),
  });
  register({
    id: "textMode.colorPalette.recentPrevious", title: "Previous Recent Color", category: "Palettes", key: "Q",
    modifiers: { shift: true }, contexts: context({ focus: ["canvas", "palette"] }), repeat: true,
    execute: () => textMode.colorPalettePanel.selectRecent(-1),
  });

  for (const frame of [
    { id: "previous", title: "Previous Frame", key: ",", execute: () => textMode.frames.prevFrame() },
    { id: "next", title: "Next Frame", key: ".", execute: () => textMode.frames.nextFrame() },
  ]) {
    register({
      id: `textMode.frame.${frame.id}`, title: frame.title, category: "Animation", key: frame.key,
      contexts: context({ focus: ["canvas", "timeline"] }), repeat: true, execute: frame.execute,
    });
  }
  for (const timeline of [
    { id: "previousFrame", title: "Previous Sprite Frame", key: "A", execute: () => textMode.frames.prevFrame() },
    { id: "nextFrame", title: "Next Sprite Frame", key: "D", execute: () => textMode.frames.nextFrame() },
    { id: "previousLayer", title: "Previous Sprite Layer", key: "W", execute: () => textMode.layers.moveSelect(1) },
    { id: "nextLayer", title: "Next Sprite Layer", key: "S", execute: () => textMode.layers.moveSelect(-1) },
  ]) {
    register({
      id: `textMode.spriteTimeline.${timeline.id}`, title: timeline.title, category: "Animation", key: timeline.key,
      contexts: context({ focus: ["canvas", "timeline"], spriteFramesVisible: true }),
      repeat: true, execute: timeline.execute,
    });
  }
  for (const color of [
    { id: "background", title: "Use Background Color", key: "1", type: "background" },
    { id: "foreground", title: "Use Foreground Color", key: "2", type: "cell" },
    { id: "multi1", title: "Use Multicolor 1", key: "3", type: "multi1" },
    { id: "multi2", title: "Use Multicolor 2", key: "4", type: "multi2" },
  ]) {
    register({
      id: `textMode.multicolor.${color.id}`, title: color.title, category: "Palettes", key: color.key,
      contexts: context({ screenMode: "c64multicolor" }),
      execute: () => textMode.tools.drawTools.pixelDraw.setC64MultiColorType(color.type),
    });
    commands.addCommandActivation(`textMode.multicolor.${color.id}`, {
      actionContexts: [{ modal: "blockEditor", screenMode: "c64multicolor" }],
      contexts: [{
        focus: ["canvas", "palette"],
        modal: "blockEditor",
        popupOpen: false,
        screenMode: "c64multicolor",
        shortcutsAllowed: true,
      }],
    });
  }
}
