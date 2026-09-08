/** @typedef {import("../application/commandService.mjs").CommandService} CommandService */
/** @typedef {import("../domain/shortcutContext.mjs").ShortcutContextClause} ShortcutContextClause */
/** @typedef {ReturnType<typeof import("./shortcutLabelProjection.mjs").createShortcutLabelProjection>} ShortcutLabelProjection */
/** @typedef {{commandId: string, menu: any, menuItem: any}} MenuEntry */

import { getEditorCommandDefinition } from "../domain/editorCommandDefinitions.mjs";

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

/** @param {any} menuBar @returns {MenuEntry[]} */
function collectMenuEntries(menuBar) {
  /** @type {MenuEntry[]} */
  const entries = [];
  for (const menu of menuBar.menus) {
    for (const menuItem of menu.menuItems) {
      const commandId = menuItem.commandId;
      // No ID means an independent, non-configurable surface (including
      // dynamically added project palettes/tilesets). Never infer ownership.
      if (commandId === null || typeof commandId === "undefined") continue;
      if (!getEditorCommandDefinition(commandId)) {
        throw new Error(`Menu commandId ${String(commandId)} has no command definition`);
      }
      entries.push({ commandId, menu, menuItem });
    }
  }
  return entries;
}

/**
 * Integrate explicit menu command IDs with application definitions, activation
 * state, and label projection. The only command handler bridge is legacyAction
 * calling Editor.menuClick; menuClick must never re-enter command dispatch.
 * Native command registration and label projection are composed at bootstrap.
 *
 * @param {{app: any, commands: CommandService, registerNativeCommands: () => void, labels: ShortcutLabelProjection, schedule?: (callback: () => void) => unknown}} dependencies
 */
export function createLegacyCommandCatalogAdapter({
  app,
  commands,
  registerNativeCommands,
  labels,
  schedule = (callback) => callback(),
}) {
  let connected = false;
  /** @type {any[]} */
  let menuItems = [];

  /** @param {MenuEntry[]} entries */
  function registerMenuCommands(entries) {
    /** @type {Map<string, MenuEntry[]>} */
    const groups = new Map();
    for (const entry of entries) {
      const group = groups.get(entry.commandId) || [];
      group.push(entry);
      groups.set(entry.commandId, group);
    }
    for (const [commandId, surfaces] of groups) {
      const definition = getEditorCommandDefinition(commandId);
      if (!definition) throw new Error(`Missing editor command definition ${commandId}`);
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
        execute: (details) => app.menuClick(definition.legacyAction, details?.source || "menu"),
        keyboardPolicy,
      });
      for (const { menu, menuItem } of surfaces) {
        let commandContexts = menuCommandContexts(menu);
        if (keyboardPolicy === "global") {
          commandContexts = commandContexts.map(({ shortcutsAllowed: _ignored, ...commandContext }) => commandContext);
        }
        commands.addCommandActivation(commandId, {
          actionContexts: menuActionContexts(menu, commandContexts),
          contexts: commandContexts,
          isEnabled: () => menuItem.enabled && menuItem.visible,
        });
        // Keep the independent assembler accelerator path for shared menus.
        const menuClasses = typeof menu.className === "string" ? menu.className.split(/\s+/) : [];
        menuItem.legacyShortcutModes = menuClasses.includes("ui-menu-c64-assembler")
          ? ["assembler"]
          : [];
      }
    }
  }

  function registerAdditionalSurfaceActivations() {
    /** @param {string} modal @returns {ShortcutContextClause} */
    const modalKeyboardContext = (modal) => ({
      focus: ["canvas", "palette"],
      modal,
      popupOpen: false,
      shortcutsAllowed: true,
    });
    for (const commandId of ["edit.undo", "edit.redo"]) {
      if (!commands.hasCommand(commandId)) continue;
      commands.addCommandActivation(commandId, {
        actionContexts: [{ modal: "editColorPaletteDialog" }],
        contexts: [modalKeyboardContext("editColorPaletteDialog")],
      });
    }
    for (const commandId of ["view.zoomin", "view.zoomout", "view.fitonscreen"]) {
      if (!commands.hasCommand(commandId)) continue;
      commands.addCommandActivation(commandId, {
        actionContexts: [{ editorMode: "3d" }],
        contexts: [{
          editorMode: "3d",
          modal: "none",
          popupOpen: false,
          shortcutsAllowed: true,
        }],
        isEnabled: () => app.textModeEditor?.grid3d?.currentLayer != null,
      });
    }
  }

  function updateLabels() {
    labels.updateLabels(menuItems);
  }

  return Object.freeze({
    /** @param {any} menuBar */
    connectMenuBar(menuBar) {
      if (connected) throw new Error("The legacy command catalog is already connected");
      // Validate the entire menu before registering anything or changing its
      // dispatch/accelerators, so an unknown explicit ID fails startup cleanly.
      const entries = collectMenuEntries(menuBar);
      connected = true;
      registerNativeCommands();
      registerMenuCommands(entries);
      registerAdditionalSurfaceActivations();
      menuItems = entries.map(({ menuItem }) => menuItem);
      menuBar.commandService = commands;
      commands.onDidChange(updateLabels);
      menuBar.shortcuts = menuBar.shortcuts.filter((/** @type {any} */ shortcut) =>
        shortcut.menuItem.commandId == null || shortcut.menuItem.legacyShortcutModes.length > 0);
      updateLabels();
      schedule(updateLabels);
    },
    formatToolLabel: labels.formatToolLabel,
    getToolPresentation: labels.getToolPresentation,
    updateLabels,
  });
}
