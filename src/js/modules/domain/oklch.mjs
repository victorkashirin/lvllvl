/** @typedef {{l: number, c: number, h: number}} Oklch */

/** @param {number} value @param {number} min @param {number} max */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** @param {number} value */
function linearize(value) {
  value /= 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

// Public-domain Oklab matrices by Björn Ottosson:
// https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
/** @param {number} rgb @returns {Oklch} Lightness in percent, hue in degrees. */
export function rgbToOklch(rgb) {
  const r = linearize((rgb >> 16) & 255);
  const g = linearize((rgb >> 8) & 255);
  const b = linearize(rgb & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const c = Math.hypot(a, labB);
  return {
    l: clamp(lightness * 100, 0, 100),
    c: c < 1e-7 ? 0 : c,
    h: c < 1e-7 ? 0 : (Math.atan2(labB, a) * 180 / Math.PI + 360) % 360,
  };
}

/** @param {Oklch} color */
function toLinearRgb({ l: lightness, c, h }) {
  const a = c * Math.cos(h * Math.PI / 180);
  const b = c * Math.sin(h * Math.PI / 180);
  const L = lightness / 100;
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

/** @param {number[]} channels */
const inGamut = (channels) => channels.every((value) => value >= -1e-7 && value <= 1 + 1e-7);

/**
 * Reduce chroma at constant lightness and hue to fit the palette's sRGB gamut.
 * @param {Oklch} color
 */
export function oklchToRgb(color) {
  if (![color.l, color.c, color.h].every(Number.isFinite)) {
    throw new TypeError("OKLCH components must be finite");
  }
  const normalized = {
    l: clamp(color.l, 0, 100), c: clamp(color.c, 0, 0.4),
    h: ((color.h % 360) + 360) % 360,
  };
  if (normalized.l === 0) return 0;
  if (normalized.l === 100) return 0xffffff;
  let channels = toLinearRgb(normalized);
  if (!inGamut(channels)) {
    let low = 0;
    let high = normalized.c;
    for (let i = 0; i < 20; i++) {
      const c = (low + high) / 2;
      if (inGamut(toLinearRgb({ ...normalized, c }))) low = c;
      else high = c;
    }
    channels = toLinearRgb({ ...normalized, c: low });
  }
  const [r, g, b] = channels.map((value) => {
    value = clamp(value, 0, 1);
    const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255);
  });
  return (r << 16) | (g << 8) | b;
}
