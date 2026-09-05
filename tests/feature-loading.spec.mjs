import { expect, test } from "@playwright/test";

test("image import is loaded once on first activation", async ({ page }, testInfo) => {
  const failures = [];
  const featureRequests = [];
  const applicationOrigin = new URL(testInfo.project.use.baseURL).origin;

  page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/js/features/image-import.js") {
      featureRequests.push(request.url());
    }
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).origin === applicationOrigin) {
      failures.push(`request failed: ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    if (new URL(response.url()).origin === applicationOrigin && response.status() >= 400) {
      failures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();

  const before = await page.evaluate(() => ({
    active: g_app.featureRegistry.isActive("imageImport"),
    coordinator: g_app.services.imageImportCoordinator.getStatus(),
    constructorType: typeof ImportImage,
    activeInstance: g_app.services.imageImport.getActive(g_app.textModeEditor),
    ownsImportImage: Object.hasOwn(g_app.textModeEditor, "importImage"),
  }));
  expect(before).toEqual({
    active: false,
    coordinator: "disposed",
    constructorType: "undefined",
    activeInstance: null,
    ownsImportImage: false,
  });
  expect(featureRequests).toEqual([]);

  const after = await page.evaluate(async () => {
    const editor = g_app.textModeEditor;
    const [first, second] = await Promise.all([
      g_app.activateFeature("imageImport", editor),
      g_app.activateFeature("imageImport", editor),
    ]);
    const otherEditor = {};
    const otherInstance = await g_app.activateFeature("imageImport", otherEditor);
    const contextsAreIsolated = otherInstance !== first && otherInstance.editor !== first.editor;
    await g_app.featureRegistry.dispose("imageImport", otherEditor);
    await g_app.featureRegistry.dispose("imageImport", editor);
    const disposedInstance = g_app.services.imageImport.getActive(editor);
    const reactivated = await g_app.activateFeature("imageImport", editor);
    return {
      active: g_app.featureRegistry.isActive("imageImport"),
      constructorType: typeof ImportImage,
      contextsAreIsolated,
      disposedInstance,
      initializedWithPort: first.editor !== editor && Object.isFrozen(first.editor),
      ownsImportImage: Object.hasOwn(editor, "importImage"),
      reactivatedWithNewInstance: reactivated !== first &&
        reactivated === g_app.services.imageImport.getActive(editor),
      sameConcurrentInstance: first === second,
    };
  });

  expect(after).toEqual({
    active: true,
    constructorType: "undefined",
    contextsAreIsolated: true,
    disposedInstance: null,
    initializedWithPort: true,
    ownsImportImage: false,
    reactivatedWithNewInstance: true,
    sameConcurrentInstance: true,
  });
  expect(featureRequests).toHaveLength(1);
  expect(failures, failures.join("\n")).toEqual([]);
});

test("a failed image import shows a retry action and restores focus", async ({ page }) => {
  let attempts = 0;
  let failRequest = true;

  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.route("**/js/features/image-import.js*", (route) => {
    attempts++;
    if (failRequest) route.abort("failed");
    else route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();
  await page.locator("#start2D").click();
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();
  await page.evaluate(() => {
    const trigger = document.createElement("button");
    trigger.id = "imageImportTestTrigger";
    trigger.textContent = "Open import";
    document.body.appendChild(trigger);
    trigger.focus();
  });
  await page.evaluate(() => g_app.openImageImport(undefined, "test"));

  await expect(page.locator("#featureLoadError .feature-load-error-message")).toHaveText(
    "Could not load image import. Check your connection and try again.",
  );
  await expect(page.locator("#featureLoadError .feature-load-retry")).toBeFocused();
  expect(await page.evaluate(() => g_app.featureRegistry.isActive("imageImport"))).toBe(false);
  expect(await page.evaluate(() =>
    g_app.services.imageImportCoordinator.getStatus(),
  )).toBe("failed");

  failRequest = false;
  await page.locator("#featureLoadError .feature-load-retry").click();

  await expect.poll(() => page.evaluate(() =>
    g_app.services.imageImportCoordinator.getStatus(),
  )).toBe("ready");
  await expect(page.locator("#featureLoadError")).toHaveCount(0);
  expect(await page.evaluate(() => g_app.featureRegistry.isActive("imageImport"))).toBe(true);
  await page.evaluate(() => g_app.closeImageImport());
  await expect(page.locator("#imageImportTestTrigger")).toBeFocused();
  expect(attempts).toBe(2);
});

test("a failed importer start is closed and retired on mode change", async ({ page }) => {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#start2D").click();
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();

  const failed = await page.evaluate(async () => {
    const trigger = document.createElement("button");
    trigger.id = "imageImportFailedStartTrigger";
    trigger.textContent = "Open import";
    document.body.appendChild(trigger);
    trigger.focus();

    const importer = await g_app.activateFeature("imageImport", g_app.textModeEditor);
    let closeCalls = 0;
    importer.start = async () => {
      const partialUi = document.createElement("div");
      partialUi.id = "partialImageImportUi";
      document.body.appendChild(partialUi);
      throw new Error("start failed after opening UI");
    };
    importer.close = async () => {
      closeCalls++;
      document.getElementById("partialImageImportUi")?.remove();
    };

    await g_app.openImageImport();
    return {
      activeImporter: g_app.services.imageImportCoordinator.getActive(),
      closeCallback: importer.closeCallback,
      closeCalls,
      partialUi: Boolean(document.getElementById("partialImageImportUi")),
      status: g_app.services.imageImportCoordinator.getStatus(),
    };
  });

  expect(failed).toEqual({
    activeImporter: null,
    closeCallback: null,
    closeCalls: 1,
    partialUi: false,
    status: "failed",
  });
  await expect(page.locator("#featureLoadError .feature-load-retry")).toBeFocused();

  await page.evaluate(() => g_app.setMode("start"));
  await expect.poll(() => page.evaluate(() =>
    g_app.services.imageImportCoordinator.getStatus(),
  )).toBe("disposed");
  await expect(page.locator("#featureLoadError")).toHaveCount(0);
  await expect(page.locator("#imageImportFailedStartTrigger")).toBeFocused();
});

test("an immediate close cancels an opening importer without deadlocking", async ({ page }) => {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#start2D").click();
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();

  const result = await page.evaluate(async () => {
    const opening = g_app.openImageImport();
    const closing = g_app.closeImageImport();
    const completed = Promise.all([opening, closing]).then(() => "completed");
    const timedOut = new Promise((resolve) => {
      setTimeout(() => resolve("timed out"), 1000);
    });
    return Promise.race([completed, timedOut]);
  });

  expect(result).toBe("completed");
  expect(await page.evaluate(() => ({
    active: g_app.services.imageImportCoordinator.getActive(),
    status: g_app.services.imageImportCoordinator.getStatus(),
  }))).toEqual({ active: null, status: "disposed" });
});

test("the image-import dialog keeps application typography and valid icons", async ({ page }, testInfo) => {
  const failures = [];
  const applicationOrigin = new URL(testInfo.project.use.baseURL).origin;

  page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).origin === applicationOrigin) {
      failures.push(`request failed: ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    if (new URL(response.url()).origin === applicationOrigin && response.status() >= 400) {
      failures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();

  await page.locator("#start2D").click();
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();

  const importMenu = page
    .locator(".ui-menubar-item:visible")
    .filter({ hasText: /^Import$/ });
  await expect(importMenu).toBeVisible();
  await importMenu.click();

  const imageImportItem = page
    .locator(".ui-menu-item:visible")
    .filter({
      has: page.locator(".ui-menu-item-label", { hasText: /^Image \/ Video\.\.\.$/ }),
    });
  await expect(imageImportItem).toBeVisible();
  await imageImportItem.click();

  const panel = page.locator("#importImagePanel");
  await expect(panel).toBeVisible();
  const colorAnalysis = await page.evaluate(() => {
    const editor = g_app.textModeEditor;
    const importer = g_app.services.imageImport.getActive(editor);
    const tileSet = editor.tileSetManager.getCurrentTileSet();
    const imageData = new ImageData(
      editor.frames.width * tileSet.charWidth,
      editor.frames.height * tileSet.charHeight,
    );
    return importer.importColorUtils.findColors(imageData, [0]);
  });
  expect(colorAnalysis).toEqual([{ color: 0, timesUsed: 0 }]);
  const dialog = panel.locator(
    "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' ui-dialog ')][1]",
  );

  const invalidIcons = await dialog.locator("img").evaluateAll((images) =>
    images
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.getAttribute("src")),
  );
  const malformedIconElements = await dialog.locator("i.halflings").evaluateAll((icons) =>
    icons
      .filter((icon) => icon.childElementCount > 0 || icon.textContent.trim() !== "")
      .map((icon) => icon.outerHTML.slice(0, 160)),
  );
  const leakedIconFonts = await dialog.locator("*").evaluateAll(
    (elements) => elements
      .filter(
        (element) =>
          !element.classList.contains("halflings") &&
          getComputedStyle(element).fontFamily.includes("Glyphicons"),
      )
      .map((element) => `${element.tagName.toLowerCase()}#${element.id}`),
  );

  expect(invalidIcons).toEqual([]);
  expect(await dialog.locator("i.halflings").count()).toBe(3);
  expect(malformedIconElements).toEqual([]);
  expect(leakedIconFonts).toEqual([]);
  expect(failures, failures.join("\n")).toEqual([]);
});
