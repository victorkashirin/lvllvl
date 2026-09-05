const importCapabilities = /** @type {Readonly<Record<string, readonly string[]>>} */ (Object.freeze({
  assembly: ["grid"],
  c: [
    "colorPaletteManager", "frames", "graphic", "gridView2d", "layers",
    "tileSetManager",
  ],
  "c64-formats": [
    "colorPaletteManager", "currentTile", "frames", "graphic", "grid", "gridView2d",
    "history", "layers", "setColorPerMode", "setScreenMode", "tileSetManager", "tools",
  ],
  "c64-sprite-formats": [
    "colorPaletteManager", "frames", "graphic", "history", "layers", "spriteFrames",
  ],
  charpad: [
    "colorPaletteManager", "currentTile", "graphic", "gridView2d", "history", "layers",
    "sideBlockPalette", "sideTilePalette", "tileSetManager", "tools",
  ],
  image: [
    "charsImageData", "checkerboardPattern", "chooseCharactersDialog", "chooseColorsDialog",
    "colorPaletteManager", "colorPickerPopupMenu", "currentTile", "currentTileSetID", "frames",
    "getC64ECMColor", "getColorPerMode", "getHasTileFlip", "getHasTileRotate",
    "getScreenMode", "graphic", "grid", "history", "layers", "petscii",
    "setBackgroundColor", "setBorderColor", "setC64ECMColor", "setC64Multi1Color",
    "setC64Multi2Color", "setValue", "showTileEditor", "tileEditor", "tileEditorMobile",
    "tileSetManager", "tileSets", "tools", "updateBackgroundColorPicker",
  ],
  spr: ["colorPaletteManager", "graphic", "history", "layers"],
  "sprite-image": [
    "colorPaletteManager", "currentTile", "frames", "graphic", "history", "layers",
    "spriteFrames",
  ],
  spritepad: ["colorPaletteManager", "graphic", "history", "layers"],
}));

const exportCapabilities = /** @type {Readonly<Record<string, readonly string[]>>} */ (Object.freeze({
  "3d-gif": ["frames", "graphic", "grid3d", "gridView3d", "tileSetManager"],
  binary: ["colorPaletteManager", "frames", "graphic", "layers", "tileSetManager"],
  "c64-assembly": [
    "blockSetManager", "colorPaletteManager", "currentTileSetID", "frames",
    "getBlockModeEnabled", "getColorPerMode", "getScreenMode", "graphic", "grid", "layers",
    "tileSetManager", "tileSets", "tools",
  ],
  "c64-dialog": [
    "bgInPrevLayer", "colorPaletteManager", "currentTile", "frames", "getScreenMode", "getTileSet",
    "graphic", "layers", "tileSetManager", "tileSets", "toPrgAdv",
  ],
  "c64-sprite-assembly": [
    "getBlockModeEnabled", "getColorPerMode", "getScreenMode", "graphic", "layers",
  ],
  charpad: [
    "currentTile", "getBlockModeEnabled", "getColorPerMode", "getScreenMode", "graphic", "layers",
  ],
  "frame-image": ["colorPaletteManager", "graphic", "grid", "layers"],
  gif: [
    "animationTools", "colorPaletteManager", "exportFrameImage", "frames", "graphic", "layers",
    "tileSetManager",
  ],
  "gif-mobile": [
    "animationTools", "colorPaletteManager", "exportFrameImage", "frames", "graphic", "layers",
    "tileSetManager",
  ],
  image: [
    "checkerboardPattern", "colorPaletteManager", "exportFrameImage", "frames", "graphic",
    "tileSetManager",
  ],
  json: [
    "colorPaletteManager", "currentTile", "frames", "getBlockModeEnabled", "getColorPerMode",
    "getScreenMode", "graphic", "layers", "tileSetManager",
  ],
  "mega65-assembly": [
    "blockSetManager", "colorPaletteManager", "currentTileSetID", "frames",
    "getBlockModeEnabled", "getColorPerMode", "getScreenMode", "graphic", "grid", "layers",
    "tileSetManager", "tileSets",
  ],
  obj: ["grid3d"],
  pet: ["graphic", "layers"],
  "petscii-c": ["graphic", "layers"],
  png: ["colorPaletteManager", "exportFrameImage", "frames", "graphic", "tileSetManager"],
  "png-mobile": [
    "colorPaletteManager", "exportFrameImage", "graphic", "grid", "layers", "tileSetManager",
  ],
  seq: ["frames", "graphic", "layers"],
  "sprite-binary": ["graphic", "layers"],
  "sprite-pad": [
    "currentTile", "getBlockModeEnabled", "getColorPerMode", "getScreenMode", "graphic", "layers",
  ],
  "sprite-png": ["checkerboardPattern", "frames", "graphic", "layers"],
  text: ["graphic", "layers"],
  "to-prg": [
    "bgInPrevLayer", "colorPaletteManager", "currentTile", "frames", "getScreenMode", "getTileSet",
    "graphic", "layers", "tileSetManager", "tileSets", "toPrg", "toPrgAdv",
  ],
  "to-prg-advanced": [
    "baseCodeEditor", "bgInPrevLayer", "colorPaletteManager", "colorPickerPopupMenu", "frames",
    "getTileSet", "graphic", "grid", "layers", "petscii", "saveLayout", "setLayoutType",
    "tileSetManager", "tileSets", "tools",
  ],
  vox: ["frames", "grid3d", "tileSetManager"],
  "x16-assembly": [
    "blockSetManager", "colorPaletteManager", "currentTileSetID", "getBlockModeEnabled",
    "getColorPerMode", "getScreenMode", "graphic", "layers", "tileSetManager", "tileSets",
  ],
  "x16-basic": ["colorPaletteManager", "layers", "tileSetManager"],
}));

const blockedBackReferences = new Set(["app", "editor", "g_app"]);

/**
 * Wrap objects crossing the compatibility boundary. The membrane preserves the
 * legacy method receiver, recursively wraps returned model objects, and hides
 * common application backreferences so a declared manager cannot become an
 * escape hatch back to the complete editor.
 *
 * @param {boolean} readOnly
 * @param {object} blockedRoot
 */
function capabilityMembrane(readOnly, blockedRoot) {
  const proxies = new WeakMap();
  const targets = new WeakMap();
  const methodsByTarget = new WeakMap();

  /** @param {any} value */
  function unwrap(value) {
    return targets.get(value) ?? value;
  }

  /** @param {any} value */
  function wrap(value) {
    if (value === blockedRoot) return undefined;
    if (typeof value !== "object" || value === null) return value;
    // DOM, media, typed-array, and other platform objects have branded methods
    // that reject Proxy receivers. They are resources rather than application
    // containers, so pass them through unchanged.
    const tag = Object.prototype.toString.call(value);
    if (tag !== "[object Object]" && tag !== "[object Array]") return value;
    if (proxies.has(value)) return proxies.get(value);

    const proxy = new Proxy(value, {
      defineProperty(target, property, descriptor) {
        if (readOnly) throw new TypeError("Export document ports are read-only");
        return Reflect.defineProperty(target, property, descriptor);
      },
      deleteProperty(target, property) {
        if (readOnly) throw new TypeError("Export document ports are read-only");
        return Reflect.deleteProperty(target, property);
      },
      get(target, property) {
        if (typeof property === "string" && blockedBackReferences.has(property)) {
          return undefined;
        }
        const item = Reflect.get(target, property, target);
        if (typeof item !== "function") return wrap(item);
        let targetMethods = methodsByTarget.get(target);
        if (!targetMethods) {
          targetMethods = new WeakMap();
          methodsByTarget.set(target, targetMethods);
        }
        let wrappedMethod = targetMethods.get(item);
        if (!wrappedMethod) {
          /** @param {...any} args */
          wrappedMethod = (...args) => wrap(Reflect.apply(item, target, args.map(unwrap)));
          targetMethods.set(item, wrappedMethod);
        }
        return wrappedMethod;
      },
      getOwnPropertyDescriptor(target, property) {
        if (typeof property === "string" && blockedBackReferences.has(property)) {
          return undefined;
        }
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
        if (!descriptor || descriptor.configurable === false) return descriptor;
        const wrappedDescriptor = { ...descriptor };
        if ("value" in descriptor) {
          wrappedDescriptor.value = wrap(descriptor.value);
          if (readOnly) wrappedDescriptor.writable = false;
        } else {
          const getter = descriptor.get;
          const setter = descriptor.set;
          if (getter) {
            wrappedDescriptor.get = () => wrap(Reflect.apply(getter, target, []));
          }
          if (readOnly) {
            wrappedDescriptor.set = undefined;
          } else if (setter) {
            wrappedDescriptor.set = (item) => Reflect.apply(setter, target, [unwrap(item)]);
          }
        }
        return wrappedDescriptor;
      },
      has(target, property) {
        if (typeof property === "string" && blockedBackReferences.has(property)) {
          return false;
        }
        return Reflect.has(target, property);
      },
      ownKeys(target) {
        return Reflect.ownKeys(target).filter((property) =>
          typeof property !== "string" || !blockedBackReferences.has(property),
        );
      },
      preventExtensions(target) {
        if (readOnly) throw new TypeError("Export document ports are read-only");
        return Reflect.preventExtensions(target);
      },
      set(target, property, item) {
        if (readOnly) throw new TypeError("Export document ports are read-only");
        return Reflect.set(target, property, unwrap(item), target);
      },
      setPrototypeOf(target, prototype) {
        if (readOnly) throw new TypeError("Export document ports are read-only");
        return Reflect.setPrototypeOf(target, prototype);
      },
    });
    proxies.set(value, proxy);
    targets.set(proxy, value);
    return proxy;
  }

  return Object.freeze({ unwrap, wrap });
}

/**
 * Create a frozen, named capability view. Functions are bound to the source so
 * legacy controllers cannot recover the mutable editor via their receiver.
 *
 * @param {object} source
 * @param {readonly string[]} names
 * @param {string} label
 * @param {{ readOnly?: boolean }} [options]
 */
function capabilityView(source, names, label, { readOnly = false } = {}) {
  if (!source || typeof source !== "object") {
    throw new TypeError(`${label} requires an editor context`);
  }
  /** @type {Record<string, any>} */
  const view = {};
  const values = /** @type {Record<string, any>} */ (source);
  const { unwrap, wrap } = capabilityMembrane(readOnly, source);
  for (const name of names) {
    const value = values[name];
    if (typeof value === "function") {
      /** @param {...any} args */
      const invoke = (...args) => wrap(Reflect.apply(value, source, args.map(unwrap)));
      Object.defineProperty(view, name, {
        configurable: false,
        enumerable: true,
        value: invoke,
        writable: false,
      });
    } else {
      Object.defineProperty(view, name, {
        configurable: false,
        enumerable: true,
        get: () => wrap(values[name]),
      });
    }
  }
  return Object.freeze(view);
}

/**
 * The import side is intentionally write-capable, but only through the
 * operations named for its format family.
 *
 * @param {string} format
 * @param {object} editor
 */
export function createLegacyImportDestination(format, editor) {
  const capabilities = importCapabilities[format];
  if (!capabilities) throw new Error(`Unknown legacy importer: ${format}`);
  return capabilityView(editor, capabilities, `Importer ${format}`);
}

/**
 * Compatibility port for stateful classic export controllers. This is
 * deliberately not called a snapshot: converted encoders receive data-only
 * snapshots through ImportExportService, while remaining controllers receive a
 * read-only membrane over only their declared document capabilities.
 *
 * @param {string} format
 * @param {object} editor
 */
export function createLegacyExportDocumentPort(format, editor) {
  const capabilities = exportCapabilities[format];
  if (!capabilities) throw new Error(`Unknown legacy exporter: ${format}`);
  return capabilityView(editor, capabilities, `Exporter ${format}`, { readOnly: true });
}

/**
 * @param {{
 *   constructors: Record<string, new () => any>,
 *   host: object,
 *   ports?: Record<string, (editor: object) => object>,
 * }} dependencies
 */
export function createLegacyImportExportAdapter({ constructors, host, ports = {} }) {
  if (!constructors || typeof constructors !== "object" || !host || typeof host !== "object") {
    throw new TypeError("Legacy import/export controllers require constructors and a host port");
  }

  /** @param {string} format @param {object} editor @param {"import" | "export"} kind */
  function create(format, editor, kind) {
    const Controller = constructors[`${kind}:${format}`];
    if (typeof Controller !== "function") {
      throw new Error(`Legacy ${kind} controller is not registered: ${format}`);
    }
    const controller = new Controller();
    if (typeof controller.init !== "function") {
      throw new Error(`Legacy ${kind} controller has no init method: ${format}`);
    }
    const portFactory = ports[`${kind}:${format}`];
    const documentPort = portFactory
      ? portFactory(editor)
      : kind === "import"
        ? createLegacyImportDestination(format, editor)
        : createLegacyExportDocumentPort(format, editor);
    controller.init(documentPort, host);
    return controller;
  }

  return Object.freeze({
    /** @param {string} format @param {object} editor */
    createImportController(format, editor) {
      return create(format, editor, "import");
    },
    /** @param {string} format @param {object} editor */
    createExportController(format, editor) {
      return create(format, editor, "export");
    },
    /** @param {string} format @param {object} editor */
    createImportDestination(format, editor) {
      return createLegacyImportDestination(format, editor);
    },
    /** @param {string} format @param {object} editor */
    createExportDocumentPort(format, editor) {
      return createLegacyExportDocumentPort(format, editor);
    },
  });
}

export const legacyImportFormats = Object.freeze(Object.keys(importCapabilities));
export const legacyExportFormats = Object.freeze(Object.keys(exportCapabilities));
