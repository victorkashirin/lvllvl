/** @typedef {import("../application/commandService.mjs").CommandService} CommandService */
/** @typedef {import("../domain/shortcutContext.mjs").ShortcutContextClause} ShortcutContextClause */
/** @typedef {{id: string, title: string, category: string, key?: string, keys?: string[], modifiers?: Record<string, boolean>, contexts: ShortcutContextClause[], allowDuringCanvasTyping?: boolean, execute: (details?: {source?: string}) => unknown, isEnabled?: () => boolean, release?: (details?: {source?: string}) => unknown, repeat?: boolean}} LegacyCommandRegistration */
/** @typedef {{commandId: string, menu: any, menuItem: any}} LegacyMenuEntry */

import {
  getLegacyMenuCommandDefinition,
  getLegacyMenuCommandDefinitionForAlias,
} from "../domain/legacyMenuCommandDefinitions.mjs";

const baseTextContext = Object.freeze({
  editorMode: ["2d", "3d"],
  focus: "canvas",
  modal: "none",
  popupOpen: false,
  shortcutsAllowed: true,
});

/** @param {string} menuItemId @returns {string | null} */
export function commandIdForLegacyMenuItem(menuItemId) {
  return getLegacyMenuCommandDefinitionForAlias(menuItemId)?.id || null;
}

/** @param {any} menu @returns {ShortcutContextClause[]} */
function menuCommandContexts(menu) {
  const classNames = typeof menu.className === "string" ? menu.className.split(/\s+/) : [];
  /** @param {string} className */
  const hasClass = (className) => classNames.includes(className);
  /** @type {string[]} */
  const modes = [];
  if (hasClass("ui-menu-tilemode")) modes.push("2d");
  if (hasClass("ui-menu-3d")) modes.push("3d");
  if (hasClass("ui-menu-colorpalette")) modes.push("color palette");
  if (hasClass("ui-menu-tileset")) modes.push("tile set");
  if (hasClass("ui-menu-script")) modes.push("script", "json", "text", "hex");
  const uniqueModes = modes.filter((mode, index) => modes.indexOf(mode) === index);
  const baseContext = { modal: "none", popupOpen: false, shortcutsAllowed: true };
  const graphicType = hasClass("ui-menu-screen")
    ? { not: "sprite" }
    : (hasClass("ui-menu-sprite") ? "sprite" : null);
  if (graphicType !== null && uniqueModes.includes("2d")) {
    /** @type {ShortcutContextClause[]} */
    const contexts = [{ ...baseContext, editorMode: "2d", graphicType }];
    const otherModes = uniqueModes.filter((mode) => mode !== "2d");
    if (otherModes.length) {
      contexts.push({
        ...baseContext,
        editorMode: otherModes.length === 1 ? otherModes[0] : otherModes,
      });
    }
    return contexts;
  }
  if (uniqueModes.length) {
    return [{
      ...baseContext,
      editorMode: uniqueModes.length === 1 ? uniqueModes[0] : uniqueModes,
    }];
  }
  return [baseContext];
}

/** @param {any} menu @param {ShortcutContextClause[]} commandContexts @returns {ShortcutContextClause[]} */
function menuActionContexts(menu, commandContexts) {
  const keyboardOnly = new Set(["modal", "popupOpen", "shortcutsAllowed"]);
  const actionContexts = commandContexts.map((commandContext) => Object.fromEntries(
    Object.entries(commandContext).filter(([key]) => !keyboardOnly.has(key)),
  ));
  const classNames = typeof menu.className === "string" ? menu.className.split(/\s+/) : [];
  for (const [className, editorMode] of [
    ["ui-menu-music", "music"],
    ["ui-menu-c64", "c64"],
    ["ui-menu-c64-assembler", "assembler"],
  ]) {
    if (classNames.includes(className)) actionContexts.push({ editorMode });
  }
  return actionContexts;
}

/**
 * Own the configurable editor catalog while adapting its handlers, menus, and
 * labels to the legacy application objects.
 *
 * @param {{app: any, commands: CommandService, document: Document, toolMetadata: any, schedule?: (callback: () => void) => unknown, translate?: (value: string) => string}} dependencies
 */
export function createLegacyCommandCatalogAdapter({
  app,
  commands,
  document,
  toolMetadata,
  schedule = (callback) => callback(),
  translate = (value) => value,
}) {
  if (!toolMetadata) throw new TypeError("Legacy command catalog requires tool metadata");
  const { paletteTools: paletteToolDefinitions, pixelSubtools: pixelSubtoolDefinitions, textTools: textToolDefinitions } = toolMetadata;
  let connected = false;
  /** @type {any[]} */
  let menuItems = [];

  /** @param {string} key @param {Record<string, boolean>} [modifiers] */
  const binding = (key, modifiers = {}) =>
    commands.bindingFromLegacyShortcut({ key, ...modifiers });
  /** @param {ShortcutContextClause} [values] @returns {ShortcutContextClause[]} */
  const context = (values = {}) => [{ ...baseTextContext, ...values }];
  /** @param {LegacyCommandRegistration} definition */
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

  function registerEditorCommands() {
    const textMode = app.textModeEditor;
    if (!textMode) return;

    register({
      id: "textMode.preview.hold", title: "Preview Artwork", category: "View", key: "Tab",
      contexts: context({ deviceType: "desktop", editorMode: "2d", pointerCanvas: true }),
      execute: () => app.setOverviewMode(true),
      release: () => app.setOverviewMode(false),
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
        title: `Select Colour ${colorIndex + 1}`,
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

    for (const tool of textToolDefinitions) {
      const supportsPixelMode = typeof tool.pixel === "string";
      register({
        id: tool.id,
        title: tool.title,
        category: "Text Tools",
        contexts: context({ textEditorMode: supportsPixelMode ? ["tile", "pixel"] : "tile" }),
        key: tool.key,
        execute() {
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
    }
    for (const tool of pixelSubtoolDefinitions) {
      register({
        id: tool.id,
        title: tool.title,
        category: "Text Tools",
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
      id: "textMode.lineSegment.horizontal", title: "Horizontal Line Segment", category: "Text Tools", key: "F",
      contexts: context({ textEditorMode: "tile", textTool: "linesegment" }),
      execute: () => textMode.tools.drawTools.lineSegmentDraw.setMode("horizontal"),
    });
    register({
      id: "textMode.lineSegment.vertical", title: "Vertical Line Segment", category: "Text Tools", key: "G",
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
      id: "textMode.picker.colors", title: "Show Colour Picker", category: "Palettes", key: "?",
      modifiers: { shift: true }, contexts: context({ textEditorMode: "tile" }),
      execute: () => textMode.gridView2d.showColorPicker(),
    });
    register({
      id: "textMode.colors.switch", title: "Switch Foreground and Background Colours", category: "Palettes", key: "X",
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
        execute: () => textMode.tools.drawTools.tilePalette.tilePaletteDisplay.moveSelection(direction.dx, direction.dy),
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
        title: direction.title.replace("Palette", "Colour Palette"),
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
      execute: () => textMode.tools.drawTools.tilePalette.rotateCharacter(),
    });
    register({
      id: "textMode.colorPalette.recentNext", title: "Next Recent Colour", category: "Palettes", key: "E",
      modifiers: { shift: true }, contexts: context({ focus: ["canvas", "palette"] }), repeat: true,
      execute: () => textMode.colorPalettePanel.selectRecent(1),
    });
    register({
      id: "textMode.colorPalette.recentPrevious", title: "Previous Recent Colour", category: "Palettes", key: "Q",
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
      { id: "background", title: "Use Background Colour", key: "1", type: "background" },
      { id: "foreground", title: "Use Foreground Colour", key: "2", type: "cell" },
      { id: "multi1", title: "Use Multicolour 1", key: "3", type: "multi1" },
      { id: "multi2", title: "Use Multicolour 2", key: "4", type: "multi2" },
    ]) {
      register({
        id: `textMode.multicolor.${color.id}`, title: color.title, category: "Palettes", key: color.key,
        contexts: context({ screenMode: "c64multicolor" }),
        execute: () => textMode.tools.drawTools.pixelDraw.setC64MultiColorType(color.type),
      });
    }

    if (app.colorPaletteEditor?.colorPaletteEdit) {
      for (const tool of paletteToolDefinitions) {
        register({
          id: tool.id,
          title: tool.title,
          category: "Colour Palette Tools",
          contexts: [{ editorMode: "color palette", focus: "canvas", modal: "none", popupOpen: false, shortcutsAllowed: true }],
          key: tool.key,
          execute: () => app.colorPaletteEditor.colorPaletteEdit.setColorPaletteTool(tool.tool),
        });
      }
    }
  }

  /** @param {any} menuBar @returns {LegacyMenuEntry[]} */
  function collectMenuEntries(menuBar) {
    /** @type {LegacyMenuEntry[]} */
    const entries = [];
    for (const menu of menuBar.menus) {
      for (const menuItem of menu.menuItems) {
        if (menuItem.type !== "item" || !menuItem.uiID) continue;
        const menuClasses = /** @type {string[]} */ (typeof menu.className === "string"
          ? menu.className.split(/\s+/).filter(Boolean)
          : []);
        const supported = ["ui-menu-tilemode", "ui-menu-3d", "ui-menu-colorpalette", "ui-menu-tileset", "ui-menu-script"];
        const excluded = ["ui-menu-music", "ui-menu-c64", "ui-menu-c64-assembler"];
        const excludedOnlyMenu = menuClasses.some((value) => excluded.includes(value)) &&
          !menuClasses.some((value) => supported.includes(value));
        // Music, Ace-only actions, emulator/debugger input, and joystick input
        // are independent systems and deliberately remain on legacy paths.
        if (excludedOnlyMenu) continue;
        const definition = getLegacyMenuCommandDefinitionForAlias(menuItem.uiID);
        if (!definition) {
          throw new Error(`Configurable menu item ${menuItem.uiID} has no command definition`);
        }
        const commandId = definition.id;
        menuItem.legacyShortcutModes = menuClasses.includes("ui-menu-c64-assembler")
          ? ["assembler"]
          : [];
        menuItem.commandId = commandId;
        entries.push({ commandId, menu, menuItem });
      }
    }
    return entries;
  }

  /** @param {any} menuBar */
  function registerMenuCommands(menuBar) {
    menuBar.commandService = commands;
    const entries = collectMenuEntries(menuBar);
    /** @type {Map<string, LegacyMenuEntry[]>} */
    const groups = new Map();
    for (const entry of entries) {
      const group = groups.get(entry.commandId) || [];
      group.push(entry);
      groups.set(entry.commandId, group);
    }
    for (const [commandId, aliases] of groups) {
      const definition = getLegacyMenuCommandDefinition(commandId);
      if (!definition) throw new Error(`Missing legacy menu command definition ${commandId}`);
      const keyboardPolicy = commandId === "project.save" || commandId === "project.saveas"
        ? "global"
        : "local";
      const defaultBindings = definition.defaultShortcuts.flatMap((shortcut) => {
        const value = commands.bindingFromLegacyShortcut(shortcut);
        return value ? [value] : [];
      });
      commands.defineCommand({
        id: commandId,
        title: definition.title,
        category: definition.category,
        defaultBindings,
        execute: (details) => app.menuClick(definition.action, "command", details?.source),
        keyboardPolicy,
      });
      for (const { menu, menuItem } of aliases) {
        let commandContexts = menuCommandContexts(menu);
        if (keyboardPolicy === "global") {
          commandContexts = commandContexts.map(({ shortcutsAllowed: _ignored, ...commandContext }) => commandContext);
        }
        commands.addCommandActivation(commandId, {
          actionContexts: menuActionContexts(menu, commandContexts),
          contexts: commandContexts,
          isEnabled: () => menuItem.enabled && menuItem.visible,
        });
      }
    }
    menuItems = entries.map(({ menuItem }) => menuItem);
  }

  function updateMenuLabels() {
    for (const menuItem of menuItems) {
      const effectiveBindings = commands.getEffectiveBindings(menuItem.commandId);
      menuItem.setShortcutText(effectiveBindings.map((value) => commands.formatBinding(value)).join(" / "));
      const menuElement = document.getElementById(menuItem.id);
      if (!menuElement) continue;
      const ariaShortcuts = effectiveBindings
        .map((value) => commands.formatAriaBinding(value))
        .filter(Boolean)
        .join(" ");
      if (ariaShortcuts) menuElement.setAttribute("aria-keyshortcuts", ariaShortcuts);
      else menuElement.removeAttribute("aria-keyshortcuts");
      const shortcutLabel = commands.formatBindings(menuItem.commandId);
      menuElement.title = shortcutLabel ? `${menuItem.label} (${shortcutLabel})` : menuItem.label;
    }
  }

  function updateEditorLabels() {
    const elements = document.querySelectorAll("[data-shortcut-command]");
    for (const element of elements) {
      const commandId = element.getAttribute("data-shortcut-command");
      if (!commandId || !commands.hasCommand(commandId)) continue;
      const label = element.getAttribute("data-shortcut-label") || "";
      const shortcut = commands.formatBindings(commandId);
      const ariaShortcuts = commands.getEffectiveBindings(commandId)
        .map((value) => commands.formatAriaBinding(value))
        .filter(Boolean)
        .join(" ");
      const suffix = element.matches?.("[data-shortcut-suffix]")
        ? element
        : element.querySelector?.("[data-shortcut-suffix]");
      if (suffix) suffix.textContent = shortcut ? ` (${shortcut})` : "";
      if (label) element.setAttribute("title", shortcut ? `${label} (${shortcut})` : label);
      if (ariaShortcuts) element.setAttribute("aria-keyshortcuts", ariaShortcuts);
      else element.removeAttribute("aria-keyshortcuts");
    }
    const drawTools = app.textModeEditor?.tools?.drawTools;
    if (drawTools?.tool) {
      const currentToolLabel = drawTools.getToolLabel(drawTools.tool);
      for (const id of ["currentTool", "currentPopupTool", "toolSettingsCurrentTool"]) {
        const element = document.getElementById(id);
        if (element) element.textContent = currentToolLabel;
      }
      const pixelDraw = drawTools.pixelDraw;
      const currentPixelDrawTool = document.getElementById("currentPixelDrawTool");
      if (pixelDraw?.toolType && currentPixelDrawTool) {
        currentPixelDrawTool.textContent = pixelDraw.getToolLabel(pixelDraw.toolType);
      }
      const pixelToolLabel = document.getElementById("pixelToolLabel");
      if (pixelDraw?.toolType && pixelToolLabel) {
        pixelToolLabel.textContent = pixelDraw.getToolLabel(pixelDraw.toolType);
      }
    }
    const colorPaletteEdit = app.colorPaletteEditor?.colorPaletteEdit;
    if (colorPaletteEdit?.currentTool) {
      const paletteToolLabel = document.getElementById("colorPaletteEditorCurrentTool");
      if (paletteToolLabel) paletteToolLabel.textContent = colorPaletteEdit.getToolLabel(colorPaletteEdit.currentTool);
    }
  }

  function updateLabels() {
    updateMenuLabels();
    updateEditorLabels();
  }

  /** @param {string} scope @param {string} toolId */
  function getToolPresentation(scope, toolId) {
    const presentation = toolMetadata.getToolPresentation(scope, toolId);
    if (!presentation) return null;
    const shortcut = presentation.commandId && commands.hasCommand(presentation.commandId)
      ? commands.formatBindings(presentation.commandId)
      : presentation.shortcut;
    return Object.freeze({
      commandId: presentation.commandId,
      label: translate(presentation.label),
      shortcut: shortcut || false,
    });
  }

  return Object.freeze({
    commandIdForMenuItem: commandIdForLegacyMenuItem,
    /** @param {any} menuBar */
    connectMenuBar(menuBar) {
      if (connected) throw new Error("The legacy command catalog is already connected");
      connected = true;
      registerEditorCommands();
      registerMenuCommands(menuBar);
      commands.onDidChange(updateLabels);
      menuBar.shortcuts = menuBar.shortcuts.filter((/** @type {any} */ shortcut) =>
        shortcut.menuItem.commandId === null || shortcut.menuItem.legacyShortcutModes.length > 0);
      updateLabels();
      schedule(updateLabels);
    },
    /** @param {string} scope @param {string} toolId */
    formatToolLabel(scope, toolId) {
      const presentation = getToolPresentation(scope, toolId);
      if (!presentation) return toolId;
      return presentation.label + (presentation.shortcut ? ` (${presentation.shortcut})` : "");
    },
    getToolPresentation,
    updateLabels,
  });
}
