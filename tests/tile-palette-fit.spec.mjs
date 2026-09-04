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
