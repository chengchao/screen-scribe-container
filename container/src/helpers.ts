import { promises as fs } from "fs";
import { basename, join } from "path";
import { S3Client } from "@aws-sdk/client-s3";
import { downloadFile } from "./r2";

/**
 * Check if a file exists at the given path.
 * @param {string} filePath Path to the file to check
 * @returns {Promise<boolean>} True if file exists, false otherwise
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parameters for downloading a file from S3/R2
 */
export interface DownloadFileParams {
  s3: S3Client;
  bucket: string;
  fileKey: string;
  outputPath: string;
  timeoutMs?: number;
}

/**
 * Download a file only if it doesn't already exist at the target path.
 * @param {DownloadFileParams} params Download parameters
 * @returns {Promise<{downloaded: boolean, etag?: string}>} Result indicating if file was downloaded and optional etag
 */
export async function downloadFileIfNotExists(
  params: DownloadFileParams
): Promise<{ downloaded: boolean; etag?: string }> {
  const { outputPath } = params;

  if (await fileExists(outputPath)) {
    console.log(`File already exists at ${outputPath}, skipping download`);
    return { downloaded: false };
  }

  console.log(`File does not exist at ${outputPath}, downloading...`);
  const etag = await downloadFile(params);
  return { downloaded: true, etag };
}

/**
 * Create a temporary directory for PDF operations.
 * @param {string} baseDir Base directory where the temp directory will be created (defaults to /tmp)
 * @param {string} prefix Prefix for the directory name (defaults to 'pdf-op-')
 * @returns {Promise<string>} Path to the created temporary directory
 * @throws
 */
export async function createTmpDirectory(
  baseDir: string = "/tmp",
  prefix: string = "pdf-op-"
): Promise<string> {
  try {
    // Create a unique directory name with timestamp and random suffix
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const dirName = `${prefix}${timestamp}-${randomSuffix}`;
    const tmpDir = join(baseDir, dirName);

    // Create the directory
    await fs.mkdir(tmpDir, { recursive: true });

    console.log(`Created temporary directory: ${tmpDir}`);
    return tmpDir;
  } catch (error) {
    console.error("Failed to create temporary directory:", error);
    throw error;
  }
}

/**
 * Create a temporary directory for PDF operations based on a job GUID.
 * @param {string} jobGuid The job GUID to use as the directory identifier
 * @param {string} baseDir Base directory where the temp directory will be created (defaults to /tmp)
 * @param {string} prefix Prefix for the directory name (defaults to 'pdf-job-')
 * @returns {Promise<string>} Path to the created temporary directory
 * @throws
 */
export async function createTmpDirectoryFromJobGuid(
  jobGuid: string,
  baseDir: string = "/tmp",
  prefix: string = "pdf-job-"
): Promise<string> {
  try {
    // Create directory name using the job GUID
    const dirName = `${prefix}${jobGuid}`;
    const tmpDir = join(baseDir, dirName);

    // Create the directory
    await fs.mkdir(tmpDir, { recursive: true });

    console.log(`Created temporary directory for job ${jobGuid}: ${tmpDir}`);
    return tmpDir;
  } catch (error) {
    console.error(
      `Failed to create temporary directory for job ${jobGuid}:`,
      error
    );
    throw error;
  }
}

/**
 * Clean up temporary files in the specified directory.
 * @param {String} tmpDir Directory to clean up (defaults to /tmp)
 * @param {Array<String>} patterns File patterns to match for deletion (e.g., ['downloaded.pdf', 'page-*.pdf', 'converted*'])
 * @throws
 */
export async function cleanupTmpDirectory(
  tmpDir: string = "/tmp",
  patterns: string[] = []
): Promise<void> {
  try {
    const files = await fs.readdir(tmpDir, { withFileTypes: true });

    // If no patterns specified, clean up common temporary files
    const defaultPatterns = [
      "downloaded.pdf",
      "page-*.pdf",
      "converted*",
      "split*",
      "output*",
    ];
    const patternsToUse = patterns.length > 0 ? patterns : defaultPatterns;

    const filesToDelete = files
      .filter((item) => item.isFile())
      .filter((item) => {
        return patternsToUse.some((pattern) => {
          // Convert glob-like pattern to regex
          const regexPattern = pattern.replace(/\*/g, ".*").replace(/\?/g, ".");
          const regex = new RegExp(`^${regexPattern}$`);
          return regex.test(item.name);
        });
      })
      .map((item) => join(tmpDir, item.name));

    if (filesToDelete.length > 0) {
      console.log(
        `Cleaning up ${filesToDelete.length} temporary files: ${filesToDelete
          .map((f) => basename(f))
          .join(", ")}`
      );
      await Promise.all(
        filesToDelete.map(async (filePath) => {
          try {
            await fs.unlink(filePath);
          } catch (error) {
            // Ignore errors if file doesn't exist or can't be deleted
            console.warn(`Failed to delete ${filePath}:`, error);
          }
        })
      );
    } else {
      console.log("No temporary files to clean up");
    }
  } catch (error) {
    console.warn("Failed to clean up temporary directory:", error);
    // Don't throw error as cleanup failure shouldn't stop the main process
  }
}

/**
 * List files in given dirctory.
 * @param {String} location Name of the file path.
 * @param {String} filePrefix Prefix of the file path.
 * @return {Array<String>} Absolute path to the converted file
 * @throws
 */
export async function listFiles(
  location: string,
  filePrefix: string,
  fileSuffix: string = ""
): Promise<Array<string>> {
  try {
    const files = await fs.readdir(location, { withFileTypes: true });
    return files
      .filter((item) => item.isFile())
      .filter((item) => item.name.startsWith(filePrefix))
      .filter((item) => item.name.endsWith(fileSuffix))
      .map((item) => join(location, item.name));
  } catch (error) {
    console.error(error);
    throw error;
  }
}
