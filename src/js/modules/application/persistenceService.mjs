/** @typedef {import("../infrastructure/browserStorageAdapter.mjs").PersistenceStoragePort} PersistenceStoragePort */

const catalogKey = "projects";
const legacyAutosaveDataKey = "__autosaveData";
const legacyAutosaveThumbnailKey = "__autosaveThumbnail";

/** @param {unknown} value @returns {unknown[]} */
function arrayValue(value) {
  return value != null && typeof value === "object" && "length" in value
    ? Array.from(/** @type {ArrayLike<unknown>} */ (value))
    : [];
}

/** @param {unknown[]} projects @param {{id: string}} projectData */
function mergeProjectMetadata(projects, projectData) {
  const projectList = projects.slice();
  const index = projectList.findIndex((project) =>
    project != null && typeof project === "object" && "id" in project && project.id === projectData.id
  );
  if (index === -1) projectList.push(projectData);
  else projectList[index] = projectData;
  return projectList;
}

export class PersistenceService {
  /** @param {{storage: PersistenceStoragePort, clock: () => number, createId: () => string}} dependencies */
  constructor({ storage, clock, createId }) {
    if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function") {
      throw new TypeError("PersistenceService requires a storage port");
    }
    if (typeof clock !== "function" || typeof createId !== "function") {
      throw new TypeError("PersistenceService requires clock and identifier providers");
    }
    this.storage = storage;
    this.clock = clock;
    this.createId = createId;
    /** @type {Promise<void>} */
    this.mutationTail = Promise.resolve();
  }

  /**
   * The save journal is application-wide, so every operation that can publish,
   * recover, or remove project state must share one queue.
   * @template T
   * @param {() => Promise<T>} operation
   * @returns {Promise<T>}
   */
  runExclusive(operation) {
    const result = this.mutationTail.then(() => operation());
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  /** @param {string} key */
  readRaw(key) { return this.storage.get(key); }
  /** @param {string} key @param {unknown} value */
  writeRaw(key, value) { return this.storage.set(key, value); }
  /** @param {string} key */
  removeRaw(key) { return this.storage.remove(key); }

  /** @param {object} args */
  async prepareProjectSave(args) {
    const projects = arrayValue(await this.storage.get(catalogKey));
    const type = "type" in args && typeof args.type === "string" ? args.type : "project";
    const name = "name" in args ? String(args.name) : "";
    const existingProject = /** @type {any} */ (projects.find((project) => {
      const entry = /** @type {any} */ (project);
      return entry != null && typeof entry === "object" && entry.name === name && entry.type === type;
    }));

    let projectId = existingProject?.id || null;
    if (!projectId && "projectId" in args && typeof args.projectId === "string") {
      const preferredIsUnused = !projects.some((project) =>
        project != null && typeof project === "object" && "id" in project && project.id === args.projectId
      );
      if (preferredIsUnused) projectId = args.projectId;
    }
    if (!projectId) projectId = this.createId();

    const projectData = { ...(existingProject || {}) };
    projectData.id = projectId;
    projectData.name = name;
    projectData.type = type;
    projectData.lastModified = this.clock();
    projectData.projectNavVisible = "projectNavVisible" in args ? !!args.projectNavVisible : false;
    if ("currentPath" in args && args.currentPath !== false) projectData.currentPath = args.currentPath;
    if ("owner" in args && "repository" in args) {
      projectData.githubOwner = args.owner;
      projectData.githubRepository = args.repository;
    }

    return {
      projectData,
      projectId,
      thumbnailData: "thumbnailData" in args ? args.thumbnailData : null,
    };
  }

  /** @param {{projectData: {id: string}, projectId: string, thumbnailData: unknown}} details */
  async writeProjectMetadata(details) {
    const projects = arrayValue(await this.storage.get(catalogKey));
    const projectList = mergeProjectMetadata(projects, details.projectData);
    await this.storage.set(`${details.projectId}-thumbnail`, details.thumbnailData);
    await this.storage.set(catalogKey, projectList);
  }

  /** @param {{staleFileIds?: string[], previousVersionKey?: string | null, commitKey: string}} details */
  async cleanupCommittedProjectSave(details) {
    const cleanupKeys = [...(details.staleFileIds || [])];
    if (details.previousVersionKey && details.previousVersionKey !== details.commitKey) {
      cleanupKeys.push(details.previousVersionKey);
    }
    for (const key of cleanupKeys) await this.storage.remove(key);
  }

  recoverPendingProjectSave() {
    return this.runExclusive(() => this.recoverPendingProjectSaveUnlocked());
  }

  async recoverPendingProjectSaveUnlocked() {
    const journal = /** @type {any} */ (await this.storage.get(this.storage.projectSaveJournalKey));
    if (!journal?.projectId || !journal.commitKey) return { recovered: false };

    const pointer = await this.storage.get(journal.projectId);
    const commitIsActive = this.storage.isVersionPointer(pointer) &&
      /** @type {{activeVersion?: string}} */ (pointer).activeVersion === journal.commitKey;
    if (commitIsActive) {
      await this.writeProjectMetadata(journal);
      await this.cleanupCommittedProjectSave(journal);
      await this.storage.remove(this.storage.projectSaveJournalKey);
      return { recovered: true, projectId: journal.projectId };
    }

    for (const key of [...(journal.stagedFileIds || []), journal.commitKey]) {
      try { await this.storage.remove(key); } catch {}
    }
    await this.storage.remove(this.storage.projectSaveJournalKey);
    return { recovered: false, rolledBack: true };
  }

  /** @param {{projectId: string}} journal */
  async publishProjectDeletion(journal) {
    const projects = arrayValue(await this.storage.get(catalogKey));
    await this.storage.set(catalogKey, projects.filter((project) =>
      !(project != null && typeof project === "object" && "id" in project && project.id === journal.projectId)
    ));
  }

  /** @param {{cleanupKeys: string[]}} journal */
  async cleanupProjectDeletion(journal) {
    for (const key of journal.cleanupKeys) await this.storage.remove(key);
  }

  recoverPendingProjectDelete() {
    return this.runExclusive(() => this.recoverPendingProjectDeleteUnlocked());
  }

  async recoverPendingProjectDeleteUnlocked() {
    const journal = /** @type {any} */ (await this.storage.get(this.storage.projectDeleteJournalKey));
    if (journal == null) return { recovered: false };
    const cleanupKeys = Array.isArray(journal.cleanupKeys) ?
      /** @type {unknown[]} */ (journal.cleanupKeys) : null;
    if (!journal.projectId || !cleanupKeys ||
      cleanupKeys.some((key) => typeof key !== "string")) {
      throw new Error("The pending project-deletion journal is invalid.");
    }
    const pendingDeletion = {
      cleanupKeys: /** @type {string[]} */ (cleanupKeys),
      projectId: String(journal.projectId),
    };

    await this.publishProjectDeletion(pendingDeletion);
    await this.cleanupProjectDeletion(pendingDeletion);
    await this.storage.remove(this.storage.projectDeleteJournalKey);
    return { recovered: true, projectId: pendingDeletion.projectId };
  }

  async recoverPendingOperationsUnlocked() {
    await this.recoverPendingProjectSaveUnlocked();
    await this.recoverPendingProjectDeleteUnlocked();
  }

  /** @param {string} projectId */
  async getProjectManifest(projectId) {
    const record = await this.storage.readVersioned(projectId);
    if (record.value != null &&
      !(typeof record.value === "object" && "length" in record.value)) {
      throw new Error("The saved project manifest is invalid.");
    }
    return { files: arrayValue(record.value), versionKey: record.versionKey };
  }

  /** @param {string} fileId */
  async loadBlob(fileId) {
    const content = await this.storage.get(fileId);
    if (content == null) throw new Error("A saved project file is missing.");
    return content;
  }

  /** @param {string} fileId @param {unknown} content */
  saveBlob(fileId, content) { return this.storage.set(fileId, content); }

  /**
   * @param {unknown[]} files
   * @param {unknown[]} previousManifest
   * @param {Record<string, {revision: number}>} modifiedSnapshot
   */
  createSavePlan(files, previousManifest, modifiedSnapshot) {
    const manifest = [];
    const writes = [];
    const savedRevisions = [];
    const staleFileIds = previousManifest.map((entry) => String(/** @type {any} */ (entry).id));

    for (const rawFile of files) {
      const file = /** @type {any} */ (rawFile);
      const fileId = this.createId();
      manifest.push({
        path: file.path,
        lastModified: this.clock(),
        sha: file.sha == null ? "" : file.sha,
        id: fileId,
        deleted: !!file.deleted,
      });
      writes.push({ fileId, content: file.deleted ? "" : file.content });
      const dirty = modifiedSnapshot[String(file.id)];
      if (dirty) savedRevisions.push({ id: file.id, revision: dirty.revision });
    }
    return {
      manifest,
      savedRevisions,
      stagedFileIds: writes.map((write) => write.fileId),
      staleFileIds,
      writes,
    };
  }

  /** @param {any} request */
  saveDocument(request) {
    return this.runExclusive(() => this.saveDocumentUnlocked(request));
  }

  /** @param {any} request */
  async saveDocumentUnlocked(request) {
    await this.recoverPendingOperationsUnlocked();
    const details = await this.prepareProjectSave({
      ...request.projectDetails,
      projectId: request.pendingProjectId || request.projectDetails.projectId,
    });
    request.onProjectIdentified?.(details.projectId);
    const previous = await this.getProjectManifest(details.projectId);
    const plan = this.createSavePlan(request.files, previous.files, request.modifiedSnapshot);
    const commitKey = this.storage.createVersionKey(details.projectId);
    const journal = {
      ...details,
      commitKey,
      previousVersionKey: previous.versionKey,
      stagedFileIds: plan.stagedFileIds,
      staleFileIds: plan.staleFileIds,
    };

    await this.storage.set(this.storage.projectSaveJournalKey, journal);
    for (const write of plan.writes) await this.storage.set(write.fileId, write.content);
    await this.storage.commitVersioned(details.projectId, plan.manifest, commitKey);
    await this.writeProjectMetadata(journal);
    await this.cleanupCommittedProjectSave(journal);
    await this.storage.remove(this.storage.projectSaveJournalKey);
    return {
      manifest: plan.manifest,
      projectId: details.projectId,
      savedRevisions: plan.savedRevisions,
      versionKey: commitKey,
    };
  }

  /** @param {object} args */
  saveProjectMetadata(args) {
    return this.runExclusive(() => this.saveProjectMetadataUnlocked(args));
  }

  /** @param {object} args */
  async saveProjectMetadataUnlocked(args) {
    await this.recoverPendingOperationsUnlocked();
    const details = await this.prepareProjectSave(args);
    await this.writeProjectMetadata(details);
    return { projectId: details.projectId };
  }

  /** @param {string} type */
  listProjects(type) {
    return this.runExclusive(async () => {
      await this.recoverPendingOperationsUnlocked();
      return arrayValue(await this.storage.get(catalogKey)).filter((project) =>
        project != null && typeof project === "object" && "type" in project && project.type === type
      );
    });
  }

  /** @param {string} projectId */
  readThumbnail(projectId) { return this.storage.get(`${projectId}-thumbnail`); }

  /** @param {string} projectId */
  deleteProject(projectId) {
    return this.runExclusive(() => this.deleteProjectUnlocked(projectId));
  }

  /** @param {string} projectId */
  async deleteProjectUnlocked(projectId) {
    await this.recoverPendingOperationsUnlocked();
    const manifest = await this.getProjectManifest(projectId);
    const cleanupKeys = [projectId, `${projectId}-thumbnail`];
    if (manifest.versionKey) cleanupKeys.push(manifest.versionKey);
    for (const file of manifest.files) {
      const id = /** @type {{id?: string}} */ (file).id;
      if (id) cleanupKeys.push(id);
    }
    const journal = {
      cleanupKeys: [...new Set(cleanupKeys)],
      projectId,
      requestedAt: this.clock(),
    };

    await this.storage.set(this.storage.projectDeleteJournalKey, journal);
    await this.publishProjectDeletion(journal);
    await this.cleanupProjectDeletion(journal);
    await this.storage.remove(this.storage.projectDeleteJournalKey);
  }

  /** @param {string} projectId @param {unknown[]} files */
  commitProjectManifest(projectId, files) {
    return this.runExclusive(() => this.commitProjectManifestUnlocked(projectId, files));
  }

  /** @param {string} projectId @param {unknown[]} files */
  async commitProjectManifestUnlocked(projectId, files) {
    await this.recoverPendingOperationsUnlocked();
    const commit = await this.storage.commitVersioned(projectId, files);
    await this.storage.cleanupPreviousVersion(commit);
  }

  /** @param {string} projectName @param {string} owner @param {string} repository */
  updateProjectRepository(projectName, owner, repository) {
    return this.runExclusive(() => this.updateProjectRepositoryUnlocked(projectName, owner, repository));
  }

  /** @param {string} projectName @param {string} owner @param {string} repository */
  async updateProjectRepositoryUnlocked(projectName, owner, repository) {
    await this.recoverPendingOperationsUnlocked();
    const projects = /** @type {any[]} */ (arrayValue(await this.storage.get(catalogKey)));
    const project = projects.find((entry) => entry.name === projectName && entry.type === "project");
    if (!project) throw new Error("The local project could not be found.");
    project.githubOwner = owner;
    project.githubRepository = repository;
    await this.storage.set(catalogKey, projects);
  }

  /** @param {string} projectId @param {string} name */
  renameProject(projectId, name) {
    return this.runExclusive(() => this.renameProjectUnlocked(projectId, name));
  }

  /** @param {string} projectId @param {string} name */
  async renameProjectUnlocked(projectId, name) {
    await this.recoverPendingOperationsUnlocked();
    const projects = /** @type {any[]} */ (arrayValue(await this.storage.get(catalogKey)));
    for (const project of projects) if (project.id === projectId) project.name = name;
    await this.storage.set(catalogKey, projects);
  }

  /** @param {{data: unknown, thumbnailData: unknown}} snapshot */
  async saveAutosave(snapshot) {
    const commit = await this.storage.commitVersioned(this.storage.autosaveKey, {
      ...snapshot,
      savedAt: this.clock(),
    });
    await this.storage.cleanupPreviousVersion(commit);
  }

  async loadAutosaveSnapshot() {
    const record = await this.storage.readVersioned(this.storage.autosaveKey);
    if (record.value != null) return record.value;
    const data = await this.storage.get(legacyAutosaveDataKey);
    if (data == null) return null;
    return { data, thumbnailData: await this.storage.get(legacyAutosaveThumbnailKey) };
  }

  async getAutosaveSummary() {
    const snapshot = /** @type {any} */ (await this.loadAutosaveSnapshot());
    if (snapshot?.data != null) return { success: true, thumbnailData: snapshot.thumbnailData };
    const thumbnailData = await this.storage.get(legacyAutosaveThumbnailKey);
    return { success: thumbnailData != null, thumbnailData };
  }
}
