import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const sandbox = vm.createContext({});
vm.runInContext(
  readFileSync(new URL("../src/js/textMode/tools/fill.js", import.meta.url), "utf8"),
  sandbox,
  { filename: "src/js/textMode/tools/fill.js" },
);

function runFill(method, affects = { tile: false, foreground: true, background: false }) {
  const cells = [
    { t: 1, fc: 2, bc: 3, rx: 1, ry: 2, rz: 3, fh: 1, fv: 0 },
    { t: 1, fc: 2, bc: 3, rx: 2, ry: 3, rz: 1, fh: 0, fv: 1 },
    { t: 4, fc: 2, bc: 3, rx: 3, ry: 1, rz: 2, fh: 1, fv: 1 },
    { t: 1, fc: 2, bc: 5, rx: 0, ry: 2, rz: 1, fh: 0, fv: 0 },
    { t: 1, fc: 9, bc: 3, rx: 2, ry: 0, rz: 3, fh: 1, fv: 0 },
  ];
  let setCalls = 0;
  let redraws = 0;
  const layer = {
    getType: () => "grid",
    getGridWidth: () => cells.length,
    getGridHeight: () => 1,
    getCell: ({ x }) => cells[x],
    getBlockModeEnabled: () => false,
    setCell: (args) => {
      setCalls++;
      for (const property of ["t", "fc", "bc", "rx", "ry", "rz", "fh", "fv"]) {
        if (typeof args[property] !== "undefined") cells[args.x][property] = args[property];
      }
    },
  };
  const editor = {
    layers: { getSelectedLayerObject: () => layer },
    currentTile: {
      getCharacters: () => [[10]],
      getColor: () => 11,
      getBGColor: () => 12,
    },
    tools: {
      drawTools: {
        drawCharacter: affects.tile,
        drawColor: affects.foreground,
        drawBgColor: affects.background,
        select: { isActive: () => false },
      },
    },
    graphic: { redraw() { redraws++; } },
  };
  const fill = new sandbox.Fill();
  fill.init(editor);

  fill[method](0, 0);

  return { cells, redraws, setCalls };
}

for (const method of ["floodFill", "nonContiguousFill"]) {
  test(`${method}: foreground-only fill matches and updates only foreground color`, () => {
    assert.deepEqual(runFill(method).cells, [
      { t: 1, fc: 11, bc: 3, rx: 1, ry: 2, rz: 3, fh: 1, fv: 0 },
      { t: 1, fc: 11, bc: 3, rx: 2, ry: 3, rz: 1, fh: 0, fv: 1 },
      { t: 4, fc: 11, bc: 3, rx: 3, ry: 1, rz: 2, fh: 1, fv: 1 },
      { t: 1, fc: 11, bc: 5, rx: 0, ry: 2, rz: 1, fh: 0, fv: 0 },
      { t: 1, fc: 9, bc: 3, rx: 2, ry: 0, rz: 3, fh: 1, fv: 0 },
    ]);
  });

  test(`${method}: no affected channels is a true no-op`, () => {
    const result = runFill(method, { tile: false, foreground: false, background: false });
    assert.equal(result.setCalls, 0);
    assert.equal(result.redraws, 0);
  });
}
