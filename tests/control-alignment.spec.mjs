import { expect, test } from "@playwright/test";

function spread(values) {
  return Math.max(...values) - Math.min(...values);
}

test("form controls use the dark theme and align with adjacent text", async ({ page }) => {
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
      <input id="themed-text-input" type="text" value="Text">
      <textarea id="themed-textarea">Text area</textarea>
      <select id="themed-select"><option>Option</option></select>
      <input id="themed-range" type="range" min="0" max="100" value="50">
      <button id="themed-button" type="button">Button</button>
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
    const customStyle = getComputedStyle(document.getElementById("custom-checkbox"));
    const textInputStyle = getComputedStyle(document.getElementById("themed-text-input"));
    const textareaStyle = getComputedStyle(document.getElementById("themed-textarea"));
    const selectStyle = getComputedStyle(document.getElementById("themed-select"));
    const rangeStyle = getComputedStyle(document.getElementById("themed-range"));
    const buttonStyle = getComputedStyle(document.getElementById("themed-button"));
    const stylesheetRules = Array.from(document.styleSheets).flatMap((stylesheet) =>
      Array.from(stylesheet.cssRules));
    const rangeTrackStyle = stylesheetRules.find((rule) =>
      rule.selectorText === 'input[type="range"]::-webkit-slider-runnable-track').style;
    const rangeThumbStyle = stylesheetRules.find((rule) =>
      rule.selectorText === 'input[type="range"]::-webkit-slider-thumb').style;

    return {
      buttonBorderRadius: buttonStyle.borderRadius,
      customCheckbox: verticalGeometry(document.getElementById("custom-checkbox")),
      customLabel: verticalGeometry(document.getElementById("custom-checkbox-label")),
      colorLabelCenters: colorLabels.map((label) => verticalGeometry(label).center),
      gridValueCenters: gridValues.map((value) => verticalGeometry(value).center),
      nativeCheckbox: verticalGeometry(nativeCheckbox),
      nativeLabel: verticalGeometry(document.getElementById("native-checkbox-label")),
      nativeStyle: {
        appearance: nativeStyle.appearance,
        backgroundColor: nativeStyle.backgroundColor,
        borderRadius: nativeStyle.borderRadius,
        borderStyle: nativeStyle.borderStyle,
        colorScheme: nativeStyle.colorScheme,
        marginBlockEnd: nativeStyle.marginBlockEnd,
        marginBlockStart: nativeStyle.marginBlockStart,
        verticalAlign: nativeStyle.verticalAlign,
      },
      customStyle: {
        backgroundColor: customStyle.backgroundColor,
        borderRadius: customStyle.borderRadius,
        borderStyle: customStyle.borderStyle,
      },
      metaColorScheme: document.querySelector('meta[name="color-scheme"]')?.content,
      rangeStyle: {
        accentColor: rangeStyle.accentColor,
        appearance: rangeStyle.appearance,
        height: rangeStyle.height,
        thumbBackgroundColor: rangeThumbStyle.backgroundColor,
        thumbBorderWidth: rangeThumbStyle.borderTopWidth,
        thumbHeight: rangeThumbStyle.height,
        trackBackgroundColor: rangeTrackStyle.backgroundColor,
        trackBorderWidth: rangeTrackStyle.borderTopWidth,
        trackHeight: rangeTrackStyle.height,
      },
      selectStyle: {
        backgroundColor: selectStyle.backgroundColor,
        borderRadius: selectStyle.borderRadius,
        borderStyle: selectStyle.borderStyle,
        boxShadow: selectStyle.boxShadow,
        color: selectStyle.color,
        paddingInlineEnd: selectStyle.paddingInlineEnd,
        paddingInlineStart: selectStyle.paddingInlineStart,
      },
      swatches: swatches.map(verticalGeometry),
      textInputStyle: {
        backgroundColor: textInputStyle.backgroundColor,
        borderRadius: textInputStyle.borderRadius,
        borderStyle: textInputStyle.borderStyle,
        boxShadow: textInputStyle.boxShadow,
        color: textInputStyle.color,
      },
      textareaStyle: {
        backgroundColor: textareaStyle.backgroundColor,
        borderRadius: textareaStyle.borderRadius,
        borderStyle: textareaStyle.borderStyle,
        color: textareaStyle.color,
      },
    };
  });
  await page.locator("#themed-text-input").focus();
  const focusedTextInputStyle = await page.locator("#themed-text-input").evaluate((input) => {
    const style = getComputedStyle(input);
    return {
      backgroundColor: style.backgroundColor,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  await page.locator("#themed-range").focus();
  const focusedRangeStyle = await page.locator("#themed-range").evaluate((range) => {
    const style = getComputedStyle(range);
    return {
      borderRadius: style.borderRadius,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
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
  expect(desktopAlignment.buttonBorderRadius).toBe("2px");
  expect(desktopAlignment.nativeStyle).toEqual({
    appearance: "none",
    backgroundColor: "rgb(51, 51, 51)",
    borderRadius: "2px",
    borderStyle: "none",
    colorScheme: "dark",
    marginBlockEnd: "0px",
    marginBlockStart: "0px",
    verticalAlign: "middle",
  });
  expect(desktopAlignment.customStyle).toEqual({
    backgroundColor: "rgb(51, 51, 51)",
    borderRadius: "2px",
    borderStyle: "none",
  });
  expect(desktopAlignment.metaColorScheme).toBe("dark");
  expect(desktopAlignment.rangeStyle).toEqual({
    accentColor: "rgb(63, 111, 150)",
    appearance: "none",
    height: "25px",
    thumbBackgroundColor: "rgb(136, 136, 136)",
    thumbBorderWidth: "0px",
    thumbHeight: "18px",
    trackBackgroundColor: "rgb(51, 51, 51)",
    trackBorderWidth: "0px",
    trackHeight: "4px",
  });
  expect(desktopAlignment.selectStyle).toEqual({
    backgroundColor: "rgb(51, 51, 51)",
    borderRadius: "2px",
    borderStyle: "none",
    boxShadow: "none",
    color: "rgb(221, 221, 221)",
    paddingInlineEnd: "24px",
    paddingInlineStart: "8px",
  });
  expect(desktopAlignment.textInputStyle).toEqual({
    backgroundColor: "rgb(51, 51, 51)",
    borderRadius: "2px",
    borderStyle: "none",
    boxShadow: "none",
    color: "rgb(221, 221, 221)",
  });
  expect(desktopAlignment.textareaStyle).toEqual({
    backgroundColor: "rgb(51, 51, 51)",
    borderRadius: "2px",
    borderStyle: "none",
    color: "rgb(221, 221, 221)",
  });
  expect(focusedTextInputStyle).toEqual({
    backgroundColor: "rgb(64, 64, 64)",
    outlineColor: "rgb(128, 184, 235)",
    outlineStyle: "solid",
    outlineWidth: "2px",
  });
  expect(focusedRangeStyle).toEqual({
    borderRadius: "2px",
    outlineColor: "rgb(128, 184, 235)",
    outlineStyle: "solid",
    outlineWidth: "2px",
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
    const checkboxElement = document.getElementById("custom-checkbox");
    const checkbox = checkboxElement.getBoundingClientRect();
    const checkboxStyle = getComputedStyle(checkboxElement);
    const stylesheetRules = Array.from(document.styleSheets).flatMap((stylesheet) =>
      Array.from(stylesheet.cssRules));
    const rangeTrackStyle = stylesheetRules.find((rule) =>
      rule.selectorText === '.mobileMode input[type="range"]::-webkit-slider-runnable-track').style;
    const rangeThumbStyle = stylesheetRules.find((rule) =>
      rule.selectorText === '.mobileMode input[type="range"]::-webkit-slider-thumb').style;
    const label = document.getElementById("custom-checkbox-label").getBoundingClientRect();
    return {
      checkboxBackgroundColor: checkboxStyle.backgroundColor,
      checkboxBorderRadius: checkboxStyle.borderRadius,
      checkboxCenter: checkbox.top + checkbox.height / 2,
      checkboxHeight: checkbox.height,
      labelCenter: label.top + label.height / 2,
      rangeThumbBackgroundColor: rangeThumbStyle.backgroundColor,
      rangeThumbBorderWidth: rangeThumbStyle.borderTopWidth,
      rangeTrackBackgroundColor: rangeTrackStyle.backgroundColor,
      rangeTrackBorderWidth: rangeTrackStyle.borderTopWidth,
    };
  });

  expect(mobileAlignment.checkboxHeight).toBe(19);
  expect(mobileAlignment.checkboxBackgroundColor).toBe("rgb(51, 51, 51)");
  expect(mobileAlignment.checkboxBorderRadius).toBe("2px");
  expect(mobileAlignment.rangeThumbBackgroundColor).toBe("rgb(136, 136, 136)");
  expect(mobileAlignment.rangeThumbBorderWidth).toBe("0px");
  expect(mobileAlignment.rangeTrackBackgroundColor).toBe("rgb(51, 51, 51)");
  expect(mobileAlignment.rangeTrackBorderWidth).toBe("0px");
  expect(
    Math.abs(mobileAlignment.checkboxCenter - mobileAlignment.labelCenter),
  ).toBeLessThanOrEqual(0.1);
});
