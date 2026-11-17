import { hashString } from './hash';

export type Palette = {
  /** Saturated, readable colour for a star. */
  core: string;
  /** Brighter tint used for the halo. */
  glow: string;
  /** Same hue, softer, for large nebula areas. */
  dim: string;
  /** Deepened tint that reads on warm paper. */
  ink: string;
};

const memory = new Map<string, Palette>();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function fallbackPalette(seed: string): Palette {
  const hue = hashString(seed) % 360;
  return {
    core: `hsl(${hue} 72% 62%)`,
    glow: `hsl(${hue} 92% 78%)`,
    dim: `hsl(${hue} 58% 68%)`,
    ink: `hsl(${hue} 72% 34%)`,
  };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return [0, 0, l];

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return [h * 360, s, l];
}

/** Reads the dominant hue of an already-proxied (same-origin) cover image. */
export function paletteFromImage(url: string): Promise<Palette> {
  const remembered = memory.get(url);
  if (remembered) return Promise.resolve(remembered);

  return new Promise<Palette>((resolve) => {
    const image = new Image();
    const finish = (palette: Palette) => {
      memory.set(url, palette);
      resolve(palette);
    };

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 28;
        canvas.height = 28;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return finish(fallbackPalette(url));

        context.drawImage(image, 0, 0, 28, 28);
        const { data } = context.getImageData(0, 0, 28, 28);
        const buckets = new Array<number>(12).fill(0);
        const samples: Array<{ h: number; s: number; l: number; weight: number }> = [];

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 160) continue;
          const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
          if (s < 0.16 || l < 0.1 || l > 0.94) continue;
          const weight = s * (0.45 + l * 0.55);
          buckets[Math.min(11, Math.floor(h / 30))] += weight;
          samples.push({ h, s, l, weight });
        }

        if (samples.length === 0) return finish(fallbackPalette(url));

        let winningBucket = 0;
        for (let i = 1; i < buckets.length; i += 1) {
          if (buckets[i] > buckets[winningBucket]) winningBucket = i;
        }

        const sectorStart = winningBucket * 30;
        const inSector = samples.filter((sample) => {
          const distance = Math.abs(sample.h - sectorStart);
          return Math.min(distance, 360 - distance) < 32;
        });
        const chosen = inSector.length > 0 ? inSector : samples;
        const weightSum = chosen.reduce((sum, sample) => sum + sample.weight, 0) || 1;
        const hue =
          chosen.reduce((sum, sample) => sum + sample.h * sample.weight, 0) / weightSum;
        const saturation = Math.min(
          88,
          Math.max(48, (chosen.reduce((sum, s) => sum + s.s * s.weight, 0) / weightSum) * 100 + 18),
        );
        const lightness = Math.min(
          76,
          Math.max(60, (chosen.reduce((sum, s) => sum + s.l * s.weight, 0) / weightSum) * 100 + 12),
        );

        const roundedHue = hue.toFixed(0);
        finish({
          core: `hsl(${roundedHue} ${saturation.toFixed(0)}% ${lightness.toFixed(0)}%)`,
          glow: `hsl(${roundedHue} ${Math.min(96, saturation + 12).toFixed(0)}% ${Math.min(
            80,
            lightness + 8,
          ).toFixed(0)}%)`,
          dim: `hsl(${roundedHue} ${Math.max(42, saturation - 16).toFixed(0)}% ${Math.max(
            58,
            lightness - 12,
          ).toFixed(0)}%)`,
          ink: `hsl(${roundedHue} ${Math.min(94, saturation + 8).toFixed(0)}% ${clamp(
            lightness - 30,
            26,
            42,
          ).toFixed(0)}%)`,
        });
      } catch {
        finish(fallbackPalette(url));
      }
    };

    image.onerror = () => finish(fallbackPalette(url));
    image.src = url;
  });
}
