import assert from "node:assert/strict";
import test from "node:test";

import {
  ImportExportCancelledError,
  ImportExportService,
  ImportExportTimeoutError,
} from "../src/js/modules/application/importExportService.mjs";
import {
  createExportArtifact,
  createImmutableExportSnapshot,
  ImportSourceError,
  ImportSourceErrorCode,
  ImportSourceKind,
  validateImportSource,
} from "../src/js/modules/domain/importExportValues.mjs";
import { encodeSvgExport } from "../src/js/modules/domain/svgExport.mjs";

test("validated import sources are typed, bounded, and defensively copied", () => {
  const original = Uint8Array.from([1, 2, 3]);
  const source = validateImportSource({
    bytes: original,
    filename: "sprite.bin",
    mediaType: "application/octet-stream",
  }, {
    maxBytes: 3,
    minBytes: 3,
    mediaTypes: ["application/octet-stream"],
  });

  original[0] = 9;
  const firstRead = source.readBytes();
  firstRead[1] = 9;
  assert.equal(source.kind, ImportSourceKind.BYTES);
  assert.equal(source.byteLength, 3);
  assert.deepEqual(Array.from(source.readBytes()), [1, 2, 3]);
  assert.equal(Object.isFrozen(source), true);

  const text = validateImportSource({ text: "hello", filename: "hello.txt" });
  assert.equal(text.kind, ImportSourceKind.TEXT);
  assert.equal(text.text, "hello");
  assert.equal(text.byteLength, 5);
});

test("malformed import sources retain actionable error categories", () => {
  const cases = [
    [{}, {}, ImportSourceErrorCode.INVALID],
    [{ text: "x", bytes: Uint8Array.of(1) }, {}, ImportSourceErrorCode.INVALID],
    [{ text: "" }, {}, ImportSourceErrorCode.EMPTY],
    [{ bytes: Uint8Array.of(1) }, { minBytes: 2 }, ImportSourceErrorCode.TRUNCATED],
    [{ text: "large" }, { maxBytes: 2 }, ImportSourceErrorCode.OVERSIZED],
    [{ text: "x", mediaType: "text/x-unknown" }, {
      mediaTypes: ["text/plain"],
    }, ImportSourceErrorCode.UNSUPPORTED],
  ];

  for (const [source, constraints, code] of cases) {
    assert.throws(
      () => validateImportSource(source, constraints),
      (error) => error instanceof ImportSourceError && error.code === code,
    );
  }
});

test("export snapshots and artifacts own immutable copies of their data", () => {
  const input = {
    cells: [{ character: 65, color: 2 }],
    bytes: Uint8Array.of(1, 2),
  };
  const snapshot = createImmutableExportSnapshot(input);
  input.cells[0].character = 66;
  input.bytes[0] = 9;

  assert.deepEqual(snapshot, {
    cells: [{ character: 65, color: 2 }],
    bytes: [1, 2],
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.cells), true);
  assert.equal(Object.isFrozen(snapshot.cells[0]), true);
  assert.throws(() => createImmutableExportSnapshot({ callback() {} }), /data only/);
  assert.throws(() => createImmutableExportSnapshot(new Date()), /plain objects/);

  const prototypeKey = createImmutableExportSnapshot(JSON.parse('{"__proto__":{"polluted":true}}'));
  assert.equal(Object.getPrototypeOf(prototypeKey), Object.prototype);
  assert.equal(Object.hasOwn(prototypeKey, "__proto__"), true);
  assert.equal(prototypeKey.__proto__.polluted, true);
  assert.equal(prototypeKey.polluted, undefined);
  assert.equal(JSON.stringify(prototypeKey), '{"__proto__":{"polluted":true}}');

  const bytes = Uint8Array.of(4, 5);
  const artifact = createExportArtifact({
    filename: "sprite.bin",
    mediaType: "application/octet-stream",
    data: bytes,
  });
  bytes[0] = 0;
  const artifactRead = artifact.readBytes();
  artifactRead[1] = 0;
  assert.deepEqual(Array.from(artifact.readBytes()), [4, 5]);
  assert.equal(artifact.byteLength, 2);

  assert.deepEqual(createExportArtifact({
    filename: "screen.txt",
    mediaType: "text/plain",
    data: "A",
  }), {
    filename: "screen.txt",
    mediaType: "text/plain",
    text: "A",
    byteLength: 1,
  });
});

test("import operations parse before applying and can be retried safely", async () => {
  const service = new ImportExportService();
  const destination = { values: [] };
  service.registerImporter("numbers", {
    constraints: { mediaTypes: ["text/plain"] },
    parse(source) {
      const values = JSON.parse(source.text);
      if (!Array.isArray(values)) throw new TypeError("Expected an array");
      return values;
    },
    apply(target, values) {
      target.values = values.slice();
      return values.length;
    },
  });

  await assert.rejects(service.import("numbers", {
    source: { text: "not json", mediaType: "text/plain" },
    destination,
  }), SyntaxError);
  assert.deepEqual(destination.values, []);

  assert.equal(await service.import("NUMBERS", {
    source: { text: "[1,2]", mediaType: "text/plain" },
    destination,
  }), 2);
  assert.deepEqual(destination.values, [1, 2]);
});

test("import apply functions are synchronous atomic commits", async () => {
  const service = new ImportExportService();
  assert.throws(() => service.registerImporter("async", {
    parse(source) { return source.text; },
    async apply(target, parsed) { target.value = parsed; },
  }), /commit synchronously/);

  service.registerImporter("thenable", {
    parse(source) { return source.text; },
    apply() { return Promise.resolve(); },
  });
  await assert.rejects(service.import("thenable", {
    destination: {},
    source: { text: "value" },
  }), /commit synchronously/);
});

test("cancellation and timeout prevent a late import from mutating its destination", async () => {
  const service = new ImportExportService();
  const destination = { applied: false };
  let releaseParse;
  service.registerImporter("slow", {
    parse(source, operation) {
      assert.equal(operation.signal instanceof AbortSignal, true);
      return new Promise((resolve) => { releaseParse = () => resolve(source.text); });
    },
    apply(target) {
      target.applied = true;
    },
  });

  const controller = new AbortController();
  const cancelled = service.import("slow", {
    source: { text: "cancel" },
    destination,
    signal: controller.signal,
  });
  controller.abort(new ImportExportCancelledError("Stopped by caller"));
  await assert.rejects(cancelled, ImportExportCancelledError);
  releaseParse();
  await Promise.resolve();
  assert.equal(destination.applied, false);

  const timedOut = service.import("slow", {
    source: { text: "timeout" },
    destination,
    timeoutMs: 5,
  });
  await assert.rejects(timedOut, ImportExportTimeoutError);
  releaseParse();
  await Promise.resolve();
  assert.equal(destination.applied, false);
});

test("export operations receive isolated snapshots and return generated artifacts", async () => {
  const service = new ImportExportService();
  let seenSnapshot;
  service.registerExporter("json", {
    encode(snapshot, operation) {
      assert.equal(operation.signal instanceof AbortSignal, true);
      seenSnapshot = snapshot;
      return {
        filename: "screen.json",
        mediaType: "application/json",
        data: JSON.stringify(snapshot),
      };
    },
  });
  const document = { cells: [65, 66] };
  const artifact = await service.export("json", { snapshot: document });
  document.cells[0] = 0;

  assert.equal(Object.isFrozen(seenSnapshot), true);
  assert.equal(Object.isFrozen(seenSnapshot.cells), true);
  assert.equal(artifact.filename, "screen.json");
  assert.equal(artifact.mediaType, "application/json");
  assert.equal(artifact.text, '{"cells":[65,66]}');
});

test("SVG export fixture produces deterministic artifact text", async () => {
  const service = new ImportExportService();
  service.registerExporter("svg", { encode: encodeSvgExport });
  const snapshot = {
    background: "rgb(0,0,0)",
    cellHeight: 8,
    cellWidth: 8,
    cells: [{
      background: null,
      foreground: "rgb(255,255,255)",
      path: "M0 0h1v1h-1z",
      x: 1,
      y: 2,
    }],
    filename: "fixture",
    height: 24,
    vector: false,
    width: 16,
  };
  const artifact = await service.export("svg", { snapshot });

  assert.equal(artifact.filename, "fixture.svg");
  assert.equal(artifact.mediaType, "image/svg+xml");
  assert.equal(
    artifact.text,
    '<?xml version="1.0" standalone="no"?>' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="24"' +
      ' viewBox="0 0 16 24" shape-rendering="crispEdges">' +
      '<rect width="100%" height="100%" fill="rgb(0,0,0)"/>' +
      '<path transform="translate(8 16)" d="M0 0h1v1h-1z"' +
      ' fill="rgb(255,255,255)"/></svg>',
  );
});

test("SVG export keeps vector data inside its attributes", () => {
  const data = encodeSvgExport({
    background: null,
    cellHeight: 32,
    cellWidth: 32,
    cells: [{
      background: null,
      foreground: "rgb(255,255,255)",
      path: 'M0 0"><script>alert(1)</script>',
      transform: 'translate(0 0)" onload="alert(1)',
      x: 0,
      y: 0,
    }],
    filename: "fixture",
    height: 32,
    vector: true,
    width: 32,
  }).data;

  assert.doesNotMatch(data, /<script|" onload=/);
  assert.match(data, /&quot; onload=&quot;/);
  assert.match(data, /&quot;&gt;&lt;script&gt;/);
});
