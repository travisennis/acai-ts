import { memoize } from "@travisennis/stdlib/functional";
import { simpleGit } from "simple-git";
import { executeCommand } from "../utils/process.ts";

// Function to get diff stats
export async function getDiffStat() {
  const git = simpleGit(process.cwd());
  try {
    // Get diff stat comparing working directory to HEAD
    const diffSummary = await git.diffSummary(["--stat"]);
    return {
      filesChanged: diffSummary.files.length,
      insertions: diffSummary.insertions,
      deletions: diffSummary.deletions,
    };
  } catch (error) {
    // Handle cases where git diff fails (e.g., initial commit)
    console.error("Error getting git diff stat:", error);
    return {
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
    };
  }
}

export const inGitDirectory = memoize(async (): Promise<boolean> => {
  const { code } = await executeCommand(
    ["git", "rev-parse", "--is-inside-work-tree"],
    {
      cwd: process.cwd(),
      throwOnError: false,
    },
  );
  return code === 0;
});

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(): Promise<boolean> {
  if (!(await inGitDirectory())) {
    return false;
  }

  const git = simpleGit(process.cwd());
  try {
    const status = await git.status();
    return status.files.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get the current git branch name
 */
export async function getCurrentBranch(): Promise<string | null> {
  if (!(await inGitDirectory())) {
    return null;
  }

  const git = simpleGit(process.cwd());
  try {
    const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
    return branch.trim();
  } catch {
    return null;
  }
}
