import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { parse } from "acorn";
import { buildGraph, copiedScripts } from "../scripts/build-graph.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");
let firstPartyProgramsPromise;

async function loadLegacyScript(relativePath, globals = {}) {
  const context = vm.createContext({ console, URL, Uint8Array, ...globals });
  const source = await readFile(path.join(projectRoot, relativePath), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
  return context;
}

function walk(node, visit) {
  if(!node || typeof node !== "object") return;
  visit(node);
  for(const value of Object.values(node)) {
    if(Array.isArray(value)) {
      for(const child of value) walk(child, visit);
    } else if(value && typeof value.type === "string") {
      walk(value, visit);
    }
  }
}

function loadFirstPartyPrograms() {
  if(!firstPartyProgramsPromise) {
    const files = [...new Set([
      ...buildGraph["js/main.js"].inputs.filter((filename) => !filename.startsWith("lib/")),
      ...Object.values(copiedScripts).filter((filename) => !filename.startsWith("lib/")),
      "js/musicScriptingSandbox.js",
    ])];
    firstPartyProgramsPromise = Promise.all(files.map(async (relativePath) => {
      const source = await readFile(path.join(sourceRoot, relativePath), "utf8");
      let program;
      try {
        program = parse(source, { ecmaVersion: "latest", locations: true, sourceType: "module" });
      } catch(error) {
        program = parse(source, { ecmaVersion: "latest", locations: true, sourceType: "script" });
      }
      return { program, relativePath };
    }));
  }
  return firstPartyProgramsPromise;
}

async function listFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for(const entry of entries) {
    const filename = path.join(directory, entry.name);
    if(entry.isDirectory()) {
      files.push(...await listFiles(filename, extension));
    } else if(entry.name.endsWith(extension)) {
      files.push(filename);
    }
  }
  return files;
}

test("assembler expressions use a bounded numeric and label grammar", async () => {
  const context = await loadLegacyScript("src/js/assembler/assembler.js");
  const assembler = new context.Assembler();
  assembler.init();
  assembler.addLabel("start", 0x1234);

  assert.equal(assembler.parseParam("$10 + 2 - 1"), 0x11);
  assert.equal(assembler.parseParam("%1010 + 2"), 12);
  assert.equal(assembler.parseParam("start + 4"), 0x1238);
  assert.equal(assembler.parseParam("<start + 2"), 0x36);
  assert.equal(assembler.parseParam(">start - 2"), 0x12);
  assert.equal(assembler.parseParam("-2 + 5"), 3);
});

test("assembler expressions reject executable or ambiguous syntax", async () => {
  const context = await loadLegacyScript("src/js/assembler/assembler.js");
  const assembler = new context.Assembler();
  assembler.init();

  context.compromised = false;
  for(const expression of [
    "compromised = true",
    "globalThis.compromised = true",
    "1 * 2",
    "1; compromised = true",
    "1 +",
    "1++2",
    "unknown + 1",
    "1 + ".repeat(2000) + "1",
  ]) {
    assert.equal(assembler.parseParam(expression), false, expression);
  }
  assert.equal(context.compromised, false);
});

test("assembler labels cannot mutate inherited object state", async () => {
  const context = await loadLegacyScript("src/js/assembler/assembler.js");
  const assembler = new context.Assembler();
  assembler.init();

  assembler.addLabel("__proto__", 0x1234);
  assembler.addLabel("constructor", 0x5678);

  assert.equal(Object.getPrototypeOf(assembler.labels), null);
  assert.equal(assembler.labels.__proto__.value, 0x1234);
  assert.equal(assembler.labels.constructor.value, 0x5678);
  assert.equal(vm.runInContext("Object.prototype.value", context), undefined);
});

test("assembler entry points evaluate complete expressions and reject trailing syntax", async () => {
  const context = await loadLegacyScript("src/js/assembler/assembler.js");
  const assembler = new context.Assembler();
  assembler.init();

  const result = assembler.assemble([
    "answer = 1 + 2",
    "negative = -2 + 5",
    "byte answer, negative, $10 + 2",
  ].join("\n"));

  assert.equal(result.success, true);
  assert.deepEqual(Array.from(assembler.memory.slice(result.start, result.end)), [3, 3, 18]);

  for(const source of ["answer = 123garbage", "answer = 1 = 2", "byte 123garbage"]) {
    const invalidResult = assembler.assemble(source);
    assert.equal(invalidResult.success, false, source);
    assert.match(invalidResult.errors[0].message, /invalid expression/, source);
  }
});

test("assembler label offsets are independent for repeated placeholders", async () => {
  const context = await loadLegacyScript("src/js/assembler/assembler.js");
  const assembler = new context.Assembler();
  assembler.init();
  assembler.addLabel("target", 0x1234);
  assembler.addLabelPlaceholder("target", 0x0801, "l", 1);
  assembler.addLabelPlaceholder("target", 0x0802, "l", 2);

  assembler.processLabels();

  assert.equal(assembler.memory[0x0801], 0x35);
  assert.equal(assembler.memory[0x0802], 0x36);
});

test("music sandbox commands are canonical and bounded before application", async () => {
  const context = await loadLegacyScript("src/js/music/musicScripting.js");
  const scripting = new context.MusicScripting();
  scripting.music = {
    filters: { filters: [{ name: "Low pass" }] },
    instruments: { instruments: [{ name: "Bass" }] },
    patterns: [{ getLength: () => 16, name: "Verse" }],
    tracks: [{}, {}, {}],
  };
  const inSandboxRealm = (value) => vm.runInContext(
    `JSON.parse(${JSON.stringify(JSON.stringify(value))})`,
    context,
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(scripting.validateSandboxCommands(inSandboxRealm([
      {
        type: "addNote",
        patternId: 0,
        position: 0,
        instrument: "Bass",
        pitch: "c4",
        duration: 1,
      },
      {
        type: "addEffect",
        patternId: 0,
        position: 1,
        effect: "fon",
        effectParam: "Low pass",
      },
    ])))),
    [
      {
        type: "addNote",
        patternId: 0,
        position: 0,
        instrument: 0,
        pitch: 48,
        duration: 1,
      },
      {
        type: "addEffect",
        patternId: 0,
        position: 1,
        effect: 10,
        effectParam: 0,
        effectParam2: 0,
      },
    ],
  );

  for(const command of [
    { type: "addNote", patternId: 0, position: 0, instrument: -1, pitch: 48, duration: 1 },
    { type: "addNote", patternId: 0, position: 0, instrument: "Missing", pitch: 48, duration: 1 },
    { type: "addNote", patternId: 0, position: 0, instrument: 0, pitch: 96, duration: 1 },
    { type: "addEffect", patternId: 0, position: 0, effect: "fon" },
    { type: "addEffect", patternId: 0, position: 0, effect: "__proto__" },
    { type: "setChannelEnabled", channel: 1, enabled: "false" },
  ]) {
    assert.throws(
      () => scripting.validateSandboxCommands(inSandboxRealm([command])),
      /outside the allowed range|not found|requires a filter|invalid/,
    );
  }
});

test("music command application targets exact channels and pattern IDs", async () => {
  const checkboxUpdates = [];
  const context = await loadLegacyScript("src/js/music/musicScripting.js", {
    $: (selector) => ({
      prop: (name, value) => checkboxUpdates.push({ name, selector, value }),
    }),
  });
  const scripting = new context.MusicScripting();
  const selections = [];
  let channelsUpdated = 0;
  scripting.music = {
    filters: { filters: [] },
    instruments: { instruments: [] },
    patterns: [{ name: "Duplicate" }, { name: "Duplicate" }],
    tracks: [[0], [1]],
    trackView: {
      selectPattern: (track, pattern) => selections.push({ pattern, track }),
      setChannels: () => channelsUpdated++,
    },
  };

  scripting.applySandboxCommands([
    { type: "setChannelEnabled", channel: 2, enabled: false },
    { type: "selectPattern", patternId: 1 },
  ]);

  assert.deepEqual(checkboxUpdates, [{ name: "checked", selector: "#channel2", value: false }]);
  assert.deepEqual(selections, [{ pattern: 0, track: 1 }]);
  assert.equal(channelsUpdated, 1);
});

test("music command application reuses wrappers within a command batch", async () => {
  const context = await loadLegacyScript("src/js/music/musicScripting.js");
  const calls = [];
  let instrumentInstances = 0;
  let patternInstances = 0;

  context.PatternScripting = function() {
    patternInstances++;
    this.init = (music, id) => calls.push(["pattern-init", music, id]);
    this.clear = () => calls.push(["clear"]);
    this.addNote = (...args) => calls.push(["add-note", ...args]);
    this.eraseNote = (...args) => calls.push(["erase-note", ...args]);
  };
  context.InstrumentScripting = function() {
    instrumentInstances++;
    this.init = (music, id) => calls.push(["instrument-init", music, id]);
    this.setADSR = (...args) => calls.push(["adsr", ...args]);
    this.setWavetable = (...args) => calls.push(["wavetable", ...args]);
  };

  const scripting = new context.MusicScripting();
  scripting.music = { marker: "music" };
  scripting.applySandboxCommands([
    { type: "clearPattern", patternId: 1 },
    { type: "addNote", patternId: 1, position: 2, instrument: 3, pitch: 48, duration: 1 },
    { type: "eraseNote", patternId: 2, position: 4 },
    { type: "setADSR", instrumentId: 3, values: [1, 2, 3, 4] },
    { type: "setWavetable", instrumentId: 3, table: [[1, 2]] },
  ]);

  assert.equal(patternInstances, 2);
  assert.equal(instrumentInstances, 1);
  assert.equal(calls.filter(([name]) => name === "pattern-init").length, 2);
  assert.equal(calls.filter(([name]) => name === "instrument-init").length, 1);
  assert.equal(calls.filter(([name]) => name === "add-note").length, 1);
  assert.equal(calls.filter(([name]) => name === "wavetable").length, 1);
});

test("music sandbox command validation enforces an aggregate table budget", async () => {
  const context = await loadLegacyScript("src/js/music/musicScripting.js");
  const scripting = new context.MusicScripting();
  scripting.music = {
    filters: { filters: [] },
    instruments: { instruments: [{ name: "Bass" }] },
    patterns: [{ getLength: () => 16, name: "Verse" }],
    tracks: [{}],
  };
  const table = Array.from({ length: 256 }, () => Array(16).fill(0));
  const commands = Array.from({ length: 17 }, () => ({
    type: "setWavetable",
    instrumentId: 0,
    table,
  }));
  const sandboxCommands = vm.runInContext(
    `JSON.parse(${JSON.stringify(JSON.stringify(commands))})`,
    context,
  );

  assert.throws(
    () => scripting.validateSandboxCommands(sandboxCommands),
    /instrument tables are too large/,
  );
});

test("music sandbox bounds pending work and removes timed-out queued scripts", async () => {
  const timers = [];
  const clearedTimers = [];
  const context = await loadLegacyScript("src/js/music/musicScripting.js", {
    clearTimeout: (timer) => clearedTimers.push(timer),
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
  });
  const scripting = new context.MusicScripting();
  scripting.ensureSandbox = () => {};
  scripting.getSandboxState = () => ({});

  const results = [];
  for(let index = 0; index < 4; index++) {
    scripting.runInSandbox(`script ${index}`, (result) => results.push(result));
  }

  assert.equal(Object.getPrototypeOf(scripting.sandboxRequests), null);
  assert.equal(scripting.sandboxQueue.length, 4);
  assert.equal(Object.keys(scripting.sandboxRequests).length, 4);

  scripting.runInSandbox("one too many", (result) => results.push(result));
  assert.equal(results[0].success, false);
  assert.match(results[0].error, /too many/i);
  assert.equal(scripting.sandboxQueue.length, 4);

  timers[0]();
  assert.equal(scripting.sandboxQueue.length, 3);
  assert.equal(Object.keys(scripting.sandboxRequests).length, 3);
  assert.equal(results[1].success, false);
  assert.match(results[1].error, /did not respond/i);
  assert.deepEqual(clearedTimers, []);
});

test("GitHub repository addresses accept only exact GitHub identifier forms", async () => {
  const context = await loadLegacyScript("src/js/file/github.js");
  const parseAddress = context.parseGitHubRepositoryAddress;

  assert.deepEqual(
    { ...parseAddress("openai/codex") },
    { owner: "openai", repository: "codex" },
  );
  assert.deepEqual(
    { ...parseAddress("https://github.com/openai/codex.git") },
    { owner: "openai", repository: "codex" },
  );
  assert.deepEqual(
    { ...parseAddress("git@github.com:openai/codex.git") },
    { owner: "openai", repository: "codex" },
  );

  for(const address of [
    "javascript:alert(1)",
    "https://evil.example/openai/codex",
    "https://github.com/openai/codex/issues",
    "https://github.com/openai/codex?tab=readme",
    "https://github.com/openai/codex%2Fother",
    "open--ai/codex",
    "-openai/codex",
    "openai/<img src=x onerror=alert(1)>",
    "openai/codex/other",
  ]) {
    assert.equal(parseAddress(address), null, address);
  }
});

test("first-party application scripts contain no direct eval calls", async () => {
  const directEvalCalls = [];

  for(const { program, relativePath } of await loadFirstPartyPrograms()) {
    walk(program, (node) => {
      if(node.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === "eval") {
        directEvalCalls.push(`${relativePath}:${node.loc?.start.line ?? "?"}`);
      }
    });
  }

  assert.deepEqual(directEvalCalls, []);
});

test("first-party application scripts contain no inline event handlers", async () => {
  const inlineEventHandlers = [];

  for(const { program, relativePath } of await loadFirstPartyPrograms()) {
    walk(program, (node) => {
      var value = null;
      if(node.type === "Literal" && typeof node.value === "string") {
        value = node.value;
      } else if(node.type === "TemplateElement") {
        value = node.value.cooked;
      }
      if(typeof value === "string" && /\son[a-z]+\s*=/i.test(value)) {
        inlineEventHandlers.push(`${relativePath}:${node.loc?.start.line ?? "?"}`);
      }
    });
  }

  assert.deepEqual(inlineEventHandlers, []);
});

test("first-party HTML templates contain no inline event handlers", async () => {
  const files = [
    path.join(sourceRoot, "index.html"),
    path.join(sourceRoot, "music-scripting-sandbox.html"),
    ...await listFiles(path.join(sourceRoot, "html"), ".html"),
  ];
  const inlineEventHandlers = [];

  for(const filename of files) {
    const source = await readFile(filename, "utf8");
    if(/\son[a-z]+\s*=/i.test(source)) {
      inlineEventHandlers.push(path.relative(projectRoot, filename));
    }
  }

  assert.deepEqual(inlineEventHandlers, []);
});

test("the app CSP requires Trusted Types and keeps dynamic code in the opaque sandbox", async () => {
  const index = await readFile(path.join(projectRoot, "src/index.html"), "utf8");
  const sandbox = await readFile(path.join(projectRoot, "src/music-scripting-sandbox.html"), "utf8");
  const musicScripting = await readFile(
    path.join(projectRoot, "src/js/music/musicScripting.js"),
    "utf8",
  );

  assert.match(index, /require-trusted-types-for 'script'/);
  assert.doesNotMatch(index, /script-src[^;]*'unsafe-eval'/);
  assert.match(index, /connect-src[^;]*https:\/\/drive\.google\.com/);
  assert.match(index, /connect-src[^;]*https:\/\/drive\.usercontent\.google\.com/);
  assert.match(index, /connect-src[^;]*https:\/\/lospec\.com/);
  assert.match(index, /frame-src[^;]*https:\/\/content\.googleapis\.com/);
  assert.match(sandbox, /script-src 'self' 'unsafe-eval'/);
  assert.match(sandbox, /connect-src 'none'/);
  assert.match(musicScripting, /setAttribute\('sandbox', 'allow-scripts'\)/);
  assert.doesNotMatch(musicScripting, /allow-same-origin/);
});
