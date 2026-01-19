import {
  getCurrentBranch,
  getDiffStat,
  getGitStatus,
  getUnpushedCommitsCount,
  inGitDirectory,
} from "../utils/git.ts";

export interface ProjectStatusData {
  path: string;
  isGitRepository: boolean;
  branch?: string;
  hasChanges: boolean;
  unpushedCommits: number;
  fileChanges: {
    added: number;
    modified: number;
    deleted: number;
    untracked: number;
  };
  diffStats: {
    insertions: number;
    deletions: number;
  };
}

// Cache for project status to prevent excessive Git operations
class ProjectStatus {
  private cachedStatus: ProjectStatusData | null = null;
  private cacheTime = 0;
  private cacheTtl = 2000; // 2 seconds

  async get(): Promise<ProjectStatusData> {
    const now = Date.now();

    // Return cached status if it's still valid
    if (this.cachedStatus && now - this.cacheTime < this.cacheTtl) {
      return this.cachedStatus;
    }

    // const currentDir = process.cwd().split("/").pop() || process.cwd();
    let pwd = process.cwd();
    const home = process.env["HOME"] || process.env["USERPROFILE"];
    if (home && pwd.startsWith(home)) {
      pwd = `~${pwd.slice(home.length)}`;
    }

    const currentDir = pwd;
    let status: ProjectStatusData = {
      path: currentDir,
      isGitRepository: false,
      fileChanges: {
        added: 0,
        modified: 0,
        deleted: 0,
        untracked: 0,
      },
      diffStats: {
        insertions: 0,
        deletions: 0,
      },
      hasChanges: false,
      unpushedCommits: 0,
    };

    if (await inGitDirectory()) {
      // Generate fresh status
      const branch = await getCurrentBranch();

      const fileChanges = await getGitStatus();
      const hasChanges =
        fileChanges.added > 0 ||
        fileChanges.deleted > 0 ||
        fileChanges.modified > 0;

      const stats = await getDiffStat();
      const unpushedCommits = await getUnpushedCommitsCount();

      status = {
        path: currentDir,
        isGitRepository: true,
        branch: branch ?? undefined,
        hasChanges,
        unpushedCommits,
        fileChanges: {
          added: fileChanges.added,
          modified: fileChanges.modified,
          deleted: fileChanges.deleted,
          untracked: fileChanges.untracked,
        },
        diffStats: {
          insertions: stats.insertions,
          deletions: stats.deletions,
        },
      };
    }

    this.cachedStatus = status;
    this.cacheTime = now;

    return this.cachedStatus;
  }

  // Clear cache (call this when you know the status has changed)
  clear(): void {
    this.cachedStatus = null;
    this.cacheTime = 0;
  }
}

const projectStatus = new ProjectStatus();

export async function getProjectStatus(): Promise<ProjectStatusData> {
  return await projectStatus.get();
}

// Export clear function for cases where we know the status changed
// (e.g., after file operations, git operations)
export function clearProjectStatusCache(): void {
  projectStatus.clear();
}
