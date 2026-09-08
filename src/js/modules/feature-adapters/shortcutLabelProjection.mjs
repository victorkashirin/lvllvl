/** @typedef {import("../application/commandService.mjs").CommandService} CommandService */

/**
 * Project effective shortcuts onto menu, tool, and accessibility labels.
 * This presentation boundary neither defines nor executes commands.
 *
 * @param {{app: any, commands: CommandService, document: Document, toolMetadata: any, translate?: (value: string) => string}} dependencies
 */
export function createShortcutLabelProjection({ app, commands, document, toolMetadata, translate = (value) => value }) {
  /** @param {any[]} menuItems */
  function updateMenuLabels(menuItems) {
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
    for (const [surface, elementId] of [
      [app.colorPaletteEditor?.colorPaletteEdit, "colorPaletteEditorCurrentTool"],
      [app.textModeEditor?.colorPaletteEdit, "colorPaletteEditCurrentTool"],
      [app.textModeEditor?.blockEditor, "currentBlockEditTool"],
    ]) {
      if (!surface?.currentTool) continue;
      const toolLabel = document.getElementById(elementId);
      if (toolLabel) toolLabel.textContent = surface.getToolLabel(surface.currentTool);
    }
  }

  /** @param {any[]} menuItems */
  function updateLabels(menuItems) {
    updateMenuLabels(menuItems);
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
