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
    g_app.services?.commands?.hasCommand("textMode.tool.pencil") &&
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
    g_app.textModeEditor.tools.drawTools.setDrawTool("type");
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
    UI.closeDialog();
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

  await expect(page.locator(".keyboard-shortcuts-group-heading")
    .filter({ hasText: /Current editor.*Text Tools/ })).toHaveCount(1);
  await expect(page.locator(".keyboard-shortcuts-group-heading")
    .filter({ hasText: /Colour Palette Editor.*Colour Palette Tools/ })).toHaveCount(1);

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
  expect(await page.evaluate(() => g_app.textModeEditor.tools.drawTools.tool)).toBe("pen");

  await search.fill("Pencil");
  const pencilRow = page.locator('tr[data-command-id="textMode.tool.pencil"]');
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
  await page.locator("#keyboardShortcutsRecorderCapture").click();
  await page.keyboard.press("l");

  await expect(page.locator("#keyboardShortcutsConflictActions")).toBeVisible();
  await expect(page.locator("#keyboardShortcutsRecorderMessage")).toContainText("Eraser");
  await page.locator("#keyboardShortcutsReplaceConflicts").click();
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => g_app.services.commands.formatBindings("textMode.tool.pencil"))).toBe("L");
  await expect(page.locator("#keyboardShortcutsStatus")).toContainText("Shortcut saved");
  await expect(pencilRow.locator(".keyboard-shortcuts-binding")).toHaveText("L");
  await expect(pencilRow.locator(".keyboard-shortcuts-binding")).toBeFocused();
  await expect(pencilRow.locator(".keyboard-shortcuts-source")).toHaveText("User");

  await search.fill("Eraser");
  const eraserRow = page.locator('tr[data-command-id="textMode.tool.erase"]');
  await expect(eraserRow.locator(".keyboard-shortcuts-binding-unassigned")).toHaveText("Assign");
  await expect(page.locator('#drawTool_pen [data-shortcut-command="textMode.tool.pencil"]'))
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
    "textMode.tool.erase": [],
    "textMode.tool.pencil": [{ sequence: [{ key: "l" }] }],
  });
});

test("shortcut settings identify changes that are only applied for this session", async ({ page }) => {
  await open2DProject(page);
  await openShortcutSettings(page);
  await page.locator("#keyboardShortcutsSearch").fill("Pencil");
  const pencilRow = page.locator('tr[data-command-id="textMode.tool.pencil"]');

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
      version: 1,
      overrides: {
        "Bad id": [{ sequence: [{ key: "b" }] }],
        "future.command": [{ sequence: [{ key: "f" }] }],
        "textMode.tool.invalid": [{ sequence: [] }],
        "textMode.tool.pencil": [
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
    pencil: g_app.services.commands.formatBindings("textMode.tool.pencil"),
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
      version: 1,
      overrides: {
        "textMode.tool.invalid": [{ sequence: [] }],
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
    pencil: g_app.services.commands.formatBindings("textMode.tool.pencil"),
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
      'tr[data-command-id="textMode.tool.pencil"]',
    );
    window.__shortcutConflictAnalyses = 0;
  });
  await search.fill("Pencil");
  expect(await page.evaluate(() => ({
    reusedRow: window.__shortcutPencilRow === document.querySelector(
      'tr[data-command-id="textMode.tool.pencil"]',
    ),
    conflictAnalyses: window.__shortcutConflictAnalyses,
  }))).toEqual({ conflictAnalyses: 0, reusedRow: true });
  const pencilBinding = page.locator(
    'tr[data-command-id="textMode.tool.pencil"] .keyboard-shortcuts-binding',
  );
  const physical = page.locator("#keyboardShortcutsPhysicalKey");
  const capture = page.locator("#keyboardShortcutsRecorderCapture");
  const recorder = page.locator("#keyboardShortcutsRecorder");
  const status = page.locator("#keyboardShortcutsStatus");

  await pencilBinding.focus();
  await page.keyboard.press("Enter");
  await expect(physical).toBeFocused();
  await page.keyboard.press("Space");
  await expect(physical).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(capture).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(capture).toHaveAttribute("data-capturing", "true");
  await page.keyboard.press("Escape");
  await expect(recorder).toBeHidden();
  await expect(status).toHaveText("Shortcut recording cancelled.");
  await expect(pencilBinding).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(physical).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await expect(recorder).toBeHidden();
  await expect(status).toContainText("Shortcut saved");
  await expect(pencilBinding).toHaveText("Shift+[Tab]");
  await expect(pencilBinding).toBeFocused();
  expect(await page.evaluate(() => {
    const chord = g_app.services.commands.getEffectiveBindings("textMode.tool.pencil")[0].sequence[0];
    return { code: chord.code, key: chord.key, shift: chord.shift };
  })).toEqual({ code: "Tab", key: null, shift: true });

  await page.keyboard.press("Enter");
  await expect(physical).toBeFocused();
  await page.keyboard.press("Space");
  await expect(physical).not.toBeChecked();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
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
    probeStatus: g_app.services.commands.assignBinding("textMode.tool.pencil", {}).status,
  }))).toEqual({ ownMethod: true, probeStatus: "rejected" });
  await page.keyboard.press("Enter");
  await expect(physical).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(capture).toBeFocused();
  await page.keyboard.press("Enter");
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
    commands.assignBinding("textMode.tool.erase",
      commands.bindingFromLegacyShortcut({ key: "l" }));
  });
  const conflictsOnly = page.locator("#keyboardShortcutsConflictsOnly");
  await conflictsOnly.check();
  await expect(pencilBinding).toBeVisible();
  await pencilBinding.focus();
  await page.keyboard.press("Enter");
  await physical.check();
  await capture.click();
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
    const commandHeader = holder.querySelector("tbody .keyboard-shortcuts-command");
    const groupHeader = holder.querySelector("tbody .keyboard-shortcuts-group-heading");
    return {
      columnPosition: getComputedStyle(columnHeader).position,
      columnTop: columnHeader.getBoundingClientRect().top,
      clientHeight: holder.clientHeight,
      groupPosition: getComputedStyle(groupHeader).position,
      holderTop: holder.getBoundingClientRect().top,
      rowPosition: getComputedStyle(commandHeader).position,
      scrollHeight: holder.scrollHeight,
      scrollTop: holder.scrollTop,
    };
  });
  expect(headerState.scrollHeight).toBeGreaterThan(headerState.clientHeight);
  expect(headerState.scrollTop).toBeGreaterThan(0);
  expect(headerState.columnPosition).toBe("sticky");
  expect(Math.abs(headerState.columnTop - headerState.holderTop)).toBeLessThanOrEqual(2);
  expect(headerState.groupPosition).toBe("static");
  expect(headerState.rowPosition).toBe("static");
});

test("shortcut overrides survive reload and can be reset", async ({ page }) => {
  await open2DProject(page);
  await page.evaluate(() => {
    const commands = g_app.services.commands;
    commands.assignBinding("textMode.tool.pencil", commands.bindingFromLegacyShortcut({ key: "5" }));
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() =>
    g_app.services?.commands?.formatBindings("textMode.tool.pencil"),
  )).toBe("5");

  await page.evaluate(() => g_app.services.commands.resetBinding("textMode.tool.pencil"));
  expect(await page.evaluate(() =>
    g_app.services.commands.formatBindings("textMode.tool.pencil"),
  )).toBe("N");
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
