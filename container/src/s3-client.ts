import { S3Client } from "@aws-sdk/client-s3";
import { getEnv } from "@/config";

export function getS3Client() {
  const { CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } =
    getEnv();

  const s3 = new S3Client({
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    region: "auto",
    endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    maxAttempts: 3,
  });

  return s3;
}
