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

const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;

/**
 * executeCommand wrapper that always resolves (never throws)
 */
function execFileNoThrow(
  file: string,
  args: string[],
  abortSignal?: AbortSignal,
  timeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
  preserveOutputOnError = true,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return executeCommand([file, ...args], {
    cwd: process.cwd(),
    timeout,
    abortSignal,
    throwOnError: false,
    preserveOutputOnError,
  });
}

export const inGitDirectory = memoize(async (): Promise<boolean> => {
  const { code } = await execFileNoThrow("git", [
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  return code === 0;
});
