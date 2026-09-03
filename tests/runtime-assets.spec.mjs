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

test("package-managed Perfect Scrollbar retains its browser API", async ({ page }) => {
  const assertNoFailures = await openHarness(
    page,
    '<div id="scrollbar" style="height:40px;overflow:auto"><div style="height:100px"></div></div>',
  );
  await loadScript(page, "/js/libs.js");

  const result = await page.evaluate(() => {
    const scrollbar = new PerfectScrollbar("#scrollbar");
    const rails = document.querySelectorAll("#scrollbar > .ps__rail-x, #scrollbar > .ps__rail-y");
    scrollbar.destroy();
    return { constructor: typeof PerfectScrollbar, rails: rails.length };
  });

  expect(result).toEqual({ constructor: "function", rails: 2 });
  assertNoFailures();
});

test("package-managed jQuery and JSZip retain their browser APIs", async ({ page }) => {
  const assertNoFailures = await openHarness(page, '<div id="target"></div>');
  await loadScript(page, "/js/libs.js");

  const result = await page.evaluate(async () => {
    $("#target").text("ready");
    const archive = new JSZip();
    archive.file("hello.txt", "hello");
    const bytes = await archive.generateAsync({ type: "uint8array" });
    const reopened = await JSZip.loadAsync(bytes);

    return {
      jquery: $.fn.jquery,
      jszip: JSZip.version,
      text: $("#target").text(),
      zippedText: await reopened.file("hello.txt").async("string"),
    };
  });

  expect(result).toEqual({
    jquery: "3.7.1",
    jszip: "3.10.1",
    text: "ready",
    zippedText: "hello",
  });
  assertNoFailures();
});

test("package-managed browser libraries preserve their legacy global APIs", async ({ page }) => {
  const assertNoFailures = await openHarness(page);
  await loadScript(page, "/js/libs.js");

  const result = await page.evaluate(() => {
    const matrix = new jsfeat.matrix_t(2, 2, jsfeat.U8C1_t);
    const quantizer = new RgbQuant({ colors: 2 });
    const tweened = { value: 0 };
    new TWEEN.Tween(tweened).to({ value: 1 }, 10).start(0);
    TWEEN.update(10);
    const linted = JSHINT("var answer = 42;", { esversion: 5 });
    const stats = new Stats();
    const manager = new Hammer.Manager(document.body);
    manager.destroy();

    return {
      babel: Babel.version,
      chroma: chroma("#336699").hex(),
      download: typeof download,
      hammer: typeof Hammer.Manager,
      jsfeat: [matrix.cols, matrix.rows],
      jshint: linted,
      jszipUtils: typeof JSZipUtils.getBinaryContent,
      localForage: typeof localforage.getItem,
      mousewheel: typeof $.event.special.mousewheel,
      rgbQuant: quantizer.colors,
      stats: stats.REVISION,
      three: [THREE.REVISION, typeof THREE.OrbitControls, typeof THREE.GLTFExporter],
      tween: tweened.value,
    };
  });

  expect(result).toEqual({
    babel: "6.26.0",
    chroma: "#336699",
    download: "function",
    hammer: "function",
    jsfeat: [2, 2],
    jshint: true,
    jszipUtils: "function",
    localForage: "function",
    mousewheel: "object",
    rgbQuant: 2,
    stats: 16,
    three: ["129", "function", "function"],
    tween: 1,
  });
  assertNoFailures();
});

test("GitHub API adapter preserves the legacy client contract", async ({ page }) => {
  const assertNoFailures = await openHarness(page);
  const requests = [];

  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON?.();
    requests.push({
      authorization: request.headers().authorization,
      body,
      method: request.method(),
      path: `${url.pathname}${url.search}`,
    });

    let responseBody = {};
    const responseHeaders = {
      "access-control-expose-headers": "x-oauth-scopes",
      "content-type": "application/json",
    };
    if (url.pathname === "/user") {
      responseBody = { login: "test-user" };
      responseHeaders["x-oauth-scopes"] = "repo, gist";
    } else if (url.pathname.endsWith("/git/blobs") && request.method() === "POST") {
      responseBody = { sha: "blob-sha" };
    } else if (url.pathname.endsWith("/git/trees/tree-sha")) {
      responseBody = { tree: [{ path: "hello.txt", type: "blob" }] };
    } else if (url.pathname === "/gists" && request.method() === "POST") {
      responseBody = { id: "gist-id" };
    } else if (url.pathname === "/gists/gist-id") {
      responseBody = { id: "gist-id", files: {} };
    }

    await route.fulfill({
      body: JSON.stringify(responseBody),
      headers: responseHeaders,
      status: 200,
    });
  });

  await loadScript(page, "/js/githubApi.js");
  const result = await page.evaluate(async () => {
    const github = new GitHub({ token: "test-token" });
    const profile = await github.getUser().getProfile();
    const repository = github.getRepo("owner", "project");
    const blob = await repository.createBlob("hello ✓");
    const tree = await repository.getTree("tree-sha?recursive=1");
    const gist = github.getGist();
    await gist.create({ description: "test", files: {} });
    const reopenedGist = await gist.read();

    return {
      blobSha: blob.data.sha,
      gistId: reopenedGist.data.id,
      login: profile.data.login,
      scopes: profile.headers["x-oauth-scopes"],
      treePath: tree.data.tree[0].path,
    };
  });

  expect(result).toEqual({
    blobSha: "blob-sha",
    gistId: "gist-id",
    login: "test-user",
    scopes: "repo, gist",
    treePath: "hello.txt",
  });
  expect(requests.map((request) => request.path)).toEqual([
    "/user",
    "/repos/owner/project/git/blobs",
    "/repos/owner/project/git/trees/tree-sha?recursive=1",
    "/gists",
    "/gists/gist-id",
  ]);
  expect(requests.every((request) => request.authorization === "Bearer test-token")).toBe(true);
  expect(Buffer.from(requests[1].body.content, "base64").toString("utf8")).toBe("hello ✓");
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

test("retained Ace modes expose their legacy module IDs", async ({ page }) => {
  const assertNoFailures = await openHarness(page);
  await loadScript(page, "/js/libs.js");

  const modeIds = await page.evaluate(() =>
    ["assembly_6502", "c64basic", "javascript"].map((name) => {
      const Mode = ace.require(`ace/mode/${name}`).Mode;
      return new Mode().$id;
    }));

  expect(modeIds).toEqual([
    "ace/mode/assembly_6502",
    "ace/mode/c64basic",
    "ace/mode/javascript",
  ]);
  assertNoFailures();
});

test("retained color and image helpers preserve their browser APIs", async ({ page }) => {
  const assertNoFailures = await openHarness(page);
  await loadScript(page, "/js/libs.js");

  const result = await page.evaluate(() => {
    const image = {
      data: new Uint8ClampedArray([10, 20, 30, 255]),
      height: 1,
      width: 1,
    };
    JSManipulate.invert.filter(image);
    return {
      color: Colour.fromString("#336699").toString(),
      filterNames: [JSManipulate.blur.name, JSManipulate.invert.name],
      pixels: [...image.data],
    };
  });

  expect(result).toEqual({
    color: "#336699",
    filterNames: ["Blur", "Invert"],
    pixels: [245, 235, 225, 255],
  });
  assertNoFailures();
});

test("retained scripting and audio helpers preserve their browser APIs", async ({ page }) => {
  const assertNoFailures = await openHarness(page);
  await loadScript(page, "/js/libs.js");

  const result = await page.evaluate(async () => {
    const interpreter = new Interpreter("var answer = 6 * 7;");
    interpreter.run();
    const answer = interpreter.pseudoToNative(
      interpreter.getProperty(interpreter.global, "answer"),
    );
    const audioContext = new AudioContext();
    const tuna = new Tuna(audioContext);
    const effects = ["Chorus", "Compressor", "Gain"].map(
      (name) => typeof tuna[name],
    );
    await audioContext.close();
    return { answer, effects };
  });

  expect(result).toEqual({ answer: 42, effects: ["function", "function", "function"] });
  assertNoFailures();
});

test("retained UI helpers preserve their browser APIs", async ({ page }) => {
  const assertNoFailures = await openHarness(
    page,
    '<div class="rippleJS" id="target" style="width:20px;height:20px"></div>',
  );
  await loadScript(page, "/js/libs.js");

  const result = await page.evaluate(async () => {
    const target = document.querySelector("#target");
    startRipple("mousedown", { offsetX: 4, offsetY: 5, target }, target);
    const activeRipples = target.querySelectorAll(".ripple").length;
    document.dispatchEvent(new MouseEvent("mouseup"));
    await new Promise((resolve) => setTimeout(resolve, 700));
    return {
      activeRipples,
      initialized: typeof rippleJSInit,
      remainingRipples: target.querySelectorAll(".ripple").length,
    };
  });

  expect(result).toEqual({
    activeRipples: 1,
    initialized: "function",
    remainingRipples: 0,
  });
  assertNoFailures();
});

test("retained font parser preserves its split-script browser API", async ({ page }) => {
  const assertNoFailures = await openHarness(page);
  await loadScript(page, "/js/libs.js");

  const result = await page.evaluate(() => {
    const path = { cmds: [], crds: [] };
    Typr.U.P.moveTo(path, 1, 2);
    Typr.U.P.lineTo(path, 3, 4);
    Typr.U.P.closePath(path);
    return {
      commands: path.cmds,
      coordinates: path.crds,
      parse: typeof Typr.parse,
    };
  });

  expect(result).toEqual({
    commands: ["M", "L", "Z"],
    coordinates: [1, 2, 3, 4],
    parse: "function",
  });
  assertNoFailures();
});

test("retained provider loader exposes the Google API bootstrap", async ({ page }) => {
  const assertNoFailures = await openHarness(page);
  await loadScript(page, "/lib/google-api/api.js");

  const result = await page.evaluate(() => ({
    bootstrapState: typeof window.___jsl,
    load: typeof window.gapi?.load,
  }));

  expect(result).toEqual({ bootstrapState: "object", load: "function" });
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
