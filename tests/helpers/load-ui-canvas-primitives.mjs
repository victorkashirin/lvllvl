import { readFileSync } from "node:fs";

const devicePixelRatioSource = readFileSync(
  new URL("../../src/js/ui/devicePixelRatio.js", import.meta.url),
  "utf8",
);
const primitivesSource = readFileSync(
  new URL("../../src/js/ui/canvasPrimitives.js", import.meta.url),
  "utf8",
);

export function loadUIDevicePixelRatio() {
  return devicePixelRatioSource;
}

export function loadUICanvasPrimitives() {
  return primitivesSource;
}
