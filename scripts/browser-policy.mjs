export const browserPolicy = Object.freeze({
  javascriptEcmaVersion: 2020,
  performanceBudgets: Object.freeze({
    initialPayloadRawBytes: 9_250_000,
    initialPayloadGzipBytes: 2_100_000,
    startupMilliseconds: 5_000,
  }),
});

// The primary Chromium project runs the complete suite. The remaining projects
// exercise the production boot contract without multiplying the slower feature
// and persistence tests across every engine and device class.
export const browserTestProjects = Object.freeze([
  {
    name: "chromium-desktop",
    browserName: "chromium",
    device: "Desktop Chrome",
    deviceClass: "desktop",
    runFullSuite: true,
  },
  {
    name: "firefox-desktop",
    browserName: "firefox",
    device: "Desktop Firefox",
    deviceClass: "desktop",
  },
  {
    name: "webkit-desktop",
    browserName: "webkit",
    device: "Desktop Safari",
    deviceClass: "desktop",
  },
  {
    name: "chromium-handheld",
    browserName: "chromium",
    device: "Pixel 7",
    deviceClass: "handheld",
    viewport: Object.freeze({ height: 640, width: 360 }),
  },
  {
    name: "webkit-handheld",
    browserName: "webkit",
    device: "iPhone 15",
    deviceClass: "handheld",
  },
  {
    name: "webkit-tablet",
    browserName: "webkit",
    device: "iPad Pro 11",
    deviceClass: "tablet",
  },
]);
