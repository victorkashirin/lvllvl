/** @typedef {import("../domain/historyState.mjs").HistoryAction} HistoryAction */

/**
 * @typedef {object} TextModeHistoryCapabilities
 * @property {(actionName: "setCell" | "setCell3d", params: Record<string, any>, direction: "undo" | "redo") => void} setCell
 * @property {(params: Record<string, any>, direction: "undo" | "redo") => void} setBlockCell
 * @property {(params: Record<string, any>) => void} setCursorLocation
 * @property {(params: Record<string, any>) => void} setCursorPixelLocation
 * @property {(params: Record<string, any>, direction: "undo" | "redo") => void} setSelection
 * @property {(params: Record<string, any>, direction: "undo" | "redo") => void} setPixelSelection
 * @property {(params: Record<string, any>, direction: "undo" | "redo") => void} setTilePixel
 * @property {(params: Record<string, any>, direction: "undo" | "redo") => void} setBackgroundColor
 * @property {(params: Record<string, any>, direction: "undo" | "redo") => void} setBorderColor
 * @property {(actionName: "insertframe" | "deleteframe", params: Record<string, any>, direction: "undo" | "redo") => void} setFrameCollection
 * @property {(actionName: "createlayer" | "deletelayer", params: Record<string, any>, direction: "undo" | "redo") => void} setLayerCollection
 * @property {() => void} redrawSelection
 * @property {(allCells: boolean) => void} redrawGrid
 * @property {() => void} updateLayerPreviews
 * @property {(characters: number[]) => void} refreshTiles
 */

/**
 * Adapts the legacy text-mode editor to the narrow capabilities consumed by
 * history replay. Keeping this mapping exported lets contract tests exercise
 * the same old/new value translation used by the application composition root.
 * @param {any} editor
 * @param {{isNewSystem?: () => boolean}} [options]
 * @returns {TextModeHistoryCapabilities}
 */
export function createLegacyTextModeHistoryCapabilities(
  editor,
  { isNewSystem = () => false } = {},
) {
  if (!editor) throw new TypeError("Legacy text-mode history requires an editor");

  return {
    setCell(actionName, params, direction) {
      if (editor.graphic.getCurrentFrame() !== params.frame) {
        editor.frames.gotoFrame(params.frame);
      }

      /** @type {Record<string, any>} */
      const args = {
        t: direction === "undo" ? params.oldCharacter : params.newCharacter,
        x: params.x,
        y: params.y,
        z: params.z,
        fc: direction === "undo" ? params.oldColor : params.newColor,
        bc: direction === "undo" ? params.oldBgColor : params.newBgColor,
        rx: direction === "undo" ? params.oldRx : params.newRx,
        ry: direction === "undo" ? params.oldRy : params.newRy,
        rz: direction === "undo" ? params.oldRz : params.newRz,
        fh: direction === "undo" ? params.oldFh : params.newFh,
        fv: direction === "undo" ? params.oldFv : params.newFv,
        update: false,
      };
      args.b = direction === "undo" ? params.oldB : params.newB;

      if (actionName === "setCell") {
        editor.layers.getLayerObjectFromRef(params.layerRef)?.setCell(args);
      } else {
        editor.grid3d.setCell(args);
      }
    },
    setBlockCell(params, direction) {
      editor.blockSetManager.getCurrentBlockSet().setCharacterInBlock(
        params.b,
        params.x,
        params.y,
        direction === "undo" ? params.oldCharacter : params.newCharacter,
      );
    },
    setCursorLocation(params) {
      editor.gridView2d.setLastCursorLocation(params);
    },
    setCursorPixelLocation(params) {
      editor.tools.drawTools.pixelDraw.setLastCursorPixelLocation(params);
    },
    setSelection(params, direction) {
      editor.tools.drawTools.select.setSelection({
        from: direction === "undo" ? params.lastFrom : params.from,
        to: direction === "undo" ? params.lastTo : params.to,
        enabled: direction === "undo" ? params.lastEnabled : params.enabled,
      });
    },
    setPixelSelection(params, direction) {
      editor.tools.drawTools.pixelSelect.setSelection({
        from: direction === "undo" ? params.lastFrom : params.from,
        to: direction === "undo" ? params.lastTo : params.to,
        enabled: direction === "undo" ? params.lastEnabled : params.enabled,
      });
    },
    setTilePixel(params, direction) {
      editor.tileSetManager.getCurrentTileSet().setPixel(
        params.c,
        params.x,
        params.y,
        direction === "undo" ? params.oldValue : params.newValue,
        false,
      );
    },
    setBackgroundColor(params, direction) {
      const color = direction === "undo" ? params.oldColor : params.newColor;
      editor.tools.currentBackgroundColor = color;
      editor.setBackgroundColor(color);
    },
    setBorderColor(params, direction) {
      const color = direction === "undo" ? params.oldColor : params.newColor;
      editor.tools.currentBorderColor = color;
      editor.grid.setBorderColor(color);
    },
    setFrameCollection(actionName, params, direction) {
      if (direction === "undo" && actionName === "insertframe") {
        editor.frames.deleteFrame(params.position + 1);
      } else if (direction === "undo") {
        editor.frames.insertFrame(
          params.position - 1,
          false,
          params.frameData,
          params.layerFrameData,
        );
      } else if (actionName === "insertframe") {
        editor.frames.insertFrame(params.position);
      } else {
        editor.frames.deleteFrame(params.position);
      }
    },
    setLayerCollection(actionName, params, direction) {
      if (direction === "undo" && actionName === "deletelayer") {
        editor.layers.newLayer({
          layerId: params.layerId,
          layerPosition: params.layerPosition,
          layerData: params.layerData,
        });
        editor.graphic.redraw({ allCells: true });
      } else if (direction === "undo") {
        editor.layers.deleteLayer({ layerId: params.layerId });
      } else if (actionName === "deletelayer") {
        editor.layers.deleteLayer({ layerId: params.layerId });
      } else {
        editor.layers.newLayer({ layerId: params.layerId });
      }
    },
    redrawSelection() {
      editor.graphic.redraw({ allCells: true });
    },
    redrawGrid(allCells) {
      if (isNewSystem()) {
        if (allCells) editor.graphic.invalidateAllCells();
        editor.gridView2d.draw();
      } else if (allCells) {
        editor.grid.update({ allCells: true });
      } else {
        editor.grid.update();
      }
    },
    updateLayerPreviews() {
      editor.layers.updateAllLayerPreviews();
    },
    refreshTiles(characters) {
      const tileSet = editor.tileSetManager.getCurrentTileSet();
      for (const character of characters) tileSet.updateCharacter(character);
      editor.tileSetManager.tileSetUpdated();
      editor.graphic.invalidateAllCells();
      if (isNewSystem()) editor.gridView2d.draw();
      else editor.grid.update({ allCells: true });
    },
  };
}

/**
 * Maps stable legacy action shapes onto a small replay capability port. This is
 * the sole knowledge of text-mode action names in the native module graph.
 * @param {TextModeHistoryCapabilities} capabilities
 */
export function createTextModeHistoryReplay(capabilities) {
  const required = [
    "setCell",
    "setBlockCell",
    "setCursorLocation",
    "setCursorPixelLocation",
    "setSelection",
    "setPixelSelection",
    "setTilePixel",
    "setBackgroundColor",
    "setBorderColor",
    "setFrameCollection",
    "setLayerCollection",
    "redrawSelection",
    "redrawGrid",
    "updateLayerPreviews",
    "refreshTiles",
  ];
  const callableCapabilities = /** @type {Record<string, any>} */ (capabilities);
  for (const name of required) {
    if (typeof callableCapabilities[name] !== "function") {
      throw new TypeError(`Text-mode history requires the ${name} capability`);
    }
  }

  return {
    /** @param {HistoryAction[]} actions @param {"undo" | "redo"} direction */
    replay(actions, direction) {
      let updateWholeGrid = false;
      let gridCellsChanged = false;
      const changedCharacters = new Set();
      const ordered = direction === "undo" ? [...actions].reverse() : actions;

      for (const action of ordered) {
        const { name, params } = action;
        switch (name) {
          case "setCell":
          case "setCell3d":
            gridCellsChanged = true;
            capabilities.setCell(name, params, direction);
            break;
          case "setBlockCell":
            if (direction === "undo") updateWholeGrid = true;
            else gridCellsChanged = true;
            capabilities.setBlockCell(params, direction);
            break;
          case "cursorLocation":
            if (direction === "undo") capabilities.setCursorLocation(params);
            break;
          case "cursorPixelLocation":
            if (direction === "undo") capabilities.setCursorPixelLocation(params);
            break;
          case "setSelection":
            capabilities.setSelection(params, direction);
            capabilities.redrawSelection();
            break;
          case "pixelSetSelection":
            capabilities.setPixelSelection(params, direction);
            break;
          case "setCharPixel":
            capabilities.setTilePixel(params, direction);
            changedCharacters.add(params.c);
            break;
          case "setBackgroundColor":
            capabilities.setBackgroundColor(params, direction);
            break;
          case "setBorderColor":
            capabilities.setBorderColor(params, direction);
            break;
          case "insertframe":
          case "deleteframe":
            capabilities.setFrameCollection(name, params, direction);
            break;
          case "createlayer":
          case "deletelayer":
            capabilities.setLayerCollection(name, params, direction);
            break;
        }
      }

      if (updateWholeGrid) {
        capabilities.redrawGrid(true);
      } else if (gridCellsChanged) {
        capabilities.redrawGrid(direction === "redo");
        capabilities.updateLayerPreviews();
      }
      if (changedCharacters.size > 0) {
        capabilities.refreshTiles([...changedCharacters]);
      }
    },
  };
}
