import { Frame } from "../types";
import sharp from "sharp";

/** 2. Quick histogram diff to filter near-identical frames */
export async function filterFrames(
  frames: Frame[],
  threshold = 0.2
): Promise<Frame[]> {
  const hist = async (f: Frame) => {
    const { data, info } = await sharp(f.path)
      .resize(64, 64)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const bins = new Array(16 * 4 * 4).fill(0);
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i] / 255,
        g = data[i + 1] / 255,
        b = data[i + 2] / 255;
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        d = max - min;
      let h = 0;
      if (d === 0) h = 0;
      else if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
      const s = max === 0 ? 0 : d / max;
      const v = max;
      const hi = Math.min(15, Math.floor(h / 22.5));
      const si = Math.min(3, Math.floor(s * 4));
      const vi = Math.min(3, Math.floor(v * 4));
      bins[hi * (4 * 4) + si * 4 + vi]++;
    }
    const sum = bins.reduce((a, b) => a + b, 0) || 1;
    return bins.map((x) => x / sum);
  };

  const hists: number[][] = [];
  for (const f of frames) hists.push(await hist(f));

  const keep: Frame[] = [frames[0]];
  for (let i = 1; i < frames.length; i++) {
    const dist = hists[i].reduce(
      (acc, v, idx) => acc + Math.abs(v - hists[i - 1][idx]),
      0
    );
    if (dist >= threshold) keep.push(frames[i]);
  }
  return keep;
}
