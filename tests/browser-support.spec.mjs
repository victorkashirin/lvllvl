import { expect, test } from "@playwright/test";

import { browserPolicy } from "../scripts/browser-policy.mjs";

const desktop2DRendererProjects = new Set(["chromium-desktop", "firefox-desktop"]);

function isDesktop2DRendererProject(testInfo) {
  return desktop2DRendererProjects.has(testInfo.project.name);
}

function observeLocalFailures(page, baseURL) {
  const localFailures = [];
  const localOrigin = new URL(baseURL).origin;

  page.on("pageerror", (error) =>
    localFailures.push(`page error: ${error.stack ?? error.message}`),
  );
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).origin === localOrigin) {
      localFailures.push(`request failed: ${request.method()} ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    if (new URL(response.url()).origin === localOrigin && response.status() >= 400) {
      localFailures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  return localFailures;
}

async function waitForStableStartPage(page, timeout, observedFailures = []) {
  try {
    await expect(page.locator("#startPage")).toBeVisible({ timeout });
  } catch (error) {
    const pageState = await page.evaluate(() => ({
      body: document.body?.innerText.slice(0, 500) ?? "",
      readyState: document.readyState,
      uiReady: typeof UI === "undefined" ? "unavailable" : UI.ready,
      url: window.location.href,
    }));
    throw new Error(
      `${error.message}\nPage state: ${JSON.stringify(pageState)}${
        observedFailures.length > 0 ? `\nObserved failures:\n${observedFailures.join("\n")}` : ""
      }`,
    );
  }
  await page.waitForLoadState("load");
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function startupState(page, testInfo) {
  const state = await page.evaluate(() => ({
    mobile: Boolean(UI.isMobile.any()),
    ready: UI.ready,
  }));
  const expectsMobileInterface = testInfo.project.metadata.deviceClass !== "desktop";

  expect(state).toEqual({ mobile: expectsMobileInterface, ready: true });
}

async function open2DProject(page, testInfo, { vector = false } = {}) {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForStableStartPage(
    page,
    browserPolicy.performanceBudgets.startupMilliseconds,
  );

  await page.locator("#start2D").click();
  if (vector) {
    await page.locator('input[name="newProjectMode"][value="vector"]').evaluate((input) => {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect.poll(() => page.evaluate(() =>
    Array.from(document.querySelectorAll(".ui-dialog-background"))
      .every((element) => getComputedStyle(element).display === "none"),
  )).toBe(true);
}

test("first-party production startup stays within budget", async ({ page }, testInfo) => {
  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);

  // Any unexpected external startup request is isolated from the first-party
  // timing and is rejected by the dedicated no-external-request test below.
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );

  const startedAt = Date.now();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForStableStartPage(
    page,
    browserPolicy.performanceBudgets.startupMilliseconds,
    localFailures,
  );
  const startupMilliseconds = Date.now() - startedAt;

  await startupState(page, testInfo);
  expect(startupMilliseconds).toBeLessThanOrEqual(
    browserPolicy.performanceBudgets.startupMilliseconds,
  );
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test("production starts offline without external provider requests", async ({ page }, testInfo) => {
  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);
  const externalRequests = [];

  await page.route(/^https:\/\//, (route) => {
    externalRequests.push(route.request().url());
    return route.abort("internetdisconnected");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForStableStartPage(
    page,
    browserPolicy.performanceBudgets.startupMilliseconds,
    localFailures,
  );

  await startupState(page, testInfo);
  expect(externalRequests).toEqual([]);
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test("direct image-import routes activate and clean up on desktop and touch profiles", async ({ page }, testInfo) => {
  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );

  await page.goto("/?route=feature%3Aimage-import", { waitUntil: "domcontentloaded" });
  const routeState = () => page.evaluate(() => ({
    active: g_app.featureRegistry.isActive("imageImport", g_app.textModeEditor),
    route: g_app.services.uiRoutes.getActiveRoute(),
    source: g_app.services.uiRoutes.getState("feature:image-import").source,
    status: g_app.services.uiRoutes.getState("feature:image-import").status,
  }));
  await expect.poll(routeState).toEqual({
    active: true,
    route: "feature:image-import",
    source: "deep-link",
    status: "ready",
  });

  const panel = page.locator(".ui-dialog:visible, .ui-mobilepanel:visible")
    .filter({ hasText: "Import Image" });
  await expect(panel).toBeVisible();

  if (testInfo.project.metadata.deviceClass === "desktop") {
    const originalImporter = await page.evaluate(async () => {
      const importer = g_app.services.imageImport.getActive(g_app.textModeEditor);
      await g_app.closeRoute("feature:image-import");
      globalThis.__routeTestImporter = importer;
      return Boolean(importer);
    });
    expect(originalImporter).toBe(true);
    await page.keyboard.press("Alt+Shift+I");
    await expect.poll(routeState).toEqual({
      active: true,
      route: "feature:image-import",
      source: "keyboard",
      status: "ready",
    });
    expect(await page.evaluate(() =>
      g_app.services.imageImport.getActive(g_app.textModeEditor) === globalThis.__routeTestImporter,
    )).toBe(true);
  }

  const repeated = await page.evaluate(async () => {
    const firstInstance = g_app.services.imageImport.getActive(g_app.textModeEditor);
    const [first, second] = await Promise.all([
      g_app.openImageImport(undefined, "keyboard"),
      g_app.openImageImport(undefined, "menu"),
    ]);
    return {
      sameInstance: first === second && first === firstInstance,
      status: g_app.services.uiRoutes.getState("feature:image-import").status,
    };
  });
  expect(repeated).toEqual({ sameInstance: true, status: "ready" });
  await expect(panel).toHaveCount(1);
  expect(await page.evaluate(() => UI.dialogStack.filter((dialog) =>
    dialog.uiID === "importImageDialog" || dialog.uiID === "importImageMobile",
  ).length)).toBe(1);

  await page.evaluate(() => g_app.closeRoute("feature:image-import"));
  await expect.poll(routeState).toEqual({
    active: true,
    route: "editor:2d",
    source: "keyboard",
    status: "disposed",
  });
  await expect(panel).toHaveCount(0);
  await page.evaluate(() => { delete globalThis.__routeTestImporter; });
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test("mobile image import serializes rapid close and reopen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-handheld");

  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/?route=feature%3Aimage-import", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() =>
    g_app.services.uiRoutes.getState("feature:image-import").status,
  )).toBe("ready");
  await page.waitForTimeout(250);

  await page.evaluate(async () => {
    const closing = g_app.closeRoute("feature:image-import");
    const reopening = g_app.openImageImport(undefined, "rapid-reopen");
    await Promise.all([closing, reopening]);
  });
  await page.waitForTimeout(300);

  expect(await page.evaluate(() => ({
    active: g_app.services.uiRoutes.getActiveRoute(),
    stackEntries: UI.dialogStack.filter((dialog) =>
      dialog.uiID === "importImageMobile",
    ).length,
    status: g_app.services.uiRoutes.getState("feature:image-import").status,
    visible: g_app.services.imageImport.getActive(g_app.textModeEditor)?.visible,
  }))).toEqual({
    active: "feature:image-import",
    stackEntries: 1,
    status: "ready",
    visible: true,
  });
  await expect(page.locator(".ui-mobilepanel:visible").filter({
    hasText: "Import Image",
  })).toBeVisible();

  await page.evaluate(async () => {
    UI.closeDialog();
    await g_app.openImageImport(undefined, "panel-close-reopen");
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => ({
    active: g_app.services.uiRoutes.getActiveRoute(),
    stackEntries: UI.dialogStack.filter((dialog) =>
      dialog.uiID === "importImageMobile",
    ).length,
    status: g_app.services.uiRoutes.getState("feature:image-import").status,
    visible: g_app.services.imageImport.getActive(g_app.textModeEditor)?.visible,
  }))).toEqual({
    active: "feature:image-import",
    stackEntries: 1,
    status: "ready",
    visible: true,
  });

  expect(await page.evaluate(async () => {
    UI.closeDialog();
    const switching = g_app.setMode("start");
    const modeDuringClose = g_app.getMode();
    await switching;
    return {
      active: g_app.services.uiRoutes.getActiveRoute(),
      modeAfterClose: g_app.getMode(),
      modeDuringClose,
    };
  })).toEqual({
    active: "app:start",
    modeAfterClose: "start",
    modeDuringClose: "2d",
  });
  await expect(page.locator(".ui-mobilepanel:visible").filter({
    hasText: "Import Image",
  })).toHaveCount(0);
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test("production image-import entry points share their context-scoped instance", async ({ page }, testInfo) => {
  test.skip(!["chromium-desktop", "chromium-handheld"].includes(testInfo.project.name));

  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForStableStartPage(
    page,
    browserPolicy.performanceBudgets.startupMilliseconds,
    localFailures,
  );

  const routeState = () => page.evaluate(() => ({
    route: g_app.services.uiRoutes.getActiveRoute(),
    source: g_app.services.uiRoutes.getState("feature:image-import").source,
    status: g_app.services.uiRoutes.getState("feature:image-import").status,
  }));
  const rememberInstance = () => page.evaluate(() => {
    if (!globalThis.__entrypointImporter) {
      globalThis.__entrypointImporter = g_app.services.imageImport.getActive(g_app.textModeEditor);
    }
    return g_app.services.imageImport.getActive(g_app.textModeEditor) ===
      globalThis.__entrypointImporter;
  });
  const waitForImport = async (source) => {
    await expect.poll(routeState).toEqual({
      route: "feature:image-import",
      source,
      status: "ready",
    });
    expect(await rememberInstance()).toBe(true);
    const focusTarget = testInfo.project.metadata.deviceClass === "desktop"
      ? page.locator("#importImageChooseFile")
      : page.locator("#importImageMobileChooseFile");
    await expect(focusTarget).toBeFocused();
  };
  const closeImport = async () => {
    await page.evaluate(() => g_app.closeRoute("feature:image-import"));
    await expect.poll(() => page.evaluate(() =>
      g_app.services.uiRoutes.getActiveRoute(),
    )).toBe("editor:2d");
  };

  if (testInfo.project.metadata.deviceClass === "desktop") {
    await page.keyboard.press("Alt+Shift+I");
    expect(await page.evaluate(() => g_app.services.uiRoutes.getActiveRoute())).not.toBe(
      "feature:image-import",
    );
  }
  await page.locator("#startImportImage").click();
  await waitForImport("start-page");
  await closeImport();

  if (testInfo.project.metadata.deviceClass === "desktop") {
    const importMenu = page.locator(".ui-menubar-item:visible").filter({ hasText: /^Import$/ });
    await importMenu.click();
    await page.locator(".ui-menu-item:visible").filter({
      has: page.locator(".ui-menu-item-label", { hasText: /^Image \/ Video\.\.\.$/ }),
    }).click();
    await waitForImport("menu");
    await closeImport();

    await page.keyboard.press("Alt+Shift+I");
    await waitForImport("keyboard");
    await closeImport();

    await page.evaluate(() => {
      const file = new File([
        Uint8Array.from(atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAFgAI/ScL3WQAAAABJRU5ErkJggg==",
        ), (character) => character.charCodeAt(0)),
      ], "route-test.png", { type: "image/png" });
      const event = new Event("drop", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
      document.dispatchEvent(event);
    });
    const dropDialog = page.locator(".ui-dialog:visible").filter({
      has: page.locator("#dropImageAction_import"),
    });
    await expect(dropDialog).toBeVisible();
    await dropDialog.getByText("OK", { exact: true }).click();
    await waitForImport("drag-and-drop");

    await page.evaluate(() => {
      const nested = UI.create("UI.Dialog", {
        id: "routeNestedDialog",
        title: "Nested route dialog",
        width: 200,
        height: 100,
      });
      nested.on("close", () => { globalThis.__nestedRouteDialogClosed = true; });
      UI.showDialog(nested);
      g_app.setMode("start");
    });
    await expect.poll(() => page.evaluate(() => ({
      importVisible: g_app.services.imageImport.getActive(g_app.textModeEditor)?.visible,
      nestedClosed: globalThis.__nestedRouteDialogClosed === true,
      route: g_app.services.uiRoutes.getActiveRoute(),
      stackHasImporter: UI.dialogStack.some((dialog) =>
        dialog.uiID === "importImageDialog" || dialog.uiID === "importImageMobile"),
    }))).toEqual({
      importVisible: false,
      nestedClosed: true,
      route: "app:start",
      stackHasImporter: false,
    });
  } else {
    await page.locator("#mobileMenuBarHamburger").click();
    await page.locator(".mobile-menu-item").filter({ hasText: "Import Image / Video" }).click();
    await waitForImport("mobile-menu");
    await closeImport();
  }

  await page.evaluate(() => {
    delete globalThis.__entrypointImporter;
    delete globalThis.__nestedRouteDialogClosed;
  });
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test("2D startup remains available when WebGL is unavailable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");

  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) {
        return null;
      }
      return originalGetContext.call(this, type, ...args);
    };
  });
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForStableStartPage(
    page,
    browserPolicy.performanceBudgets.startupMilliseconds,
    localFailures,
  );

  expect(await page.evaluate(() => ({ renderer: UI.renderer, enabled: UI.webGLEnabled }))).toEqual({
    renderer: null,
    enabled: false,
  });
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test(
  "Firefox creates a default project without unexpected first-party console issues",
  async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "firefox-desktop");

    const page = await browser.newPage({ baseURL: testInfo.project.use.baseURL });
    const consoleIssues = [];
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type())) {
        const location = message.location();
        consoleIssues.push(
          `${message.type()}: ${message.text()}${location.url ? ` (${location.url})` : ""}`,
        );
      }
    });
    page.on("pageerror", (error) => consoleIssues.push(`page error: ${error.message}`));

    await page.route(/^https:\/\//, (route) =>
      route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
    );
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForStableStartPage(
      page,
      browserPolicy.performanceBudgets.startupMilliseconds,
      consoleIssues,
    );

    await page.locator("#start2D").click();
    await page.getByText("OK", { exact: true }).last().click();
    await expect(page.locator("#startPage")).toBeHidden();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );

    const webGLUnavailable = await page.evaluate(
      () => UI.renderer === null && UI.webGLEnabled === false,
    );
    const unexpectedConsoleIssues = consoleIssues.filter(
      (issue) =>
        !(
          webGLUnavailable &&
          (issue.includes("THREE.WebGLRenderer: Error creating WebGL context") ||
            issue.includes("Failed to create WebGL context: WebGL creation failed") ||
            issue.includes("WebGL warning: <Create>"))
        ),
    );

    expect(unexpectedConsoleIssues, unexpectedConsoleIssues.join("\n")).toEqual([]);
    await page.close();
  },
);

test("2D renderer keeps only its base and overlay at full device resolution", async ({ page }, testInfo) => {
  await open2DProject(page, testInfo);
  const result = await page.evaluate(() => {
    const gridView = g_app.textModeEditor.gridView2d;
    const frontRect = gridView.canvas.getBoundingClientRect();
    const overlayRect = gridView.overlayCanvas.getBoundingClientRect();

    return {
      baseConnected: gridView.baseCanvas.isConnected,
      baseSize: [gridView.baseCanvas.width, gridView.baseCanvas.height],
      contextStillTargetsFront: gridView.context === gridView.canvas.getContext("2d"),
      frontSize: [gridView.canvas.width, gridView.canvas.height],
      hasFullSizeGridCache: "gridCanvas" in gridView,
      overlayConnected: gridView.overlayCanvas.isConnected,
      overlayPointerEvents: getComputedStyle(gridView.overlayCanvas).pointerEvents,
      overlayRect: [overlayRect.x, overlayRect.y, overlayRect.width, overlayRect.height],
      overlaySize: [gridView.overlayCanvas.width, gridView.overlayCanvas.height],
      frontRect: [frontRect.x, frontRect.y, frontRect.width, frontRect.height],
    };
  });

  expect(result.frontSize[0]).toBeGreaterThan(0);
  expect(result.frontSize[1]).toBeGreaterThan(0);
  expect(result.baseSize).toEqual(result.frontSize);
  expect(result.overlaySize).toEqual(result.frontSize);
  expect(result.overlayRect).toEqual(result.frontRect);
  expect(result).toMatchObject({
    baseConnected: false,
    contextStillTargetsFront: true,
    hasFullSizeGridCache: false,
    overlayConnected: true,
    overlayPointerEvents: "none",
  });
});

test("2D renderer invalidates the right cache when stationary controls change", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo);
  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const grid2d = editor.grid.grid2d;
    const gridView = editor.gridView2d;

    const resetInvalidation = () => {
      gridView.backBufferNeedsRedraw = false;
      gridView.overlayNeedsRedraw = false;
    };
    const captureInvalidation = () => ({
      artwork: gridView.backBufferNeedsRedraw,
      overlay: gridView.overlayNeedsRedraw,
    });

    resetInvalidation();
    grid2d.setCursorColor(grid2d.cursor.color === 1 ? 2 : 1);
    const cursorStyle = captureInvalidation();

    resetInvalidation();
    editor.currentTile.drawCursor();
    const cursorRaster = captureInvalidation();

    resetInvalidation();
    editor.tools.drawTools.setDrawMode();
    const drawMode = captureInvalidation();

    resetInvalidation();
    editor.tools.drawTools.toggleDrawCharacter();
    const drawToggle = captureInvalidation();

    resetInvalidation();
    editor.tools.drawTools.setDrawTool("pen");
    const tool = captureInvalidation();

    return { cursorRaster, cursorStyle, drawMode, drawToggle, tool };
  });

  expect(result).toEqual({
    cursorRaster: { artwork: false, overlay: true },
    cursorStyle: { artwork: false, overlay: true },
    drawMode: { artwork: false, overlay: true },
    drawToggle: { artwork: false, overlay: true },
    tool: { artwork: true, overlay: true },
  });
});

test("2D editor reuses cached artwork while a marquee animates", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo);
  const result = await page.evaluate(async () => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const select = editor.tools.drawTools.select;
    let frameDraws = 0;
    let selectionDraws = 0;
    const originalDrawFrame = editor.graphic.drawFrame;
    const originalLayerDraw = layer.draw;

    editor.graphic.drawFrame = function (...args) {
      frameDraws++;
      return originalDrawFrame.apply(this, args);
    };
    layer.draw = function (args) {
      if (args.draw === "selection") selectionDraws++;
      return originalLayerDraw.call(this, args);
    };

    select.setSelection({
      from: { x: 1, y: 1, z: 0 },
      to: { x: 5, y: 4, z: 0 },
    });
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });
    const stationarySelectionDraws = selectionDraws;

    frameDraws = 0;
    await new Promise((resolve) => {
      let frames = 0;
      const next = () => {
        if (++frames === 20) resolve();
        else requestAnimationFrame(next);
      };
      requestAnimationFrame(next);
    });
    const animatedFrameDraws = frameDraws;

    select.selectionOffsetX = 1;
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    return {
      animatedFrameDraws,
      movingSelectionDraws: selectionDraws - stationarySelectionDraws,
      stationarySelectionDraws,
    };
  });

  expect(result).toEqual({
    animatedFrameDraws: 0,
    movingSelectionDraws: 1,
    stationarySelectionDraws: 0,
  });
});

test("2D editor confines pencil rasterization and repaint to edited cells", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo);
  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const grid2d = editor.grid.grid2d;
    const gridView = editor.gridView2d;
    const tile = layer.getCell({ x: 10, y: 6 }).t === 1 ? 2 : 1;

    gridView.setScale(3.5, false);
    editor.setSelectedTiles([[tile]]);
    layer.setCell({
      x: 1,
      y: 1,
      t: tile,
      fc: editor.currentTile.color,
      bc: editor.currentTile.bgColor,
    });
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    const drawRanges = [];
    const clipRects = [];
    const originalDraw = layer.draw;
    const context = gridView.backBufferContext;
    const originalRect = context.rect;
    const originalClip = context.clip;
    let pendingRect = false;
    layer.draw = function (args) {
      drawRanges.push({
        allCells: args.allCells,
        minX: this.updatedCellRanges.minX,
        minY: this.updatedCellRanges.minY,
        maxX: this.updatedCellRanges.maxX,
        maxY: this.updatedCellRanges.maxY,
      });
      return originalDraw.call(this, args);
    };
    context.rect = function (...args) {
      pendingRect = args;
      return originalRect.apply(this, args);
    };
    context.clip = function (...args) {
      if (pendingRect) clipRects.push(pendingRect);
      pendingRect = false;
      return originalClip.apply(this, args);
    };

    grid2d.setCursor(10, 6, 0, editor.currentTile.color, editor.currentTile.bgColor);
    grid2d.setCursorEnabled(true);
    grid2d.setCursorCells();
    layer.draw = originalDraw;
    context.rect = originalRect;
    context.clip = originalClip;

    return {
      clipRects,
      displayScale: gridView.displayScale,
      drawRanges,
      tileHeight: layer.getTileSet().getTileHeight(),
      tileWidth: layer.getTileSet().getTileWidth(),
      tileWasDrawn: layer.getCell({ x: 10, y: 6 }).t === tile,
    };
  });

  expect(result.tileWasDrawn).toBe(true);
  expect(result.drawRanges).toContainEqual({
    allCells: false,
    minX: 10,
    minY: 6,
    maxX: 11,
    maxY: 7,
  });
  expect(result.displayScale).toBe(3.5);
  expect(result.clipRects).toContainEqual(expect.arrayContaining([
    expect.any(Number),
    expect.any(Number),
    expect.any(Number),
    expect.any(Number),
  ]));
  expect(
    result.clipRects.some(([, , width, height]) =>
      width <= Math.ceil(result.tileWidth * result.displayScale) + 1
      && height <= Math.ceil(result.tileHeight * result.displayScale) + 1),
  ).toBe(true);
});

test("2D editor redraws the clipped grid without a full-size grid cache", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo);
  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const grid2d = editor.grid.grid2d;
    const gridView = editor.gridView2d;

    gridView.setScale(3.5, false);
    grid2d.setCursorEnabled(false);
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    const originalDrawGrid = gridView.drawGrid;
    const baseContext = gridView.baseContext;
    const originalRect = baseContext.rect;
    const originalClip = baseContext.clip;
    let gridRasterizations = 0;
    let pendingRect = false;
    const baseClipRects = [];
    gridView.drawGrid = function (...args) {
      gridRasterizations++;
      return originalDrawGrid.apply(this, args);
    };
    baseContext.rect = function (...args) {
      pendingRect = args;
      return originalRect.apply(this, args);
    };
    baseContext.clip = function (...args) {
      if (pendingRect) baseClipRects.push(pendingRect);
      pendingRect = false;
      return originalClip.apply(this, args);
    };

    const tile = layer.getCell({ x: 12, y: 12 }).t === 1 ? 2 : 1;
    editor.setSelectedTiles([[tile]]);
    grid2d.setCursor(12, 12, 0, editor.currentTile.color, editor.currentTile.bgColor);
    grid2d.setCursorEnabled(true);
    grid2d.setCursorCells();
    gridView.drawLineWithCursor(12, 12, 18, 12, 0);
    gridView.drawGrid = originalDrawGrid;
    baseContext.rect = originalRect;
    baseContext.clip = originalClip;

    return {
      baseClipRects,
      baseMatchesFront: gridView.baseCanvas.width === gridView.canvas.width
        && gridView.baseCanvas.height === gridView.canvas.height,
      displayScale: gridView.displayScale,
      gridRasterizations,
      hasFullSizeGridCache: "gridCanvas" in gridView,
      pixelRatio: gridView.uiComponent.getScale(),
      drawnCells: Array.from(
        { length: 7 },
        (_, index) => layer.getCell({ x: 12 + index, y: 12 }).t,
      ),
      tileHeight: layer.getTileSet().getTileHeight(),
      tileWidth: layer.getTileSet().getTileWidth(),
      tile,
    };
  });

  expect(result.displayScale).toBe(3.5);
  expect(result.baseMatchesFront).toBe(true);
  expect(result.hasFullSizeGridCache).toBe(false);
  expect(result.gridRasterizations).toBeGreaterThan(0);
  expect(result.baseClipRects.length).toBeGreaterThan(0);
  expect(
    result.baseClipRects.some(([, , width, height]) =>
      width <= Math.ceil(result.tileWidth * result.displayScale * result.pixelRatio) + 2
      && height <= Math.ceil(result.tileHeight * result.displayScale * result.pixelRatio) + 2),
  ).toBe(true);
  expect(result.drawnCells).toEqual(Array(7).fill(result.tile));
});

test("2D editor keeps a real 350% pencil hold and drag stable", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo);
  const drag = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const gridView = editor.gridView2d;
    const tileWidth = layer.getTileSet().getTileWidth();
    const tileHeight = layer.getTileSet().getTileHeight();

    UI.devicePixelRatio = 2;
    gridView.uiComponent.resize({ force: true });
    editor.tools.drawTools.setDrawTool("pen");
    const drawnTile = 2;
    editor.setSelectedTiles([[drawnTile]]);
    gridView.setScale(3.5, false);
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    const artworkX = Math.floor(
      gridView.width / 2
        - editor.graphic.getGraphicWidth() * gridView.displayScale / 2
        - gridView.camera.position.x * gridView.displayScale,
    );
    const artworkY = Math.floor(
      gridView.height / 2
        - editor.graphic.getGraphicHeight() * gridView.displayScale / 2
        + gridView.camera.position.y * gridView.displayScale,
    );
    const cellWidth = tileWidth * gridView.displayScale;
    const cellHeight = tileHeight * gridView.displayScale;
    const firstVisibleX = Math.max(0, Math.ceil(-artworkX / cellWidth));
    const lastVisibleX = Math.min(
      layer.getGridWidth() - 1,
      Math.floor((gridView.width - artworkX) / cellWidth) - 1,
    );
    const firstVisibleY = Math.max(0, Math.ceil(-artworkY / cellHeight));
    const lastVisibleY = Math.min(
      layer.getGridHeight() - 1,
      Math.floor((gridView.height - artworkY) / cellHeight) - 1,
    );
    const startCell = {
      x: Math.max(firstVisibleX, Math.floor((firstVisibleX + lastVisibleX) / 2) - 2),
      y: Math.floor((firstVisibleY + lastVisibleY) / 2),
    };
    const endCell = {
      x: Math.min(lastVisibleX, startCell.x + 4),
      y: startCell.y,
    };
    const canvasRect = gridView.canvas.getBoundingClientRect();
    const pointForCell = (cell) => ({
      x: canvasRect.left + artworkX + (cell.x + 0.5) * cellWidth,
      y: canvasRect.top + artworkY + (cell.y + 0.5) * cellHeight,
    });
    const sampleCell = {
      x: Math.min(lastVisibleX - 3, firstVisibleX + 2),
      y: Math.min(lastVisibleY - 3, firstVisibleY + 2),
    };
    const sampleLocal = {
      x: Math.floor(artworkX + sampleCell.x * cellWidth),
      y: Math.floor(artworkY + sampleCell.y * cellHeight),
      width: Math.floor(cellWidth * 3),
      height: Math.floor(cellHeight * 3),
    };
    const context = gridView.context;
    const hashSample = () => {
      const pixelRatio = gridView.uiComponent.getScale();
      const pixels = context.getImageData(
        sampleLocal.x * pixelRatio,
        sampleLocal.y * pixelRatio,
        sampleLocal.width * pixelRatio,
        sampleLocal.height * pixelRatio,
      ).data;
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index++) {
        hash ^= pixels[index];
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    };
    const emptySampleHash = hashSample();
    for (let y = sampleCell.y; y < sampleCell.y + 3; y++) {
      for (let x = sampleCell.x; x < sampleCell.x + 3; x++) {
        layer.setCell({
          x,
          y,
          t: 1,
          fc: 1,
          bc: editor.colorPaletteManager.noColor,
        });
      }
    }
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });
    const seededSampleHash = hashSample();

    const originalDrawImage = context.drawImage;
    const backBufferContext = gridView.backBufferContext;
    const originalBackBufferRect = backBufferContext.rect;
    const originalBackBufferClip = backBufferContext.clip;
    const frontWrites = [];
    const backBufferClipRects = [];
    let pendingBackBufferRect = false;
    context.drawImage = function (...args) {
      const result = originalDrawImage.apply(this, args);
      if (args[0] === gridView.baseCanvas || args[0] === gridView.backBufferCanvas) {
        frontWrites.push({
          argumentCount: args.length,
          source: args[0] === gridView.baseCanvas ? "base" : "artwork",
          compositeOperation: this.globalCompositeOperation,
          hash: hashSample(),
          sourceHeight: args.length === 9 ? args[4] : args[0].height,
          sourceWidth: args.length === 9 ? args[3] : args[0].width,
        });
      }
      return result;
    };
    backBufferContext.rect = function (...args) {
      pendingBackBufferRect = args;
      return originalBackBufferRect.apply(this, args);
    };
    backBufferContext.clip = function (...args) {
      if (pendingBackBufferRect) backBufferClipRects.push(pendingBackBufferRect);
      pendingBackBufferRect = false;
      return originalBackBufferClip.apply(this, args);
    };

    window.__pencilDrag = {
      backBufferClipRects,
      startCell,
      endCell,
      frontWrites,
      restore: () => {
        context.drawImage = originalDrawImage;
        backBufferContext.rect = originalBackBufferRect;
        backBufferContext.clip = originalBackBufferClip;
      },
    };
    return {
      start: pointForCell(startCell),
      end: pointForCell(endCell),
      startCell,
      endCell,
      cellHeight,
      cellWidth,
      pixelRatio: gridView.uiComponent.getScale(),
      drawnTile,
      emptySampleHash,
      seededSampleHash,
      sample: {
        x: Math.floor(canvasRect.left + artworkX + sampleCell.x * cellWidth),
        y: Math.floor(canvasRect.top + artworkY + sampleCell.y * cellHeight),
        width: Math.floor(cellWidth * 3),
        height: Math.floor(cellHeight * 3),
      },
    };
  });

  await page.mouse.move(drag.start.x, drag.start.y);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const baseline = await page.screenshot({ clip: drag.sample });
  const stableFrames = [];
  await page.mouse.down();
  expect(await page.evaluate(() => g_app.textModeEditor.gridView2d.mouseIsDown)).toBe(true);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  stableFrames.push(baseline.equals(await page.screenshot({ clip: drag.sample })));
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(
      drag.start.x + (drag.end.x - drag.start.x) * step / 8,
      drag.start.y + (drag.end.y - drag.start.y) * step / 8,
    );
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    stableFrames.push(baseline.equals(await page.screenshot({ clip: drag.sample })));
  }
  await page.mouse.up();

  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const {
      backBufferClipRects,
      startCell,
      endCell,
      frontWrites,
      restore,
    } = window.__pencilDrag;
    const drawnCells = [];
    for (let x = startCell.x; x <= endCell.x; x++) {
      drawnCells.push(layer.getCell({ x, y: startCell.y }).t);
    }
    restore();
    return {
      backBufferClipRects,
      drawnCells,
      frontWrites,
      mouseIsDown: editor.gridView2d.mouseIsDown,
    };
  });

  expect(result.mouseIsDown).toBe(false);
  expect(drag.seededSampleHash).not.toBe(drag.emptySampleHash);
  expect(stableFrames).toEqual(Array(9).fill(true));
  expect(result.backBufferClipRects.length).toBeGreaterThan(0);
  expect(result.backBufferClipRects[0][2]).toBeLessThanOrEqual(Math.ceil(drag.cellWidth) + 1);
  expect(result.backBufferClipRects[0][3]).toBeLessThanOrEqual(Math.ceil(drag.cellHeight) + 1);
  expect(result.frontWrites.length).toBeGreaterThanOrEqual(
    drag.endCell.x - drag.startCell.x + 1,
  );
  expect(result.frontWrites.every(({ source }) => source === "base")).toBe(true);
  expect(
    result.frontWrites.every(({ argumentCount }) => [3, 9].includes(argumentCount)),
  ).toBe(true);
  const dirtyFrontWrites = result.frontWrites.filter(
    ({ argumentCount }) => argumentCount === 9,
  );
  expect(dirtyFrontWrites.length).toBeGreaterThanOrEqual(
    drag.endCell.x - drag.startCell.x + 1,
  );
  expect(
    dirtyFrontWrites.every(({ sourceWidth, sourceHeight }) =>
      sourceWidth <= Math.ceil(drag.cellWidth * drag.pixelRatio) + 2
      && sourceHeight <= Math.ceil(drag.cellHeight * drag.pixelRatio) + 2),
  ).toBe(true);
  expect(
    result.frontWrites.every(
      ({ compositeOperation }) => compositeOperation === "source-over",
    ),
  ).toBe(true);
  expect(new Set(result.frontWrites.map(({ hash }) => hash)).size).toBe(1);
  expect(result.drawnCells).toEqual(
    Array(drag.endCell.x - drag.startCell.x + 1).fill(drag.drawnTile),
  );
});

test("2D editor keeps grid contrast stable during pencil redraws", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo);
  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const grid2d = editor.grid.grid2d;
    const gridView = editor.gridView2d;
    const context = gridView.context;

    gridView.setScale(8, false);
    grid2d.setCursorEnabled(false);
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    const sampleWidth = Math.min(256, gridView.canvas.width);
    const sampleHeight = Math.min(256, gridView.canvas.height);
    const captureUntouchedGrid = () =>
      new Uint8ClampedArray(context.getImageData(0, 0, sampleWidth, sampleHeight).data);
    const countChanges = (before, after) => {
      let changed = 0;
      for (let index = 0; index < before.length; index++) {
        if (before[index] !== after[index]) changed++;
      }
      return changed;
    };

    const baseline = captureUntouchedGrid();
    const frameChanges = [];
    const tile = layer.getCell({ x: 20, y: 12 }).t === 1 ? 2 : 1;
    editor.setSelectedTiles([[tile]]);

    for (let x = 20; x < 24; x++) {
      grid2d.setCursor(x, 12, 0, editor.currentTile.color, editor.currentTile.bgColor);
      grid2d.setCursorEnabled(true);
      grid2d.setCursorCells();
      frameChanges.push(countChanges(baseline, captureUntouchedGrid()));
    }

    grid2d.setCursorEnabled(false);
    gridView.render();

    return {
      displayScale: gridView.displayScale,
      frameChanges,
      finalChanges: countChanges(baseline, captureUntouchedGrid()),
    };
  });

  expect(result.displayScale).toBeGreaterThan(6);
  expect(result.frameChanges).toEqual([0, 0, 0, 0]);
  expect(result.finalChanges).toBe(0);
});

test("2D editor keeps vector cursor previews out of the artwork cache", async ({ page }, testInfo) => {
  test.skip(!isDesktop2DRendererProject(testInfo));

  await open2DProject(page, testInfo, { vector: true });
  const result = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const layer = editor.layers.getSelectedLayerObject();
    const layerCanvas = layer.getCanvas();
    const layerContext = layerCanvas.getContext("2d");
    const frontCanvas = editor.gridView2d.canvas;
    const frontContext = frontCanvas.getContext("2d");
    const baseCanvas = editor.gridView2d.baseCanvas;
    const baseContext = baseCanvas.getContext("2d");
    const overlayCanvas = editor.gridView2d.overlayCanvas;
    const overlayContext = overlayCanvas.getContext("2d");
    const capture = (context, canvas) =>
      new Uint8ClampedArray(context.getImageData(0, 0, canvas.width, canvas.height).data);
    const countChanges = (before, after) => {
      let changed = 0;
      for (let index = 0; index < before.length; index++) {
        if (before[index] !== after[index]) changed++;
      }
      return changed;
    };

    let tile = 1;
    const tileSet = layer.getTileSet();
    while (tile < tileSet.getTileCount() && !tileSet.getGlyphPath(tile)) tile++;
    editor.setSelectedTiles([[tile]]);
    editor.grid.grid2d.setCursorEnabled(false);
    editor.gridView2d.setScale(3.5, false);
    editor.graphic.invalidateAllCells();
    editor.graphic.redraw({ allCells: true });

    const viewScale = editor.gridView2d.displayScale;
    const pixelRatio = editor.gridView2d.uiComponent.getScale();
    const cursorCell = {
      x: Math.floor(layer.getGridWidth() / 2),
      y: Math.floor(layer.getGridHeight() / 2),
    };
    const artworkX = Math.floor(
      editor.gridView2d.width / 2
        - editor.graphic.getGraphicWidth() * viewScale / 2
        - editor.gridView2d.camera.position.x * viewScale,
    );
    const artworkY = Math.floor(
      editor.gridView2d.height / 2
        - editor.graphic.getGraphicHeight() * viewScale / 2
        + editor.gridView2d.camera.position.y * viewScale,
    );
    const cursorRegion = {
      x: Math.max(0, Math.floor((artworkX + cursorCell.x * layer.getCellWidth() * viewScale - 2) * pixelRatio)),
      y: Math.max(0, Math.floor((artworkY + cursorCell.y * layer.getCellHeight() * viewScale - 2) * pixelRatio)),
      width: Math.ceil((layer.getCellWidth() * viewScale + 4) * pixelRatio),
      height: Math.ceil((layer.getCellHeight() * viewScale + 4) * pixelRatio),
    };
    const captureCursorRegion = (context) => new Uint8ClampedArray(
      context.getImageData(
        cursorRegion.x,
        cursorRegion.y,
        cursorRegion.width,
        cursorRegion.height,
      ).data,
    );
    const baseWithGrid = captureCursorRegion(baseContext);
    editor.setGridVisible(false);
    const baseWithoutGrid = captureCursorRegion(baseContext);
    editor.setGridVisible(true);

    const artworkBefore = capture(layerContext, layerCanvas);
    const frontBefore = capture(frontContext, frontCanvas);
    const overlayBefore = capture(overlayContext, overlayCanvas);

    editor.grid.grid2d.setCursorEnabled(true);
    editor.grid.grid2d.setCursorPosition(cursorCell.x, cursorCell.y);
    editor.gridView2d.render();
    const overlayWithCursor = capture(overlayContext, overlayCanvas);
    const overlayCursorRegion = captureCursorRegion(overlayContext);
    let cursorAboveGridPixels = 0;
    for (let index = 0; index < baseWithGrid.length; index += 4) {
      const gridChanged = baseWithGrid[index] !== baseWithoutGrid[index]
        || baseWithGrid[index + 1] !== baseWithoutGrid[index + 1]
        || baseWithGrid[index + 2] !== baseWithoutGrid[index + 2]
        || baseWithGrid[index + 3] !== baseWithoutGrid[index + 3];
      if (gridChanged && overlayCursorRegion[index + 3] !== 0) {
        cursorAboveGridPixels++;
      }
    }

    for (let x = cursorCell.x + 1; x < cursorCell.x + 7; x++) {
      editor.grid.grid2d.setCursorPosition(x, cursorCell.y);
      editor.gridView2d.render();
    }
    editor.grid.grid2d.setCursorEnabled(false);
    editor.gridView2d.render();

    return {
      cursorAboveGridPixels,
      cursorPreviewChanges: countChanges(overlayBefore, overlayWithCursor),
      overlayFollowsFront: Boolean(
        frontCanvas.compareDocumentPosition(overlayCanvas)
          & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      restoredFrontChanges: countChanges(
        frontBefore,
        capture(frontContext, frontCanvas),
      ),
      restoredOverlayChanges: countChanges(
        overlayBefore,
        capture(overlayContext, overlayCanvas),
      ),
      artworkCacheChanges: countChanges(
        artworkBefore,
        capture(layerContext, layerCanvas),
      ),
    };
  });

  expect(result.cursorPreviewChanges).toBeGreaterThan(0);
  expect(result.cursorAboveGridPixels).toBeGreaterThan(0);
  expect(result.overlayFollowsFront).toBe(true);
  expect(result.restoredFrontChanges).toBe(0);
  expect(result.restoredOverlayChanges).toBe(0);
  expect(result.artworkCacheChanges).toBe(0);
});
