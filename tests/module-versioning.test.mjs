import assert from "node:assert/strict";
import test from "node:test";

import { bundledModuleDependencies } from "../scripts/build-config.mjs";
import {
  prepareProductionModule,
  rewriteModuleImports,
  versionModuleImports,
} from "../scripts/module-versioning.mjs";

test("production module imports receive one encoded release version", () => {
  const source = [
    'import value from "./value.mjs";',
    "export { other } from /* public entry */ '../other.mjs';",
    "const lazy = import(/* lazy feature */ \"./lazy.mjs\");",
    'const unrelated = "./not-an-import.mjs";',
    'const example = `import "./example.mjs"`;',
    '// import "./comment.mjs";',
    "",
  ].join("\n");

  assert.equal(
    versionModuleImports(source, "release 1"),
    [
      'import value from "./value.mjs?v=release%201";',
      "export { other } from /* public entry */ '../other.mjs?v=release%201';",
      "const lazy = import(/* lazy feature */ \"./lazy.mjs?v=release%201\");",
      'const unrelated = "./not-an-import.mjs";',
      'const example = `import "./example.mjs"`;',
      '// import "./comment.mjs";',
      "",
    ].join("\n"),
  );
});

test("production module imports can target a bundled dependency", () => {
  const source = [
    'import { parseKeyboardEvent } from "@tanstack/hotkeys";',
    'const packageName = "@tanstack/hotkeys";',
    "",
  ].join("\n");

  assert.equal(
    rewriteModuleImports(source, { "@tanstack/hotkeys": "../../vendor/tanstack-hotkeys.mjs" }),
    [
      'import { parseKeyboardEvent } from "../../vendor/tanstack-hotkeys.mjs";',
      'const packageName = "@tanstack/hotkeys";',
      "",
    ].join("\n"),
  );
});

test("production dependency imports use the authoritative output mapping", () => {
  const source = 'import { parseKeyboardEvent } from "@tanstack/hotkeys";\n';

  assert.equal(
    prepareProductionModule(
      source,
      "js/modules/domain/keybindings.mjs",
      "release 1",
      bundledModuleDependencies,
    ),
    'import { parseKeyboardEvent } from "../../vendor/tanstack-hotkeys.mjs?v=release%201";\n',
  );
});
