import { expect, test } from "@playwright/test";

function spread(values) {
  return Math.max(...values) - Math.min(...values);
}

test("grid information and checkboxes align with adjacent text", async ({ page }) => {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();
  await page.locator("#start2D").click();
  await page.getByText("OK", { exact: true }).last().click();
  await expect(page.locator("#startPage")).toBeHidden();

  const desktopAlignment = await page.evaluate(() => {
    g_app.textModeEditor.gridInfo.setInfo(1, 2, 0, 3, 14, 6);

    const fixture = document.createElement("div");
    fixture.id = "control-alignment-fixture";
    fixture.style.cssText = "position: absolute; left: 10px; top: 10px";
    fixture.innerHTML = `
      <div>
        <label id="native-checkbox-label">
          <input id="native-checkbox" type="checkbox">
          <span>Native checkbox</span>
        </label>
      </div>
      <div>
        <label class="cb-container" id="custom-checkbox-label">
          <span class="cb-label">Custom checkbox</span>
          <input type="checkbox">
          <span class="checkmark" id="custom-checkbox" style="transition: none"></span>
        </label>
      </div>
    `;
    document.body.append(fixture);

    function verticalGeometry(element) {
      const rect = element.getBoundingClientRect();
      return { center: rect.top + rect.height / 2, height: rect.height };
    }

    const gridInfo = document.getElementById("gridinfo-coordinates");
    const gridValues = [...gridInfo.querySelectorAll(".gridinfo-value")];
    const colorLabels = [...gridInfo.querySelectorAll(".gridinfo-label")].filter(
      (label) => label.textContent.endsWith("Colour"),
    );
    const swatches = [...gridInfo.querySelectorAll(".gridinfo-color-swatch")];
    const nativeCheckbox = document.getElementById("native-checkbox");
    const nativeStyle = getComputedStyle(nativeCheckbox);

    return {
      customCheckbox: verticalGeometry(document.getElementById("custom-checkbox")),
      customLabel: verticalGeometry(document.getElementById("custom-checkbox-label")),
      colorLabelCenters: colorLabels.map((label) => verticalGeometry(label).center),
      gridValueCenters: gridValues.map((value) => verticalGeometry(value).center),
      nativeCheckbox: verticalGeometry(nativeCheckbox),
      nativeLabel: verticalGeometry(document.getElementById("native-checkbox-label")),
      nativeStyle: {
        marginBlockEnd: nativeStyle.marginBlockEnd,
        marginBlockStart: nativeStyle.marginBlockStart,
        verticalAlign: nativeStyle.verticalAlign,
      },
      swatches: swatches.map(verticalGeometry),
    };
  });

  expect(spread(desktopAlignment.gridValueCenters)).toBeLessThanOrEqual(0.1);
  expect(desktopAlignment.swatches).toHaveLength(2);
  expect(
    spread([
      ...desktopAlignment.colorLabelCenters,
      ...desktopAlignment.swatches.map((swatch) => swatch.center),
    ]),
  ).toBeLessThanOrEqual(0.1);
  expect(desktopAlignment.swatches.map((swatch) => swatch.height)).toEqual([12, 12]);
  expect(desktopAlignment.nativeStyle).toEqual({
    marginBlockEnd: "0px",
    marginBlockStart: "0px",
    verticalAlign: "middle",
  });
  expect(
    Math.abs(desktopAlignment.nativeCheckbox.center - desktopAlignment.nativeLabel.center),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(desktopAlignment.customCheckbox.center - desktopAlignment.customLabel.center),
  ).toBeLessThanOrEqual(0.1);

  await page.addStyleTag({ url: "/css/ui-mobile.css" });
  const mobileAlignment = await page.evaluate(() => {
    document.body.classList.add("mobileMode");
    const checkbox = document.getElementById("custom-checkbox").getBoundingClientRect();
    const label = document.getElementById("custom-checkbox-label").getBoundingClientRect();
    return {
      checkboxCenter: checkbox.top + checkbox.height / 2,
      checkboxHeight: checkbox.height,
      labelCenter: label.top + label.height / 2,
    };
  });

  expect(mobileAlignment.checkboxHeight).toBe(19);
  expect(
    Math.abs(mobileAlignment.checkboxCenter - mobileAlignment.labelCenter),
  ).toBeLessThanOrEqual(0.1);
});
