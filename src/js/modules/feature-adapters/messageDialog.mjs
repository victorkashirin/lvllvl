/**
 * Install the application-styled replacement for the browser alert dialog.
 * Messages are queued so calls made together remain visible in order.
 *
 * @param {{document: Document, UI: any, window: any}} dependencies
 */
export function installMessageDialog({ document, UI, window }) {
  /** @type {Array<{message: string, resolve: () => void, title: string}>} */
  const requests = [];
  /** @type {{message: string, resolve: () => void, title: string} | null} */
  let activeRequest = null;
  /** @type {any} */
  let dialog = null;
  /** @type {HTMLElement | null} */
  let messageElement = null;
  /** @type {any} */
  let okButton = null;

  function createDialog() {
    dialog = UI.create("UI.Dialog", {
      id: "messageDialog",
      title: "Notice",
      width: 420,
      height: 168,
    });

    const content = UI.create("UI.HTMLPanel", {
      html: '<div class="ui-message-dialog-message"></div>',
    });
    dialog.add(content);
    const element = /** @type {HTMLElement | null} */ (
      dialog.element.querySelector(".ui-message-dialog-message")
    );
    if (!element) throw new Error("Message dialog content was not created");
    messageElement = element;

    dialog.element.setAttribute("role", "alertdialog");
    element.setAttribute("id", `${dialog.id}-message`);
    dialog.element.setAttribute("aria-describedby", element.id);

    okButton = UI.create("UI.Button", { text: "OK", color: "primary" });
    dialog.addButton(okButton);
    const okElement = document.getElementById(okButton.id);
    okElement?.setAttribute("tabindex", "0");

    okButton.on("click", () => UI.closeDialog(dialog));
    dialog.on("keydown", (/** @type {KeyboardEvent} */ event) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        UI.closeDialog(dialog);
      }
    });
    dialog.on("close", () => {
      if (!activeRequest) return;
      const request = activeRequest;
      activeRequest = null;
      request.resolve();
      window.setTimeout(showNext, 0);
    });
  }

  function showNext() {
    if (activeRequest || requests.length === 0) return;
    if (!document.body) {
      window.setTimeout(showNext, 0);
      return;
    }
    if (!dialog) createDialog();

    activeRequest = requests.shift() ?? null;
    if (!activeRequest || !messageElement) return;
    dialog.setTitle(activeRequest.title);
    messageElement.textContent = activeRequest.message;
    UI.showDialog(dialog);
    document.getElementById(okButton.id)?.focus({ preventScroll: true });
  }

  /**
   * @param {unknown} message
   * @param {{title?: string}} [options]
   * @returns {Promise<void>}
   */
  function showAlert(message, options = {}) {
    return new Promise((resolve) => {
      requests.push({
        message: String(message),
        resolve,
        title: typeof options.title === "string" && options.title !== ""
          ? options.title
          : "Notice",
      });
      showNext();
    });
  }

  UI.alert = showAlert;
  window.alert = (/** @type {unknown} */ message) => {
    showAlert(message).catch((error) => {
      console.error("Could not show the application alert dialog.", error);
    });
  };

  return showAlert;
}
