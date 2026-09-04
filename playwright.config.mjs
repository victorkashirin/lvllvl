import { defineConfig, devices } from "@playwright/test";

import { browserTestProjects } from "./scripts/browser-policy.mjs";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? "line" : "list",
  projects: browserTestProjects.map((project) => ({
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
