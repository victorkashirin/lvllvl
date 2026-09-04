import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const storageManagerSource = await readFile("src/js/utils/storageManager.js", "utf8");
const fileManagerSource = await readFile("src/js/file/fileManager.js", "utf8");
const documentSource = await readFile("src/js/file/document.js", "utf8");
const githubSource = await readFile("src/js/file/github.js", "utf8");
const githubClientSource = await readFile("src/js/file/githubClient.js", "utf8");

async function openPersistenceHarness(page, initialEntries = {}) {
  await page.route("**/__persistence-test__.html", (route) => route.fulfill({
    body: "<!doctype html><html><body></body></html>",
    contentType: "text/html",
    status: 200,
  }));
  await page.goto("/__persistence-test__.html");
  await page.evaluate((entries) => {
    window.__storage = new Map(Object.entries(entries));
    window.__storageFailures = [];
    window.__storageHook = null;
    window.__failStorage = (method, key) => {
      window.__storageFailures.push({ key, method });
    };

    const complete = (method, key, callback, action) => {
      setTimeout(() => {
        const failureIndex = window.__storageFailures.findIndex(
          (failure) => failure.method === method && failure.key === key,
        );
        if (failureIndex !== -1) {
          window.__storageFailures.splice(failureIndex, 1);
          callback(new Error(`Injected ${method} failure for ${key}`));
          return;
        }

        if (window.__storageHook) window.__storageHook(method, key);
        action();
      }, 0);
    };

    window.localforage = {
      getItem(key, callback) {
        complete("getItem", key, callback, () => {
          callback(null, window.__storage.has(key) ? window.__storage.get(key) : null);
        });
      },
      removeItem(key, callback) {
        complete("removeItem", key, callback, () => {
          window.__storage.delete(key);
          callback(null);
        });
      },
      setItem(key, value, callback) {
        complete("setItem", key, callback, () => {
          window.__storage.set(key, value);
          callback(null, value);
        });
      },
    };
  }, initialEntries);

  await page.addScriptTag({ content: storageManagerSource });
  await page.addScriptTag({ content: fileManagerSource });
  await page.addScriptTag({ content: documentSource });
  await page.addScriptTag({ content: githubSource });
  await page.addScriptTag({ content: githubClientSource });

  await page.evaluate(() => {
    window.getTimestamp = () => Date.now();
    let guid = 0;
    window.g_app = {
      getGuid() {
        guid += 1;
        return `generated-${guid}`;
      },
      projectNavigator: {
        getCurrentEditor() { return null; },
        getCurrentPath() { return "/screens/main"; },
        getVisible() { return true; },
        updateModifiedList() {},
      },
    };

    g_app.fileManager = new FileManager();
    g_app.doc = new Document();
    g_app.fileManager.filename = "Project";
    g_app.fileManager.isNew = false;
    g_app.fileManager.saveTo = "browserStorage";
  });
}

async function configureChangedDocument(page, content = "new contents") {
  await page.evaluate((nextContent) => {
    g_app.doc.modifiedRevision = 1;
    g_app.doc.modified = {
      "document-file": { path: "/file.txt", revision: 1 },
    };
    g_app.doc.getFiles = () => [{
      content: nextContent,
      deleted: false,
      id: "document-file",
      path: "/file.txt",
      sha: "modified",
    }];
  }, content);
}

const existingProject = {
  "blob-old": "old contents",
  "project-1": [{
    deleted: false,
    id: "blob-old",
    lastModified: 1,
    path: "/file.txt",
    sha: "old-sha",
  }],
  projects: [{ id: "project-1", name: "Project", type: "project" }],
};

test("project metadata writes propagate their storage error", async ({ page }) => {
  await openPersistenceHarness(page);

  const result = await page.evaluate(async () => {
    __failStorage("setItem", "generated-1-thumbnail");
    const saved = await g_app.fileManager.saveProject({ name: "New project" });
    return {
      catalogWritten: __storage.has("projects"),
      error: saved.error.message,
      success: saved.success,
    };
  });

  expect(result).toEqual({
    catalogWritten: false,
    error: "Injected setItem failure for generated-1-thumbnail",
    success: false,
  });
});

test("a rejected file write cannot report save success", async ({ page }) => {
  await openPersistenceHarness(page, existingProject);
  await configureChangedDocument(page);

  const result = await page.evaluate(async () => {
    __failStorage("setItem", "generated-1");
    const saved = await g_app.fileManager.save({ filename: "Project" });
    const stored = await g_app.fileManager.getProjectFiles({ projectId: "project-1" });
    return {
      dirty: Object.hasOwn(g_app.doc.modified, "document-file"),
      fileId: stored.files[0].id,
      success: saved.success,
    };
  });

  expect(result).toEqual({ dirty: true, fileId: "blob-old", success: false });
});

test("an unavailable storage driver cannot report save success", async ({ page }) => {
  await openPersistenceHarness(page, existingProject);
  await configureChangedDocument(page);

  const result = await page.evaluate(async () => {
    const originalSetItem = localforage.setItem;
    localforage.setItem = () => {
      throw new Error("Injected unavailable storage driver");
    };
    const saved = await g_app.fileManager.save({ filename: "Project" });
    localforage.setItem = originalSetItem;
    return {
      dirty: Object.hasOwn(g_app.doc.modified, "document-file"),
      error: saved.error.message,
      success: saved.success,
    };
  });

  expect(result).toEqual({
    dirty: true,
    error: "Injected unavailable storage driver",
    success: false,
  });
});

test("a serialization failure leaves the document dirty and retryable", async ({ page }) => {
  await openPersistenceHarness(page, existingProject);
  await configureChangedDocument(page);

  const result = await page.evaluate(async () => {
    g_app.doc.getFiles = () => {
      throw new Error("Injected serialization failure");
    };
    const saved = await g_app.fileManager.save({ filename: "Project" });
    return {
      dirty: Object.hasOwn(g_app.doc.modified, "document-file"),
      error: saved.error.message,
      saveInProgress: g_app.doc.savingToBrowserStorage,
      success: saved.success,
    };
  });

  expect(result).toEqual({
    dirty: true,
    error: "Injected serialization failure",
    saveInProgress: false,
    success: false,
  });
});

test("a failed project commit preserves the old version and dirty state, then retries", async ({ page }) => {
  await openPersistenceHarness(page, existingProject);
  await configureChangedDocument(page);

  const failed = await page.evaluate(async () => {
    __failStorage("setItem", "project-1");
    const result = await g_app.fileManager.save({ filename: "Project" });
    const stored = await g_app.fileManager.getProjectFiles({ projectId: "project-1" });
    return {
      dirty: Object.hasOwn(g_app.doc.modified, "document-file"),
      error: result.error.message,
      errorPanel: document.querySelector("#browserStorageSaveError").textContent,
      fileId: stored.files[0].id,
      oldContents: __storage.get("blob-old"),
      success: result.success,
    };
  });

  expect(failed).toMatchObject({
    dirty: true,
    fileId: "blob-old",
    oldContents: "old contents",
    success: false,
  });
  expect(failed.error).toContain("Injected setItem failure");
  expect(failed.errorPanel).toContain("Your unsaved work is still open");
  expect(failed.errorPanel).toContain("Download As");

  const retried = await page.evaluate(async () => {
    const result = await g_app.fileManager.save({ filename: "Project" });
    const stored = await g_app.fileManager.getProjectFiles({ projectId: "project-1" });
    return {
      contents: __storage.get(stored.files[0].id),
      dirty: Object.hasOwn(g_app.doc.modified, "document-file"),
      errorDisplay: document.querySelector("#browserStorageSaveError").style.display,
      success: result.success,
    };
  });

  expect(retried).toEqual({
    contents: "new contents",
    dirty: false,
    errorDisplay: "none",
    success: true,
  });
});

test("a committed project is recovered after its catalog update is interrupted", async ({ page }) => {
  await openPersistenceHarness(page, existingProject);
  await page.evaluate(async () => {
    await BrowserStorage.commitVersioned(
      "project-1",
      __storage.get("project-1"),
      "project-old-version",
    );
  });
  await configureChangedDocument(page, "recoverable contents");

  const interrupted = await page.evaluate(async () => {
    __failStorage("setItem", "projects");
    const result = await g_app.fileManager.save({ filename: "Project" });
    const pointer = __storage.get("project-1");
    return {
      dirty: Object.hasOwn(g_app.doc.modified, "document-file"),
      journal: __storage.has(BrowserStorage.PROJECT_SAVE_JOURNAL_KEY),
      pointerIsVersioned: BrowserStorage.isVersionPointer(pointer),
      success: result.success,
    };
  });

  expect(interrupted).toEqual({
    dirty: true,
    journal: true,
    pointerIsVersioned: true,
    success: false,
  });

  const recovered = await page.evaluate(async () => {
    const reloadedFileManager = new FileManager();
    g_app.fileManager = reloadedFileManager;
    const list = await new Promise((resolve) => {
      reloadedFileManager.getProjectList({ thumbnails: false, type: "project" }, resolve);
    });
    const stored = await reloadedFileManager.getProjectFiles({ projectId: "project-1" });
    return {
      contents: __storage.get(stored.files[0].id),
      journal: __storage.has(BrowserStorage.PROJECT_SAVE_JOURNAL_KEY),
      oldBlobPresent: __storage.has("blob-old"),
      oldManifestPresent: __storage.has("project-old-version"),
      projectId: list.projects[0].id,
      success: list.success,
    };
  });

  expect(recovered).toEqual({
    contents: "recoverable contents",
    journal: false,
    oldBlobPresent: false,
    oldManifestPresent: false,
    projectId: "project-1",
    success: true,
  });
});

test("cleanup failures retain the save journal and recover on retry", async ({ page }) => {
  await openPersistenceHarness(page, existingProject);
  await configureChangedDocument(page, "new contents");

  const failed = await page.evaluate(async () => {
    __failStorage("removeItem", "blob-old");
    const result = await g_app.fileManager.save({ filename: "Project" });
    return {
      dirty: Object.hasOwn(g_app.doc.modified, "document-file"),
      journal: __storage.has(BrowserStorage.PROJECT_SAVE_JOURNAL_KEY),
      oldBlobPresent: __storage.has("blob-old"),
      success: result.success,
    };
  });

  expect(failed).toEqual({
    dirty: true,
    journal: true,
    oldBlobPresent: true,
    success: false,
  });

  const retried = await page.evaluate(async () => {
    const result = await g_app.fileManager.save({ filename: "Project" });
    return {
      dirty: Object.hasOwn(g_app.doc.modified, "document-file"),
      journal: __storage.has(BrowserStorage.PROJECT_SAVE_JOURNAL_KEY),
      oldBlobPresent: __storage.has("blob-old"),
      success: result.success,
    };
  });

  expect(retried).toEqual({
    dirty: false,
    journal: false,
    oldBlobPresent: false,
    success: true,
  });
});

test("edits made during a successful save remain dirty", async ({ page }) => {
  await openPersistenceHarness(page, existingProject);
  await configureChangedDocument(page);

  const result = await page.evaluate(async () => {
    const record = { id: "document-file", sha: "modified" };
    __storageHook = (method, key) => {
      if (method === "setItem" && key === "project-1") {
        __storageHook = null;
        g_app.doc.recordModified(record, "/file.txt");
      }
    };

    const saved = await g_app.fileManager.save({ filename: "Project" });
    return {
      dirty: Object.hasOwn(g_app.doc.modified, "document-file"),
      revision: g_app.doc.modified["document-file"].revision,
      success: saved.success,
    };
  });

  expect(result).toEqual({ dirty: true, revision: 2, success: true });
});

test("edits made between serialization and storage reads remain dirty", async ({ page }) => {
  await openPersistenceHarness(page, existingProject);
  await configureChangedDocument(page, "serialized contents");

  const result = await page.evaluate(async () => {
    let currentContents = "serialized contents";
    g_app.doc.getFiles = () => [{
      content: currentContents,
      deleted: false,
      id: "document-file",
      path: "/file.txt",
      sha: "modified",
    }];

    const record = { id: "document-file", sha: "modified" };
    __storageHook = (method, key) => {
      if (method === "getItem" && key === BrowserStorage.PROJECT_SAVE_JOURNAL_KEY) {
        __storageHook = null;
        currentContents = "newer unsaved contents";
        g_app.doc.recordModified(record, "/file.txt");
      }
    };

    const saved = await g_app.fileManager.save({ filename: "Project" });
    const stored = await g_app.fileManager.getProjectFiles({ projectId: "project-1" });
    return {
      contents: __storage.get(stored.files[0].id),
      dirty: Object.hasOwn(g_app.doc.modified, "document-file"),
      revision: g_app.doc.modified["document-file"].revision,
      success: saved.success,
    };
  });

  expect(result).toEqual({
    contents: "serialized contents",
    dirty: true,
    revision: 2,
    success: true,
  });
});

test("Save As aborts when checking for an existing project fails", async ({ page }) => {
  await openPersistenceHarness(page, existingProject);

  const result = await page.evaluate(async () => {
    let saveCalled = false;
    let confirmCalled = false;
    g_app.fileManager.save = () => {
      saveCalled = true;
    };
    window.confirm = () => {
      confirmCalled = true;
      return true;
    };
    __failStorage("getItem", "projects");

    const saved = await new Promise((resolve) => {
      g_app.fileManager.saveAs({
        filename: "Project",
        saveMethod: "browserStorage",
      }, resolve);
    });
    return {
      confirmCalled,
      error: saved.error.message,
      saveCalled,
      success: saved.success,
    };
  });

  expect(result).toEqual({
    confirmCalled: false,
    error: "Injected getItem failure for projects",
    saveCalled: false,
    success: false,
  });
});

test("unique project naming propagates reads and returns the unused name", async ({ page }) => {
  await openPersistenceHarness(page, {
    projects: [{ id: "existing", name: "Repository", type: "project" }],
  });

  const result = await page.evaluate(async () => {
    __failStorage("getItem", "projects");
    const failed = await new Promise((resolve) => {
      g_app.fileManager.getUniqueProjectName("Repository", resolve);
    });
    const resolved = await new Promise((resolve) => {
      g_app.fileManager.getUniqueProjectName("Repository", resolve);
    });
    return {
      error: failed.error.message,
      failed: failed.success,
      resolved,
    };
  });

  expect(result).toEqual({
    error: "Injected getItem failure for projects",
    failed: false,
    resolved: { success: true, name: "Repository-1" },
  });
});

test("autosave failures keep the last complete recovery snapshot", async ({ page }) => {
  await openPersistenceHarness(page);

  const result = await page.evaluate(async () => {
    await BrowserStorage.commitVersioned(
      BrowserStorage.AUTOSAVE_KEY,
      { data: { version: "old" }, thumbnailData: "old-thumbnail" },
      "autosave-old-version",
    );

    g_app.doc.data = { version: "new" };
    __failStorage("setItem", BrowserStorage.AUTOSAVE_KEY);
    const failed = await g_app.fileManager.autosave();
    const afterFailure = await BrowserStorage.getVersionedItem(BrowserStorage.AUTOSAVE_KEY);
    const retried = await g_app.fileManager.autosave();
    const afterRetry = await BrowserStorage.getVersionedItem(BrowserStorage.AUTOSAVE_KEY);

    return {
      failed: failed.success,
      oldVersion: afterFailure.data.version,
      retried: retried.success,
      savedVersion: afterRetry.data.version,
    };
  });

  expect(result).toEqual({
    failed: false,
    oldVersion: "old",
    retried: true,
    savedVersion: "new",
  });
});

test("autosave continues without a thumbnail when canvas capture throws", async ({ page }) => {
  await openPersistenceHarness(page);

  const result = await page.evaluate(async () => {
    g_app.doc.data = { version: "recoverable" };
    g_app.projectNavigator.getCurrentEditor = () => ({
      getThumbnailCanvas() {
        throw new Error("Injected canvas failure");
      },
    });

    const saved = await g_app.fileManager.autosave();
    const snapshot = await BrowserStorage.getVersionedItem(BrowserStorage.AUTOSAVE_KEY);
    return {
      success: saved.success,
      thumbnailData: snapshot.thumbnailData,
      version: snapshot.data.version,
    };
  });

  expect(result).toEqual({
    success: true,
    thumbnailData: null,
    version: "recoverable",
  });
});

test("repository opening reports a requested local-save failure", async ({ page }) => {
  await openPersistenceHarness(page);

  const result = await page.evaluate(async () => {
    let refreshCount = 0;
    window.UI = { closeDialog() {} };
    window.$ = () => ({ html() {}, hide() {}, show() {}, text() {} });
    g_app.projectNavigator.refreshTree = () => { refreshCount += 1; };
    g_app.fileManager.getUniqueProjectName = (name, callback) => {
      callback({ success: true, name });
    };
    g_app.doc.saveToBrowserStorage = (args, callback) => {
      setTimeout(() => callback({
        success: false,
        error: new Error("Injected local save failure"),
      }), 0);
    };

    const github = new GitHubUI();
    github.showLoadingDialog = () => {};
    github.setRepositoryDetails = () => {};
    github.loadProgressBar = { setProgress() {} };
    github.githubClient = {
      load(args, callback) { callback({ success: true }); },
    };

    const opened = await new Promise((resolve) => {
      github.openRepository({ owner: "owner", repository: "repo" }, resolve);
    });
    return {
      error: opened.error.message,
      refreshCount,
      success: opened.success,
    };
  });

  expect(result).toEqual({
    error: "Injected local save failure",
    refreshCount: 0,
    success: false,
  });
});

test("repository creation stops when local metadata persistence fails", async ({ page }) => {
  await openPersistenceHarness(page);

  const result = await page.evaluate(() => {
    let pushed = false;
    window.$ = () => ({ html() {}, hide() {}, show() {}, text() {} });
    g_app.fileManager.saveProjectRepositoryDetails = (args, callback) => {
      callback({ success: false, error: new Error("Injected metadata failure") });
    };

    const github = new GitHubUI();
    github.repoOkButton = { setEnabled() {} };
    github.repoCloseButton = { setEnabled() {} };
    github.recordRepository = (args, callback) => callback({});
    github.saveToRepository = () => { pushed = true; };
    github.githubClient = {
      createRepo(args, callback) {
        callback({
          status: 201,
          data: { id: 1, name: args.repository, full_name: `${args.owner}/${args.repository}` },
        });
      },
      setRepositoryFolder() {},
    };

    github.createRepository({ owner: "owner", repository: "repo" });
    return { pushed };
  });

  expect(result).toEqual({ pushed: false });
});

test("repository SHA failures propagate without changing in-memory status", async ({ page }) => {
  await openPersistenceHarness(page);

  const result = await page.evaluate(async () => {
    const record = { sha: "modified" };
    g_app.doc.getDocRecord = () => record;
    g_app.fileManager.updateFileSHA = (repositoryId, treeFiles, files, callback) => {
      callback({ success: false, error: new Error("Injected SHA save failure") });
    };

    const githubClient = new GitHubClient();
    const updated = await new Promise((resolve) => {
      githubClient.updateBrowserFiles(
        [{ path: "file.txt", sha: "remote-sha" }],
        [],
        resolve,
      );
    });
    return {
      error: updated.error.message,
      sha: record.sha,
      success: updated.success,
    };
  });

  expect(result).toEqual({
    error: "Injected SHA save failure",
    sha: "modified",
    success: false,
  });
});
