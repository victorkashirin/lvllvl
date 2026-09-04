import { expect, test } from "@playwright/test";

import { browserPolicy } from "../scripts/browser-policy.mjs";

function observeLocalFailures(page, baseURL) {
  const localFailures = [];
  const localOrigin = new URL(baseURL).origin;

  page.on("pageerror", (error) => localFailures.push(`page error: ${error.message}`));
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

async function waitForStableStartPage(page, timeout) {
  await expect(page.locator("#startPage")).toBeVisible({ timeout });
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

test("first-party production startup stays within budget", async ({ page }, testInfo) => {
  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);

  // Provider SDK latency is outside the first-party startup budget. Empty scripts
  // isolate the local application while preserving successful script responses.
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );

  const startedAt = Date.now();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForStableStartPage(page, browserPolicy.performanceBudgets.startupMilliseconds);
  const startupMilliseconds = Date.now() - startedAt;

  await startupState(page, testInfo);
  expect(startupMilliseconds).toBeLessThanOrEqual(
    browserPolicy.performanceBudgets.startupMilliseconds,
  );
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});

test("production starts when external providers are offline", async ({ page }, testInfo) => {
  const localFailures = observeLocalFailures(page, testInfo.project.use.baseURL);

  await page.route(/^https:\/\//, (route) => route.abort("internetdisconnected"));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForStableStartPage(page, browserPolicy.performanceBudgets.startupMilliseconds);

  await startupState(page, testInfo);
  expect(localFailures, localFailures.join("\n")).toEqual([]);
});
