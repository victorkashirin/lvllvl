import { expect, test } from "@playwright/test";

const harnessPath = "/__runtime-smoke__.html";

async function openHarness(page, body = "") {
  const failures = [];

  page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console error: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    failures.push(`request failed: ${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  await page.route(`**${harnessPath}`, (route) =>
    route.fulfill({
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`,
      contentType: "text/html",
      status: 200,
    }),
  );
  await page.goto(harnessPath);

  return () => expect(failures, failures.join("\n")).toEqual([]);
}

async function loadScript(page, source) {
  await page.evaluate((src) =>
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    }), source);
}

async function loadStylesheet(page, source) {
  await page.evaluate((href) =>
    new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = resolve;
      link.onerror = () => reject(new Error(`Failed to load ${href}`));
      document.head.appendChild(link);
    }), source);
}

test("production stylesheet includes Perfect Scrollbar and CodeMirror", async ({ page }) => {
  const assertNoFailures = await openHarness(
    page,
    '<div class="ps" id="scrollbar"><div class="ps__rail-x"></div></div>' +
      '<textarea id="music-script"></textarea>',
  );

  await loadStylesheet(page, "/css/style.css");
  await loadScript(page, "/lib/codemirror/codemirror.js");
  await loadScript(page, "/lib/codemirror/mode/javascript/javascript.js");
  await loadScript(page, "/lib/codemirror/addon/scroll/simplescrollbars.js");
  await loadScript(page, "/lib/codemirror/addon/search/searchcursor.js");
  await loadScript(page, "/lib/codemirror/addon/search/search.js");
  await loadScript(page, "/lib/codemirror/addon/dialog/dialog.js");
  await loadScript(page, "/lib/jshint/jshint.js");

  const result = await page.evaluate(() => {
    const editor = CodeMirror.fromTextArea(document.querySelector("#music-script"), {
      lineNumbers: true,
      mode: "javascript",
      scrollbarStyle: "simple",
    });
    editor.setValue("const note = 1;");
    const line = document.querySelector(".CodeMirror-lines");
    const rail = document.querySelector(".ps__rail-x");
    return {
      codeMirror: typeof CodeMirror === "function",
      editorValue: editor.getValue(),
      linePadding: getComputedStyle(line).paddingTop,
      railDisplay: getComputedStyle(rail).display,
      scrollbarOverflow: getComputedStyle(document.querySelector("#scrollbar")).overflow,
    };
  });

  expect(result.codeMirror).toBe(true);
  expect(result.editorValue).toBe("const note = 1;");
  expect(result.linePadding).toBe("4px");
  expect(result.railDisplay).toBe("none");
  expect(result.scrollbarOverflow).toBe("hidden");
  assertNoFailures();
});

test("Ace loads its lazy themes and workers", async ({ page }) => {
  const assertNoFailures = await openHarness(
    page,
    '<div id="javascript-editor" style="width:400px;height:160px"></div>' +
      '<div id="json-editor" style="width:400px;height:160px"></div>',
  );
  await loadScript(page, "/js/libs.js");

  const requested = [];
  page.on("request", (request) => requested.push(new URL(request.url()).pathname));

  await page.evaluate(async () => {
    ace.config.set("basePath", "/lib/ace/src");

    const javascriptEditor = ace.edit("javascript-editor");
    javascriptEditor.setTheme("ace/theme/chrome");
    javascriptEditor.session.setMode("ace/mode/javascript");
    javascriptEditor.session.setUseWorker(true);
    javascriptEditor.setValue("const answer = 42;", -1);

    const jsonEditor = ace.edit("json-editor");
    jsonEditor.setTheme("ace/theme/tomorrow_night");
    jsonEditor.session.setMode("ace/mode/json");
    jsonEditor.session.setUseWorker(true);
    jsonEditor.setValue('{"answer": 42}', -1);

    await new Promise((resolve) => setTimeout(resolve, 1_000));
    javascriptEditor.destroy();
    jsonEditor.destroy();
  });

  expect(requested).toEqual(expect.arrayContaining([
    "/lib/ace/src/theme-chrome.js",
    "/lib/ace/src/theme-tomorrow_night.js",
    "/lib/ace/src/worker-javascript.js",
    "/lib/ace/src/worker-json.js",
  ]));
  assertNoFailures();
});

test("CA65 and LD65 initialize their WebAssembly runtimes", async ({ page }) => {
  const assertNoFailures = await openHarness(page);
  await loadScript(page, "/lib/ca65/ca65.js");
  await loadScript(page, "/lib/ca65/ld65.js");

  const initialized = await page.evaluate(async () => {
    const initialize = (factory, directory) =>
      new Promise((resolve, reject) => {
        try {
          factory({
            locateFile: (filename) => `${directory}/${filename}`,
            noInitialRun: true,
            onAbort: reject,
            onRuntimeInitialized() {
              resolve(typeof this.FS === "object");
            },
          });
        } catch (error) {
          reject(error);
        }
      });

    return {
      ca65: await initialize(CA65, "/lib/ca65"),
      ld65: await initialize(LD65, "/lib/ca65"),
    };
  });

  expect(initialized).toEqual({ ca65: true, ld65: true });
  assertNoFailures();
});

test("GIF, ACME, and Exomizer workers execute", async ({ page }) => {
  const assertNoFailures = await openHarness(page);
  await loadScript(page, "/js/libs.js");

  const result = await page.evaluate(async () => {
    const gif = await new Promise((resolve, reject) => {
      const encoder = new GIF({
        height: 1,
        width: 1,
        workers: 1,
        workerScript: "/lib/gif/gif.worker.js",
      });
      encoder.addFrame(new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1));
      encoder.on("finished", (blob) => resolve(blob.size > 0));
      encoder.on("abort", () => reject(new Error("GIF worker aborted")));
      encoder.render();
    });

    const runWorker = (url, data) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(url);
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error(`${url} timed out`));
        }, 20_000);
        worker.onerror = (event) => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error(event.message));
        };
        worker.onmessage = (event) => {
          clearTimeout(timer);
          worker.terminate();
          resolve(event.data);
        };
        worker.postMessage(data);
      });

    const acme = await runWorker("/c64/acme097/acmeAssemblerWorker.js", {
      config: { arguments: "--format cbm" },
      files: [{
        type: "asm",
        filePath: "main.asm",
        content: [
          "* = $0801",
          "!byte $0b,$08,$01,$00,$9e",
          "!text \"2061\"",
          "!byte 0,0,0",
          "* = $080d",
          "lda #0",
          "rts",
          "!fill 1024, 0",
        ].join("\n"),
      }],
    });
    if (!acme || !acme.success) throw new Error("ACME smoke assembly failed");
    const exomizer = await runWorker("/c64/exomizer/exomizerWorker.js", {
      config: {},
      file: acme.prg,
    });

    return {
      acme: acme?.success === true,
      exomizer: exomizer?.success === true,
      gif,
    };
  });

  expect(result).toEqual({ acme: true, exomizer: true, gif: true });
  assertNoFailures();
});

test("C64 initializes its WebAssembly runtime", async ({ page }) => {
  const assertNoFailures = await openHarness(page);
  await loadScript(page, "/c64/c64/c64.js");

  const initialized = await page.evaluate(async () => {
    const mainRuntime = await new Promise((resolve, reject) => {
      try {
        C64({
          locateFile: (filename) => `/c64/c64/${filename}`,
          onAbort: reject,
          onRuntimeInitialized() {
            resolve(typeof this.cwrap === "function");
          },
        });
      } catch (error) {
        reject(error);
      }
    });
    const standaloneResponse = await fetch("/c64page/js/c64.wasm");
    if (!standaloneResponse.ok) {
      throw new Error(`Standalone C64 WASM: HTTP ${standaloneResponse.status}`);
    }
    const standaloneModule = await WebAssembly.compileStreaming(standaloneResponse);

    return {
      mainRuntime,
      standaloneRuntime: standaloneModule instanceof WebAssembly.Module,
    };
  });

  expect(initialized).toEqual({ mainRuntime: true, standaloneRuntime: true });
  assertNoFailures();
});
