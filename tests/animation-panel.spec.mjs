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
}

async function openInterfaceMenu(page) {
  const interfaceMenu = page
    .locator(".ui-menubar-item:visible")
    .filter({ hasText: /^Interface$/ });
  await expect(interfaceMenu).toBeVisible();
  await interfaceMenu.click();
}

test("the animation panel can be closed, restored, and stays hidden", async ({ page }) => {
  await openDefaultProject(page);

  await page.evaluate(() => {
    g_app.textModeEditor.setTilePalettePanelVisible("bottom", false);
    g_app.textModeEditor.setBottomBlockPanelVisible(false);
    g_app.textModeEditor.setAnimationPanelVisible(true);
  });

  const animationPanel = page.locator("#frames");
  const closeButton = page.getByRole("button", { name: "Close Animation Panel" });
  await expect(animationPanel).toBeVisible();
  await expect(closeButton).toBeVisible();

  const beforeClose = await page.evaluate(() => ({
    bottomHeight: document
      .getElementById(`${UI("textEditorContent").id}south`)
      .getBoundingClientRect().height,
    centerHeight: document
      .getElementById(`${UI("textEditorContent").id}center`)
      .getBoundingClientRect().height,
    checked: UI("view-animationpanel").getChecked(),
  }));
  expect(beforeClose.bottomHeight).toBe(60);
  expect(beforeClose.checked).toBe(true);

  await closeButton.click();
  await expect(animationPanel).toBeHidden();

  const afterClose = await page.evaluate(() => ({
    bottomHeight: document
      .getElementById(`${UI("textEditorContent").id}south`)
      .getBoundingClientRect().height,
    centerHeight: document
      .getElementById(`${UI("textEditorContent").id}center`)
      .getBoundingClientRect().height,
    checked: UI("view-animationpanel").getChecked(),
    preference: localStorage.getItem("textmode.animationPanelVisible"),
  }));
  expect(afterClose).toEqual({
    bottomHeight: 0,
    centerHeight: beforeClose.centerHeight + 60,
    checked: false,
    preference: "no",
  });

  await openInterfaceMenu(page);
  const animationMenuItem = page
    .locator(".ui-menu-item:visible")
    .filter({ hasText: /^Animation Panel$/ });
  await expect(animationMenuItem).toBeVisible();
  await animationMenuItem.click();
  await expect(animationPanel).toBeVisible();
  expect(await page.evaluate(() => ({
    checked: UI("view-animationpanel").getChecked(),
    preference: localStorage.getItem("textmode.animationPanelVisible"),
  }))).toEqual({ checked: true, preference: "yes" });

  await page.evaluate(() =>
    g_app.textModeEditor.setTilePalettePanelVisible("bottom", true),
  );
  const bottomPalette = page.locator("#charPalette");
  await expect(bottomPalette).toBeVisible();
  const withPalette = await page.evaluate(() => ({
    bottomHeight: document
      .getElementById(`${UI("textEditorContent").id}south`)
      .getBoundingClientRect().height,
    centerHeight: document
      .getElementById(`${UI("textEditorContent").id}center`)
      .getBoundingClientRect().height,
  }));
  expect(withPalette.bottomHeight).toBe(280);

  await closeButton.click();
  await expect(animationPanel).toBeHidden();
  await expect(bottomPalette).toBeVisible();
  expect(await page.evaluate(() => ({
    bottomHeight: document
      .getElementById(`${UI("textEditorContent").id}south`)
      .getBoundingClientRect().height,
    centerHeight: document
      .getElementById(`${UI("textEditorContent").id}center`)
      .getBoundingClientRect().height,
  }))).toEqual({
    bottomHeight: 220,
    centerHeight: withPalette.centerHeight + 60,
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();
  await page.locator("#start2D").click();
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();
  await expect(animationPanel).toBeHidden();
  expect(await page.evaluate(() => UI("view-animationpanel").getChecked())).toBe(false);
});
