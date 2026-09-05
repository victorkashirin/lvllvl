import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

import {
  chunkReport,
  requestReport,
} from "../scripts/performance-baseline.mjs";

test("activation request reporting includes every resource and repeated transfer", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvllvl-performance-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  const script = Buffer.from("export const ready = true;\n");
  const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
  await writeFile(path.join(root, "feature.mjs"), script);
  await writeFile(path.join(root, "feature.wasm"), wasm);

  assert.deepEqual(
    await requestReport(["feature.mjs", "feature.wasm", "feature.mjs"], { root }),
    {
      "feature.mjs": {
        count: 2,
        gzipBytes: gzipSync(script, { level: 9 }).byteLength * 2,
        rawBytes: script.byteLength * 2,
      },
      "feature.wasm": {
        count: 1,
        gzipBytes: gzipSync(wasm, { level: 9 }).byteLength,
        rawBytes: wasm.byteLength,
      },
    },
  );
  assert.deepEqual(Object.keys(await chunkReport(["feature.mjs", "feature.wasm"], { root })), [
    "feature.mjs",
  ]);
});
