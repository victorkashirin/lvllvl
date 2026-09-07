/** @typedef {Record<string, any>} LegacyUI */
/** @typedef {import("../application/commandService.mjs").CommandService} CommandService */
/** @typedef {import("../domain/keybindings.mjs").Keybinding} Keybinding */

/**
 * @typedef {object} ShortcutConflict
 * @property {number} [bindingIndex]
 * @property {string} commandId
 * @property {string} contextLabel
 * @property {boolean} [layoutDependent]
 * @property {"new" | "existing" | "unresolved"} [precedence]
 * @property {string} title
 * @property {"context-separated" | "duplicate" | "hard" | "layout-possible" | "layout-unknown" | "prefix" | "reserved"} type
 */

/**
 * @typedef {object} ShortcutSummary
 * @property {Keybinding[]} bindings
 * @property {string} category
 * @property {ShortcutConflict[]} conflicts
 * @property {Record<string, unknown>[]} contexts
 * @property {string} contextLabel
 * @property {string} id
 * @property {boolean} availableInCurrentMode
 * @property {boolean} modified
 * @property {string} source
 * @property {string} title
 */

/**
 * @param {{commands: CommandService, document: Document, UI: LegacyUI, confirmAction: (message: string) => boolean, downloadText: (filename: string, text: string) => void, reportError?: (operation: string, error: unknown) => void, setTimer: (callback: () => void, delay: number) => unknown}} dependencies
 */
export function createKeyboardShortcutsDialog({
  commands,
  document,
  UI,
  confirmAction,
  downloadText,
  reportError = () => {},
  setTimer,
}) {
  if (!commands || !document || !UI || typeof UI.create !== "function") {
    throw new TypeError("Keyboard shortcut settings require command, document, and UI ports");
  }

  /** @type {any} */
  let dialog = null;
  /** @type {any} */
  let htmlPanel = null;
  /** @type {HTMLElement | null} */
  let root = null;
  /** @type {(() => void) | null} */
  let unsubscribe = null;
  let initialized = false;
  /** @type {{anchor: HTMLElement, commandId: string, index: number, binding: any | null} | null} */
  let recording = null;

  /** @param {string} id */
  function element(id) {
    return /** @type {HTMLElement | null} */ (document.getElementById(id));
  }

  /** @param {string} message @param {"info" | "warning" | "error"} [kind] */
  function setStatus(message, kind = "info") {
    const status = element("keyboardShortcutsStatus");
    if (!status) return;
    status.textContent = message;
    status.setAttribute("data-kind", kind);
  }

  /**
   * @param {import("../application/commandService.mjs").ShortcutEditResult} result
   * @param {string} durableMessage
   * @param {string} sessionMessage
   * @param {string} rejectedMessage
   */
  function showEditOutcome(result, durableMessage, sessionMessage, rejectedMessage) {
    if (result.status === "rejected") {
      setStatus(rejectedMessage, "error");
      return false;
    }
    if (result.status === "session-only") {
      setStatus(sessionMessage, "warning");
      return true;
    }
    if (!result.applied) {
      setStatus(durableMessage);
      return true;
    }
    setStatus(durableMessage);
    return true;
  }

  /** @param {string} tag @param {string} [className] @param {string} [text] */
  function createElement(tag, className = "", text = "") {
    const created = document.createElement(tag);
    if (className) created.className = className;
    if (text) created.textContent = text;
    return created;
  }

  /** @param {HTMLElement} target @param {string} action @param {string} commandId */
  function setAction(target, action, commandId) {
    target.dataset.action = action;
    target.dataset.commandId = commandId;
  }

  /** @param {ShortcutConflict} conflict */
  function conflictLabel(conflict) {
    const context = conflict.contextLabel ? ` (${conflict.contextLabel})` : "";
    const layout = conflict.layoutDependent ? " depending on keyboard layout" : "";
    if (conflict.type === "layout-unknown") {
      return "Keyboard-layout metadata is unavailable; re-record this shortcut to verify conflicts";
    }
    if (conflict.type === "layout-possible") {
      return `May conflict with ${conflict.title}${layout}${context}; re-record to verify`;
    }
    if (conflict.type === "hard") {
      if (conflict.precedence === "new") return `Conflicts with ${conflict.title}${layout}${context}; that command is shadowed`;
      if (conflict.precedence === "existing") return `Conflicts with ${conflict.title}${layout}${context}; this command is shadowed`;
      return `Conflicts with ${conflict.title}${layout}${context}; neither command wins`;
    }
    if (conflict.type === "prefix") return `Sequence overlaps ${conflict.title}${layout}${context}`;
    if (conflict.type === "reserved") return "May be reserved by the browser or operating system";
    return `Also used by ${conflict.title}${layout}${context}`;
  }

  /** @param {ShortcutSummary} summary @param {string} query */
  function commandMatches(summary, query) {
    if (!query) return true;
    const haystack = [
      summary.category,
      summary.contextLabel,
      summary.id,
      summary.title,
      ...summary.bindings.map((binding) => commands.formatBinding(binding)),
    ].join(" ").toLocaleLowerCase();
    return haystack.includes(query);
  }

  const functionOrder = [
    "Text Tools",
    "Canvas",
    "Selection",
    "Tile",
    "Palettes",
    "Animation",
    "Edit",
    "View",
    "Screen",
    "Layers",
    "Tiles",
    "Colours",
    "Project",
    "Import",
    "Export",
    "Interface",
    "Settings",
    "Help",
  ];

  /** @param {string} category */
  function functionRank(category) {
    const rank = functionOrder.indexOf(category);
    return rank === -1 ? functionOrder.length : rank;
  }

  /** @param {unknown} value @returns {string[]} */
  function modeValues(value) {
    if (Array.isArray(value)) return value.flatMap(modeValues);
    if (value && typeof value === "object") {
      const condition = /** @type {{anyOf?: unknown[]}} */ (value);
      if (Array.isArray(condition.anyOf)) return condition.anyOf.flatMap(modeValues);
      return [];
    }
    return typeof value === "string" ? [value] : [];
  }

  /** @param {string} mode */
  function modeLabel(mode) {
    if (mode === "2d" || mode === "3d") return "Text / Sprite Editor";
    if (mode === "color palette") return "Colour Palette Editor";
    if (mode === "tile set") return "Tile Set Editor";
    if (["script", "json", "text", "hex"].includes(mode)) return "Code / Data Editors";
    return mode.replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase());
  }

  /** @param {ShortcutSummary} summary */
  function commandScope(summary) {
    if (summary.availableInCurrentMode) return "Current editor";
    const labels = Array.from(new Set(summary.contexts.flatMap((context) =>
      modeValues(context.editorMode).map(modeLabel),
    )));
    return labels.length ? labels.join(" / ") : "Other editor modes";
  }

  /** @param {ShortcutSummary[]} summaries */
  function groupedRows(summaries) {
    const sorted = [...summaries].sort((left, right) => {
      if (left.availableInCurrentMode !== right.availableInCurrentMode) {
        return left.availableInCurrentMode ? -1 : 1;
      }
      const leftScope = commandScope(left);
      const rightScope = commandScope(right);
      if (leftScope !== rightScope) return leftScope.localeCompare(rightScope);
      const rankDifference = functionRank(left.category) - functionRank(right.category);
      if (rankDifference) return rankDifference;
      if (left.category !== right.category) return left.category.localeCompare(right.category);
      if (Boolean(left.bindings.length) !== Boolean(right.bindings.length)) {
        return left.bindings.length ? -1 : 1;
      }
      return left.title.localeCompare(right.title);
    });
    /** @type {HTMLElement[]} */
    const rows = [];
    let groupKey = "";
    for (const summary of sorted) {
      const scope = commandScope(summary);
      const nextGroupKey = `${scope}\u0000${summary.category}`;
      if (nextGroupKey !== groupKey) {
        groupKey = nextGroupKey;
        const groupCommands = sorted.filter((candidate) =>
          commandScope(candidate) === scope && candidate.category === summary.category,
        );
        const boundCount = groupCommands.filter((candidate) => candidate.bindings.length > 0).length;
        const groupRow = createElement("tr", "keyboard-shortcuts-group");
        const heading = createElement("th", "keyboard-shortcuts-group-heading");
        heading.setAttribute("colspan", "6");
        heading.setAttribute("scope", "rowgroup");
        heading.appendChild(createElement("span", "keyboard-shortcuts-group-scope", scope));
        heading.appendChild(createElement("span", "keyboard-shortcuts-group-function", summary.category));
        heading.appendChild(createElement(
          "span",
          "keyboard-shortcuts-group-count",
          `${groupCommands.length} command${groupCommands.length === 1 ? "" : "s"} · ${boundCount} bound`,
        ));
        groupRow.appendChild(heading);
        rows.push(groupRow);
      }
      rows.push(createCommandRow(summary));
    }
    return rows;
  }

  /** @param {ShortcutSummary} summary */
  function createCommandRow(summary) {
    const row = createElement("tr", "keyboard-shortcuts-row");
    row.dataset.commandId = summary.id;
    if (summary.modified) row.classList.add("keyboard-shortcuts-row-modified");
    if (summary.conflicts.some((conflict) =>
      ["hard", "layout-possible", "layout-unknown", "prefix"].includes(conflict.type))) {
      row.classList.add("keyboard-shortcuts-row-conflict");
    }

    const commandCell = createElement("th", "keyboard-shortcuts-command");
    commandCell.setAttribute("scope", "row");
    commandCell.appendChild(createElement("div", "keyboard-shortcuts-command-title", summary.title));
    commandCell.appendChild(createElement("div", "keyboard-shortcuts-command-category", summary.category));
    commandCell.appendChild(createElement("div", "keyboard-shortcuts-command-id", summary.id));
    row.appendChild(commandCell);

    const bindingsCell = createElement("td", "keyboard-shortcuts-bindings");
    const bindingLabel = summary.bindings.length
      ? summary.bindings.map((binding) => commands.formatBinding(binding)).join(" / ")
      : "Assign";
    const edit = /** @type {HTMLButtonElement} */ (createElement(
      "button",
      `keyboard-shortcuts-binding${summary.bindings.length ? "" : " keyboard-shortcuts-binding-unassigned"}`,
      bindingLabel,
    ));
    edit.type = "button";
    edit.title = `${summary.bindings.length ? "Change" : "Assign"} ${summary.title} shortcut`;
    edit.setAttribute("aria-label", `${summary.bindings.length ? "Change" : "Assign"} ${summary.title} shortcut${
      summary.bindings.length ? ` ${bindingLabel}` : ""
    }`);
    edit.dataset.index = "0";
    setAction(edit, "change", summary.id);
    bindingsCell.appendChild(edit);
    row.appendChild(bindingsCell);

    row.appendChild(createElement("td", "keyboard-shortcuts-context", summary.contextLabel));
    row.appendChild(createElement("td", "keyboard-shortcuts-source", summary.source));

    const warningCell = createElement("td", "keyboard-shortcuts-warning");
    if (summary.conflicts.length) {
      const actionable = summary.conflicts.some((conflict) => conflict.type !== "context-separated");
      const warning = createElement(
        "span",
        actionable ? "keyboard-shortcuts-warning-badge" : "keyboard-shortcuts-reuse-badge",
        actionable ? "!" : "↔",
      );
      warning.title = summary.conflicts.map(conflictLabel).join("\n");
      warning.setAttribute("aria-label", warning.title);
      warningCell.appendChild(warning);
    }
    row.appendChild(warningCell);

    const actions = createElement("td", "keyboard-shortcuts-actions");
    const clear = /** @type {HTMLButtonElement} */ (createElement("button", "ui-button keyboard-shortcuts-action", "Clear"));
    clear.type = "button";
    clear.disabled = summary.bindings.length === 0;
    clear.title = `Clear the shortcut for ${summary.title}`;
    setAction(clear, "clear", summary.id);
    actions.appendChild(clear);

    const reset = /** @type {HTMLButtonElement} */ (createElement("button", "ui-button keyboard-shortcuts-action", "Reset"));
    reset.type = "button";
    reset.disabled = !summary.modified;
    reset.title = `Restore the default shortcuts for ${summary.title}`;
    setAction(reset, "reset", summary.id);
    actions.appendChild(reset);
    row.appendChild(actions);
    return row;
  }

  function render() {
    if (!root) return;
    const search = /** @type {HTMLInputElement | null} */ (element("keyboardShortcutsSearch"));
    const modifiedOnly = /** @type {HTMLInputElement | null} */ (element("keyboardShortcutsModifiedOnly"));
    const boundOnly = /** @type {HTMLInputElement | null} */ (element("keyboardShortcutsBoundOnly"));
    const conflictsOnly = /** @type {HTMLInputElement | null} */ (element("keyboardShortcutsConflictsOnly"));
    const query = String(search?.value || "").trim().toLocaleLowerCase();
    const allCommands = commands.getCommands();
    const summaries = allCommands.filter((summary) => {
      if (modifiedOnly?.checked && !summary.modified) return false;
      if (boundOnly?.checked && summary.bindings.length === 0) return false;
      if (conflictsOnly?.checked && !summary.conflicts.some((conflict) =>
        ["hard", "layout-possible", "layout-unknown", "prefix", "reserved"].includes(conflict.type))) return false;
      return commandMatches(summary, query);
    });
    const body = element("keyboardShortcutsTableBody");
    if (!body) return;
    body.replaceChildren(...groupedRows(summaries));
    if (recording && !recording.anchor.isConnected) cancelRecording(false);
    const count = element("keyboardShortcutsCount");
    if (count) count.textContent = `${summaries.length} of ${allCommands.length} commands`;
  }

  /** @param {HTMLElement} anchor */
  function positionRecorder(anchor) {
    const panel = element("keyboardShortcutsRecorder");
    if (!root || !panel || panel.hidden || !anchor.isConnected) return;
    const margin = 10;
    panel.style.left = `${margin}px`;
    panel.style.top = `${margin}px`;
    panel.style.visibility = "hidden";
    const rootRect = root.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const preferredLeft = anchorRect.left - rootRect.left +
      ((anchorRect.width - panelRect.width) / 2);
    const maxLeft = Math.max(margin, rootRect.width - panelRect.width - margin);
    const left = Math.min(maxLeft, Math.max(margin, preferredLeft));
    const below = anchorRect.bottom - rootRect.top + 8;
    const above = anchorRect.top - rootRect.top - panelRect.height - 8;
    const top = below + panelRect.height <= rootRect.height - margin
      ? below
      : Math.max(margin, above);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.visibility = "visible";
  }

  function positionActiveRecorder() {
    if (!recording) return;
    if (!recording.anchor.isConnected) {
      cancelRecording(false);
      return;
    }
    positionRecorder(recording.anchor);
  }

  /** @param {boolean} [restoreFocus] */
  function cancelRecording(restoreFocus = true) {
    const commandId = recording?.commandId || "";
    commands.setRecording(false);
    recording = null;
    const panel = element("keyboardShortcutsRecorder");
    if (panel) panel.hidden = true;
    const conflictActions = element("keyboardShortcutsConflictActions");
    if (conflictActions) conflictActions.hidden = true;
    if (restoreFocus && commandId) {
      setTimer(() => {
        const action = root?.querySelector(`[data-command-id="${commandId}"][data-action]`);
        if (action && typeof /** @type {{focus?: unknown}} */ (action).focus === "function") {
          /** @type {HTMLElement} */ (action).focus();
        }
      }, 0);
    }
  }

  function resetRecordingCapture() {
    if (!recording) return;
    recording.binding = null;
    const display = element("keyboardShortcutsRecorderDisplay");
    const message = element("keyboardShortcutsRecorderMessage");
    const conflictActions = element("keyboardShortcutsConflictActions");
    if (display) display.textContent = "Press a shortcut";
    if (message) message.textContent = "Escape cancels. Delete and Backspace can be assigned normally.";
    if (conflictActions) conflictActions.hidden = true;
    setStatus("");
  }

  /** @param {string} commandId @param {number} index @param {HTMLElement} anchor */
  function startRecording(commandId, index, anchor) {
    const summary = commands.getCommands().find((candidate) => candidate.id === commandId);
    if (!summary) return;
    recording = { anchor, commandId, index, binding: null };
    commands.setRecording(true);
    const panel = element("keyboardShortcutsRecorder");
    const title = element("keyboardShortcutsRecorderTitle");
    if (panel) panel.hidden = false;
    if (title) title.textContent = `${summary.bindings.length ? "Change" : "Assign"} shortcut: ${summary.title}`;
    resetRecordingCapture();
    positionRecorder(anchor);
    const capture = /** @type {HTMLButtonElement | null} */ (element("keyboardShortcutsRecorderCapture"));
    capture?.focus({ preventScroll: true });
  }

  /** @param {"normal" | "replace" | "precedence"} behavior */
  function commitRecording(behavior) {
    if (!recording?.binding) return;
    const commandId = recording.commandId;
    const binding = recording.binding;
    const analysis = commands.analyzeBinding(commandId, binding);
    const result = commands.editBindings({
      binding,
      commandId,
      replaceConflicts: behavior === "replace",
      takePrecedence: behavior === "precedence",
      type: "assign",
    });
    if (result.status === "rejected") {
      setStatus("Shortcut could not be changed.", "error");
      return;
    }
    const savedBinding = commands.getEffectiveBindings(commandId)[0];
    const remainingHardConflicts = behavior === "precedence" && savedBinding
      ? commands.analyzeBinding(commandId, savedBinding).filter((conflict) => conflict.type === "hard")
      : [];
    cancelRecording();
    const reserved = analysis.some((conflict) => conflict.type === "reserved");
    const layoutPossible = analysis.some((conflict) => conflict.type === "layout-possible");
    const layoutUnknown = analysis.some((conflict) => conflict.type === "layout-unknown");
    const prefix = analysis.some((conflict) => conflict.type === "prefix");
    const contextReuse = analysis.some((conflict) => conflict.type === "context-separated");
    const remainsShadowed = remainingHardConflicts.some((conflict) => conflict.precedence === "existing");
    const hasUnresolved = remainingHardConflicts.some((conflict) => conflict.precedence === "unresolved");
    const durable = result.status === "durable";
    let status = durable
      ? "Shortcut saved."
      : "Shortcut applied for this session, but could not be saved.";
    /** @type {"info" | "warning" | "error"} */
    let statusKind = durable ? "info" : "warning";
    if (remainsShadowed) {
      status += " A more specific command still takes precedence in its context.";
      statusKind = "warning";
    } else if (hasUnresolved) {
      status += " Part of the conflict is still unresolved.";
      statusKind = "warning";
    } else if (layoutPossible || layoutUnknown) {
      status += " A possible keyboard-layout conflict could not be verified. Re-record it to verify conflicts.";
      statusKind = "warning";
    } else if (reserved) {
      status += " It may be intercepted by the browser or operating system.";
      statusKind = "warning";
    } else if (prefix) {
      status += " It overlaps the start of another shortcut sequence.";
      statusKind = "warning";
    } else if (contextReuse) {
      status += " The same key is used in a separate context.";
    }
    setStatus(status, statusKind);
    render();
  }

  /** @param {KeyboardEvent} event */
  function recordKey(event) {
    if (!recording) return;
    const currentRecording = recording;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      cancelRecording();
      setStatus("Shortcut recording cancelled.");
      return;
    }
    resetRecordingCapture();
    const physical = /** @type {HTMLInputElement | null} */ (element("keyboardShortcutsPhysicalKey"));
    const binding = commands.bindingFromEvent(event, { physical: physical?.checked === true });
    const display = element("keyboardShortcutsRecorderDisplay");
    const message = element("keyboardShortcutsRecorderMessage");
    if (!binding) {
      const modifiers = commands.formatActiveModifiers(event);
      if (display && modifiers) display.textContent = modifiers;
      return;
    }
    currentRecording.binding = binding;
    if (display) display.textContent = commands.formatBinding(binding);
    const analysis = commands.analyzeBinding(currentRecording.commandId, binding).filter((conflict) => {
      return conflict.type !== "duplicate" || conflict.commandId !== currentRecording.commandId;
    });
    const hard = analysis.filter((conflict) => conflict.type === "hard");
    if (!hard.length) {
      commitRecording("normal");
      return;
    }
    if (message) {
      message.textContent = `${hard.map(conflictLabel).join(". ")}. ` +
        "Replace removes those bindings; Keep Both preserves them and uses the displayed precedence.";
    }
    const conflictActions = element("keyboardShortcutsConflictActions");
    if (conflictActions) conflictActions.hidden = false;
    positionActiveRecorder();
    const replace = /** @type {HTMLButtonElement | null} */ (element("keyboardShortcutsReplaceConflicts"));
    replace?.focus({ preventScroll: true });
  }

  /** @param {MouseEvent} event */
  function handleClick(event) {
    const eventTarget = /** @type {{closest?: (selector: string) => unknown}} */ (event.target);
    const closest = typeof eventTarget?.closest === "function"
      ? eventTarget.closest("[data-action]")
      : null;
    if (!closest || typeof closest !== "object" || !("dataset" in closest)) return;
    const target = /** @type {HTMLElement} */ (closest);
    const action = target.dataset.action;
    const commandId = target.dataset.commandId || "";
    const index = Number(target.dataset.index ?? -1);
    if (action === "change") {
      startRecording(commandId, index, target);
    } else if (action === "clear") {
      showEditOutcome(
        commands.unbindCommand(commandId),
        "Shortcut cleared and saved.",
        "Shortcut cleared for this session, but could not be saved.",
        "Shortcut could not be cleared.",
      );
    } else if (action === "reset") {
      showEditOutcome(
        commands.resetCommand(commandId),
        "Default shortcut restored and saved.",
        "Default shortcut restored for this session, but could not be saved.",
        "Default shortcut could not be restored.",
      );
    } else if (action === "cancel-recording") {
      cancelRecording();
      setStatus("Shortcut recording cancelled.");
    } else if (action === "replace-conflicts") {
      commitRecording("replace");
    } else if (action === "keep-conflicts") {
      commitRecording("precedence");
    } else if (action === "reset-all") {
      if (confirmAction("Reset all keyboard shortcuts to their defaults?")) {
        const result = commands.resetAll();
        showEditOutcome(
          result,
          result.applied ? "All default shortcuts restored and saved." : "All shortcuts already use their defaults.",
          "All defaults restored for this session, but could not be saved.",
          "Default shortcuts could not be restored.",
        );
      }
    } else if (action === "export") {
      downloadText("lvllvl-keyboard-shortcuts.json", commands.exportConfiguration());
      setStatus("Keyboard shortcuts exported.");
    } else if (action === "import") {
      const input = /** @type {HTMLInputElement | null} */ (element("keyboardShortcutsImportFile"));
      input?.click();
    }
  }

  /** @param {Event} event */
  async function importFile(event) {
    const input = /** @type {HTMLInputElement} */ (event.currentTarget);
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = commands.importConfiguration(await file.text());
      if (!showEditOutcome(
        result,
        result.applied ? "Keyboard shortcuts imported and saved." : "Keyboard shortcuts already match the import.",
        "Keyboard shortcuts imported for this session, but could not be saved.",
        "Could not import shortcuts: the file is not valid.",
      )) {
        reportError("import keyboard shortcuts", result.error);
      }
      render();
    } catch (error) {
      setStatus("Could not import shortcuts: the file is not valid.", "error");
      reportError("import keyboard shortcuts", error);
    } finally {
      input.value = "";
    }
  }

  /** @param {KeyboardEvent} event */
  function handleRecordingKeyDown(event) {
    const target = /** @type {{closest?: (selector: string) => unknown, id?: string}} */ (event.target);
    const isRecorderAction = typeof target?.closest === "function" &&
      target.closest("#keyboardShortcutsRecorder [data-action]") !== null;
    const plainEscape = event.key === "Escape" &&
      !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (recording && (plainEscape || (!isRecorderAction && target?.id !== "keyboardShortcutsPhysicalKey"))) {
      recordKey(event);
    }
  }

  function bindEvents() {
    if (!root || initialized) return;
    initialized = true;
    root.addEventListener("click", handleClick);
    root.addEventListener("keydown", (event) => {
      if (!recording) return;
      const target = /** @type {{closest?: (selector: string) => unknown, id?: string}} */ (event.target);
      const isRecorderControl = target?.id === "keyboardShortcutsPhysicalKey" ||
        (typeof target?.closest === "function" &&
          target.closest("#keyboardShortcutsRecorder [data-action]") !== null);
      if (isRecorderControl) event.stopPropagation();
    });
    element("keyboardShortcutsSearch")?.addEventListener("input", render);
    element("keyboardShortcutsModifiedOnly")?.addEventListener("change", render);
    element("keyboardShortcutsBoundOnly")?.addEventListener("change", render);
    element("keyboardShortcutsConflictsOnly")?.addEventListener("change", render);
    element("keyboardShortcutsTableHolder")?.addEventListener("scroll", positionActiveRecorder, { passive: true });
    document.defaultView?.addEventListener("resize", positionActiveRecorder);
    document.addEventListener("keydown", handleRecordingKeyDown, true);
    element("keyboardShortcutsPhysicalKey")?.addEventListener("change", () => {
      resetRecordingCapture();
      const capture = /** @type {HTMLButtonElement | null} */ (element("keyboardShortcutsRecorderCapture"));
      capture?.focus({ preventScroll: true });
    });
    element("keyboardShortcutsImportFile")?.addEventListener("change", (event) => {
      void importFile(event);
    });
    unsubscribe = commands.onDidChange(render);
  }

  function createDialog() {
    dialog = UI.create("UI.Dialog", {
      height: 620,
      id: "keyboardShortcutsDialog",
      maxHeight: 760,
      maxWidth: 1100,
      title: "Keyboard Shortcuts",
      width: 980,
    });
    htmlPanel = UI.create("UI.HTMLPanel", { id: "keyboardShortcutsPanel" });
    dialog.add(htmlPanel);
    const close = UI.create("UI.Button", { color: "primary", text: "Close" });
    close.on("click", () => UI.closeDialog(dialog));
    dialog.addButton(close);
    dialog.on("close", () => {
      cancelRecording(false);
    });
    htmlPanel.load("html/keyboardShortcuts.html", () => {
      root = element("keyboardShortcutsRoot");
      bindEvents();
      render();
      setTimer(() => {
        const search = /** @type {HTMLInputElement | null} */ (element("keyboardShortcutsSearch"));
        search?.focus();
      }, 0);
    });
  }

  return Object.freeze({
    dispose() {
      cancelRecording(false);
      document.removeEventListener("keydown", handleRecordingKeyDown, true);
      element("keyboardShortcutsTableHolder")?.removeEventListener("scroll", positionActiveRecorder);
      document.defaultView?.removeEventListener("resize", positionActiveRecorder);
      unsubscribe?.();
      unsubscribe = null;
    },
    show() {
      if (!dialog) createDialog();
      UI.showDialog(dialog);
      render();
      setTimer(() => {
        const search = /** @type {HTMLInputElement | null} */ (element("keyboardShortcutsSearch"));
        search?.focus();
      }, 0);
    },
  });
}
