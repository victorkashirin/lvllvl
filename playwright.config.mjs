import os from "node:os";

import { defineConfig, devices } from "@playwright/test";

import { browserTestProjects } from "./scripts/browser-policy.mjs";

// Playwright 1.62.1 selects WebKit revision 2251 on macOS 14, but its client
// sends the newer PushAPIEnabled protocol setting that revision does not know.
// Keep WebKit coverage in Linux CI while avoiding six guaranteed one-minute
// setup timeouts on affected local Macs.
const hasIncompatibleMacOS14WebKit =
  process.platform === "darwin" && os.release().split(".")[0] === "23";
const configuredProjects = browserTestProjects.filter(
  (project) => !(hasIncompatibleMacOS14WebKit && project.browserName === "webkit"),
);

if (hasIncompatibleMacOS14WebKit) {
  console.warn(
    "Skipping WebKit projects: Playwright 1.62.1's macOS 14 browser revision has an incompatible protocol.",
  );
}

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.mjs/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? "line" : "list",
  projects: configuredProjects.map((project) => ({
    name: project.name,
    metadata: {
      deviceClass: project.deviceClass,
    },
    testMatch: project.runFullSuite ? undefined : /browser-support\.spec\.mjs/,
    use: {
      ...devices[project.device],
      browserName: project.browserName,
      ...(project.viewport ? { viewport: project.viewport } : {}),
    },
  })),
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
  },
  webServer: {
    command: "npm run preview -- --port 4173",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
