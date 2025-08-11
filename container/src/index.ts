import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { downloadFile, uploadFile } from "./r2";
import { getS3Client } from "./s3-client";
import { createTmpDirectory } from "./helpers";
import { join } from "path";
import { sampleVideo } from "./ffmpeg";
import pLimit from "p-limit";
import { getEnv } from "./config";
import { filterFrames } from "./utils/filter-frames";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.post(
  "/sample",
  zValidator(
    "json",
    z.object({
      source: z.object({
        bucket: z.string(),
        fileKey: z.string(),
      }),
      destination: z.object({
        bucket: z.string(),
        folder: z.string(),
      }),
    })
  ),
  async (c) => {
    try {
      const { source, destination } = c.req.valid("json");
      const env = getEnv();
      const s3 = getS3Client();

      const tmpDir = await createTmpDirectory();
      const videoPath = join(tmpDir, "downloaded.mov");

      await downloadFile({
        s3,
        bucket: source.bucket,
        fileKey: source.fileKey,
        outputPath: videoPath,
      });
      console.log("Downloaded video");
      const { frames } = await sampleVideo({
        inputPath: videoPath,
        outputDir: tmpDir,
      });
      console.log("Sampled frames", frames.length);

      const filteredFrames = await filterFrames(frames, env.CHANGE_THRESHOLD);
      console.log("Filtered frames", filteredFrames.length);

      const limit = pLimit(env.UPLOAD_CONCURRENCY_LIMIT);
      const uploadPromises = filteredFrames.map((frame) =>
        limit(() => {
          const asyncUpload = async () => {
            const frameNumber = frame.path
              .split("/")
              .pop()
              ?.replace(/frame-(\d+)\.png$/, "$1");

            await uploadFile({
              s3,
              bucket: destination.bucket,
              fileKey: `${destination.folder}/${frameNumber}.png`,
              inputPath: frame.path,
            });
            return {
              frameNumber,
              frameFileKey: `${destination.folder}/${frameNumber}.png`,
              frameTime: frame.time,
            };
          };

          return asyncUpload();
        })
      );
      const frameFileKeys = await Promise.all(uploadPromises);
      console.log(
        `Uploaded ${filteredFrames.length} frames to ${destination.bucket}/${destination.folder}`
      );
      return c.json({
        message: "Frames uploaded",
        frameFileKeys,
      });
    } catch (error) {
      return c.json({ error: "Invalid request" }, 400);
    }
  }
);

export default app;
