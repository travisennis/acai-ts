import style from "../terminal/style.ts";
import {
  getCurrentBranch,
  getDiffStat,
  getGitStatus,
  inGitDirectory,
} from "../tools/git-utils.ts";

// Cache for project status to prevent excessive Git operations
class ProjectStatusCache {
  private cachedStatus: string | null = null;
  private cacheTime = 0;
  private cacheTtl = 2000; // 2 seconds

  async getStatus(): Promise<string> {
    const now = Date.now();

    // Return cached status if it's still valid
    if (this.cachedStatus && now - this.cacheTime < this.cacheTtl) {
      return this.cachedStatus;
    }

    const currentDir = process.cwd().split("/").pop() || process.cwd();
    let gitStatus = "";
    if (await inGitDirectory()) {
      // Generate fresh status
      const branch = await getCurrentBranch();

      const fileChanges = await getGitStatus();
      if (branch) {
        const hasChanges =
          fileChanges.added > 0 ||
          fileChanges.deleted > 0 ||
          fileChanges.modified > 0;
        const asterisk = hasChanges ? "*" : "";
        gitStatus = ` ${style.gray(branch + asterisk)}`;
      }

      const stats = await getDiffStat();
      let fileStatus = "";
      if (fileChanges.added) fileStatus += ` +${fileChanges.added}`;
      if (fileChanges.modified) fileStatus += ` ~${fileChanges.modified}`;
      if (fileChanges.deleted) fileStatus += ` -${fileChanges.deleted}`;
      if (fileChanges.untracked) fileStatus += ` ?${fileChanges.untracked}`;
      gitStatus +=
        " " +
        `${style.dim("[")}${style.yellow(fileStatus.trim())} ` +
        `${style.green(`+${stats.insertions}`)} ` +
        `${style.red(`-${stats.deletions}`)}${style.dim("]")}`;
    }

    this.cachedStatus = `${style.blue(currentDir)}${gitStatus}`;
    this.cacheTime = now;

    return this.cachedStatus;
  }

  // Clear cache (call this when you know the status has changed)
  clear(): void {
    this.cachedStatus = null;
    this.cacheTime = 0;
  }
}

const statusCache = new ProjectStatusCache();

export async function getProjectStatusLine(): Promise<string> {
  return await statusCache.getStatus();
}

// Export clear function for cases where we know the status changed
// (e.g., after file operations, git operations)
export function clearProjectStatusCache(): void {
  statusCache.clear();
}
