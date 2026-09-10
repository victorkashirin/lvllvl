import { expect, test } from "@playwright/test";

async function open2DProject(page) {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();
  await page.locator("#start2D").click();
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();
  await expect.poll(() => page.evaluate(() => Boolean(
    g_app.services?.commands?.hasCommand("editor.tool.pencil") &&
    g_app.textModeEditor?.tileSetManager?.getCurrentTileSet(),
  ))).toBe(true);
}

async function openShortcutSettings(page) {
  await expect(page.locator(".ui-menubar-item").filter({ hasText: /^Settings$/ })).toHaveCount(0);
  const helpMenu = page.locator(".ui-menubar-item").filter({ hasText: /^Help$/ });
  await expect(helpMenu).toBeVisible();
  await helpMenu.click();
  await page.getByText("Keyboard Shortcuts...", { exact: true }).last().click();
  await expect(page.locator("#keyboardShortcutsRoot")).toBeVisible();
}

test("Save and Save As remain available while the code editor has focus", async ({ page }) => {
  await open2DProject(page);
  const modifier = await page.evaluate(() => UI.os === "Mac OS" ? "Meta" : "Control");

  await page.evaluate(() => {
    window.__shortcutSaveEvents = [];
    g_app.fileManager.save = () => window.__shortcutSaveEvents.push("save");
    g_app.fileManager.showSaveAs = () => window.__shortcutSaveEvents.push("save-as");
    g_app.setMode("script");
    g_app.scriptEditor.codeEditor.focus();
  });
  await expect.poll(() => page.evaluate(() => ({
    focus: document.activeElement?.closest?.(".ace_editor") != null,
    shortcutsAllowed: g_app.allowKeyShortcuts,
  }))).toEqual({ focus: true, shortcutsAllowed: false });

  await page.keyboard.press(`${modifier}+s`);
  await page.keyboard.press(`${modifier}+Shift+s`);
  expect(await page.evaluate(() => window.__shortcutSaveEvents)).toEqual(["save", "save-as"]);
});

test("active canvas typing owns destructive and printable menu shortcuts", async ({ page }) => {
  await open2DProject(page);

  await page.evaluate(() => {
    const drawTools = g_app.textModeEditor.tools.drawTools;
    window.__shortcutTypingEvents = [];
    window.__shortcutClearAllCount = 0;
    drawTools.setDrawTool("type");
    drawTools.typing.isActive = () => true;
    drawTools.typing.keyDown = (event) => window.__shortcutTypingEvents.push(event.key);
    drawTools.select.clearAll = () => {
      window.__shortcutClearAllCount++;
    };
    document.activeElement?.blur();
  });

  await page.keyboard.press("Delete");
  await page.evaluate(() => {
    const commands = g_app.services.commands;
    commands.assignBinding("edit.clearall",
      commands.bindingFromLegacyShortcut({ key: "q" }));
  });
  await page.keyboard.press("q");

  expect(await page.evaluate(() => ({
    clearAllCount: window.__shortcutClearAllCount,
    typingEvents: window.__shortcutTypingEvents,
  }))).toEqual({ clearAllCount: 0, typingEvents: ["Delete", "q"] });

  expect(await page.evaluate(() => {
    let cropCount = 0;
    g_app.textModeEditor.cropToSelection = () => { cropCount++ };
    const commands = g_app.services.commands;
    const wrongMode = commands.execute("textMode.screen.crop", { source: "test" }, {
      editorMode: "color palette",
      graphicType: "screen",
    });
    const validModeWithInputOwned = commands.execute("textMode.screen.crop", { source: "test" }, {
      editorMode: "2d",
      focus: "textInput",
      graphicType: "screen",
      inputOwner: "editableText",
      modal: "test-dialog",
      popupOpen: true,
      shortcutsAllowed: false,
    });
    return {
      cropCount,
      validModeWithInputOwned: validModeWithInputOwned.accepted,
      wrongMode: wrongMode.accepted,
    };
  })).toEqual({ cropCount: 1, validModeWithInputOwned: true, wrongMode: false });
});

test("palette surfaces and canvas typing keep one shortcut owner", async ({ page }) => {
  await open2DProject(page);
  const modifier = await page.evaluate(() => UI.os === "Mac OS" ? "Meta" : "Control");

  expect(await page.evaluate(() => {
    const commands = g_app.services.commands;
    const sharedIds = [
      "editor.tool.pencil",
      "editor.tool.erase",
      "editor.tool.eyedropper",
      "editor.tool.move",
      "editor.tool.marquee",
    ];
    const eraser = commands.getCommands().find(({ id }) => id === "editor.tool.erase");
    const eraserEditorModes = eraser.contexts.flatMap(({ editorMode }) =>
      Array.isArray(editorMode) ? editorMode : (typeof editorMode === "string" ? [editorMode] : []));
    return {
      eraserEditorModes: [...new Set(eraserEditorModes)].sort(),
      eraserHasPaletteModal: eraser.contexts.some(({ modal }) => modal === "editColorPaletteDialog"),
      legacyCommandsPresent: [
        "textMode.tool.pencil",
        "colorPalette.tool.pencil",
      ].some((id) => commands.hasCommand(id)),
      sharedCommandCount: commands.getCommands().filter(({ id }) => sharedIds.includes(id)).length,
    };
  })).toEqual({
    eraserEditorModes: ["2d", "3d", "color palette"],
    eraserHasPaletteModal: true,
    legacyCommandsPresent: false,
    sharedCommandCount: 5,
  });

  await page.evaluate(() => {
    const palette = g_app.colorPaletteEditor.colorPaletteEdit;
    palette.setColorPaletteTool = (tool) => window.__shortcutOwnerEvents.push(["standalone-tool", tool]);
    palette.undo = () => window.__shortcutOwnerEvents.push(["standalone-undo"]);
    palette.redo = () => window.__shortcutOwnerEvents.push(["standalone-redo"]);
    g_app.setMode("color palette");
    window.__shortcutOwnerEvents = [];
    document.activeElement?.blur();
  });

  for (const key of ["n", "l", "i", "v", "m"]) await page.keyboard.press(key);
  await page.keyboard.press(`${modifier}+z`);
  await page.keyboard.press(`${modifier}+Shift+z`);
  expect(await page.evaluate(() => window.__shortcutOwnerEvents)).toEqual([
    ["standalone-tool", "pen"],
    ["standalone-tool", "erase"],
    ["standalone-tool", "eyedropper"],
    ["standalone-tool", "move"],
    ["standalone-tool", "select"],
    ["standalone-undo"],
    ["standalone-redo"],
  ]);

  await page.evaluate(() => {
    g_app.setMode("2d");
    const drawTools = g_app.textModeEditor.tools.drawTools;
    drawTools.setDrawTool("type");
    drawTools.typing.isActive = () => true;
    g_app.textModeEditor.editColorPalette();
  });
  await expect(page.locator("#colorPaletteEdit")).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    UI.dialogStack[UI.dialogStack.length - 1]?.uiID,
  )).toBe("editColorPaletteDialog");

  await page.evaluate(() => {
    const palette = g_app.textModeEditor.colorPaletteEdit;
    palette.setColorPaletteTool = (tool) => window.__shortcutOwnerEvents.push(["modal-tool", tool]);
    palette.undo = () => window.__shortcutOwnerEvents.push(["modal-undo"]);
    palette.redo = () => window.__shortcutOwnerEvents.push(["modal-redo"]);
    window.__shortcutOwnerEvents = [];
    document.activeElement?.blur();
  });

  for (const key of ["n", "l", "i", "v", "m"]) await page.keyboard.press(key);
  await page.keyboard.press(`${modifier}+z`);
  await page.keyboard.press(`${modifier}+Shift+z`);
  expect(await page.evaluate(() => window.__shortcutOwnerEvents)).toEqual([
    ["modal-tool", "pen"],
    ["modal-tool", "erase"],
    ["modal-tool", "eyedropper"],
    ["modal-tool", "move"],
    ["modal-tool", "select"],
    ["modal-undo"],
    ["modal-redo"],
  ]);

  await page.locator("#colorPaletteEditHex").focus();
  await page.keyboard.press("n");
  expect(await page.evaluate(() => window.__shortcutOwnerEvents)).toHaveLength(7);

  await page.evaluate(() => {
    const commands = g_app.services.commands;
    commands.assignBinding("editor.tool.erase",
      commands.bindingFromLegacyShortcut({ key: "F2" }));
    window.__shortcutOwnerEvents = [];
    document.activeElement?.blur();
  });
  await expect(page.locator("#colorPaletteEditTool_erase"))
    .toHaveAttribute("title", "Eraser (F2)");
  await page.keyboard.press("l");
  await page.keyboard.press("F2");
  expect(await page.evaluate(() => window.__shortcutOwnerEvents)).toEqual([
    ["modal-tool", "erase"],
  ]);

  await page.evaluate(() => {
    UI.closeDialog();
    g_app.setMode("2d");
    g_app.textModeEditor.tools.drawTools.setDrawTool("pen");
    document.activeElement?.blur();
  });
  await expect(page.locator('#drawTool_erase [data-shortcut-command="editor.tool.erase"]'))
    .toHaveAttribute("title", "Eraser (F2)");
  await page.keyboard.press("F2");
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.tools.drawTools.tool,
  )).toBe("erase");

  await page.evaluate(() => {
    g_app.setMode("3d");
    g_app.textModeEditor.tools.drawTools.setDrawTool("pen");
    document.activeElement?.blur();
  });
  await expect.poll(() => page.evaluate(() => g_app.mode)).toBe("3d");
  await page.keyboard.press("F2");
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.tools.drawTools.tool,
  )).toBe("erase");

  await page.evaluate(() => {
    g_app.setMode("color palette");
    window.__shortcutOwnerEvents = [];
    document.activeElement?.blur();
  });
  await expect(page.locator("#colorPaletteEditorTool_erase"))
    .toHaveAttribute("title", "Eraser (F2)");
  await page.keyboard.press("F2");
  expect(await page.evaluate(() => window.__shortcutOwnerEvents)).toEqual([
    ["standalone-tool", "erase"],
  ]);

  await page.evaluate(() => {
    g_app.setMode("2d");
    const editor = g_app.textModeEditor;
    const drawTools = editor.tools.drawTools;
    window.__shortcutOwnerEvents = [];
    drawTools.setDrawTool("type");
    drawTools.typing.isActive = () => true;
    drawTools.typing.keyDown = (event) => {
      if (event.key.length === 1) window.__shortcutOwnerEvents.push(["typed", event.key]);
    };
    editor.currentTile.setColor = (index) => window.__shortcutOwnerEvents.push(["colour", index]);
    document.activeElement?.blur();
  });

  await page.keyboard.press("Alt+1");
  await page.keyboard.press("Alt+Shift+1");
  await page.keyboard.press("n");
  expect(await page.evaluate(() => ({
    events: window.__shortcutOwnerEvents,
    tool: g_app.textModeEditor.tools.drawTools.tool,
  }))).toEqual({
    events: [["colour", 0], ["colour", 8], ["typed", "n"]],
    tool: "type",
  });
});

test("Meta Tile Editor uses rebound shared commands", async ({ page }) => {
  await open2DProject(page);

  await page.evaluate(() => {
    const commands = g_app.services.commands;
    commands.assignBinding("editor.tool.pencil",
      commands.bindingFromLegacyShortcut({ key: "F2" }));
    g_app.textModeEditor.blockEditor.show({ blockHeight: 2, blockWidth: 2 });
  });
  await expect.poll(() => page.evaluate(() =>
    UI.dialogStack[UI.dialogStack.length - 1]?.uiID,
  )).toBe("blockEditor");
  await expect(page.locator("#blockEditTool_pen")).toHaveAttribute("title", "Pencil (F2)");

  await page.evaluate(() => {
    const blockEditor = g_app.textModeEditor.blockEditor;
    window.__blockEditorShortcutEvents = [];
    blockEditor.setTool = (tool) => window.__blockEditorShortcutEvents.push(["tool", tool]);
    blockEditor.tilePaletteDisplay.moveSelection = (dx, dy) =>
      window.__blockEditorShortcutEvents.push(["palette", dx, dy]);
    blockEditor.rotateCharacter = () => window.__blockEditorShortcutEvents.push(["rotate"]);
    document.activeElement?.blur();
  });

  await page.keyboard.press("n");
  await page.keyboard.press("F2");
  await page.keyboard.press("d");
  await page.keyboard.press("r");
  expect(await page.evaluate(() => window.__blockEditorShortcutEvents)).toEqual([
    ["tool", "pen"],
    ["palette", 1, 0],
    ["rotate"],
  ]);
});

test("tile and color picker popups support keyboard-only selection", async ({ page }) => {
  await open2DProject(page);

  await expect.poll(() => page.evaluate(() => {
    const display = g_app.textModeEditor.colorPalettePanel.colorPaletteDisplay;
    const color = display.getSelectedColor(0);
    const position = display.colorToGridXy(color);
    if(position.x === false || position.y === false) return null;
    const ratio = display.canvasScale;
    const x = display.colorSpacing
      + position.x * (display.colorWidth + display.colorSpacing)
      + display.colorWidth / 2;
    const y = display.colorSpacing
      + position.y * (display.colorHeight + display.colorSpacing);
    const context = display.canvas.getContext("2d");
    const pixel = (logicalX, logicalY) => Array.from(context.getImageData(
      Math.floor(logicalX * ratio),
      Math.floor(logicalY * ratio),
      1,
      1,
    ).data.slice(0, 3));
    return {
      outer: pixel(x, y - 0.5),
      inner: pixel(x, y + 0.5),
    };
  })).toEqual({
    outer: [255, 212, 0],
    inner: [0, 0, 0],
  });

  await expect.poll(() => page.locator("#toolSettingsCurrentTile").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for(let index = 0; index < pixels.length; index += 4) {
      if(pixels[index] === 255 && pixels[index + 1] === 212 && pixels[index + 2] === 0) {
        return true;
      }
    }
    return false;
  })).toBe(true);

  await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    editor.currentTile.setCharacters([[0]]);
    document.activeElement?.blur();
  });

  await page.keyboard.press("/");
  await expect(page.locator("#characterPickerCanvas")).toBeVisible();
  expect(await page.evaluate(() =>
    g_app.textModeEditor.tileSetManager.tilePickerPopup.tilePaletteDisplay
      .getSelectedCharactersGrid(),
  )).toEqual([[0]]);

  await page.keyboard.press("ArrowRight");
  const pendingTile = await page.evaluate(() =>
    g_app.textModeEditor.tileSetManager.tilePickerPopup.tilePaletteDisplay
      .getSelectedCharactersGrid(),
  );
  expect(pendingTile).not.toEqual([[0]]);
  expect(await page.evaluate(() =>
    g_app.textModeEditor.currentTile.getCharacters(),
  )).toEqual([[0]]);

  await page.keyboard.press("Enter");
  await expect(page.locator("#characterPickerCanvas")).toBeHidden();
  expect(await page.evaluate(() =>
    g_app.textModeEditor.currentTile.getCharacters(),
  )).toEqual(pendingTile);

  const edgeTile = await page.evaluate(() =>
    g_app.textModeEditor.tileSetManager.tilePickerPopup.tilePaletteDisplay
      .getCharPaletteMap()[0][0],
  );
  await page.evaluate((tile) => {
    g_app.textModeEditor.currentTile.setCharacters([[tile]]);
  }, edgeTile);
  await page.keyboard.press("/");
  await expect(page.locator("#characterPickerCanvas")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => {
    const display = g_app.textModeEditor.tileSetManager.tilePickerPopup.tilePaletteDisplay;
    return {
      characters: display.getSelectedCharacters(),
      grid: display.getSelectedCharactersGrid(),
    };
  })).toEqual({ characters: [edgeTile], grid: [[edgeTile]] });
  await page.keyboard.press("Enter");
  await expect(page.locator("#characterPickerCanvas")).toBeHidden();

  const colorNavigation = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const map = editor.colorPaletteManager.getCurrentColorPalette().getCurrentColorMap();
    const directions = [
      { dx: 1, dy: 0, key: "ArrowRight", opposite: "ArrowLeft" },
      { dx: -1, dy: 0, key: "ArrowLeft", opposite: "ArrowRight" },
      { dx: 0, dy: 1, key: "ArrowDown", opposite: "ArrowUp" },
      { dx: 0, dy: -1, key: "ArrowUp", opposite: "ArrowDown" },
    ];
    for(let y = 0; y < map.length; y++) {
      for(let x = 0; x < map[y].length; x++) {
        if(map[y][x] < 0) continue;
        for(const direction of directions) {
          const nextY = y + direction.dy;
          const nextX = x + direction.dx;
          if(map[nextY]?.[nextX] >= 0) {
            editor.currentTile.setColor(map[y][x]);
            editor.currentTile.setBGColor(map[y][x]);
            return {
              background: map[y][x],
              foreground: map[y][x],
              key: direction.key,
              opposite: direction.opposite,
              target: map[nextY][nextX],
            };
          }
        }
      }
    }
    throw new Error("The test palette has no adjacent colors");
  });

  await page.keyboard.press("Shift+Slash");
  await expect(page.locator("#colorPickerCanvas")).toBeVisible();
  await expect(page.locator("#colorPickerKeyboardHint"))
    .toHaveText("Shift+Enter / Right-click BG");
  await page.keyboard.press(colorNavigation.key);
  expect(await page.evaluate(() =>
    g_app.textModeEditor.colorPaletteManager.colorPicker.colorPaletteDisplay
      .getHighlightColor(),
  )).toBe(colorNavigation.target);
  expect(await page.evaluate(() => ({
    background: g_app.textModeEditor.currentTile.getBGColor(),
    foreground: g_app.textModeEditor.currentTile.getColor(),
  }))).toEqual({
    background: colorNavigation.background,
    foreground: colorNavigation.foreground,
  });

  await page.keyboard.press("Enter");
  await expect(page.locator("#colorPickerCanvas")).toBeHidden();
  expect(await page.evaluate(() => ({
    background: g_app.textModeEditor.currentTile.getBGColor(),
    foreground: g_app.textModeEditor.currentTile.getColor(),
  }))).toEqual({
    background: colorNavigation.background,
    foreground: colorNavigation.target,
  });

  await page.keyboard.press("Shift+Slash");
  await expect(page.locator("#colorPickerCanvas")).toBeVisible();
  const rightClickCell = await page.evaluate((color) => {
    const display = g_app.textModeEditor.colorPaletteManager.colorPicker.colorPaletteDisplay;
    const position = display.colorToGridXy(color);
    return {
      x: display.colorSpacing + position.x * (display.colorWidth + display.colorSpacing) + display.colorWidth / 2,
      y: display.colorSpacing + position.y * (display.colorHeight + display.colorSpacing) + display.colorHeight / 2,
    };
  }, colorNavigation.target);
  const colorCanvasBox = await page.locator("#colorPickerCanvas").boundingBox();
  await page.mouse.click(
    colorCanvasBox.x + rightClickCell.x,
    colorCanvasBox.y + rightClickCell.y,
    { button: "right" },
  );
  await expect(page.locator("#colorPickerCanvas")).toBeHidden();
  expect(await page.evaluate(() => ({
    background: g_app.textModeEditor.currentTile.getBGColor(),
    foreground: g_app.textModeEditor.currentTile.getColor(),
  }))).toEqual({
    background: colorNavigation.target,
    foreground: colorNavigation.target,
  });

  await page.keyboard.press("Shift+Slash");
  await expect(page.locator("#colorPickerCanvas")).toBeVisible();
  await page.keyboard.press(colorNavigation.opposite);
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator("#colorPickerCanvas")).toBeHidden();
  expect(await page.evaluate(() => ({
    background: g_app.textModeEditor.currentTile.getBGColor(),
    foreground: g_app.textModeEditor.currentTile.getColor(),
  }))).toEqual({
    background: colorNavigation.foreground,
    foreground: colorNavigation.target,
  });

  await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const colorMap = editor.colorPaletteManager.getCurrentColorPalette().getCurrentColorMap();
    const topRowColor = colorMap[0].find((color) => color >= 0);
    window.__transparentKeyboardColor = null;
    editor.colorPaletteManager.showColorPicker(100, 100, {
      colorPickedCallback: (color) => {
        window.__transparentKeyboardColor = color;
      },
      currentColor: topRowColor,
      hasNone: true,
    });
  });
  await expect(page.locator("#colorPickerCanvas")).toBeVisible();
  await page.keyboard.press("ArrowUp");
  expect(await page.evaluate(() =>
    g_app.textModeEditor.colorPaletteManager.colorPicker.keyboardNoColorHighlighted,
  )).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.locator("#colorPickerCanvas")).toBeHidden();
  expect(await page.evaluate(() => window.__transparentKeyboardColor)).toBe(-1);

  await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    window.__originalGetScreenMode = editor.getScreenMode;
    editor.getScreenMode = () => TextModeEditor.Mode.C64STANDARD;
  });
  await page.keyboard.press("Shift+Slash");
  await expect(page.locator("#colorPickerCanvas")).toBeVisible();
  await expect(page.locator("#colorPickerKeyboardHint")).toBeHidden();
  await page.keyboard.press(colorNavigation.opposite);
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator("#colorPickerCanvas")).toBeVisible();
  expect(await page.evaluate(() =>
    g_app.textModeEditor.currentTile.getColor(),
  )).toBe(colorNavigation.target);
  const unsupportedColorCanvasBox = await page.locator("#colorPickerCanvas").boundingBox();
  await page.mouse.click(
    unsupportedColorCanvasBox.x + rightClickCell.x,
    unsupportedColorCanvasBox.y + rightClickCell.y,
    { button: "right" },
  );
  await expect(page.locator("#colorPickerCanvas")).toBeVisible();
  expect(await page.evaluate(() =>
    g_app.textModeEditor.colorPaletteManager.colorPicker.colorPaletteDisplay
      .getSelectedColor(1),
  )).toBe(-1);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    editor.getScreenMode = window.__originalGetScreenMode;
    delete window.__originalGetScreenMode;
  });
});

test("menu rebindings retire the legacy default accelerator", async ({ page }) => {
  await open2DProject(page);
  const modifier = await page.evaluate(() => UI.os === "Mac OS" ? "Meta" : "Control");

  await page.evaluate(() => {
    window.__shortcutCopyImageCount = 0;
    g_app.textModeEditor.copyAsImage = () => {
      window.__shortcutCopyImageCount++;
    };
    const commands = g_app.services.commands;
    commands.assignBinding("edit.copyimage",
      commands.bindingFromLegacyShortcut({ key: "F2" }));
    document.activeElement?.blur();
  });

  await page.keyboard.press(`${modifier}+i`);
  expect(await page.evaluate(() => window.__shortcutCopyImageCount)).toBe(0);
  await page.keyboard.press("F2");
  expect(await page.evaluate(() => window.__shortcutCopyImageCount)).toBe(1);
});

test("shortcut settings replace conflicts and drive the editor from one binding", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await open2DProject(page);

  const menuBindings = await page.evaluate(() => ({
    clearAll: g_app.services.commands.formatBindings("edit.clearall"),
    copyImage: g_app.services.commands.formatBindings("edit.copyimage"),
    referenceImage: g_app.services.commands.formatBindings("textMode.referenceImage"),
  }));
  expect(menuBindings.clearAll).toBe("Delete");
  expect(menuBindings.copyImage).toMatch(/^(?:Cmd|Ctrl)\+I$/);
  expect(menuBindings.referenceImage).toMatch(/^(?:Ctrl\+Alt|Option\+Cmd)\+I$/);

  await page.evaluate(() => {
    window.__shortcutClearAllCount = 0;
    g_app.textModeEditor.tools.drawTools.select.clearAll = () => {
      window.__shortcutClearAllCount++;
    };
    document.activeElement?.blur();
  });
  await page.keyboard.press("Delete");
  expect(await page.evaluate(() => window.__shortcutClearAllCount)).toBe(1);

  await openShortcutSettings(page);

  const conflictsOnly = page.locator("#keyboardShortcutsConflictsOnly");
  await conflictsOnly.check();
  const canvasCopyLeft = page.locator('tr[data-command-id="textMode.canvas.copyContents.left"]');
  const isMac = await page.evaluate(() => UI.os === "Mac OS");
  if (isMac) {
    await expect(canvasCopyLeft).toBeHidden();
  } else {
    await expect(canvasCopyLeft).toBeVisible();
    const canvasCopyWarning = canvasCopyLeft.locator(".keyboard-shortcuts-warning-badge");
    await expect(canvasCopyWarning).toHaveText("!");
    await expect(canvasCopyWarning).toHaveAttribute(
      "title",
      "May be reserved by the browser or operating system",
    );
  }
  await conflictsOnly.uncheck();
  if (isMac) {
    const canvasCopyReuse = canvasCopyLeft.locator(".keyboard-shortcuts-reuse-badge");
    await expect(canvasCopyReuse).toHaveText("↔");
    await expect(canvasCopyReuse).toHaveAttribute("title", /Also used by Copy Selection Contents Left/);
  }

  const toolsHeading = page.locator(".keyboard-shortcuts-group-heading")
    .filter({ hasText: /^Tools/ });
  await expect(toolsHeading).toHaveCount(1);
  await expect(page.locator(".keyboard-shortcuts-group-heading")
    .filter({ hasText: /^Text Tools/ })).toHaveCount(0);
  await expect(toolsHeading.locator(".keyboard-shortcuts-group-function"))
    .toHaveCSS("color", "rgb(238, 238, 238)");
  await expect(page.locator(".keyboard-shortcuts-group-scope, .keyboard-shortcuts-group-separator"))
    .toHaveCount(0);
  await expect(page.locator(".keyboard-shortcuts-group-heading")
    .filter({ hasText: /Current Editor|Other editor modes|Color Palette Editor/ })).toHaveCount(0);
  const pencilActions = page.locator('tr[data-command-id="editor.tool.pencil"] .keyboard-shortcuts-action');
  await expect(pencilActions).toHaveCount(2);
  for (const action of await pencilActions.all()) {
    await expect(action).toHaveCSS("align-items", "center");
    await expect(action).toHaveCSS("justify-content", "center");
  }
  await expect(page.locator('tr[data-command-id="editor.tool.pencil"] .keyboard-shortcuts-command-category'))
    .toHaveCount(0);

  const toolbarControlAlignment = await page.locator(".keyboard-shortcuts-toolbar").evaluate((toolbar) => {
    const filter = toolbar.querySelector(".keyboard-shortcuts-filter");
    const buttons = Array.from(toolbar.querySelectorAll(":scope > .ui-button"));
    const filterBounds = filter.getBoundingClientRect();
    return buttons.map((button) => {
      const bounds = button.getBoundingClientRect();
      return {
        centerDifference: Math.abs(
          (bounds.top + bounds.bottom) / 2 - (filterBounds.top + filterBounds.bottom) / 2,
        ),
        height: bounds.height,
      };
    });
  });
  expect(toolbarControlAlignment).toEqual([
    { centerDifference: 0, height: 28 },
    { centerDifference: 0, height: 28 },
    { centerDifference: 0, height: 28 },
  ]);

  const excludedCommands = await page.evaluate(() => g_app.services.commands.getCommands()
    .map(({ id }) => id)
    .filter((id) => /(?:^music\.|^debugger\.|joystick|^ace\.|assembler)/i.test(id)));
  expect(excludedCommands).toEqual([]);

  const excludedContexts = await page.evaluate(() => g_app.services.commands.getCommands()
    .filter(({ category, contexts }) => category === "Music" || contexts.some(({ editorMode }) => {
      const modes = Array.isArray(editorMode) ? editorMode : [editorMode];
      return modes.some((mode) => ["music", "c64", "assembler"].includes(mode));
    }))
    .map(({ id }) => id));
  expect(excludedContexts).toEqual([]);

  const search = page.locator("#keyboardShortcutsSearch");
  await search.press("l");
  await expect(search).toHaveValue("l");
  await expect(page.locator('tr[data-command-id="editor.tool.erase"]')).toBeVisible();
  await expect(page.locator('tr[data-command-id="editor.tool.pencil"]')).toBeHidden();
  expect(await page.evaluate(() => g_app.textModeEditor.tools.drawTools.tool)).toBe("pen");

  await search.fill("U");
  await expect(page.locator('tr[data-command-id="editor.tool.shape"]')).toBeVisible();
  await expect(page.locator('tr[data-command-id="textMode.pixelTool.shape"]')).toBeHidden();

  await search.evaluate((input, firefoxMac) => {
    const event = new KeyboardEvent("keydown", {
      altKey: true,
      bubbles: true,
      cancelable: true,
      code: "Digit1",
      key: "¡",
    });
    Object.defineProperty(event, "getModifierState", {
      value: (modifier) => firefoxMac && modifier === "AltGraph",
    });
    input.dispatchEvent(event);
  }, isMac);
  await expect(search).toHaveValue(isMac ? "Option+1" : "Alt+1");
  await expect(page.locator('tr[data-command-id="textMode.color.select.1"]')).toBeVisible();
  await expect(page.locator('tr[data-command-id="editor.tool.shape"]')).toBeHidden();

  await search.press("Shift+/");
  await expect(search).toHaveValue("Shift+?");
  await expect(page.locator('tr[data-command-id="textMode.picker.colors"]')).toBeVisible();
  await expect(page.locator('tr[data-command-id="textMode.picker.tiles"]')).toBeHidden();

  await search.press(`${isMac ? "Meta" : "Control"}+a`);
  expect(await search.evaluate((input) => [input.selectionStart, input.selectionEnd]))
    .toEqual([0, "Shift+?".length]);

  await search.fill("");
  await search.press("Shift+P");
  await expect(search).toHaveValue("P");

  await search.fill("Pencil");
  const pencilRow = page.locator('tr[data-command-id="editor.tool.pencil"]');
  await expect(pencilRow).toBeVisible();
  await expect(pencilRow.locator(".keyboard-shortcuts-binding")).toHaveText("N");
  const listHeight = await page.locator("#keyboardShortcutsTableHolder").evaluate((element) =>
    element.getBoundingClientRect().height,
  );
  await pencilRow.locator(".keyboard-shortcuts-binding").click();
  await expect(page.locator("#keyboardShortcutsRecorder")).toHaveCSS("position", "absolute");
  expect(await page.locator("#keyboardShortcutsTableHolder").evaluate((element) =>
    element.getBoundingClientRect().height,
  )).toBe(listHeight);
  await expect(page.locator("#keyboardShortcutsRecorderCapture"))
    .toHaveAttribute("data-capturing", "true");
  await page.keyboard.press("l");

  await expect(page.locator("#keyboardShortcutsConflictActions")).toBeVisible();
  await expect(page.locator("#keyboardShortcutsRecorderMessage")).toContainText("Eraser");
  await page.locator("#keyboardShortcutsReplaceConflicts").click();
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => g_app.services.commands.formatBindings("editor.tool.pencil"))).toBe("L");
  await expect(page.locator("#keyboardShortcutsStatus")).toContainText("Shortcut saved");
  await expect(pencilRow.locator(".keyboard-shortcuts-binding")).toHaveText("L");
  await expect(pencilRow.locator(".keyboard-shortcuts-binding")).toBeFocused();
  await expect(pencilRow.locator(".keyboard-shortcuts-source")).toHaveText("User");

  await search.fill("Eraser");
  const eraserRow = page.locator('tr[data-command-id="editor.tool.erase"]');
  await expect(eraserRow.locator(".keyboard-shortcuts-binding-unassigned")).toHaveText("Assign");
  await expect(page.locator('#drawTool_pen [data-shortcut-command="editor.tool.pencil"]'))
    .toHaveAttribute("title", "Pencil (L)");

  await search.fill("");
  await page.locator("#keyboardShortcutsBoundOnly").check();
  await expect(pencilRow).toBeVisible();
  await expect(eraserRow).toBeHidden();

  await page.getByText("Close", { exact: true }).last().click();
  await page.evaluate(() => {
    document.activeElement?.blur();
    g_app.textModeEditor.tools.drawTools.setDrawTool("erase");
  });
  await page.keyboard.press("n");
  expect(await page.evaluate(() => g_app.textModeEditor.tools.drawTools.tool)).toBe("erase");
  await page.keyboard.press("l");
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.tools.drawTools.tool,
  )).toBe("pen");

  expect(await page.evaluate(() => JSON.parse(
    localStorage.getItem("lvllvl.keyboardShortcuts"),
  ).overrides)).toMatchObject({
    "editor.tool.erase": [],
    "editor.tool.pencil": [{ sequence: [{ key: "l" }] }],
  });
});

test("shortcut settings identify changes that are only applied for this session", async ({ page }) => {
  await open2DProject(page);
  await openShortcutSettings(page);
  await page.locator("#keyboardShortcutsSearch").fill("Pencil");
  const pencilRow = page.locator('tr[data-command-id="editor.tool.pencil"]');

  await page.evaluate(() => {
    window.__shortcutOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "lvllvl.keyboardShortcuts") {
        throw new DOMException("Injected quota failure", "QuotaExceededError");
      }
      return window.__shortcutOriginalSetItem.call(this, key, value);
    };
  });
  await pencilRow.locator('[data-action="clear"]').click();

  await expect(page.locator("#keyboardShortcutsStatus")).toHaveText(
    "Shortcut cleared for this session, but could not be saved.",
  );
  await expect(page.locator("#keyboardShortcutsStatus")).toHaveAttribute("data-kind", "warning");
  await expect(pencilRow.locator(".keyboard-shortcuts-binding-unassigned")).toHaveText("Assign");
  expect(await page.evaluate(() => localStorage.getItem("lvllvl.keyboardShortcuts"))).toBeNull();

  await page.evaluate(() => {
    Storage.prototype.setItem = window.__shortcutOriginalSetItem;
    delete window.__shortcutOriginalSetItem;
  });
});

test("shortcut import reports recovered, truncated, and unknown entries", async ({ page }) => {
  await open2DProject(page);
  await openShortcutSettings(page);
  await page.locator("#keyboardShortcutsImportFile").setInputFiles({
    buffer: Buffer.from(JSON.stringify({
      version: 2,
      overrides: {
        "Bad id": [{ sequence: [{ key: "b" }] }],
        "future.command": [{ sequence: [{ key: "f" }] }],
        "editor.tool.invalid": [{ sequence: [] }],
        "editor.tool.pencil": [
          { sequence: [{ key: "p" }] },
          { sequence: [{ key: "q" }] },
        ],
      },
    })),
    mimeType: "application/json",
    name: "shortcuts.json",
  });

  await expect(page.locator("#keyboardShortcutsStatus")).toHaveText(
    "Keyboard shortcuts imported and saved. 2 invalid entries were skipped. " +
    "Extra shortcuts were ignored for 1 command. " +
    "1 unknown command override was retained for future availability.",
  );
  expect(await page.evaluate(() => ({
    exported: JSON.parse(g_app.services.commands.exportConfiguration()).overrides["future.command"],
    pencil: g_app.services.commands.formatBindings("editor.tool.pencil"),
  }))).toEqual({
    exported: [{ priority: 0, repeat: false, sequence: [{
      alt: false,
      code: null,
      ctrl: false,
      key: "f",
      meta: false,
      mod: false,
      shift: false,
    }] }],
    pencil: "P",
  });

  await page.locator("#keyboardShortcutsImportFile").setInputFiles({
    buffer: Buffer.from(JSON.stringify({
      version: 2,
      overrides: {
        "editor.tool.invalid": [{ sequence: [] }],
      },
    })),
    mimeType: "application/json",
    name: "invalid-shortcuts.json",
  });
  await expect(page.locator("#keyboardShortcutsStatus")).toHaveText(
    "Could not import shortcuts: the file is not valid. 1 invalid entry was skipped.",
  );
  await expect(page.locator("#keyboardShortcutsStatus")).toHaveAttribute("data-kind", "error");
  expect(await page.evaluate(() => ({
    future: JSON.parse(g_app.services.commands.exportConfiguration()).overrides["future.command"],
    pencil: g_app.services.commands.formatBindings("editor.tool.pencil"),
  }))).toEqual({
    future: [{ priority: 0, repeat: false, sequence: [{
      alt: false,
      code: null,
      ctrl: false,
      key: "f",
      meta: false,
      mod: false,
      shift: false,
    }] }],
    pencil: "P",
  });
});

test("shortcut recorder supports keyboard setup, Tab capture, focus return, and scoped sticky headers", async ({ page }) => {
  await open2DProject(page);
  await page.evaluate(() => {
    const commands = g_app.services.commands;
    const analyzeBinding = commands.analyzeBinding.bind(commands);
    window.__shortcutConflictAnalyses = 0;
    commands.analyzeBinding = (commandId, binding) => {
      window.__shortcutConflictAnalyses++;
      return analyzeBinding(commandId, binding);
    };
  });
  await openShortcutSettings(page);
  const search = page.locator("#keyboardShortcutsSearch");
  await page.evaluate(() => {
    window.__shortcutPencilRow = document.querySelector(
      'tr[data-command-id="editor.tool.pencil"]',
    );
    window.__shortcutConflictAnalyses = 0;
  });
  await search.fill("Pencil");
  expect(await page.evaluate(() => ({
    reusedRow: window.__shortcutPencilRow === document.querySelector(
      'tr[data-command-id="editor.tool.pencil"]',
    ),
    conflictAnalyses: window.__shortcutConflictAnalyses,
  }))).toEqual({ conflictAnalyses: 0, reusedRow: true });
  const pencilBinding = page.locator(
    'tr[data-command-id="editor.tool.pencil"] .keyboard-shortcuts-binding',
  );
  const physical = page.locator("#keyboardShortcutsPhysicalKey");
  const capture = page.locator("#keyboardShortcutsRecorderCapture");
  const recorder = page.locator("#keyboardShortcutsRecorder");
  const status = page.locator("#keyboardShortcutsStatus");

  await pencilBinding.focus();
  await page.keyboard.press("Enter");
  await expect(capture).toBeFocused();
  await expect(capture).toHaveAttribute("data-capturing", "true");
  await expect(physical).toBeEnabled();
  await physical.click();
  await expect(physical).toBeChecked();
  await expect(capture).toBeFocused();
  await expect(capture).toHaveAttribute("data-capturing", "true");
  await page.keyboard.press("Escape");
  await expect(recorder).toBeHidden();
  await expect(status).toHaveText("Shortcut recording cancelled.");
  await expect(pencilBinding).toBeFocused();

  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await expect(recorder).toBeHidden();
  await expect(status).toContainText("Shortcut saved");
  await expect(pencilBinding).toHaveText("Shift+[Tab]");
  await expect(pencilBinding).toBeFocused();
  expect(await page.evaluate(() => {
    const chord = g_app.services.commands.getEffectiveBindings("editor.tool.pencil")[0].sequence[0];
    return { code: chord.code, key: chord.key, shift: chord.shift };
  })).toEqual({ code: "Tab", key: null, shift: true });

  await page.keyboard.press("Enter");
  await expect(capture).toHaveAttribute("data-capturing", "true");
  await physical.click();
  await expect(physical).not.toBeChecked();
  await page.keyboard.press("l");
  await expect(page.locator("#keyboardShortcutsReplaceConflicts")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(recorder).toBeHidden();
  await expect(pencilBinding).toHaveText("L");
  await expect(pencilBinding).toBeFocused();

  await page.evaluate(() => {
    const commands = g_app.services.commands;
    Object.defineProperty(commands, "assignBinding", {
      configurable: true,
      value: () => ({
        applied: false,
        error: new Error("Injected rejected shortcut edit"),
        overrides: {},
        status: "rejected",
      }),
    });
  });
  expect(await page.evaluate(() => ({
    ownMethod: Object.hasOwn(g_app.services.commands, "assignBinding"),
    probeStatus: g_app.services.commands.assignBinding("editor.tool.pencil", {}).status,
  }))).toEqual({ ownMethod: true, probeStatus: "rejected" });
  await page.keyboard.press("Enter");
  await expect(capture).toBeFocused();
  await expect(capture).toHaveAttribute("data-capturing", "true");
  await page.keyboard.press("q");
  await expect(page.locator("#keyboardShortcutsReplaceConflicts")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(recorder).toBeVisible();
  await expect(status).toHaveText("Shortcut could not be changed.");
  await expect(status).toHaveAttribute("data-kind", "error");
  await page.keyboard.press("Escape");
  await expect(pencilBinding).toBeFocused();
  await page.evaluate(() => {
    delete g_app.services.commands.assignBinding;
  });

  await page.evaluate(() => {
    const commands = g_app.services.commands;
    commands.assignBinding("editor.tool.erase",
      commands.bindingFromLegacyShortcut({ key: "l" }));
  });
  const conflictsOnly = page.locator("#keyboardShortcutsConflictsOnly");
  await conflictsOnly.check();
  await expect(pencilBinding).toBeVisible();
  await pencilBinding.focus();
  await page.keyboard.press("Enter");
  await physical.check();
  await expect(capture).toHaveAttribute("data-capturing", "true");
  await page.keyboard.press("Shift+Tab");
  await expect(recorder).toBeHidden();
  await expect(conflictsOnly).toBeChecked();
  await expect(pencilBinding).toHaveText("Shift+[Tab]");
  await expect(pencilBinding).toBeFocused();

  await search.fill("");
  await expect(pencilBinding).toBeHidden();
  await conflictsOnly.uncheck();
  const headerState = await page.locator("#keyboardShortcutsTableHolder").evaluate((holder) => {
    holder.scrollTop = holder.scrollHeight;
    const columnHeader = holder.querySelector("thead th");
    const groupHeaders = Array.from(holder.querySelectorAll("tbody .keyboard-shortcuts-group-heading"));
    const visibleGroupHeader = groupHeaders.reverse().find((header) =>
      header.getBoundingClientRect().top <= holder.getBoundingClientRect().top + columnHeader.offsetHeight + 2,
    );
    return {
      columnPosition: getComputedStyle(columnHeader).position,
      columnTop: columnHeader.getBoundingClientRect().top,
      clientHeight: holder.clientHeight,
      groupPosition: getComputedStyle(visibleGroupHeader).position,
      groupTop: visibleGroupHeader.getBoundingClientRect().top,
      headerHeight: columnHeader.offsetHeight,
      holderTop: holder.getBoundingClientRect().top,
      scrollHeight: holder.scrollHeight,
      scrollTop: holder.scrollTop,
    };
  });
  expect(headerState.scrollHeight).toBeGreaterThan(headerState.clientHeight);
  expect(headerState.scrollTop).toBeGreaterThan(0);
  expect(headerState.columnPosition).toBe("sticky");
  expect(Math.abs(headerState.columnTop - headerState.holderTop)).toBeLessThanOrEqual(2);
  expect(headerState.groupPosition).toBe("sticky");
  expect(headerState.groupTop - headerState.holderTop - headerState.headerHeight)
    .toBeCloseTo(0, 0);
});

test("shortcut overrides survive reload and can be reset", async ({ page }) => {
  await open2DProject(page);
  await page.evaluate(() => {
    const commands = g_app.services.commands;
    commands.assignBinding("editor.tool.pencil", commands.bindingFromLegacyShortcut({ key: "5" }));
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() =>
    g_app.services?.commands?.formatBindings("editor.tool.pencil"),
  )).toBe("5");

  await page.evaluate(() => g_app.services.commands.resetBinding("editor.tool.pencil"));
  expect(await page.evaluate(() =>
    g_app.services.commands.formatBindings("editor.tool.pencil"),
  )).toBe("N");
});

test("shortcut overrides synchronize across open tabs without dropping stale edits", async ({ page, context }) => {
  await open2DProject(page);
  const secondPage = await context.newPage();
  await open2DProject(secondPage);

  // Hold storage-event application so both services begin their edits from the
  // same stale snapshot. Persistence must merge the second command itself.
  await Promise.all([page, secondPage].map((candidate) => candidate.evaluate(() => {
    g_app.services.commands.synchronizeConfiguration = () => {};
  })));
  await page.evaluate(() => {
    const commands = g_app.services.commands;
    commands.assignBinding(
      "editor.tool.pencil",
      commands.bindingFromLegacyShortcut({ key: "5" }),
    );
  });
  await secondPage.evaluate(() => {
    const commands = g_app.services.commands;
    commands.assignBinding(
      "editor.tool.erase",
      commands.bindingFromLegacyShortcut({ key: "6" }),
    );
  });
  expect(await secondPage.evaluate(() => Object.keys(JSON.parse(
    localStorage.getItem("lvllvl.keyboardShortcuts"),
  ).overrides).sort())).toEqual(["editor.tool.erase", "editor.tool.pencil"]);

  await Promise.all([page, secondPage].map((candidate) => candidate.evaluate(() => {
    const commands = g_app.services.commands;
    delete commands.synchronizeConfiguration;
    commands.synchronizeConfiguration(localStorage.getItem("lvllvl.keyboardShortcuts"));
  })));
  for (const candidate of [page, secondPage]) {
    await expect.poll(() => candidate.evaluate(() => ({
      erase: g_app.services.commands.formatBindings("editor.tool.erase"),
      pencil: g_app.services.commands.formatBindings("editor.tool.pencil"),
    }))).toEqual({ erase: "6", pencil: "5" });
  }

  await secondPage.evaluate(() => {
    const commands = g_app.services.commands;
    commands.assignBinding(
      "editor.tool.pencil",
      commands.bindingFromLegacyShortcut({ key: "7" }),
    );
  });
  await expect.poll(() => page.evaluate(() =>
    g_app.services.commands.formatBindings("editor.tool.pencil"),
  )).toBe("7");
  await secondPage.close();
});

test("Preview and tile placement are listed and honor their effective bindings", async ({ page }) => {
  await open2DProject(page);
  await openShortcutSettings(page);

  const search = page.locator("#keyboardShortcutsSearch");
  await search.fill("Preview Artwork");
  const previewRow = page.locator('tr[data-command-id="textMode.preview.hold"]');
  await expect(previewRow).toBeVisible();
  await expect(previewRow.locator(".keyboard-shortcuts-binding")).toHaveText("Tab");
  await expect(previewRow.locator(".keyboard-shortcuts-binding")).not.toHaveAttribute("aria-keyshortcuts");

  await search.fill("Place Selected Tile");
  const placeRow = page.locator('tr[data-command-id="textMode.canvas.placeSelectedTile"]');
  await expect(placeRow).toBeVisible();
  await expect(placeRow.locator(".keyboard-shortcuts-binding")).toHaveText("Enter / Insert");
  await expect(placeRow.getByRole("button", { name: /Remove shortcut|Show commands using/ })).toHaveCount(0);
  await expect(placeRow.getByRole("button", { name: "Clear" })).toBeVisible();
  await page.getByText("Close", { exact: true }).last().click();

  await page.evaluate(() => {
    window.__shortcutPlaceCount = 0;
    g_app.textModeEditor.tools.drawTools.setDrawTool("pen");
    g_app.textModeEditor.grid.grid2d.setCursorCells = () => {
      window.__shortcutPlaceCount++;
    };
    document.activeElement?.blur();
  });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Insert");
  expect(await page.evaluate(() => window.__shortcutPlaceCount)).toBe(2);

  await page.evaluate(() => {
    const commands = g_app.services.commands;
    commands.clearBinding("textMode.canvas.placeSelectedTile");
  });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Insert");
  expect(await page.evaluate(() => window.__shortcutPlaceCount)).toBe(2);

  const gridCanvasId = await page.evaluate(() => {
    const commands = g_app.services.commands;
    commands.assignBinding("textMode.preview.hold",
      commands.bindingFromLegacyShortcut({ key: "5" }));
    return g_app.textModeEditor.gridView2d.canvas.id;
  });
  await page.locator(`#${gridCanvasId}`).hover();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("5");
  await expect(page.locator("body")).toHaveClass(/\boverview-mode\b/);
  const overviewScale = await page.evaluate(() => {
    g_app.services.commands.clearBinding("view.zoomin");
    return g_app.textModeEditor.gridView2d.getScale();
  });
  const modifier = await page.evaluate(() => UI.os === "Mac OS" ? "Meta" : "Control");
  await page.keyboard.press(`${modifier}+=`);
  expect(await page.evaluate(() => g_app.textModeEditor.gridView2d.getScale())).toBe(overviewScale);
  await page.keyboard.up("5");
  await expect(page.locator("body")).not.toHaveClass(/\boverview-mode\b/);

  await page.keyboard.down("5");
  await expect(page.locator("body")).toHaveClass(/\boverview-mode\b/);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("body")).not.toHaveClass(/\boverview-mode\b/);
  expect(await page.evaluate(() => g_app.services.commands.getActiveCommandCount())).toBe(0);
  await page.keyboard.up("5");

  await page.keyboard.down("5");
  await expect(page.locator("body")).toHaveClass(/\boverview-mode\b/);
  await page.evaluate(() => g_app.setDeviceType("mobile"));
  await expect(page.locator("body")).not.toHaveClass(/\boverview-mode\b/);
  expect(await page.evaluate(() => g_app.services.commands.getActiveCommandCount())).toBe(0);
  await page.keyboard.up("5");
  await page.evaluate(() => g_app.setDeviceType("desktop"));

  await page.locator(`#${gridCanvasId}`).hover();
  await page.evaluate(() => {
    const commands = g_app.services.commands;
    const chord = commands.bindingFromLegacyShortcut({ key: "5" }).sequence[0];
    commands.assignBinding("textMode.preview.hold", { sequence: [chord, chord] });
    window.__shortcutOriginalEditorMode = g_app.textModeEditor.getEditorMode();
  });
  await page.keyboard.down("5");
  expect(await page.evaluate(() => g_app.services.commands.hasPendingSequence())).toBe(true);
  await page.evaluate(() => g_app.textModeEditor.setEditorMode(
    window.__shortcutOriginalEditorMode === "pixel" ? "tile" : "pixel",
  ));
  expect(await page.evaluate(() => g_app.services.commands.hasPendingSequence())).toBe(false);
  await page.keyboard.up("5");
  await page.evaluate(() => {
    const commands = g_app.services.commands;
    g_app.textModeEditor.setEditorMode(window.__shortcutOriginalEditorMode);
    commands.assignBinding("textMode.preview.hold",
      commands.bindingFromLegacyShortcut({ key: "5" }));
  });
});

test("canvas, selection, and colour actions dispatch only through configurable commands", async ({ page }) => {
  await open2DProject(page);
  const modifier = await page.evaluate(() => UI.os === "Mac OS" ? "Meta" : "Control");

  await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const drawTools = editor.tools.drawTools;
    window.__migratedShortcutEvents = [];
    drawTools.setDrawTool("pen");
    drawTools.select.isActive = () => false;
    editor.grid.grid2d.moveCursor = (dx, dy) => {
      window.__migratedShortcutEvents.push(["cursor", dx, dy]);
    };
    editor.grid.grid2d.setCursorEnabled = () => {};
    editor.currentTile.setColor = (index) => {
      window.__migratedShortcutEvents.push(["colour", index]);
    };
    document.activeElement?.blur();
  });

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Alt+1");
  expect(await page.evaluate(() => window.__migratedShortcutEvents)).toEqual([
    ["cursor", 1, 0],
    ["colour", 0],
  ]);

  await page.evaluate(() => {
    const drawTools = g_app.textModeEditor.tools.drawTools;
    drawTools.setDrawTool("select");
    drawTools.select.isActive = () => true;
    drawTools.select.nudgeSelection = (...args) => {
      window.__migratedShortcutEvents.push(["selection", ...args]);
    };
    drawTools.select.clear = () => {
      window.__migratedShortcutEvents.push(["selection-clear"]);
    };
  });
  await page.keyboard.press("Delete");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press(`${modifier}+ArrowRight`);
  await page.keyboard.press("Alt+ArrowLeft");
  expect(await page.evaluate(() => window.__migratedShortcutEvents.slice(2))).toEqual([
    ["selection-clear"],
    ["selection", 0, 1, 0, {}],
    ["selection", 1, 0, 0, { moveCut: true, moveCopy: false }],
    ["selection", -1, 0, 0, { moveCut: false, moveCopy: true }],
  ]);

  await page.evaluate(() => {
    const commands = g_app.services.commands;
    const drawTools = g_app.textModeEditor.tools.drawTools;
    commands.clearBinding("textMode.canvas.cursor.right");
    commands.clearBinding("textMode.color.select.1");
    drawTools.setDrawTool("pen");
    drawTools.select.isActive = () => false;
    window.__migratedShortcutEvents = [];
  });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Alt+1");
  expect(await page.evaluate(() => window.__migratedShortcutEvents)).toEqual([]);
});
