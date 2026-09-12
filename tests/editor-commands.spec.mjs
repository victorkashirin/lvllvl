import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const legacyTextmodeProject = await readFile(
  new URL("./fixtures/legacy-textmode-project.json", import.meta.url),
  "utf8",
);

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
    g_app.textModeEditor.history &&
    g_app.textModeEditor.tileSetManager.getCurrentTileSet(),
  ))).toBe(true);
}

test("2D grid visibility persists across application reloads", async ({ page }) => {
  await open2DProject(page);

  await page.evaluate(() => g_app.textModeEditor.setGridVisible(false));
  await expect.poll(() => page.evaluate(() =>
    localStorage.getItem("textmode.gridvisible"),
  )).toBe("0");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    menuChecked: UI("edit-showgrid").getChecked(),
    visible: g_app.textModeEditor.getGridVisible(),
  }))).toEqual({ menuChecked: false, visible: false });
});

test("landing page and About show plus release information", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();

  await expect(page.locator(".start-edition")).toHaveText(/plus/i);
  await expect(page.locator(".lvllvl-version")).toHaveText(`v${packageJson.version}`);
  await expect(page.locator(".start-improvement-list li").filter({
    hasText: "Artwork preview",
  })).toContainText("hold Tab");
  await expect(page.locator(".start-improvement-list li").filter({
    hasText: "Zen Mode",
  })).toBeVisible();
  await expect(page.locator(".start-github-link")).toHaveAttribute(
    "href",
    "https://github.com/victorkashirin/lvllvl",
  );

  const buildInfo = await page.evaluate(() => g_app.getBuildInfo());
  expect(buildInfo).toMatchObject({ version: packageJson.version });
  expect(buildInfo.buildDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await page.evaluate(() => g_app.menuClick("help-about"));
  const aboutDialog = page.locator(".ui-dialog:visible").filter({
    hasText: "About lvllvl plus",
  }).last();
  await expect.poll(() => aboutDialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.borderTopWidth, style.borderRightWidth,
      style.borderBottomWidth, style.borderLeftWidth];
  })).toEqual(["0px", "0px", "0px", "0px"]);
  await expect(aboutDialog).toContainText(new RegExp(`Version\\s+${packageJson.version}`));
  await expect(aboutDialog).toContainText(new RegExp(`Build date\\s+${buildInfo.buildDate} UTC`));
  await expect(aboutDialog.getByRole("link", {
    name: "View lvllvl plus on GitHub",
  })).toHaveAttribute("href", "https://github.com/victorkashirin/lvllvl");
});

test("export variants live in Export and advertise their actual capabilities", async ({ page }) => {
  await open2DProject(page);

  const exportState = await page.evaluate(() => {
    const tileMenu = (label) => g_app.menuBar.menus.find((menu) =>
      menu.label === label && menu.className.split(/\s+/).includes("ui-menu-tilemode"));
    const labels = (label) => tileMenu(label).menuItems
      .filter((item) => item.type !== "separator")
      .map((item) => item.label);
    const commands = g_app.services.commands.getCommands();

    return {
      commands: ["export.gif", "export.c64"].map((id) => {
        const command = commands.find((candidate) => candidate.id === id);
        return { category: command.category, id: command.id, title: command.title };
      }),
      menus: {
        export: labels("Export"),
        interface: labels("Interface"),
      },
    };
  });
  const menuItems = exportState.menus;

  expect(menuItems.export).toEqual(expect.arrayContaining([
    "GIF / PNG...",
    "GIF / Video (legacy)...",
    "C64 PRG / D64...",
    "C64 Player Source / PRG (experimental)...",
  ]));
  expect(menuItems.interface).not.toEqual(expect.arrayContaining([
    "GIF / Video (legacy)...",
    "C64 Player Source / PRG (experimental)...",
  ]));
  expect(menuItems.export.indexOf("GIF / Video (legacy)..."))
    .toBe(menuItems.export.indexOf("GIF / PNG...") + 1);
  expect(menuItems.export.indexOf("C64 Player Source / PRG (experimental)..."))
    .toBe(menuItems.export.indexOf("C64 PRG / D64...") + 1);
  expect(exportState.commands).toEqual([
    {
      category: "Export",
      id: "export.gif",
      title: "GIF / Video (legacy)...",
    },
    {
      category: "Export",
      id: "export.c64",
      title: "C64 Player Source / PRG (experimental)...",
    },
  ]);

  await page.evaluate(() => g_app.menuClick("export-gif"));
  const gifDialog = page.locator(".ui-dialog:visible").filter({
    hasText: "Export GIF / Video (legacy)",
  }).last();
  await expect(gifDialog).toBeVisible();
  await expect(gifDialog.locator('input[name="exportGIFFormat"][value="video"]'))
    .toHaveCount(1);
  await page.evaluate(() => UI.closeDialog());

  await page.evaluate(() => g_app.menuClick("export-c64"));
  const c64Dialog = page.locator(".ui-dialog:visible").filter({
    hasText: "Export C64 Player Source / PRG",
  }).last();
  await expect(c64Dialog).toBeVisible();
  await expect(c64Dialog.locator("#exportC64As")).toBeVisible();
  await expect(c64Dialog.locator("#exportC64DownloadSource")).toHaveCount(1);
  await expect(c64Dialog.locator("#exportC64DownloadPRG")).toHaveCount(1);
  await expect(c64Dialog.locator("#exportC64Type, #exportC64D64Options"))
    .toHaveCount(0);

  const filenames = await page.evaluate(async () => {
    const c64Exporter = g_app.textModeEditor.exportC64.exportC64;
    const originalAssemble = g_app.assemblerEditor.assemble;
    const originalDownload = window.download;
    const downloads = [];

    try {
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Timed out waiting for exports")), 5000);
        window.download = (_data, filename) => {
          downloads.push(filename);
          if (downloads.length === 2) {
            window.clearTimeout(timeout);
            resolve();
          }
        };
        g_app.assemblerEditor.assemble = (callback) => callback({ prg: new Uint8Array([0]) });
        c64Exporter.files = [];
        c64Exporter.downloadZip({ filename: "player-source.zip" });
        c64Exporter.assemble({ filename: "player-build" });
      });
    } finally {
      g_app.assemblerEditor.assemble = originalAssemble;
      window.download = originalDownload;
    }

    return downloads.sort();
  });
  expect(filenames).toEqual(["player-build.prg", "player-source.zip"]);
});

test("fractional-DPR tile input and every undo surface share classic history", async ({ page }) => {
  await open2DProject(page);

  const before = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const tileEditor = editor.tileEditor.tileEditorGrid;
    UI.setDevicePixelRatio(1.25);
    editor.tileEditor.setVisible(true);
    tileEditor.setCharacters([[0]]);
    const target = { x: 5, y: 3 };
    return {
      backingHeight: tileEditor.canvas.height,
      backingWidth: tileEditor.canvas.width,
      canvasScale: tileEditor.canvasScale,
      cssHeight: tileEditor.canvasHeight,
      cssWidth: tileEditor.canvasWidth,
      historyLength: editor.history.historyLength,
      pixelHeight: tileEditor.pixelHeight,
      pixelWidth: tileEditor.pixelWidth,
      revision: g_app.doc.modifiedRevision,
      target,
      value: tileEditor.getPixel(target.x, target.y),
    };
  });
  expect(before.canvasScale).toBe(1.25);
  expect(before.backingWidth).toBe(Math.round(before.cssWidth * 1.25));
  expect(before.backingHeight).toBe(Math.round(before.cssHeight * 1.25));

  const canvas = page.locator("#tileEditorCanvas");
  await expect(canvas).toBeVisible();
  await canvas.click({
    position: {
      x: (before.target.x + 0.5) * before.pixelWidth,
      y: (before.target.y + 0.5) * before.pixelHeight,
    },
  });

  const edit = await page.evaluate(({ target }) => {
    const editor = g_app.textModeEditor;
    return {
      dirtyRevision: g_app.doc.modifiedRevision,
      historyLength: editor.history.historyLength,
      value: editor.tileEditor.tileEditorGrid.getPixel(target.x, target.y),
    };
  }, before);
  const expected = before.value === 1 ? 0 : 1;
  expect(edit.value).toBe(expected);
  expect(edit.dirtyRevision).toBeGreaterThan(before.revision);
  expect(edit.historyLength).toBe(before.historyLength + 1);

  const modifier = await page.evaluate(() => UI.os === "Mac OS" ? "Meta" : "Control");
  await page.keyboard.press(`${modifier}+z`);
  await expect.poll(() => page.evaluate(({ target }) =>
    g_app.textModeEditor.tileEditor.tileEditorGrid.getPixel(target.x, target.y),
  before)).toBe(before.value);

  await page.evaluate(() => g_app.menuClick("edit-redo"));
  await expect.poll(() => page.evaluate(({ target }) =>
    g_app.textModeEditor.tileEditor.tileEditorGrid.getPixel(target.x, target.y),
  before)).toBe(expected);

  await page.locator("#mobileMenuBarUndo").evaluate((button) => button.click());
  await expect.poll(() => page.evaluate(({ target }) =>
    g_app.textModeEditor.tileEditor.tileEditorGrid.getPixel(target.x, target.y),
  before)).toBe(before.value);
});

test("zen mode reveals edge controls, keeps shortcuts active, and restores the layout", async ({ page }) => {
  await open2DProject(page);

  const before = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    UI("tabSplitPanel").setPanelVisible("north", true);
    editor.setToolsVisible(true);
    editor.textModeEditorPanel.setPanelVisible("east", true);
    UI("textEditorContent").setPanelVisible("south", true);
    editor.textModeEditorPanel.resizeThePanel({ panel: "west", size: 91 });
    editor.textModeEditorPanel.resizeThePanel({ panel: "east", size: 317 });
    UI("textEditorContent").resizeThePanel({ panel: "south", size: 233 });

    return {
      bottom: UI("textEditorContent").southSize,
      gridInfo: UI("gridSplitPanel").southSize,
      menu: UI("projectSplitPanel").northSize,
      right: editor.textModeEditorPanel.eastSize,
      tabs: UI("tabSplitPanel").northSize,
      tools: editor.textModeEditorPanel.westSize,
    };
  });

  await page.evaluate(() => g_app.menuClick("view-zenmode"));
  await expect(page.locator("body")).toHaveClass(/\bzen-mode\b/);
  await expect(page.locator("#zenModeStatus")).toContainText("Alt+Shift+Z to exit");

  await expect.poll(() => page.evaluate(() => ({
    bottom: UI("textEditorContent").southSize,
    gridInfo: UI("gridSplitPanel").southSize,
    menu: UI("projectSplitPanel").northSize,
    right: g_app.textModeEditor.textModeEditorPanel.eastSize,
    tabs: UI("tabSplitPanel").northSize,
    tools: g_app.textModeEditor.textModeEditorPanel.westSize,
    zoomShortcut: g_app.services.commands.formatBindings("view.zoomin").length > 0,
  }))).toEqual({
    bottom: 0,
    gridInfo: before.gridInfo,
    menu: 0,
    right: 0,
    tabs: 0,
    tools: 0,
    zoomShortcut: true,
  });

  const panelSelectors = await page.evaluate(() => ({
    bottom: `#${g_app.zenModeState.bottom.element.id}`,
    gridInfo: `#${g_app.zenModeState.gridInfo.element.id}`,
    left: `#${g_app.zenModeState.tools.element.id}`,
    menu: `#${g_app.zenModeState.menu.element.id}`,
    right: `#${g_app.zenModeState.right.element.id}`,
    tabs: `#${g_app.zenModeState.tabs.element.id}`,
    topStrip: `#${g_app.zenModeState.topStrip.element.id}`,
  }));

  const modifier = await page.evaluate(() => UI.os === "Mac OS" ? "Meta" : "Control");
  const scaleBefore = await page.evaluate(() => g_app.textModeEditor.gridView2d.getScale());
  await page.keyboard.press(`${modifier}+=`);
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.gridView2d.getScale(),
  )).toBeGreaterThan(scaleBefore);

  const viewport = page.viewportSize();
  const getCanvasBounds = () => page.evaluate(() => {
    const bounds = g_app.textModeEditor.gridView2d.canvas.getBoundingClientRect();
    return {
      height: bounds.height,
      width: bounds.width,
      x: bounds.x,
      y: bounds.y,
    };
  });
  const zenWorkspace = await getCanvasBounds();
  const expectWorkspaceUnchanged = async () => {
    expect(await getCanvasBounds()).toEqual(zenWorkspace);
  };
  const restingTopStrip = await page.locator(panelSelectors.topStrip).boundingBox();
  const restingGridInfo = await page.locator(panelSelectors.gridInfo).boundingBox();

  await page.locator("#zenModeEdgeTop").hover();
  await expect(page.locator(panelSelectors.menu)).toBeVisible();
  await expect(page.locator(panelSelectors.tabs)).toBeVisible();
  await expect(page.locator(panelSelectors.topStrip)).toBeVisible();
  await expect.poll(() => page.evaluate(() => UI("projectSplitPanel").northSize)).toBe(0);
  await expectWorkspaceUnchanged();
  const menuBounds = await page.locator(panelSelectors.menu).boundingBox();
  const tabBounds = await page.locator(panelSelectors.tabs).boundingBox();
  const topStripBounds = await page.locator(panelSelectors.topStrip).boundingBox();
  expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(tabBounds.y);
  expect(tabBounds.y + tabBounds.height).toBeLessThanOrEqual(topStripBounds.y);
  await page.locator(panelSelectors.menu).hover({ position: { x: 100, y: 15 } });
  await page.waitForTimeout(500);
  await expect(page.locator(panelSelectors.menu)).toBeVisible();
  await page.locator(panelSelectors.topStrip).hover({ position: { x: 100, y: 15 } });
  await page.waitForTimeout(500);
  await expect(page.locator(panelSelectors.menu)).toBeVisible();
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await expect(page.locator(panelSelectors.menu)).toBeHidden();
  expect(await page.locator(panelSelectors.topStrip).boundingBox()).toEqual(restingTopStrip);

  await page.locator("#zenModeEdgeLeft").hover();
  await expect(page.locator(panelSelectors.left)).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.textModeEditorPanel.westSize,
  )).toBe(0);
  await expectWorkspaceUnchanged();
  await page.locator(panelSelectors.left).hover({ position: { x: 30, y: 100 } });
  await page.waitForTimeout(500);
  await expect(page.locator(panelSelectors.left)).toBeVisible();
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await expect(page.locator(panelSelectors.left)).toBeHidden();

  await page.locator("#zenModeEdgeRight").hover();
  await expect(page.locator(panelSelectors.right)).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.textModeEditorPanel.eastSize,
  )).toBe(0);
  await expectWorkspaceUnchanged();
  await page.locator(panelSelectors.right).hover({ position: { x: 30, y: 100 } });
  await page.waitForTimeout(500);
  await expect(page.locator(panelSelectors.right)).toBeVisible();
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await expect(page.locator(panelSelectors.right)).toBeHidden();

  await page.locator("#zenModeEdgeBottom").hover();
  await expect(page.locator(panelSelectors.bottom)).toBeVisible();
  await expect(page.locator(panelSelectors.gridInfo)).toBeVisible();
  await expect.poll(() => page.evaluate(() => UI("textEditorContent").southSize)).toBe(0);
  await expectWorkspaceUnchanged();
  const bottomBounds = await page.locator(panelSelectors.bottom).boundingBox();
  const gridInfoBounds = await page.locator(panelSelectors.gridInfo).boundingBox();
  expect(gridInfoBounds.y + gridInfoBounds.height).toBeLessThanOrEqual(bottomBounds.y);
  await page.locator(panelSelectors.bottom).hover({ position: { x: 100, y: 50 } });
  await page.waitForTimeout(500);
  await expect(page.locator(panelSelectors.bottom)).toBeVisible();
  await page.locator(panelSelectors.gridInfo).hover({ position: { x: 100, y: 12 } });
  await page.waitForTimeout(500);
  await expect(page.locator(panelSelectors.bottom)).toBeVisible();
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await expect(page.locator(panelSelectors.bottom)).toBeHidden();
  expect(await page.locator(panelSelectors.gridInfo).boundingBox()).toEqual(restingGridInfo);

  await page.keyboard.press("Alt+Shift+z");
  await expect(page.locator("body")).not.toHaveClass(/\bzen-mode\b/);
  await expect.poll(() => page.evaluate(() => ({
    bottom: UI("textEditorContent").southSize,
    menu: UI("projectSplitPanel").northSize,
    right: g_app.textModeEditor.textModeEditorPanel.eastSize,
    tabs: UI("tabSplitPanel").northSize,
    tools: g_app.textModeEditor.textModeEditorPanel.westSize,
    zenMenuChecked: UI("view-zenmode").getChecked(),
  }))).toEqual({
    bottom: before.bottom,
    menu: before.menu,
    right: before.right,
    tabs: before.tabs,
    tools: before.tools,
    zenMenuChecked: false,
  });
});

test("Tab toggles a clean centred overview, remembers its zoom, and restores the working view", async ({ page }) => {
  await open2DProject(page);

  const before = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    localStorage.removeItem("textmode.overviewScale");
    UI("tabSplitPanel").setPanelVisible("north", true);
    editor.setToolsVisible(true);
    editor.textModeEditorPanel.setPanelVisible("east", true);
    UI("textEditorContent").setPanelVisible("south", true);
    UI("gridSplitPanel").setPanelVisible("west", true);
    UI("gridSplitPanel").setPanelVisible("south", true);
    editor.textModeEditorPanel.resizeThePanel({ panel: "west", size: 91 });
    editor.textModeEditorPanel.resizeThePanel({ panel: "east", size: 317 });
    UI("textEditorContent").resizeThePanel({ panel: "south", size: 233 });
    UI("gridSplitPanel").resizeThePanel({ panel: "west", size: 211 });
    editor.setGridVisible(true);
    editor.gridView2d.setScale(3.25);
    editor.gridView2d.setCameraPosition(17, -11);

    return {
      cameraX: editor.gridView2d.camera.position.x,
      cameraY: editor.gridView2d.camera.position.y,
      documentScale: g_app.doc.getDocRecord("/settings").data.scale,
      gridInfo: UI("gridSplitPanel").southSize,
      gridVisible: editor.getGridVisible(),
      menu: UI("projectSplitPanel").northSize,
      right: editor.textModeEditorPanel.eastSize,
      scale: editor.gridView2d.scale,
      tabs: UI("tabSplitPanel").northSize,
      tileEditor: UI("gridSplitPanel").westSize,
      timeline: UI("textEditorContent").southSize,
      tools: editor.textModeEditorPanel.westSize,
      topStrip: UI("textEditorMobileSplitPanel").northSize,
    };
  });

  const gridCanvasId = await page.evaluate(() =>
    g_app.textModeEditor.gridView2d.canvas.id,
  );
  const gridCanvas = page.locator(`#${gridCanvasId}`);
  await gridCanvas.hover();
  await page.evaluate(() => {
    const first = document.createElement("div");
    first.id = "overview-focus-first";
    first.tabIndex = 0;
    const second = document.createElement("button");
    second.id = "overview-focus-second";
    document.body.append(first, second);
    first.focus();
  });
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => document.activeElement.id))
    .toBe("overview-focus-second");
  await expect(page.locator("body")).not.toHaveClass(/\boverview-mode\b/);
  await page.evaluate(() => {
    document.querySelector("#overview-focus-first").remove();
    document.querySelector("#overview-focus-second").remove();
  });

  await gridCanvas.hover();
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Tab");
  await expect(page.locator("body")).toHaveClass(/\boverview-mode\b/);
  await expect.poll(() => page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const gridView = editor.gridView2d;
    return {
      artworkOnly: gridView.artworkOnly,
      cameraX: gridView.camera.position.x,
      cameraY: gridView.camera.position.y,
      documentScale: g_app.doc.getDocRecord("/settings").data.scale,
      gridInfo: UI("gridSplitPanel").southSize,
      gridSettingPreserved: editor.getGridVisible(),
      menu: UI("projectSplitPanel").northSize,
      right: editor.textModeEditorPanel.eastSize,
      scale: gridView.getScale(),
      tabs: UI("tabSplitPanel").northSize,
      tileEditor: UI("gridSplitPanel").westSize,
      timeline: UI("textEditorContent").southSize,
      tools: editor.textModeEditorPanel.westSize,
      topStrip: UI("textEditorMobileSplitPanel").northSize,
    };
  })).toEqual({
    artworkOnly: true,
    cameraX: 0,
    cameraY: 0,
    documentScale: before.documentScale,
    gridInfo: 0,
    gridSettingPreserved: true,
    menu: 0,
    right: 0,
    scale: 1,
    tabs: 0,
    tileEditor: 0,
    timeline: 0,
    tools: 0,
    topStrip: 0,
  });

  const modifier = await page.evaluate(() => UI.os === "Mac OS" ? "Meta" : "Control");
  await page.evaluate(() =>
    g_app.textModeEditor.gridView2d.setCameraPosition(23, -17),
  );
  await page.keyboard.press(`${modifier}+-`);
  await expect.poll(() => page.evaluate(() => {
    const gridView = g_app.textModeEditor.gridView2d;
    return {
      cameraX: gridView.camera.position.x,
      cameraY: gridView.camera.position.y,
      documentScale: g_app.doc.getDocRecord("/settings").data.scale,
      scale: gridView.getScale(),
    };
  })).toEqual({
    cameraX: 0,
    cameraY: 0,
    documentScale: before.documentScale,
    scale: 0.5,
  });

  await page.evaluate(() =>
    g_app.textModeEditor.gridView2d.setCameraPosition(-31, 19),
  );
  await page.keyboard.press(`${modifier}+=`);
  await expect.poll(() => page.evaluate(() => {
    const gridView = g_app.textModeEditor.gridView2d;
    return {
      cameraX: gridView.camera.position.x,
      cameraY: gridView.camera.position.y,
      scale: gridView.getScale(),
    };
  })).toEqual({ cameraX: 0, cameraY: 0, scale: 1 });

  await page.evaluate(() =>
    g_app.textModeEditor.gridView2d.setCameraPosition(11, 13),
  );
  await page.keyboard.press(`${modifier}+0`);
  await expect.poll(() => page.evaluate(() => ({
    cameraX: g_app.textModeEditor.gridView2d.camera.position.x,
    cameraY: g_app.textModeEditor.gridView2d.camera.position.y,
  }))).toEqual({ cameraX: 0, cameraY: 0 });
  await page.keyboard.press(`${modifier}+1`);
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.gridView2d.getScale(),
  )).toBe(1);

  await page.evaluate(() => {
    const gridView = g_app.textModeEditor.gridView2d;
    gridView.setScale(0.1);
    gridView.zoomToXY(5, 7, 0.25);
  });
  await expect.poll(() => page.evaluate(() => {
    const gridView = g_app.textModeEditor.gridView2d;
    return {
      cameraX: gridView.camera.position.x,
      cameraY: gridView.camera.position.y,
      scale: gridView.getScale(),
    };
  })).toEqual({ cameraX: 0, cameraY: 0, scale: 0.25 });

  await page.keyboard.press("Tab");
  await expect(page.locator("body")).not.toHaveClass(/\boverview-mode\b/);
  await expect.poll(() => page.evaluate(() => {
    const editor = g_app.textModeEditor;
    return {
      artworkOnly: editor.gridView2d.artworkOnly,
      cameraX: editor.gridView2d.camera.position.x,
      cameraY: editor.gridView2d.camera.position.y,
      documentScale: g_app.doc.getDocRecord("/settings").data.scale,
      gridInfo: UI("gridSplitPanel").southSize,
      gridVisible: editor.getGridVisible(),
      menu: UI("projectSplitPanel").northSize,
      right: editor.textModeEditorPanel.eastSize,
      scale: editor.gridView2d.scale,
      tabs: UI("tabSplitPanel").northSize,
      tileEditor: UI("gridSplitPanel").westSize,
      timeline: UI("textEditorContent").southSize,
      tools: editor.textModeEditorPanel.westSize,
      topStrip: UI("textEditorMobileSplitPanel").northSize,
    };
  })).toEqual({ artworkOnly: false, ...before });

  await expect.poll(() => page.evaluate(() =>
    localStorage.getItem("textmode.overviewScale"),
  )).toBe("0.25");

  await gridCanvas.hover();
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => {
    const gridView = g_app.textModeEditor.gridView2d;
    return {
      artworkOnly: gridView.artworkOnly,
      cameraX: gridView.camera.position.x,
      cameraY: gridView.camera.position.y,
      scale: gridView.getScale(),
    };
  })).toEqual({ artworkOnly: true, cameraX: 0, cameraY: 0, scale: 0.25 });
  await page.keyboard.press("Tab");

  await page.keyboard.press("Alt+Shift+z");
  await expect(page.locator("body")).toHaveClass(/\bzen-mode\b/);
  await gridCanvas.hover();
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Tab");
  await expect(page.locator("body")).toHaveClass(/\boverview-mode\b/);
  await page.keyboard.press("Alt+Shift+z");
  await expect(page.locator("body")).not.toHaveClass(/\bzen-mode\b/);
  await expect(page.locator("body")).not.toHaveClass(/\boverview-mode\b/);
  await expect.poll(() => page.evaluate(() => {
    const editor = g_app.textModeEditor;
    return {
      artworkOnly: editor.gridView2d.artworkOnly,
      gridInfo: UI("gridSplitPanel").southSize,
      menu: UI("projectSplitPanel").northSize,
      right: editor.textModeEditorPanel.eastSize,
      tabs: UI("tabSplitPanel").northSize,
      tileEditor: UI("gridSplitPanel").westSize,
      timeline: UI("textEditorContent").southSize,
      tools: editor.textModeEditorPanel.westSize,
      topStrip: UI("textEditorMobileSplitPanel").northSize,
    };
  })).toEqual({
    artworkOnly: false,
    gridInfo: before.gridInfo,
    menu: before.menu,
    right: before.right,
    tabs: before.tabs,
    tileEditor: before.tileEditor,
    timeline: before.timeline,
    tools: before.tools,
    topStrip: before.topStrip,
  });
});

test("maintained editors work without the retired runtime shells", async ({ page }) => {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();

  const legacyRecord = await page.evaluate(async (contents) => {
    const doc = g_app.createDocument();
    await new Promise((resolve) => doc.loadLocalFile(contents, resolve));

    const path = "/screens/Legacy Screen";
    const migratedRecord = doc.getDocRecord(path);
    doc.openDoc({ view: path });

    const selectedLayer = g_app.textModeEditor.layers.getSelectedLayerObject();
    return {
      cell: selectedLayer.getCell({ x: 0, y: 0 }).t,
      currentEditor: g_app.projectNavigator.getCurrentEditor() === g_app.textModeEditor,
      currentPath: g_app.projectNavigator.getCurrentPath(),
      migratedType: migratedRecord.type,
      mode: g_app.getMode(),
      path,
    };
  }, legacyTextmodeProject);
  expect(legacyRecord).toMatchObject({
    cell: 0,
    currentEditor: true,
    currentPath: "/screens/Legacy Screen",
    migratedType: "graphic",
    mode: "2d",
  });

  const spritePath = "/sprites/Untitled Sprite";
  await page.goto("/?editor=sprite", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeHidden();
  await expect.poll(() => page.evaluate(() => ({
    exists: Boolean(g_app.doc.getDocRecord("/sprites/Untitled Sprite")),
    mode: g_app.getMode(),
    spriteEditorDefined: typeof globalThis.SpriteEditor !== "undefined",
    type: g_app.textModeEditor.graphic.getType(),
  }))).toEqual({
    exists: true,
    mode: "2d",
    spriteEditorDefined: false,
    type: "sprite",
  });

  const menuState = await page.evaluate(() => ({
    active: [
      "c64debugger-sound",
      "c64debugger-joystick1",
      "c64debugger-mouse1",
      "c64debugger-size-1",
      "c64debugger-prgloadrun",
      "c64debugger-viewraster",
    ].every((id) => UI.exists(id)),
    retired: [
      "c64-sound",
      "c64-joystick1",
      "c64-mouse1",
      "c64-size-1",
      "c64-prgloadrun",
      "c64-viewraster",
    ].some((id) => UI.exists(id)),
  }));
  expect(menuState).toEqual({ active: true, retired: false });

  await page.evaluate(() => g_app.setMode("c64"));
  await expect.poll(() => page.evaluate(() => ({
    mode: g_app.getMode(),
    visible: UI("c64debuggerPanel").getVisible(),
  }))).toEqual({ mode: "c64", visible: true });

  const assemblerOpened = await page.evaluate(() =>
    g_app.projectNavigator.showDocRecord("/asm/main.asm", { forceReload: true }));
  expect(assemblerOpened).toBe(true);
  await expect.poll(() => page.evaluate(() => ({
    currentEditor: g_app.projectNavigator.getCurrentEditor() === g_app.assemblerEditor,
    mode: g_app.getMode(),
  }))).toEqual({ currentEditor: true, mode: "assembler" });

  await page.evaluate(() => {
    window.__assemblerSaveCount = 0;
    g_app.fileManager.save = () => { window.__assemblerSaveCount++ };
    document.activeElement?.blur();
  });
  await page.evaluate(() => g_app.menuClick("file-save"));
  expect(await page.evaluate(() => window.__assemblerSaveCount)).toBe(1);
  const modifier = await page.evaluate(() => UI.os === "Mac OS" ? "Meta" : "Control");
  await page.keyboard.press(`${modifier}+s`);
  expect(await page.evaluate(() => window.__assemblerSaveCount)).toBe(2);

  await page.evaluate((path) => {
    g_app.projectNavigator.showDocRecord(path, { forceReload: true });
    g_app.menuClick("export-x16assembly");
  }, spritePath);
  await expect(page.locator("#exportX16AssemblyPanel")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(
    g_app.textModeEditor.exportX16Assembly?.asmEditor,
  ))).toBe(true);
});
