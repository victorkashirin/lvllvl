import { oklchToRgb, rgbToOklch } from "../domain/oklch.mjs";

/**
 * Shared, keyboard-accessible controls for the panel and palette dialog.
 * @param {{root: HTMLElement, onChange: (rgb: number) => void}} options
 */
export function createOklchColorControl({ root, onChange }) {
  const document = root.ownerDocument;
  let color = rgbToOklch(0);
  let currentRgb = 0;
  const components = /** @type {const} */ ([
    { key: "l", label: "L", name: "Lightness (%)", max: 100, step: 0.1, digits: 1 },
    { key: "c", label: "C", name: "Chroma", max: 0.4, step: 0.001, digits: 3 },
    { key: "h", label: "H", name: "Hue (degrees)", max: 360, step: 0.1, digits: 1 },
  ]);
  const controls = components.map((component) => {
    const row = document.createElement("div");
    row.className = "colorComponentSelector oklchComponentSelector";
    const label = document.createElement("label");
    label.textContent = component.label;
    label.title = component.name;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "oklchSlider";
    const track = document.createElement("div");
    track.className = "oklchTrack";
    const caret = document.createElement("span");
    caret.className = "oklchCaret";
    caret.setAttribute("aria-hidden", "true");
    track.append(slider, caret);
    const number = document.createElement("input");
    number.type = "number";
    number.className = "oklchNumber";
    number.id = `${root.id}-${component.key}`;
    slider.id = `${number.id}-slider`;
    label.htmlFor = number.id;
    for (const input of [slider, number]) {
      input.min = "0";
      input.max = String(component.max);
      input.step = String(component.step);
      input.setAttribute("aria-label", component.name);
      input.addEventListener("input", () => {
        if (!Number.isFinite(input.valueAsNumber)) return;
        const clamped = Math.min(component.max, Math.max(0, input.valueAsNumber));
        color[component.key] = Number(clamped.toFixed(component.digits));
        currentRgb = oklchToRgb(color);
        render();
        onChange(currentRgb);
      });
      input.addEventListener("change", () => render(true));
    }
    row.append(label, track, number);
    root.append(row);
    return { component, slider, number, caret };
  });
  const hint = document.createElement("div");
  hint.className = "oklchGamutHint";
  hint.textContent = "Colors outside sRGB use reduced chroma.";
  root.append(hint);

  function render(commit = false) {
    for (const { component, slider, number, caret } of controls) {
      const value = String(Number(color[component.key].toFixed(component.digits)));
      slider.value = value;
      caret.style.left = `${Number(slider.value) / component.max * 100}%`;
      // Preserve incomplete decimal input until the user commits the field.
      if (commit || document.activeElement !== number) number.value = value;
      const stops = [];
      for (let i = 0; i <= 40; i++) {
        const rgb = oklchToRgb({ ...color, [component.key]: component.max * i / 40 });
        stops.push(`#${rgb.toString(16).padStart(6, "0")} ${i * 2.5}%`);
      }
      slider.style.backgroundImage = `linear-gradient(to right, ${stops.join(",")})`;
    }
  }

  render();
  return {
    /** @param {number} rgb */
    setRgb(rgb) {
      // Retain the user's hue/chroma across quantization and achromatic colors.
      // A different RGB selection, hex edit, or RGB/HSV edit resynchronizes it.
      if (rgb === currentRgb) return;
      currentRgb = rgb;
      color = rgbToOklch(rgb);
      render(true);
    },
    reset() {
      currentRgb = 0;
      color = rgbToOklch(0);
      render(true);
    },
  };
}
