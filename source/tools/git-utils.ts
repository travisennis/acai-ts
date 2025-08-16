import { memoize } from "@travisennis/stdlib/functional";
import { executeCommand } from "../utils/process.ts";

// Function to get diff stats
export async function getDiffStat() {
  try {
    // Get diff stat comparing working directory to HEAD
    const result = await executeCommand(["git", "diff", "--stat"], {
      cwd: process.cwd(),
      throwOnError: false,
    });

    if (result.code !== 0) {
      console.error("Error getting git diff stat:", result.stderr);
      return {
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
      };
    }

    // Parse the git diff --stat output
    // Example output: " 3 files changed, 15 insertions(+), 3 deletions(-)"
    const statLine = result.stdout.trim();
    if (!statLine) {
      return {
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
      };
    }

    // Extract numbers using regex
    const filesMatch = statLine.match(/(\d+) files? changed/);
    const insertionsMatch = statLine.match(/(\d+) insertion/);
    const deletionsMatch = statLine.match(/(\d+) deletion/);

    const filesChanged = filesMatch?.[1]
      ? Number.parseInt(filesMatch[1], 10)
      : 0;
    const insertions = insertionsMatch?.[1]
      ? Number.parseInt(insertionsMatch[1], 10)
      : 0;
    const deletions = deletionsMatch?.[1]
      ? Number.parseInt(deletionsMatch[1], 10)
      : 0;

    return {
      filesChanged,
      insertions,
      deletions,
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

  try {
    const result = await executeCommand(["git", "status", "--porcelain"], {
      cwd: process.cwd(),
      throwOnError: false,
    });

    // If there are uncommitted changes, --porcelain will output lines for each changed file
    return result.stdout.trim().length > 0;
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

  try {
    const result = await executeCommand(
      ["git", "rev-parse", "--abbrev-ref", "HEAD"],
      {
        cwd: process.cwd(),
        throwOnError: false,
      },
    );

    if (result.code !== 0) {
      return null;
    }

    return result.stdout.trim();
  } catch {
    return null;
  }
}
