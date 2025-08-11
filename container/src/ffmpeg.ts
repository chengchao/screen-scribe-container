import { execute } from "./execute";
import { promises as fs } from "fs";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { Frame } from "./types";
const execFileP = promisify(execFile);

type SampleOpts = {
  inputPath: string; // e.g. /Users/you/Desktop/Recording.mov
  outputDir: string; // e.g. /tmp/frames
  rate?: number; // frames per second to keep (default 1)
  ext?: "png" | "jpg"; // output format (default 'png')
};

export async function sampleVideo({
  inputPath,
  outputDir,
  rate = 1,
  ext = "png",
}: SampleOpts) {
  // Ensure outputDir exists
  await fs.mkdir(outputDir, { recursive: true });

  // Use the output directory as cwd and a simple relative pattern
  const outputPattern = `frame_%05d.${ext}`;

  // Notes:
  // - -vf fps=1: samples 1 frame/sec (better than -r for VFR inputs like QuickTime)
  // - -hide_banner -loglevel error: keep stderr clean unless there’s an actual error
  // - -y: overwrite existing frames if re-running
  const flags = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vf",
    `fps=${rate}`,
    outputPattern,
  ];

  await execute("ffmpeg", { flags, cwd: outputDir });

  // map files → timestamps (index / fps)
  const frames: Frame[] = [];
  let i = 1;
  while (true) {
    const filename = `${outputDir}/frame_${String(i).padStart(5, "0")}.${ext}`;
    try {
      await execFileP("stat", [filename]);
      frames.push({
        path: filename,
        time: (i - 1) / rate,
      });
      i++;
    } catch {
      break;
    }
  }

  return { frames };
}
