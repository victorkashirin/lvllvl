import { expect, test } from "@playwright/test";

async function openApp(page) {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#startPage")).toBeVisible();
}

async function executeIsolatedMusicScript(page, content) {
  return page.evaluate((scriptContent) => new Promise((resolve, reject) => {
    const channel = "lvllvl-music-scripting-v1";
    const id = `security-test-${Date.now()}-${Math.random()}`;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.style.display = "none";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Sandbox test timed out"));
    }, 8_000);

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      iframe.remove();
    }

    function onMessage(event) {
      const data = event.data ?? {};
      if(event.source !== iframe.contentWindow || data.channel !== channel) return;
      if(data.type === "ready") {
        iframe.contentWindow.postMessage({
          channel,
          type: "execute",
          id,
          content: scriptContent,
          state: {
            currentPatternId: 0,
            channelCount: 3,
            patterns: [{ name: "Verse", length: 16 }],
            instruments: [{ name: "Bass" }],
            filters: [{ name: "Low pass" }],
          },
        }, "*");
      } else if(data.type === "result" && data.id === id) {
        cleanup();
        resolve(data);
      }
    }

    window.addEventListener("message", onMessage);
    iframe.src = "/music-scripting-sandbox.html";
    document.body.appendChild(iframe);
  }), content);
}

test("shared HTML policy removes executable markup from native and jQuery sinks", async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    window.__securityTestExecuted = false;
    const payload = [
      '<strong id="kept">safe</strong>',
      '<img id="image" src="data:image/png;base64,iVBORw0KGgo=" onerror="window.__securityTestExecuted=true">',
      '<img id="protocol-relative-image" src="//attacker.invalid/probe.png">',
      '<img id="backslash-image" src="\\\\attacker.invalid/probe.png">',
      '<a id="link" href="javascript:window.__securityTestExecuted=true">unsafe link</a>',
      '<svg onload="window.__securityTestExecuted=true"></svg>',
      '<script>window.__securityTestExecuted=true<\/script>',
    ].join("");

    const nativeTarget = document.createElement("div");
    SafeHTML.setHTML(nativeTarget, payload);
    const jqueryTarget = document.createElement("div");
    $(jqueryTarget).html(payload);
    const defaultPolicyTarget = document.createElement("div");
    defaultPolicyTarget.innerHTML = payload;

    return [nativeTarget, jqueryTarget, defaultPolicyTarget].map((target) => ({
      hasStrong: Boolean(target.querySelector("#kept")),
      hasScript: Boolean(target.querySelector("script, svg")),
      imageHandler: target.querySelector("#image")?.getAttribute("onerror") ?? null,
      linkHref: target.querySelector("#link")?.getAttribute("href") ?? null,
      protocolRelativeImageSrc:
        target.querySelector("#protocol-relative-image")?.getAttribute("src") ?? null,
      backslashImageSrc: target.querySelector("#backslash-image")?.getAttribute("src") ?? null,
      executed: window.__securityTestExecuted,
    }));
  });

  for(const sink of result) {
    expect(sink).toEqual({
      hasStrong: true,
      hasScript: false,
      imageHandler: null,
      linkHref: null,
      protocolRelativeImageSrc: null,
      backslashImageSrc: null,
      executed: false,
    });
  }
});

test("shared HTML helpers sanitize each value once", async ({ page }) => {
  await openApp(page);

  const counts = await page.evaluate(() => {
    const originalSanitize = DOMPurify.sanitize;
    let calls = 0;
    DOMPurify.sanitize = function() {
      calls++;
      return originalSanitize.apply(this, arguments);
    };

    function measure(callback) {
      calls = 0;
      callback();
      return calls;
    }

    try {
      const nullTarget = document.createElement("div");
      return {
        html: measure(() => SafeHTML.setHTML(document.createElement("div"), "<strong>safe</strong>")),
        jquery: measure(() => $(document.createElement("div")).html("<strong>safe</strong>")),
        nullHtml: measure(() => SafeHTML.setHTML(nullTarget, null)),
        nullText: nullTarget.textContent,
        svg: measure(() => SafeHTML.createSVG('<svg><path d="M0 0h1v1z"/></svg>')),
        template: measure(() => SafeHTML.setTemplateHTML(
          document.createElement("div"),
          "<style>.safe { color: red; }</style><strong>safe</strong>",
        )),
      };
    } finally {
      DOMPurify.sanitize = originalSanitize;
    }
  });

  expect(counts).toEqual({
    html: 1,
    jquery: 1,
    nullHtml: 1,
    nullText: "",
    svg: 1,
    template: 1,
  });
});

test("landing-page project thumbnails use validated raster data URLs", async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const projectId = "thumbnail-project";
    const thumbnailData = "data:image/png;base64," +
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const projectName = '<img id="project-attacker" src=x onerror="window.__securityTestExecuted=true"> Project';
    window.__securityTestExecuted = false;

    const startPage = new StartPage();
    startPage.localProjectList = [
      { id: projectId, lastModified: 2, name: projectName, thumbnailData },
      { id: "__proto__", lastModified: 1, name: "Prototype project", thumbnailData },
      {
        id: "unsafe-thumbnail",
        lastModified: 0,
        name: "Unsafe thumbnail",
        thumbnailData: "javascript:window.__securityTestExecuted=true",
      },
    ];
    startPage.drawProjects();

    const projectTarget = document.querySelector(
      '#browserStorage_projects .start-tile-image[data-id="thumbnail-project"]'
    );
    const unsafeTarget = document.querySelector(
      '#browserStorage_projects .start-tile-image[data-id="unsafe-thumbnail"]'
    );
    const prototypeTarget = document.querySelector(
      '#browserStorage_projects .start-tile-image[data-id="__proto__"]'
    );
    const label = document.querySelector(
      '#browserStorage_projects .start-tile-label[data-id="thumbnail-project"]'
    );

    return {
      attackerElement: Boolean(document.getElementById("project-attacker")),
      executed: window.__securityTestExecuted,
      label: label?.textContent,
      thumbnailBackground: projectTarget?.style.backgroundImage,
      prototypeBackground: prototypeTarget?.style.backgroundImage,
      projectMapPrototypeIsNull: Object.getPrototypeOf(startPage.projects) === null,
      unsafeBackground: unsafeTarget?.style.backgroundImage,
    };
  });

  expect(result.attackerElement).toBe(false);
  expect(result.executed).toBe(false);
  expect(result.label).toBe(
    '<img id="project-attacker" src=x onerror="window.__securityTestExecuted=true"> Project'
  );
  expect(result.thumbnailBackground).toContain("data:image/png;base64,");
  expect(result.prototypeBackground).toContain("data:image/png;base64,");
  expect(result.projectMapPrototypeIsNull).toBe(true);
  expect(result.unsafeBackground).toBe("");
});

test("shared UI helpers render ordinary labels as text", async ({ page }) => {
  await openApp(page);
  const payload = '<span id="shared-helper-attacker" data-ui-button-id="ui1" ' +
    'style="position:fixed">unsafe</span>';

  const result = await page.evaluate((unsafeLabel) => {
    const payload = unsafeLabel;
    const holder = document.createElement("div");
    document.body.appendChild(holder);

    const button = UI.create("UI.Button", { text: payload });
    holder.appendChild(button.getElement());
    let buttonClicks = 0;
    button.on("click", () => buttonClicks++);
    button.setText(payload + " updated");

    const imageButton = UI.create("UI.Button", {
      imageAlt: "Download",
      imageSrc: "icons/svg/glyphicons-basic-199-save.svg",
      text: "Download",
    });
    holder.appendChild(imageButton.getElement());

    const forgedButton = document.createElement("div");
    forgedButton.dataset.uiButtonId = button.id;
    forgedButton.id = button.id;
    holder.insertBefore(forgedButton, button.element);
    forgedButton.click();
    forgedButton.remove();
    button.element.click();

    const tabs = UI.create("UI.TabPanel", { canCloseTabs: true });
    tabs.add({ key: "security", title: payload });
    holder.appendChild(tabs.getElement());

    const menuItem = UI.create("UI.MenuItem", { label: payload });
    holder.appendChild(menuItem.getElement());

    const dialog = UI.create("UI.Dialog", { height: 120, title: payload, width: 240 });

    const mobilePanel = UI.create("UI.MobilePanel", {
      height: 120,
      title: payload,
      width: 240,
    });
    mobilePanel.element.remove();
    const mobilePanelHolder = document.createElement("div");
    SafeHTML.setHTML(mobilePanelHolder, mobilePanel.getHTML());
    holder.appendChild(mobilePanelHolder);
    let mobilePanelCloses = 0;
    const originalDialogClose = UI.DialogClose;
    UI.DialogClose = () => mobilePanelCloses++;
    mobilePanelHolder.querySelector("[data-ui-dialog-close]").click();
    UI.DialogClose = originalDialogClose;

    const tree = UI.create("UI.Tree", { root: "-1" });
    const treeNode = tree.getRootNode().addChild({ label: payload, type: "graphic" });
    tree.setNodeKey("__proto__", treeNode);
    const treeHolder = document.createElement("div");
    SafeHTML.setHTML(treeHolder, tree.getHTML());
    holder.appendChild(treeHolder);

    return {
      injectedMarkup: Boolean(document.getElementById("shared-helper-attacker")),
      buttonClicks,
      buttonText: document.getElementById(button.id).textContent,
      imageButtonAlt: imageButton.element.querySelector("img")?.getAttribute("alt"),
      imageButtonSrc: imageButton.element.querySelector("img")?.getAttribute("src"),
      imageButtonText: imageButton.element.textContent.trim(),
      dialogText: dialog.element.querySelector(".ui-dialog-titlebar-heading")?.textContent.trim(),
      mobilePanelCloses,
      mobilePanelText: mobilePanelHolder
        .querySelector(".ui-dialog-titlebar-heading")?.textContent.trim(),
      treeText: treeHolder.querySelector(".ui-tree-label")?.textContent.replace(/\u00a0/g, " "),
      tabText: holder.querySelector(".ui-tab-label")?.textContent,
      menuText: holder.querySelector(".ui-menu-item-label")?.textContent,
      prototypeTreeKeyWorks: tree.getNodeFromKey("__proto__") === treeNode,
    };
  }, payload);

  expect(result.injectedMarkup).toBe(false);
  expect(result.buttonClicks).toBe(1);
  expect(result.buttonText).toContain(payload + " updated");
  expect(result.imageButtonAlt).toBe("Download");
  expect(result.imageButtonSrc).toBe("icons/svg/glyphicons-basic-199-save.svg");
  expect(result.imageButtonText).toBe("Download");
  expect(result.dialogText).toBe(payload);
  expect(result.mobilePanelCloses).toBe(1);
  expect(result.mobilePanelText).toBe(payload);
  expect(result.treeText).toBe(payload);
  expect(result.tabText).toBe(payload);
  expect(result.menuText).toBe(payload);
  expect(result.prototypeTreeKeyWorks).toBe(true);
});

test("layer labels retain their formatted metadata and treat names as text", async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const target = document.createElement("span");
    target.id = "security-layerlabel";
    document.body.appendChild(target);
    window.__securityTestExecuted = false;

    const layerObject = {
      getBlockModeEnabled: () => false,
      getHasTileFlip: () => true,
      getHasTileRotate: () => false,
      getLabel: () => '<img id="layer-attacker" src=x onerror="window.__securityTestExecuted=true"> Layer',
      getScreenMode: () => TextModeEditor.Mode.TEXTMODE,
      getType: () => "grid",
    };
    Layers.prototype.updateLayerLabel.call({
      editor: { graphic: { getType: () => "screen" } },
      getLayerObject: () => layerObject,
    }, "security-layer");

    return {
      attackerElement: Boolean(target.querySelector("#layer-attacker")),
      executed: window.__securityTestExecuted,
      name: target.querySelector(".layerLabelName")?.textContent,
      properties: Array.from(target.querySelectorAll(".layerLabelProperties"))
        .map((element) => element.textContent),
    };
  });

  expect(result).toEqual({
    attackerElement: false,
    executed: false,
    name: '<img id="layer-attacker" src=x onerror="window.__securityTestExecuted=true"> Layer',
    properties: ["Text Mode", "Tile Flip Yes, Tile Rotate No"],
  });
});

test("layer rows keep imported identifiers inert", async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const holder = document.createElement("div");
    const layerId = 'layer"><span id="layer-id-attacker" data-layer-id="other">';
    const layers = new Layers();
    const navigator = new ProjectNavigator();
    SafeHTML.setHTML(holder, Layers.prototype.getLayerHTML(layerId, "Safe layer"));
    return {
      attackerElement: Boolean(holder.querySelector("#layer-id-attacker")),
      layerMapPrototypeIsNull: Object.getPrototypeOf(layers.layerObjects) === null,
      layerId: holder.querySelector(".textModeLayer")?.dataset.layerId,
      label: holder.querySelector(".textModeLayerLabel")?.textContent,
      treeMapPrototypeIsNull: Object.getPrototypeOf(navigator.treeMap) === null,
    };
  });

  expect(result).toEqual({
    attackerElement: false,
    layerMapPrototypeIsNull: true,
    layerId: 'layer"><span id="layer-id-attacker" data-layer-id="other">',
    label: "Safe layer",
    treeMapPrototypeIsNull: true,
  });
});

test("remote provider controls and credential SDK globals are absent", async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const providers = ["github", "gist", "google-drive"];
    return {
      disabled: Object.fromEntries(providers.map((providerId) => [
        providerId,
        !g_app.services.remoteProviders.isEnabled(providerId),
      ])),
      uiDisabled: Object.fromEntries(providers.map((providerId) => [
        providerId,
        !g_app.services.remoteProviderUi.isEnabled(providerId),
      ])),
      globals: {
        firebase: typeof window.firebase,
        gapi: typeof window.gapi,
        GitHub: typeof window.GitHub,
        GitHubUI: typeof window.GitHubUI,
        GDrive: typeof window.GDrive,
      },
      providerControls: [
        "login-button",
        "start-login-mobile",
        "connectToGDriveButton",
        "connectToGDriveButtonMobile",
        "disconnectFromGDriveButton",
        "disconnectFromGDriveButtonMobile",
        "exportGIFMobileSaveGDrive",
        "gdriveMenu",
        "github_repositories",
        "loadRepository",
        "projectGithubPanel",
        "repositoryMenu",
        "saveAsConnectToGDriveButton",
        "saveAsConnectToGDriveButtonSection",
        "saveMethod_googleDrive",
        "startGoogleDriveStatus",
        "startGoogleDriveStatusMobile",
      ].filter((id) => document.getElementById(id) !== null),
    };
  });

  expect(result).toEqual({
    disabled: { github: true, gist: true, "google-drive": true },
    uiDisabled: { github: true, gist: true, "google-drive": true },
    globals: {
      firebase: "undefined",
      gapi: "undefined",
      GitHub: "undefined",
      GitHubUI: "undefined",
      GDrive: "undefined",
    },
    providerControls: [],
  });
});

test("retired provider links report the disabled state and show the start page", async ({ page }) => {
  await page.route(/^https:\/\//, (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 }),
  );

  for (const query of ["gh=owner/repository", "gd=file", "gist=id", "gid=id"]) {
    await page.goto(`/?${query}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#remoteProviderError")).toBeVisible();
    await expect(page.locator("#start2D")).toBeVisible();
    await expect.poll(() => page.evaluate(() => g_app.getMode())).toBe("start");
    await expect(page.getByText("loading....", { exact: true })).toBeHidden();
  }
});

test("mobile project rows treat document metadata as text and inert attributes", async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const holder = document.createElement("div");
    holder.id = "projectDocListMobile";
    document.body.appendChild(holder);
    const navigator = new ProjectNavigatorMobile();
    const maliciousName = '<span id="project-doc-attacker" data-ui-button-id="ui1" ' +
      'style="position:fixed">screen</span>';
    const originalDoc = g_app.doc;
    const originalNavigator = g_app.projectNavigator;
    let selected = null;
    navigator.selectDoc = (id, path) => {
      selected = { id, path };
    };
    g_app.doc = {
      dir: () => [{
        id: "screens-folder",
        name: "screens",
        type: "folder",
        children: [{ id: "screen-1", name: maliciousName, type: "graphic" }],
      }],
    };
    g_app.projectNavigator = { getCurrentEditor: () => null };

    try {
      navigator.updateProjectList();
      const row = holder.querySelector(".projectNavigatorMobileDoc");
      row.click();
      return {
        injectedMarkup: Boolean(holder.querySelector("#project-doc-attacker")),
        label: row.querySelector(".projectNavigatorMobileFilename")?.textContent,
        path: row.dataset.path,
        selected,
      };
    } finally {
      g_app.doc = originalDoc;
      g_app.projectNavigator = originalNavigator;
      holder.remove();
    }
  });

  expect(result).toEqual({
    injectedMarkup: false,
    label: '<span id="project-doc-attacker" data-ui-button-id="ui1" ' +
      'style="position:fixed">screen</span>',
    path: 'screens/<span id="project-doc-attacker" data-ui-button-id="ui1" ' +
      'style="position:fixed">screen</span>',
    selected: {
      id: "screen-1",
      path: 'screens/<span id="project-doc-attacker" data-ui-button-id="ui1" ' +
        'style="position:fixed">screen</span>',
    },
  });
});

test("shared SVG policy preserves generated geometry without executable markup", async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const svg = SafeHTML.createSVG([
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" onload="alert(1)">',
      '<path d="M0 0h8v8z" fill="red"/>',
      '<foreignObject><div>unsafe</div></foreignObject>',
      '<script>alert(1)<\/script>',
      '</svg>',
    ].join(''));
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = parsed.documentElement;
    return {
      height: root.getAttribute('height'),
      hasExecutableMarkup: Boolean(parsed.querySelector('script, foreignObject, [onload]')),
      pathCount: parsed.querySelectorAll('path').length,
      width: root.getAttribute('width'),
    };
  });

  expect(result).toEqual({
    height: "8",
    hasExecutableMarkup: false,
    pathCount: 1,
    width: "8",
  });
});

test("disabled-provider errors expose no remote or attacker-controlled markup", async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const payload = '<img id="attacker" src=x onerror="window.__securityTestExecuted=true">' +
      '<svg onload="window.__securityTestExecuted=true"></svg> remote failure';
    window.__securityTestExecuted = false;
    g_app.reportRemoteProviderError(payload, new Error(payload));
    const target = document.getElementById('remoteProviderError');

    return {
      attackerElement: Boolean(target.querySelector('#attacker, svg')),
      executed: window.__securityTestExecuted,
      message: target.textContent,
    };
  });

  expect(result).toEqual({
    attackerElement: false,
    executed: false,
    message: "GitHub, Gist, and Google Drive are temporarily disabled while secure " +
      "credential handling is prepared.",
  });
});

test("music scripts receive capabilities and return validated commands from an opaque sandbox", async ({ page }) => {
  await openApp(page);

  const result = await executeIsolatedMusicScript(page, `
    if (typeof document !== "undefined") throw new Error("document leaked");
    var pattern = Music.getCurrentPattern();
    pattern.clear();
    pattern.addNote(0, "Bass", pattern.pitchToNumber("c4"), 2);
    Music.getInstrument("Bass").setADSR(9, 15, 9, 10);
  `);

  expect(result.success).toBe(true);
  expect(result.commands).toEqual([
    { type: "clearPattern", patternId: 0 },
    { type: "addNote", patternId: 0, position: 0, instrument: 0, pitch: 48, duration: 2 },
    { type: "setADSR", instrumentId: 0, values: [9, 15, 9, 10] },
  ]);
});

test("music sandbox terminates runaway scripts", async ({ page }) => {
  await openApp(page);
  const result = await executeIsolatedMusicScript(page, "while (true) {}");

  expect(result.success).toBe(false);
  expect(result.error).toContain("two-second execution limit");
});

test("music sandbox denies direct network capabilities", async ({ page }) => {
  await openApp(page);
  const result = await executeIsolatedMusicScript(
    page,
    'fetch("https://attacker.invalid/probe")',
  );

  expect(result.success).toBe(false);
  expect(result.error).toContain("Network access is not available");
});

test("music sandbox rejects aggregate instrument-table payloads", async ({ page }) => {
  await openApp(page);
  const result = await executeIsolatedMusicScript(page, `
    var table = [];
    for(var row = 0; row < 256; row++) table.push(new Array(16).fill(0));
    var instrument = Music.getInstrument("Bass");
    for(var command = 0; command < 17; command++) instrument.setWavetable(table);
  `);

  expect(result.success).toBe(false);
  expect(result.error).toContain("instrument tables are too large");
});

test("CSP blocks disabled provider endpoints while retaining palette access", async ({ page }) => {
  await openApp(page);

  const results = await page.evaluate(async () => {
    const canFetch = async (url) => {
      try {
        await fetch(url);
        return true;
      } catch {
        return false;
      }
    };
    return {
      drive: await canFetch("https://drive.google.com/security-test"),
      github: await canFetch("https://api.github.com/security-test"),
      lospec: await canFetch("https://lospec.com/palette-list/security-test.json"),
    };
  });

  expect(results).toEqual({ drive: false, github: false, lospec: true });
});

test("production policy forbids app-origin eval and requires Trusted Types", async ({ page }) => {
  await openApp(page);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");

  expect(policy).toContain("require-trusted-types-for 'script'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("https://lospec.com");
  expect(policy).not.toMatch(/firebase|googleapis|drive\.google|github\.com/i);
  const scriptPolicy = policy.match(/script-src[^;]*/)?.[0];
  expect(scriptPolicy).toContain("'wasm-unsafe-eval'");
  expect(scriptPolicy).not.toContain("'unsafe-eval'");
});
