import assert from "node:assert/strict";
import test from "node:test";

import { DocumentSession } from "../src/js/modules/application/documentSession.mjs";
import { PersistenceService } from "../src/js/modules/application/persistenceService.mjs";

function createMemoryStorage(initialEntries = {}) {
  const entries = new Map(Object.entries(initialEntries));
  const failures = [];
  let version = 0;
  let hook = null;

  function maybeFail(method, key) {
    const index = failures.findIndex((failure) => failure.method === method && failure.key === key);
    if (index !== -1) {
      failures.splice(index, 1);
      throw new Error(`Injected ${method} failure for ${key}`);
    }
    hook?.(method, key);
  }

  const storage = {
    autosaveKey: "__autosave",
    projectDeleteJournalKey: "__delete-journal",
    projectSaveJournalKey: "__journal",
    cleanupPreviousVersion: async (commit) => {
      if (storage.isVersionPointer(commit.previousPointer) &&
        commit.previousPointer.activeVersion !== commit.versionKey) {
        try { await storage.remove(commit.previousPointer.activeVersion); } catch {}
      }
    },
    commitVersioned: async (key, value, versionKey = storage.createVersionKey(key)) => {
      const previousPointer = await storage.get(key);
      await storage.set(versionKey, value);
      const pointer = { format: "version-pointer", activeVersion: versionKey };
      try {
        await storage.set(key, pointer);
      } catch (error) {
        const current = await storage.get(key);
        if (!storage.isVersionPointer(current) || current.activeVersion !== versionKey) {
          try { await storage.remove(versionKey); } catch {}
        }
        throw error;
      }
      return { key, pointer, previousPointer, versionKey };
    },
    createVersionKey: (key) => `${key}-version-${++version}`,
    get: async (key) => {
      maybeFail("get", key);
      return entries.has(key) ? entries.get(key) : null;
    },
    isVersionPointer: (value) => value?.format === "version-pointer" &&
      typeof value.activeVersion === "string",
    readVersioned: async (key) => {
      const pointer = await storage.get(key);
      if (!storage.isVersionPointer(pointer)) {
        return { legacy: true, pointer, value: pointer, versionKey: null };
      }
      const value = await storage.get(pointer.activeVersion);
      if (value == null) throw new Error(`Incomplete version for ${key}`);
      return { legacy: false, pointer, value, versionKey: pointer.activeVersion };
    },
    remove: async (key) => {
      maybeFail("remove", key);
      entries.delete(key);
    },
    set: async (key, value) => {
      maybeFail("set", key);
      entries.set(key, value);
      return value;
    },
  };

  return {
    entries,
    fail(method, key) { failures.push({ method, key }); },
    setHook(nextHook) { hook = nextHook; },
    storage,
  };
}

function createServices(initialEntries = {}) {
  const memory = createMemoryStorage(initialEntries);
  let id = 0;
  let now = 100;
  const persistence = new PersistenceService({
    storage: memory.storage,
    clock: () => ++now,
    createId: () => `blob-${++id}`,
  });
  const errors = [];
  const session = new DocumentSession({
    persistence,
    clock: () => ++now,
    createId: () => `record-${++id}`,
    reportError(operation, error) { errors.push([operation, error]); },
    clearError() {},
  });
  return { errors, memory, persistence, session };
}

const existingProject = {
  "blob-old": "old contents",
  "project-1": [{ deleted: false, id: "blob-old", path: "/file.txt", sha: "old" }],
  projects: [{ id: "project-1", name: "Project", type: "project" }],
};

function saveRequest(content = "new contents", extras = {}) {
  return {
    projectDetails: { name: "Project", type: "project" },
    serialize: () => [{
      content,
      deleted: false,
      id: "document-file",
      path: "/file.txt",
      sha: "modified",
    }],
    ...extras,
  };
}

test("document lifecycle creates, opens, edits, saves, reloads, and deletes through the port", async () => {
  const { memory, persistence, session } = createServices();
  session.open(null);
  session.markModified("document-file", "/file.txt");

  const saved = await session.save(saveRequest("created contents"));
  assert.equal(saved.success, true);
  assert.equal(Object.keys(session.modified).length, 0);
  assert.equal(session.activeRevision, saved.versionKey);

  const projects = await persistence.listProjects("project");
  assert.equal(projects.length, 1);
  const reloaded = await persistence.getProjectManifest(saved.projectId);
  assert.equal(await persistence.loadBlob(reloaded.files[0].id), "created contents");

  const reopened = createServices();
  reopened.memory.entries.clear();
  for (const [key, value] of memory.entries) reopened.memory.entries.set(key, value);
  const reopenedManifest = await reopened.persistence.getProjectManifest(saved.projectId);
  reopened.session.open(reopenedManifest.versionKey);
  assert.equal(reopened.session.activeRevision, saved.versionKey);

  await persistence.deleteProject(saved.projectId);
  assert.deepEqual(await persistence.listProjects("project"), []);
  assert.equal(memory.entries.has(saved.projectId), false);
  assert.equal(memory.entries.has(saved.versionKey), false);
  assert.equal(memory.entries.has(reloaded.files[0].id), false);
});

for (const failure of [
  { label: "partial blob", method: "set", key: "blob-1", committed: false },
  { label: "manifest", method: "set", key: "project-1-version-1", committed: false },
  { label: "pointer", method: "set", key: "project-1", committed: false },
  { label: "catalog", method: "set", key: "projects", committed: true },
  { label: "cleanup", method: "remove", key: "blob-old", committed: true },
]) {
  test(`${failure.label} failure remains dirty and recovers the correct committed state`, async () => {
    const { memory, persistence, session } = createServices(existingProject);
    session.markModified("document-file", "/file.txt");
    memory.fail(failure.method, failure.key);

    const result = await session.save(saveRequest());
    assert.equal(result.success, false);
    assert.equal(Object.hasOwn(session.modified, "document-file"), true);
    assert.equal(memory.entries.has(memory.storage.projectSaveJournalKey), true);

    const recovery = await persistence.recoverPendingProjectSave();
    assert.equal(recovery.recovered, failure.committed);
    const manifest = await persistence.getProjectManifest("project-1");
    const contents = await persistence.loadBlob(manifest.files[0].id);
    assert.equal(contents, failure.committed ? "new contents" : "old contents");
    assert.equal(memory.entries.has(memory.storage.projectSaveJournalKey), false);
  });
}

test("journal-write failure stages no data and keeps the previous project intact", async () => {
  const { memory, persistence, session } = createServices(existingProject);
  session.markModified("document-file", "/file.txt");
  memory.fail("set", memory.storage.projectSaveJournalKey);

  const result = await session.save(saveRequest());
  assert.equal(result.success, false);
  assert.equal(memory.entries.has("blob-1"), false);
  assert.equal(await persistence.loadBlob("blob-old"), "old contents");
});

test("quota exhaustion propagates without publishing or clearing dirty state", async () => {
  const { memory, persistence, session } = createServices(existingProject);
  const originalSet = memory.storage.set;
  memory.storage.set = async (key, value) => {
    if (key === "blob-1") {
      const error = new Error("Storage quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    return originalSet(key, value);
  };
  session.markModified("document-file", "/file.txt");

  const result = await session.save(saveRequest());
  assert.equal(result.success, false);
  assert.equal(result.error.name, "QuotaExceededError");
  assert.equal(Object.hasOwn(session.modified, "document-file"), true);
  const manifest = await persistence.getProjectManifest("project-1");
  assert.equal(manifest.files[0].id, "blob-old");
});

test("a new service instance rolls back interrupted multi-blob staging", async () => {
  const { memory, session } = createServices(existingProject);
  session.markModified("first", "/first.txt");
  session.markModified("second", "/second.txt");
  memory.fail("set", "blob-2");

  const result = await session.save({
    projectDetails: { name: "Project", type: "project" },
    serialize: () => [
      { content: "first", id: "first", path: "/first.txt", sha: "modified" },
      { content: "second", id: "second", path: "/second.txt", sha: "modified" },
    ],
  });
  assert.equal(result.success, false);
  assert.equal(memory.entries.has("blob-1"), true);

  const reloaded = new PersistenceService({
    storage: memory.storage,
    clock: () => 500,
    createId: () => "unused",
  });
  assert.deepEqual(await reloaded.recoverPendingProjectSave(), {
    recovered: false,
    rolledBack: true,
  });
  assert.equal(memory.entries.has("blob-1"), false);
  assert.equal((await reloaded.getProjectManifest("project-1")).files[0].id, "blob-old");
});

test("a new service instance completes metadata after pointer publication", async () => {
  const { memory, session } = createServices(existingProject);
  session.markModified("document-file", "/file.txt");
  memory.fail("set", "projects");
  assert.equal((await session.save(saveRequest("committed"))).success, false);

  const reloaded = new PersistenceService({
    storage: memory.storage,
    clock: () => 500,
    createId: () => "unused",
  });
  assert.deepEqual(await reloaded.recoverPendingProjectSave(), {
    projectId: "project-1",
    recovered: true,
  });
  const manifest = await reloaded.getProjectManifest("project-1");
  assert.equal(await reloaded.loadBlob(manifest.files[0].id), "committed");
  assert.equal(memory.entries.has("blob-old"), false);
});

test("project listing waits for a live save instead of recovering its journal", async () => {
  const { memory, persistence, session } = createServices(existingProject);
  session.markModified("document-file", "/file.txt");
  const originalSet = memory.storage.set;
  let releaseBlobWrite = () => {};
  const blobWriteReleased = new Promise((resolve) => { releaseBlobWrite = resolve; });
  let reportBlobStaged = () => {};
  const blobStaged = new Promise((resolve) => { reportBlobStaged = resolve; });
  memory.storage.set = async (key, value) => {
    const result = await originalSet(key, value);
    if (key === "blob-1") {
      reportBlobStaged();
      await blobWriteReleased;
    }
    return result;
  };

  const saving = session.save(saveRequest("serialized contents"));
  await blobStaged;
  let listingSettled = false;
  const listing = persistence.listProjects("project").then((projects) => {
    listingSettled = true;
    return projects;
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(listingSettled, false);

  releaseBlobWrite();
  assert.equal((await saving).success, true);
  assert.equal((await listing).length, 1);
  const manifest = await persistence.getProjectManifest("project-1");
  assert.equal(await persistence.loadBlob(manifest.files[0].id), "serialized contents");
  assert.equal(memory.entries.has(memory.storage.projectSaveJournalKey), false);
});

test("deletion recovers when catalog publication fails", async () => {
  const { memory, persistence } = createServices(existingProject);
  memory.fail("set", "projects");

  await assert.rejects(persistence.deleteProject("project-1"), /Injected set failure/);
  assert.equal(memory.entries.has(memory.storage.projectDeleteJournalKey), true);
  assert.equal(memory.entries.has("project-1"), true);
  assert.equal(memory.entries.has("blob-old"), true);
  assert.equal(memory.entries.get("projects").length, 1);

  assert.deepEqual(await persistence.recoverPendingProjectDelete(), {
    projectId: "project-1",
    recovered: true,
  });
  assert.equal(memory.entries.has(memory.storage.projectDeleteJournalKey), false);
  assert.equal(memory.entries.has("project-1"), false);
  assert.equal(memory.entries.has("blob-old"), false);
  assert.deepEqual(memory.entries.get("projects"), []);
});

test("deletion stays hidden and recovers when data cleanup fails", async () => {
  const { memory, persistence } = createServices(existingProject);
  memory.fail("remove", "blob-old");

  await assert.rejects(persistence.deleteProject("project-1"), /Injected remove failure/);
  assert.equal(memory.entries.has(memory.storage.projectDeleteJournalKey), true);
  assert.equal(memory.entries.has("blob-old"), true);
  assert.deepEqual(memory.entries.get("projects"), []);

  assert.deepEqual(await persistence.recoverPendingProjectDelete(), {
    projectId: "project-1",
    recovered: true,
  });
  assert.equal(memory.entries.has(memory.storage.projectDeleteJournalKey), false);
  assert.equal(memory.entries.has("blob-old"), false);
  assert.deepEqual(memory.entries.get("projects"), []);
});

test("edits made while a save is in flight survive completed-save publication", async () => {
  const { memory, session } = createServices(existingProject);
  session.markModified("document-file", "/file.txt");
  memory.setHook((method, key) => {
    if (method === "set" && key === "project-1") {
      memory.setHook(null);
      session.markModified("document-file", "/file.txt");
    }
  });

  const result = await session.save(saveRequest("serialized contents"));
  assert.equal(result.success, true);
  assert.equal(session.modified["document-file"].revision, 2);
});

test("the session exposes save-in-flight state and rejects an overlapping save", async () => {
  const { session } = createServices(existingProject);
  session.markModified("document-file", "/file.txt");

  const first = session.save(saveRequest());
  assert.equal(session.saveInFlight, true);
  const overlapping = await session.save(saveRequest("overlap"));
  assert.equal(overlapping.success, false);
  assert.match(overlapping.error.message, /already in progress/);
  assert.equal((await first).success, true);
  assert.equal(session.saveInFlight, false);
});

test("autosave is isolated and Save As preserves the source project", async () => {
  const { memory, persistence, session } = createServices();
  session.markModified("document-file", "/file.txt");
  const source = await session.save(saveRequest("source", {
    projectDetails: { name: "Source", type: "project" },
  }));
  session.markModified("document-file", "/file.txt");
  const copy = await session.save(saveRequest("copy", {
    projectDetails: { name: "Copy", type: "project" },
  }));

  const sourceManifest = await persistence.getProjectManifest(source.projectId);
  const copyManifest = await persistence.getProjectManifest(copy.projectId);
  assert.notEqual(source.projectId, copy.projectId);
  assert.equal(await persistence.loadBlob(sourceManifest.files[0].id), "source");
  assert.equal(await persistence.loadBlob(copyManifest.files[0].id), "copy");

  await persistence.saveAutosave({ data: { version: "old" }, thumbnailData: null });
  memory.fail("set", memory.storage.autosaveKey);
  await assert.rejects(
    persistence.saveAutosave({ data: { version: "new" }, thumbnailData: null }),
    /Injected set failure/,
  );
  const autosave = await persistence.loadAutosaveSnapshot();
  assert.equal(autosave.data.version, "old");
  assert.equal((await persistence.listProjects("project")).length, 2);
});

test("an incomplete active manifest and a missing blob fail closed", async () => {
  const { memory, persistence } = createServices({
    "project-1": { format: "version-pointer", activeVersion: "missing-manifest" },
  });
  await assert.rejects(persistence.getProjectManifest("project-1"), /Incomplete version/);

  memory.entries.set("project-1", [{ id: "missing-blob", path: "/file.txt" }]);
  const manifest = await persistence.getProjectManifest("project-1");
  await assert.rejects(persistence.loadBlob(manifest.files[0].id), /missing/);
});
