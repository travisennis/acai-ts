import path from "node:path";
import { logger } from "../../logger.ts";
import { clearDirectory } from "../../utils/filesystem/operations.ts";

export async function clearTmpDirectory(
  baseDir?: string | null,
): Promise<void> {
  try {
    const tmpDirPath = path.join(baseDir ?? process.cwd(), ".tmp");
    await clearDirectory(tmpDirPath);
  } catch (error) {
    // Log error but don't block exit
    logger.error(error, "Failed to clear .tmp directory:");
  }
}
