import assert from "node:assert/strict";
import test from "node:test";

import { versionModuleImports } from "../scripts/module-versioning.mjs";

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
