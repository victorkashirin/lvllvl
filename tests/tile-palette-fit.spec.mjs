import { expect, test } from "@playwright/test";

async function openDefaultProject(page) {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();
  await page.locator("#start2D").click();
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    Array.from(document.querySelectorAll(".ui-dialog-background"))
      .every((element) => getComputedStyle(element).display === "none"),
  )).toBe(true);
  await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    editor.setTilePalettePanelVisible("bottom", true);
    editor.setTilePalettePanelVisible("side", true);
    editor.setBottomBlockPanelVisible(false);
    editor.setSideBlockPanelVisible(false);
    editor.tools.drawTools.tilePalette.resize();
    editor.sideTilePalette.resize();
  });
}

async function readDesktopLayout(page) {
  return page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const editorPanel = editor.textModeEditorPanel;
    const contentPanel = UI("textEditorContent");
    const mobileSplitPanel = UI("textEditorMobileSplitPanel");
    const expandedSize = (splitPanel, panel) => splitPanel.getPanelVisible(panel)
      ? splitPanel[`${panel}Size`]
      : splitPanel[`${panel}SizeSave`];

    const panels = {
      animation: Boolean(editor.getAnimationPanelVisible()),
      bottomBlocks: editor.getBottomBlockPanelVisible(),
      bottomTiles: editor.getTilePalettePanelVisible("bottom"),
      colour: editor.getColorPalettePanelVisible(),
      layers: editor.getLayersPanelVisible(),
      sideBlocks: editor.getSideBlockPanelVisible(),
      sideTiles: editor.getTilePalettePanelVisible("side"),
      tools: editor.getToolsVisible(),
    };
    const menuCheck = (id) => UI.ids[id]?.getChecked() ?? null;

    return {
      geometry: {
        bottomResizeVisible: !contentPanel.southResizeHidden,
        bottomSize: contentPanel.southSize,
        eastExpandedSize: expandedSize(editorPanel, "east"),
        eastSize: editorPanel.eastSize,
        eastVisible: editorPanel.getPanelVisible("east"),
        mobileFramesExpandedSize: expandedSize(mobileSplitPanel, "south"),
        mobileFramesSize: mobileSplitPanel.southSize,
        mobileFramesVisible: mobileSplitPanel.getPanelVisible("south"),
        settingsExpandedSize: expandedSize(mobileSplitPanel, "north"),
        settingsSize: mobileSplitPanel.northSize,
        settingsVisible: mobileSplitPanel.getPanelVisible("north"),
        westExpandedSize: expandedSize(editorPanel, "west"),
        westSize: editorPanel.westSize,
        westVisible: editorPanel.getPanelVisible("west"),
      },
      checks: {
        animation: menuCheck("view-animationpanel"),
        bottomBlocks: menuCheck("view-metatilepalettepanelbottom"),
        bottomTiles: menuCheck("view-tilepalettepanelbottom"),
        colour: menuCheck("view-palettepanel"),
        layers: menuCheck("view-layerspanel"),
        sideBlocks: menuCheck("view-metatilepalettepanelside"),
        sideTiles: menuCheck("view-tilepalettepanelside"),
        tools: menuCheck("view-tools"),
      },
      panels,
    };
  });
}

test("desktop and mobile modes switch to cohesive, operable layouts", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const desktopViewport = page.viewportSize();
  await openDefaultProject(page);

  await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    editor.setToolsVisible(false);
    editor.setLayersPanelVisible(false);
    editor.setColorPalettePanelVisible(false);
    editor.setTilePalettePanelVisible("side", false);
    editor.setSideBlockPanelVisible(false);
    editor.setTilePalettePanelVisible("bottom", false);
    editor.setBottomBlockPanelVisible(false);
    editor.setAnimationPanelVisible(false);
  });
  const firstDesktopLayout = await readDesktopLayout(page);
  expect(firstDesktopLayout.checks).toEqual(firstDesktopLayout.panels);
  expect(firstDesktopLayout.geometry).toMatchObject({
    bottomSize: 0,
    eastSize: 0,
    eastVisible: false,
    westSize: 0,
    westVisible: false,
  });

  await page.evaluate(() => {
    g_app.setDeviceType("mobile");
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  const state = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const hamburger = document.getElementById("mobileMenuBarHamburger");
    const hamburgerBounds = hamburger.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(
      hamburgerBounds.left + hamburgerBounds.width / 2,
      hamburgerBounds.top + hamburgerBounds.height / 2,
    );
    return {
      appDeviceType: g_app.deviceType,
      appBarHeight: document.getElementById("mobileMenuBar").getBoundingClientRect().height,
      bodyMobileMode: document.body.classList.contains("mobileMode"),
      bottomPanelVisible: UI("textEditorContent").getPanelVisible("south"),
      compactFramesVisible: UI("textEditorMobileSplitPanel").getPanelVisible("south"),
      compactSettingsVisible: UI("textEditorMobileSplitPanel").getPanelVisible("north"),
      currentTool: document.getElementById("mobileMenuCurrentTools").textContent.trim(),
      desktopBottomToolsVisible: UI("textEditorDesktopToolsHolder").getVisible(),
      desktopSettingsVisible: UI("toolSettingsDesktopPanel").getVisible(),
      desktopToolsVisible: UI("toolsDesktopPanel").getVisible(),
      eastPanelVisible: editor.textModeEditorPanel.getPanelVisible("east"),
      editorDeviceType: editor.deviceType,
      hamburgerHitTarget: Boolean(hitTarget?.closest("#mobileMenuBarHamburger")),
      hamburgerTag: hamburger.tagName,
      mobileBottomToolsVisible: UI("textEditorMobileToolsHolder").getVisible(),
      mobileInterfaceType: g_app.getMobileInterfaceType(),
      mobileSettingsVisible: UI("toolsSettingsMobileHTMLPanel").getVisible(),
      mobileStylesheetLoaded: Boolean(document.querySelector('link[href*="css/ui-mobile.css"]')),
      mobileToolsVisible: UI("toolsMobileSidePanel").getVisible(),
      paletteHeight: editor.tilePaletteMobile.canvas.height,
      paletteWidth: editor.tilePaletteMobile.canvas.width,
      projectHeaderHeight: UI("projectSplitPanel").getPanelSize({ panel: "north" }),
      toolsPanelWidth: UI("textModeEditor").westSize,
      toolsPreference: g_app.getPref("textmode.toolsPanelVisible"),
    };
  });

  expect(state).toMatchObject({
    appDeviceType: "mobile",
    appBarHeight: 46,
    bodyMobileMode: true,
    bottomPanelVisible: true,
    compactFramesVisible: false,
    compactSettingsVisible: false,
    currentTool: "Pencil",
    desktopBottomToolsVisible: false,
    desktopSettingsVisible: false,
    desktopToolsVisible: false,
    eastPanelVisible: false,
    editorDeviceType: "mobile",
    hamburgerHitTarget: true,
    hamburgerTag: "BUTTON",
    mobileBottomToolsVisible: true,
    mobileInterfaceType: "reduced",
    mobileSettingsVisible: true,
    mobileStylesheetLoaded: true,
    mobileToolsVisible: true,
    projectHeaderHeight: 46,
    toolsPanelWidth: 70,
    toolsPreference: "no",
  });
  expect(state.paletteHeight).toBeGreaterThan(0);
  expect(state.paletteWidth).toBeGreaterThan(0);

  expect(await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const getSelectedLayerObject = editor.layers.getSelectedLayerObject;
    editor.layers.getSelectedLayerObject = () => null;
    try {
      editor.tilePaletteMobile.draw();
      return true;
    } finally {
      editor.layers.getSelectedLayerObject = getSelectedLayerObject;
    }
  })).toBe(true);

  const bottomPaletteCanvas = page.locator("#tilePaletteMobileCanvas");
  await bottomPaletteCanvas.hover();
  await page.mouse.wheel(0, 160);
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.tilePaletteMobile.xScroll)).toBeLessThan(0);
  await page.mouse.wheel(0, -160);
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.tilePaletteMobile.xScroll)).toBe(0);

  const tileBeforeDrag = await page.evaluate(() =>
    g_app.textModeEditor.currentTile.getCharacters()[0][0]);
  const bottomPaletteBounds = await bottomPaletteCanvas.boundingBox();
  await page.mouse.move(
    bottomPaletteBounds.x + bottomPaletteBounds.width * 0.75,
    bottomPaletteBounds.y + bottomPaletteBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bottomPaletteBounds.x + bottomPaletteBounds.width * 0.75 - 120,
    bottomPaletteBounds.y + bottomPaletteBounds.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.tilePaletteMobile.xScroll)).toBeLessThan(0);
  expect(await page.evaluate(() =>
    g_app.textModeEditor.currentTile.getCharacters()[0][0])).toBe(tileBeforeDrag);
  await page.evaluate(() => {
    const palette = g_app.textModeEditor.tilePaletteMobile;
    palette.setXScroll(0);
    palette.draw({ redrawTileset: false });
  });

  const bottomTileTarget = 7;
  const bottomTilePosition = await page.evaluate((target) => {
    const palette = g_app.textModeEditor.tilePaletteMobile;
    const stride = (palette.tileWidth * palette.blockWidth + palette.tileHPadding) *
      palette.scale;
    return {
      x: palette.tileHPadding * palette.scale + target * stride +
        palette.tileWidth * palette.scale / 2,
      y: palette.canvas.clientHeight / 2,
    };
  }, bottomTileTarget);
  await page.locator("#tilePaletteMobileCanvas").click({ position: bottomTilePosition });
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.currentTile.getCharacters()[0][0])).toBe(bottomTileTarget);

  await page.locator("#toolsMobileCurrentTile").click();
  await expect(page.locator("#tilePaletteMobileCanvasChoose")).toBeVisible();
  const dialogTileTarget = 31;
  const dialogTilePosition = await page.evaluate((target) => {
    const display = g_app.textModeEditor.currentTile.tilePaletteChooserMobile.tilePaletteDisplay;
    const location = display.tileLocations[target][0];
    const dimensions = display.getScaledTileDimensions();
    return {
      x: location.paletteX - display.scrollX + dimensions.width / 2,
      y: location.paletteY - display.scrollY + dimensions.height / 2,
    };
  }, dialogTileTarget);
  await page.locator("#tilePaletteMobileCanvasChoose").click({
    position: dialogTilePosition,
  });
  await expect(page.locator("#tilePaletteMobileCanvasChoose")).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.currentTile.getCharacters()[0][0])).toBe(dialogTileTarget);
  const bottomSelection = await page.evaluate((target) => {
    const palette = g_app.textModeEditor.tilePaletteMobile;
    const tileHolderWidth = (palette.tileWidth * palette.blockWidth +
      palette.tileHPadding) * palette.scale;
    const left = palette.tileHPadding * palette.scale + target * tileHolderWidth +
      palette.xScroll;
    const top = palette.tileVPadding * palette.scale;
    const width = palette.tileWidth * palette.blockWidth * palette.scale;
    const height = palette.tileHeight * palette.blockHeight * palette.scale;
    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = 1;
    colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext("2d");
    colorContext.fillStyle = styles.tilePalette.selectOutline;
    colorContext.fillRect(0, 0, 1, 1);
    const expected = colorContext.getImageData(0, 0, 1, 1).data;
    const pixels = palette.context.getImageData(
      Math.max(0, Math.floor(left - 1)),
      Math.max(0, Math.floor(top - 1)),
      Math.min(palette.canvas.width - Math.max(0, Math.floor(left - 1)),
        Math.ceil(width + 2)),
      Math.min(palette.canvas.height - Math.max(0, Math.floor(top - 1)),
        Math.ceil(height + 2)),
    ).data;
    var highlighted = false;
    for(var i = 0; i < pixels.length; i += 4) {
      if(pixels[i] == expected[0] && pixels[i + 1] == expected[1] &&
          pixels[i + 2] == expected[2] && pixels[i + 3] == expected[3]) {
        highlighted = true;
        break;
      }
    }
    return {
      highlighted: highlighted,
      left: left,
      right: left + width,
      scroll: palette.xScroll,
      viewportWidth: palette.canvas.width,
    };
  }, dialogTileTarget);
  expect(bottomSelection.scroll).toBeLessThan(0);
  expect(bottomSelection.left).toBeGreaterThanOrEqual(0);
  expect(bottomSelection.right).toBeLessThanOrEqual(bottomSelection.viewportWidth);
  expect(bottomSelection.highlighted).toBe(true);

  const paletteColorSelection = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const subPalettes = editor.colorPaletteManager.colorSubPalettes;
    subPalettes.selectPalette(0, 1);
    const previousColor = subPalettes.getPaletteColor(0, 1);
    subPalettes.showMobilePicker({});

    const display = subPalettes.colorSubPalettePickerMobile.colorPaletteDisplay;
    const targetColor = display.colorMap.flat().find((color) =>
      color !== editor.colorPaletteManager.noColor && color !== previousColor);
    const gridPosition = display.colorToGridXy(targetColor);
    return {
      position: {
        x: display.colorSpacing +
          gridPosition.x * (display.colorWidth + display.colorSpacing) +
          display.colorWidth / 2,
        y: display.colorSpacing +
          gridPosition.y * (display.colorHeight + display.colorSpacing) +
          display.colorHeight / 2,
      },
      targetColor,
    };
  });
  await expect(page.locator("#colorSubPalettePickerMobileCanvasChoose")).toBeVisible();
  await page.locator("#colorSubPalettePickerMobileCanvasChoose").click({
    position: paletteColorSelection.position,
  });
  await expect(page.locator("#colorSubPalettePickerMobileCanvasChoose")).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    g_app.textModeEditor.colorPaletteManager.colorSubPalettes
      .getPaletteColor(0, 1))).toBe(paletteColorSelection.targetColor);

  await page.evaluate(() => {
    g_app.textModeEditor.colorPaletteManager.colorSubPalettes.showMobilePicker({});
  });
  await expect(page.locator("#colorSubPalettePickerMobileCanvasChoose")).toBeVisible();
  await page.locator("#colorPalettePanelSubPalette2-Color3Mobile").click();
  await expect(page.locator("#colorSubPalettePickerMobileCanvasChoose")).toBeHidden();
  expect(await page.evaluate(() => {
    const subPalettes = g_app.textModeEditor.colorPaletteManager.colorSubPalettes;
    return {
      palette: subPalettes.getCurrentPalette(),
      paletteColor: subPalettes.getCurrentPaletteColor(),
    };
  })).toEqual({ palette: 2, paletteColor: 3 });

  await page.locator("#mobileMenuBarHamburger").click();
  await expect(page.locator("#mobile-menu")).toBeVisible();
  await expect(page.locator("#mobile-menu")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#mobileMenuBarHamburger")).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => Array.from(document.body.children)
    .filter((element) => !["mobile-menu", "mobile-menu-holder"].includes(element.id))
    .every((element) => element.hasAttribute("inert")))).toBe(true);
  await expect(page.locator(".mobile-menu-item").filter({ hasText: /^Export Image$/ })).toHaveCount(1);
  await expect(page.locator(".mobile-menu-item").filter({ hasText: /^Export (PNG|GIF)$/ })).toHaveCount(0);
  expect(await page.locator(".mobile-menu-header").evaluate((element) =>
    element.getBoundingClientRect().height)).toBe(64);
  await expect(page.locator("#mobileMenuSave")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() =>
    Boolean(document.activeElement?.closest("#mobile-menu")))).toBe(true);

  await page.setViewportSize({ width: 300, height: 640 });
  await expect.poll(() => page.locator("#mobile-menu").evaluate((element) =>
    element.getBoundingClientRect().width)).toBe(252);
  await page.keyboard.press("Escape");
  await expect(page.locator("#mobile-menu")).toBeHidden();
  await expect(page.locator("#mobileMenuBarHamburger")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#mobileMenuBarHamburger")).toBeFocused();
  expect(await page.evaluate(() => Array.from(document.body.children)
    .filter((element) => !["mobile-menu", "mobile-menu-holder"].includes(element.id))
    .every((element) => !element.hasAttribute("inert")))).toBe(true);

  await page.locator("#mobileMenuBarHamburger").click();
  await page.locator(".mobile-menu-item").filter({
    hasText: "Show Expanded Controls",
  }).click();
  await expect.poll(() => page.evaluate(() => ({
    desktopSettingsVisible: UI("toolSettingsDesktopPanel").getVisible(),
    framesVisible: UI("textEditorMobileSplitPanel").getPanelVisible("south"),
    interfaceType: g_app.getMobileInterfaceType(),
    mobileSettingsVisible: UI("toolsSettingsMobileHTMLPanel").getVisible(),
    northSize: UI("textEditorMobileSplitPanel").northSize,
    settingsVisible: UI("textEditorMobileSplitPanel").getPanelVisible("north"),
    toolsPanelVisible: UI("textModeEditor").getPanelVisible("west"),
  }))).toEqual({
    desktopSettingsVisible: false,
    framesVisible: true,
    interfaceType: "full",
    mobileSettingsVisible: true,
    northSize: 40,
    settingsVisible: true,
    toolsPanelVisible: false,
  });

  await page.setViewportSize(desktopViewport);

  const desktopState = await page.evaluate(() => {
    g_app.setDeviceType("desktop");
    const projectTabLabel = document.querySelector(
      `#${g_app.tabPanel.id}-header .ui-current-tab .ui-tab-label`,
    );
    return {
      bodyMobileMode: document.body.classList.contains("mobileMode"),
      desktopBottomToolsVisible: UI("textEditorDesktopToolsHolder").getVisible(),
      desktopMenuVisible: UI("menubar").getVisible(),
      desktopSettingsVisible: UI("toolSettingsDesktopPanel").getVisible(),
      bottomSize: UI("textEditorContent").southSize,
      eastPanelVisible: UI("textModeEditor").getPanelVisible("east"),
      mobileBottomToolsVisible: UI("textEditorMobileToolsHolder").getVisible(),
      mobileMenuVisible: UI("mobileMenuBar").getVisible(),
      mobileSettingsVisible: UI("toolsSettingsMobileHTMLPanel").getVisible(),
      northSize: UI("textEditorMobileSplitPanel").northSize,
      northVisible: UI("textEditorMobileSplitPanel").getPanelVisible("north"),
      projectHeaderHeight: UI("projectSplitPanel").getPanelSize({ panel: "north" }),
      projectTabHasLiteralMarkup: projectTabLabel.textContent.includes("<img"),
      projectTabIconCount: projectTabLabel.querySelectorAll("img.ui-tab-icon").length,
      projectTabText: projectTabLabel.textContent.trim(),
      toolsPanelVisible: UI("textModeEditor").getPanelVisible("west"),
      toolsPanelWidth: UI("textModeEditor").westSize,
      toolsPanelSavedWidth: UI("textModeEditor").westSizeSave,
      toolsPreference: g_app.getPref("textmode.toolsPanelVisible"),
    };
  });
  expect(desktopState).toEqual({
    bodyMobileMode: false,
    desktopBottomToolsVisible: true,
    desktopMenuVisible: true,
    desktopSettingsVisible: true,
    bottomSize: 0,
    eastPanelVisible: false,
    mobileBottomToolsVisible: false,
    mobileMenuVisible: false,
    mobileSettingsVisible: false,
    northSize: 30,
    northVisible: true,
    projectHeaderHeight: 30,
    projectTabHasLiteralMarkup: false,
    projectTabIconCount: 1,
    projectTabText: "Untitled Screen",
    toolsPanelVisible: false,
    toolsPanelWidth: 0,
    toolsPanelSavedWidth: 77,
    toolsPreference: "no",
  });
  const firstRestoredLayout = await readDesktopLayout(page);
  expect(firstRestoredLayout).toEqual(firstDesktopLayout);
  expect(firstRestoredLayout.checks).toEqual(firstRestoredLayout.panels);

  await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    editor.setToolsVisible(true);
    editor.setLayersPanelVisible(true);
    editor.setColorPalettePanelVisible(true);
    editor.setTilePalettePanelVisible("side", false);
    editor.setSideBlockPanelVisible(false);
    editor.setTilePalettePanelVisible("bottom", true);
    editor.setBottomBlockPanelVisible(false);
    editor.setAnimationPanelVisible(true);
    editor.textModeEditorPanel.resizeThePanel({ panel: "east", size: 313 });
    editor.textModeEditorPanel.resizeThePanel({ panel: "west", size: 91 });
    UI("textEditorContent").resizeThePanel({ panel: "south", size: 257 });
  });
  const secondDesktopLayout = await readDesktopLayout(page);
  expect(secondDesktopLayout.checks).toEqual(secondDesktopLayout.panels);

  await page.evaluate(() => g_app.setDeviceType("mobile"));
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(await page.evaluate(() => ({
    bottomResizeVisible: !UI("textEditorContent").southResizeHidden,
    eastVisible: UI("textModeEditor").getPanelVisible("east"),
    mobileBottomVisible: UI("textEditorMobileToolsHolder").getVisible(),
    westVisible: UI("textModeEditor").getPanelVisible("west"),
  }))).toEqual({
    bottomResizeVisible: false,
    eastVisible: false,
    mobileBottomVisible: true,
    westVisible: false,
  });

  const mobileBlockToolState = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    editor.tools.drawTools.setDrawTool("block");
    return {
      bottomBlockPreference: g_app.getPref("textmode.bottomBlockPaletteVisible"),
      bottomSize: UI("textEditorContent").southSize,
      expectedBottomSize: g_app.mobileLayout.paletteHeight,
    };
  });
  expect(mobileBlockToolState.bottomSize).toBe(mobileBlockToolState.expectedBottomSize);
  expect(mobileBlockToolState.bottomBlockPreference).toBe("no");

  await page.evaluate(() => g_app.setDeviceType("desktop"));
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const secondRestoredLayout = await readDesktopLayout(page);
  expect(secondRestoredLayout).toEqual(secondDesktopLayout);
  expect(secondRestoredLayout.checks).toEqual(secondRestoredLayout.panels);
  expect(pageErrors).toEqual([]);
});

test("tile palettes fit their panels and retain a precise manual scale", async ({ page }) => {
  await openDefaultProject(page);

  const bottomFit = page.locator("#tilePaletteFitWidth");
  const bottomScale = page.locator("#tilePaletteScale");
  const bottomDecrease = page.locator("#tilePaletteScaleDec");
  const bottomIncrease = page.locator("#tilePaletteScaleInc");
  const sideFit = page.locator("#sidetilePaletteFitWidth");
  const sideScale = page.locator("#sidetilePaletteScale");

  await expect(bottomFit).toHaveAttribute("aria-pressed", "true");
  await expect(sideFit).toHaveAttribute("aria-pressed", "true");
  await expect(bottomScale).toBeDisabled();
  await expect(bottomDecrease).toBeDisabled();
  await expect(bottomIncrease).toBeDisabled();

  const scaleControlLayout = await page.evaluate(() => {
    const fitStyle = getComputedStyle(document.getElementById("tilePaletteFitWidth"));
    const inputElement = document.getElementById("tilePaletteScale");
    const percentElement = document.getElementById("tilePaletteScalePercent");
    const decrease = document.getElementById("tilePaletteScaleDec").getBoundingClientRect();
    const increase = document.getElementById("tilePaletteScaleInc").getBoundingClientRect();
    const input = inputElement.getBoundingClientRect();
    const percent = percentElement.getBoundingClientRect();
    const sort = document.getElementById("charPaletteSortOrder").getBoundingClientRect();
    const fit = document.getElementById("tilePaletteFitWidth").getBoundingClientRect();
    const spacing = document.getElementById("tilePaletteTileMargin").parentElement.getBoundingClientRect();
    return {
      colorsMatch: getComputedStyle(inputElement).color === getComputedStyle(percentElement).color,
      disabledScaleColor: getComputedStyle(inputElement).color,
      fitAlignItems: fitStyle.alignItems,
      fitDisplay: fitStyle.display,
      leftGroupSpacing: fit.left - sort.right,
      percentInsideInput: percent.left >= input.left && percent.right <= input.right,
      rightGroupSpacing: spacing.left - increase.right,
      scaleGroupIsFlush:
        Math.abs(decrease.right - input.left) < 0.1 &&
        Math.abs(input.right - increase.left) < 0.1,
    };
  });
  expect(scaleControlLayout).toEqual({
    colorsMatch: true,
    disabledScaleColor: "rgb(119, 119, 119)",
    fitAlignItems: "center",
    fitDisplay: "flex",
    leftGroupSpacing: 20,
    percentInsideInput: true,
    rightGroupSpacing: 20,
    scaleGroupIsFlush: true,
  });

  const fitted = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const bottom = editor.tools.drawTools.tilePalette;
    const side = editor.sideTilePalette;
    return {
      bottom: {
        contentWidth: bottom.tilePaletteDisplay.contentWidth,
        scale: bottom.tilePaletteDisplay.getScale(),
        viewWidth: bottom.tilePaletteDisplay.viewWidth,
      },
      side: {
        contentWidth: side.tilePaletteDisplay.contentWidth,
        scale: side.tilePaletteDisplay.getScale(),
        viewWidth: side.tilePaletteDisplay.viewWidth,
      },
    };
  });
  expect(fitted.bottom.contentWidth).toBeLessThanOrEqual(fitted.bottom.viewWidth);
  expect(fitted.side.contentWidth).toBeLessThanOrEqual(fitted.side.viewWidth);
  expect(Number.isInteger(fitted.bottom.scale * 8)).toBe(true);
  expect(Number.isInteger(fitted.side.scale * 8)).toBe(true);

  const sideControlRows = await page.evaluate(() => {
    const top = (id) => document.getElementById(id).getBoundingClientRect().top;
    return {
      choose: top("sidetilePaletteChooseTileSet"),
      fit: top("sidetilePaletteFitWidth"),
      spacing: top("sidetilePaletteTileMargin"),
    };
  });
  expect(Math.abs(sideControlRows.fit - sideControlRows.spacing)).toBeLessThan(5);
  expect(sideControlRows.choose).toBeGreaterThan(sideControlRows.fit + 10);

  const narrowControlRows = await page.evaluate(() => {
    return ["sidetilePaletteControlsPrimary", "sidetilePaletteControlsSecondary"].map((id) => {
      const row = document.getElementById(id);
      row.style.maxWidth = "180px";
      row.scrollLeft = row.scrollWidth;
      const rowBounds = row.getBoundingClientRect();
      const lastBounds = row.lastElementChild.getBoundingClientRect();
      const result = {
        lastControlVisible:
          lastBounds.left >= rowBounds.left - 1 && lastBounds.right <= rowBounds.right + 1,
        scrollable: row.scrollWidth > row.clientWidth && row.scrollLeft > 0,
      };
      row.style.maxWidth = "";
      return result;
    });
  });
  expect(narrowControlRows).toEqual([
    { lastControlVisible: true, scrollable: true },
    { lastControlVisible: true, scrollable: true },
  ]);

  const fittedPercentage = Number(await bottomScale.inputValue());
  await bottomFit.click();
  await expect(bottomScale).toBeEnabled();
  await expect(bottomScale).toHaveValue(String(fittedPercentage));
  expect(await bottomScale.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(34, 34, 34)");
  expect(await page.evaluate(() => localStorage.getItem("tilepalette.fitToWidth.bottom"))).toBe("no");

  await bottomScale.fill("176");
  await bottomScale.blur();
  await expect(bottomScale).toHaveValue("175");
  expect(await page.evaluate(() => ({
    preference: localStorage.getItem("tilepalette.scale_8x8"),
    scale: g_app.textModeEditor.tools.drawTools.tilePalette.tilePaletteDisplay.getScale(),
  }))).toEqual({ preference: "1.75", scale: 1.75 });

  await bottomIncrease.click();
  await expect(bottomScale).toHaveValue("225");
  await bottomDecrease.click();
  await expect(bottomScale).toHaveValue("175");

  await bottomScale.fill("10000");
  await bottomScale.blur();
  await expect(bottomScale).toHaveValue("1000");
  expect(await page.evaluate(() => localStorage.getItem("tilepalette.scale_8x8"))).toBe("10");
  await bottomScale.fill("175");
  await bottomScale.blur();
  await expect(bottomScale).toHaveValue("175");

  await expect(sideFit).toHaveAttribute("aria-pressed", "true");
  await expect(sideScale).toBeDisabled();

  await bottomFit.click();
  await expect(bottomScale).toBeDisabled();
  const beforeResize = Number(await bottomScale.inputValue());
  const viewport = page.viewportSize();
  await page.setViewportSize({ height: viewport.height, width: viewport.width + 240 });
  await expect.poll(async () => Number(await bottomScale.inputValue())).not.toBe(beforeResize);

  const resized = await page.evaluate(() => {
    const palette = g_app.textModeEditor.tools.drawTools.tilePalette.tilePaletteDisplay;
    return {
      contentWidth: palette.contentWidth,
      preference: localStorage.getItem("tilepalette.scale_8x8"),
      scale: palette.getScale(),
      viewWidth: palette.viewWidth,
    };
  });
  expect(resized.contentWidth).toBeLessThanOrEqual(resized.viewWidth);
  expect(Number.isInteger(resized.scale * 8)).toBe(true);
  expect(resized.preference).toBe("1.75");

  await page.setViewportSize({ height: viewport.height, width: 4800 });
  await expect.poll(async () => Number(await bottomScale.inputValue())).toBeGreaterThan(1000);
  const wideFit = await page.evaluate(() => {
    const palette = g_app.textModeEditor.tools.drawTools.tilePalette.tilePaletteDisplay;
    return {
      contentWidth: palette.contentWidth,
      scale: palette.getScale(),
      viewWidth: palette.viewWidth,
    };
  });
  expect(wideFit.scale).toBeGreaterThan(10);
  expect(wideFit.contentWidth).toBeLessThanOrEqual(wideFit.viewWidth);
});

test("a changed bitmap glyph reuses palette slots and uploads only its rectangles", async ({ page }) => {
  await openDefaultProject(page);

  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const tileSet = editor.tileSetManager.getCurrentTileSet();
    const display = editor.tools.drawTools.tilePalette.tilePaletteDisplay;
    display.drawTilePalette();

    const layout = display.tileLocations;
    const expectedSlots = display.tileLocations[42].length;
    const dimensions = display.getScaledTileDimensions(display.getScale());
    const uploads = [];
    let imageDataReads = 0;
    let layoutWrites = 0;
    const originalPutImageData = display.tileContext.putImageData;
    const originalGetImageData = display.tileContext.getImageData;
    const originalGridMapAdd = display.gridMapAdd;
    display.tileContext.putImageData = function (...args) {
      uploads.push(args.slice(3));
      return originalPutImageData.apply(this, args);
    };
    display.tileContext.getImageData = function (...args) {
      imageDataReads += 1;
      return originalGetImageData.apply(this, args);
    };
    display.gridMapAdd = function (...args) {
      layoutWrites += 1;
      return originalGridMapAdd.apply(this, args);
    };

    const changed = tileSet.setPixel(42, 0, 0, !tileSet.getPixel(42, 0, 0), false);
    tileSet.updateCharacters([42, 42], true);
    const reusedLayout = display.tileLocations === layout;

    display.tileContext.putImageData = originalPutImageData;
    display.tileContext.getImageData = originalGetImageData;
    display.gridMapAdd = originalGridMapAdd;
    const incremental = originalGetImageData.call(
      display.tileContext,
      0,
      0,
      display.tileCanvas.width,
      display.tileCanvas.height,
    );
    display.drawTilePalette();
    const fresh = originalGetImageData.call(
      display.tileContext,
      0,
      0,
      display.tileCanvas.width,
      display.tileCanvas.height,
    );
    let pixelsMatch = incremental.data.length === fresh.data.length;
    for (let index = 0; pixelsMatch && index < incremental.data.length; index += 1) {
      pixelsMatch = incremental.data[index] === fresh.data[index];
    }

    return {
      changed,
      dimensions,
      expectedSlots,
      imageDataReads,
      layoutWrites,
      pixelsMatch,
      reusedLayout,
      uploads,
    };
  });

  expect(result.changed).toBe(true);
  expect(result.imageDataReads).toBe(0);
  expect(result.layoutWrites).toBe(0);
  expect(result.reusedLayout).toBe(true);
  expect(result.uploads).toHaveLength(result.expectedSlots);
  for (const upload of result.uploads) {
    expect(upload).toHaveLength(4);
    expect(upload[2]).toBe(result.dimensions.width);
    expect(upload[3]).toBe(result.dimensions.height);
  }
  expect(result.pixelsMatch).toBe(true);
});

test("a changed vector glyph cannot leave pixels outside its palette slot", async ({ page }) => {
  await openDefaultProject(page);

  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const tileSet = editor.tileSetManager.getCurrentTileSet();
    const display = editor.tools.drawTools.tilePalette.tilePaletteDisplay;
    const originalGetFontAscent = tileSet.getFontAscent;
    const originalGetFontScale = tileSet.getFontScale;
    const originalGetGlyphPath = tileSet.getGlyphPath;
    const originalGetType = tileSet.getType;
    let drawOverhang = true;

    tileSet.getType = () => "vector";
    tileSet.getFontAscent = () => 0;
    tileSet.getFontScale = () => 1 / display.getScaledTileDimensions(display.getScale()).width;
    tileSet.getGlyphPath = (character) => {
      if (character !== 42 || !drawOverhang) return null;
      const dimensions = display.getScaledTileDimensions(display.getScale());
      const path = new Path2D();
      path.rect(-4, -dimensions.height - 4, dimensions.width + 8, dimensions.height + 8);
      return path;
    };

    try {
      display.drawTilePalette();
      drawOverhang = false;
      display.drawTilePalette({ tiles: [42] });
      const incremental = display.tileContext.getImageData(
        0,
        0,
        display.tileCanvas.width,
        display.tileCanvas.height,
      );

      display.drawTilePalette();
      const fresh = display.tileContext.getImageData(
        0,
        0,
        display.tileCanvas.width,
        display.tileCanvas.height,
      );
      if (incremental.data.length !== fresh.data.length) {
        return { incrementalLength: incremental.data.length, freshLength: fresh.data.length };
      }
      let differentPixels = 0;
      let firstDifference = -1;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -1;
      let maxY = -1;
      for (let index = 0; index < incremental.data.length; index += 1) {
        if (incremental.data[index] !== fresh.data[index]) {
          differentPixels += 1;
          if (firstDifference === -1) firstDifference = index;
          const pixel = Math.floor(index / 4);
          const x = pixel % incremental.width;
          const y = Math.floor(pixel / incremental.width);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      return {
        bounds: { maxX, maxY, minX, minY },
        canvas: { height: incremental.height, width: incremental.width },
        differentPixels,
        firstDifference,
        location: display.tileLocations[42],
        values: firstDifference === -1 ? null : {
          fresh: Array.from(fresh.data.slice(firstDifference - firstDifference % 4, firstDifference - firstDifference % 4 + 4)),
          incremental: Array.from(incremental.data.slice(firstDifference - firstDifference % 4, firstDifference - firstDifference % 4 + 4)),
        },
      };
    } finally {
      tileSet.getFontAscent = originalGetFontAscent;
      tileSet.getFontScale = originalGetFontScale;
      tileSet.getGlyphPath = originalGetGlyphPath;
      tileSet.getType = originalGetType;
      display.drawTilePalette();
    }
  });

  expect(result.differentPixels).toBe(0);
});

test("a hidden palette defers state-change redraws until reopened", async ({ page }) => {
  await openDefaultProject(page);

  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const palette = editor.tools.drawTools.tilePalette;
    const display = palette.tilePaletteDisplay;
    const calls = [];
    const consumedPendingRequests = [];
    const originalDraw = display.draw;
    const originalMergePending = palette.mergePendingTilePaletteRedraw;
    display.draw = function (args) {
      calls.push(args);
      return originalDraw.call(this, args);
    };
    palette.mergePendingTilePaletteRedraw = function (args) {
      const hadPending = this.pendingTilePaletteRedraw || this.pendingTilePaletteTiles !== null;
      const merged = originalMergePending.call(this, args);
      if (hadPending) consumedPendingRequests.push(merged);
      return merged;
    };

    try {
      editor.setTilePalettePanelVisible("bottom", false);
      calls.length = 0;
      palette.setCharPaletteMapType(palette.getTilePaletteMapType());
      const hiddenCalls = calls.length;
      const pendingFullRedraw = palette.pendingTilePaletteRedraw;

      editor.setTilePalettePanelVisible("bottom", true);
      return {
        consumedPendingRequests,
        hiddenCalls,
        pendingFullRedraw,
        queueCleared:
          palette.pendingTilePaletteRedraw === false &&
          palette.pendingTilePaletteTiles === null,
      };
    } finally {
      display.draw = originalDraw;
      palette.mergePendingTilePaletteRedraw = originalMergePending;
      editor.setTilePalettePanelVisible("bottom", true);
    }
  });

  expect(result.hiddenCalls).toBe(0);
  expect(result.pendingFullRedraw).toBe(true);
  expect(result.consumedPendingRequests).toHaveLength(1);
  expect(result.consumedPendingRequests[0].redrawTiles).toBe(true);
  expect(result.consumedPendingRequests[0].tiles).toBeUndefined();
  expect(result.queueCleared).toBe(true);
});
