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

interface GitCounts {
  added: number;
  modified: number;
  deleted: number;
  untracked: number;
}

export async function getGitStatus(): Promise<GitCounts> {
  const result = await executeCommand(["git", "status", "--porcelain"], {
    cwd: process.cwd(),
    throwOnError: false,
  });

  const counts: GitCounts = {
    added: 0,
    modified: 0,
    deleted: 0,
    untracked: 0,
  };

  if (result.code !== 0) {
    return counts;
  }

  const lines = result.stdout.split("\n");
  for (const line of lines) {
    incrementCountsFromStatusLine(line, counts);
  }

  return counts;
}

/**
 * Parse a single git status --porcelain line and increment the appropriate counter.
 */
function incrementCountsFromStatusLine(line: string, counts: GitCounts): void {
  if (!line) return;
  const s = line.slice(0, 2);
  if (s === "??") {
    counts.untracked++;
    return;
  }
  if (s[0] === "A" || s === "M ") {
    counts.added++;
    return;
  }
  if (s[1] === "M" || s === " M") {
    counts.modified++;
    return;
  }
  if (s[0] === "D" || s === " D") {
    counts.deleted++;
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
 * Get the current git branch name
 */
export async function getCurrentBranch(): Promise<string | null> {
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

/**
 * Count commits that exist locally but haven't been pushed to the remote branch
 */
export async function getUnpushedCommitsCount(): Promise<number> {
  try {
    // First, check if there's a remote configured
    const remoteResult = await executeCommand(
      ["git", "rev-parse", "--abbrev-ref", "@{u}"],
      {
        cwd: process.cwd(),
        throwOnError: false,
      },
    );

    if (remoteResult.code !== 0) {
      // No upstream configured or no remote
      return 0;
    }

    // Count unpushed commits using git rev-list
    // @{u}..HEAD gives commits in HEAD but not in upstream (unpushed commits)
    const result = await executeCommand(
      ["git", "rev-list", "--count", "@{u}..HEAD"],
      {
        cwd: process.cwd(),
        throwOnError: false,
      },
    );

    if (result.code !== 0 || !result.stdout.trim()) {
      return 0;
    }

    const count = Number.parseInt(result.stdout.trim(), 10);
    return Number.isNaN(count) ? 0 : count;
  } catch {
    return 0;
  }
}
