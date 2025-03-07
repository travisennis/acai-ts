import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { tool } from "ai";
import { simpleGit } from "simple-git";
import { z } from "zod";
import type { SendData } from "./types.ts";

const mdQuotes = "```";

const CONVENTIONAL_COMMIT_MESSAGE =
  /^(feat|fix|docs|style|refactor|perf|test|chore)(\(\w+\))?!?: .+/;

function validateConventionalCommit(message: string): boolean {
  return CONVENTIONAL_COMMIT_MESSAGE.test(message);
}

interface GitOptions {
  workingDir: string;
  sendData?: SendData;
}

const validateGitRepo = (workingDir: string): void => {
  try {
    const stats = fs.statSync(workingDir);
    if (!stats.isDirectory()) {
      throw new Error(`Error: ${workingDir} is not a directory`);
    }
  } catch (error) {
    throw new Error(`Error accessing directory ${workingDir}:`, {
      cause: error,
    });
  }

  const gitDir = path.join(workingDir, ".git");

  try {
    const stats = fs.statSync(gitDir);
    if (!stats.isDirectory()) {
      throw new Error(`Not a git repository: ${workingDir}`);
    }
  } catch (error) {
    console.error(`Unknown error: ${(error as Error).message}`);
    throw new Error(`Not a git repository: ${workingDir}`, { cause: error });
  }
};

function sanitizePath(workingDir: string, userPath: string): string {
  const normalizedPath = path.isAbsolute(userPath)
    ? path.normalize(userPath)
    : path.normalize(path.join(workingDir, userPath));

  const resolvedPath = path.resolve(normalizedPath);

  if (!resolvedPath.startsWith(workingDir)) {
    throw new Error(
      `Path is outside the working directory: ${resolvedPath} is not in ${workingDir}`,
    );
  }

  return resolvedPath;
}

export const GIT_READ_ONLY = [
  "gitStatus",
  "gitLog",
  "gitShow",
  "gitDiff",
  "gitDiffUnstaged",
  "gitDiffStaged",
] as const;

export const createGitTools = async ({ workingDir, sendData }: GitOptions) => {
  return {
    gitNewBranch: tool({
      description:
        "A tool to create a new git branch and switch to it. (Git command: `git checkout -b`)",
      parameters: z.object({
        path: z.string().describe("The absolute path to the git repo."),
        name: z.string().describe("The name of the git branch."),
      }),
      execute: async ({ path, name }) => {
        sendData?.({
          event: "tool-init",
          data: `Creating new git branch: ${name}`,
        });
        try {
          validateGitRepo(workingDir);
          const baseDir = sanitizePath(workingDir, path);
          const git = simpleGit({ baseDir });

          // Check if there are any changes to commit
          const status = await git.status();
          if (status.files.length > 0) {
            const message = "Repo is not clean.";
            sendData?.({
              event: "tool-error",
              data: message,
            });
            return message;
          }

          await git.checkoutLocalBranch(name);
          const successMessage = `Branch created successfully: ${name}`;
          sendData?.({
            event: "tool-completion",
            data: successMessage,
          });
          return successMessage;
        } catch (error) {
          const errorMessage = `Error creating branch: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    gitCommit: tool({
      description:
        "Commits a new git changeset for the given files with the provided commit message. It will stage the files given if they aren't already staged. The commit message should adhere to the Conventional Commits standard. (Git command: `git add` + `git commit`)",
      parameters: z.object({
        path: z.string().describe("The absolute path to the git repo."),
        message: z.string().describe("The commit message."),
        files: z
          .string()
          .describe(
            "A command-separated list of files to include in this commit. IMPORTANT: use absolute paths for all files",
          ),
      }),
      execute: async ({ path, message, files }) => {
        sendData?.({
          event: "tool-init",
          data: "Preparing to create git commit",
        });
        try {
          validateGitRepo(workingDir);
          const baseDir = sanitizePath(workingDir, path);
          const git = simpleGit({ baseDir });

          // Check if there are any changes to commit
          const status = await git.status();
          if (status.files.length === 0) {
            const message = "No changes to commit.";
            sendData?.({
              event: "tool-error",
              data: message,
            });
            return message;
          }

          // Check if no message is provided or the provided message doesn't conform to Conventional Commits
          if (!(message && validateConventionalCommit(message))) {
            const errorMessage =
              "Invalid commit message. Doesn't conform to Conventional Commits";
            sendData?.({
              event: "tool-error",
              data: errorMessage,
            });
            return errorMessage;
          }

          if (!files || files.trim() === "") {
            const errorMessage = "No files provided.";
            sendData?.({
              event: "tool-error",
              data: errorMessage,
            });
            return errorMessage;
          }

          const fileArr = files
            .split(",")
            .map((file) => file.trim())
            .map((file) => sanitizePath(workingDir, file));

          sendData?.({
            event: "tool-update",
            data: `Staging files: ${fileArr.join(", ")}`,
          });

          // Add the changes and commit
          await git.add(fileArr);
          const commitResult = await git.commit(message);
          const successMessage = `Commit created successfully: ${commitResult.commit} - ${message}`;
          sendData?.({
            event: "tool-completion",
            data: successMessage,
          });
          return successMessage;
        } catch (error) {
          const errorMessage = `Error creating commit: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    gitStatus: tool({
      description:
        "Get the status of the git repo at the given path. (Git command: `git status`)",
      parameters: z.object({
        path: z.string().describe("The absolute path to the git repo."),
      }),
      execute: async ({ path }) => {
        sendData?.({
          event: "tool-init",
          data: "Getting git repository status",
        });
        try {
          validateGitRepo(workingDir);
          const baseDir = sanitizePath(workingDir, path);
          const git = simpleGit({ baseDir });

          // Check if there are any changes to commit
          const status = await git.status();
          if (status.files.length === 0) {
            sendData?.({
              event: "tool-update",
              data: "No changes found",
            });
            return "No changes found.";
          }

          const statusMessage = `Status:\n ${mdQuotes} json\n${JSON.stringify(status, undefined, 2)}\n${mdQuotes}`;
          sendData?.({
            event: "tool-completion",
            data: statusMessage,
          });
          return statusMessage;
        } catch (error) {
          const errorMessage = `Error getting status: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    gitLog: tool({
      description:
        "Gets the log of the git repo at the given path. Unless told otherwise, will return the 3 most recent commits. (Git command: `git log --max-count=n`)",
      parameters: z.object({
        path: z.string().describe("The absolute path to the git repo."),
        n: z
          .number()
          .optional()
          .describe(
            "The number of commits to return in the log. This value is passed --max-count",
          ),
      }),
      execute: async ({ path, n }) => {
        sendData?.({
          event: "tool-init",
          data: "Retrieving git log",
        });
        try {
          validateGitRepo(workingDir);
          const baseDir = sanitizePath(workingDir, path);
          const git = simpleGit({ baseDir });

          const log = await git.log({ maxCount: n ?? 3 });
          const logMessage = `Log:\n${mdQuotes} json\n${JSON.stringify(log, undefined, 2)}\n${mdQuotes}`;
          sendData?.({
            event: "tool-completion",
            data: logMessage,
          });
          return logMessage;
        } catch (error) {
          const errorMessage = `Error getting log: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    gitShow: tool({
      description: "Shows the contents of a commit. (Git command: `git show`)",
      parameters: z.object({
        path: z.string().describe("The absolute path to the git repo."),
        revision: z.string(),
      }),
      execute: async ({ path, revision }) => {
        sendData?.({
          event: "tool-init",
          data: `Showing commit: ${revision}`,
        });
        try {
          validateGitRepo(workingDir);
          const baseDir = sanitizePath(workingDir, path);
          const git = simpleGit({ baseDir });

          const show = await git.show(revision);
          const showMessage = `Show:\n${mdQuotes} json\n${JSON.stringify(show, undefined, 2)}\n${mdQuotes}`;
          sendData?.({
            event: "tool-completion",
            data: showMessage,
          });
          return showMessage;
        } catch (error) {
          const errorMessage = `Error getting show: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    gitDiff: tool({
      description:
        "Shows differences between branches or commits. (Git command: `git diff`)",
      parameters: z.object({
        path: z.string().describe("The absolute path to the git repo."),
        target: z.string(),
      }),
      execute: async ({ path, target }) => {
        sendData?.({
          event: "tool-init",
          data: `Getting diff for target: ${target}`,
        });
        try {
          validateGitRepo(workingDir);
          const baseDir = sanitizePath(workingDir, path);
          const git = simpleGit({ baseDir });
          const diff = await git.diff([target]);
          sendData?.({
            event: "tool-completion",
            data: diff.length > 0 ? "Changes found" : "No changes detected.",
          });
          return diff.length > 0 ? diff : "No changes detected.";
        } catch (error) {
          const errorMessage = `Error getting git diff: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    gitDiffUnstaged: tool({
      description:
        "Shows changes in the working directory that are not yet staged. (Git command: `git diff`)",
      parameters: z.object({
        path: z.string().describe("The absolute path to the git repo."),
      }),
      execute: async ({ path }) => {
        sendData?.({
          event: "tool-init",
          data: "Getting unstaged changes",
        });
        try {
          validateGitRepo(workingDir);
          const baseDir = sanitizePath(workingDir, path);
          const git = simpleGit({ baseDir });
          const diff = await git.diff();
          sendData?.({
            event: "tool-completion",
            data: diff.length > 0 ? "Changes found" : "No changes detected.",
          });
          return diff.length > 0 ? diff : "No changes detected.";
        } catch (error) {
          const errorMessage = `Error getting git diff: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    gitDiffStaged: tool({
      description:
        "Shows changes that are staged for commit. (Git command: `git diff --cached`)",
      parameters: z.object({
        path: z.string().describe("The absolute path to the git repo."),
      }),
      execute: async ({ path }) => {
        sendData?.({
          event: "tool-init",
          data: "Getting staged changes",
        });
        try {
          validateGitRepo(workingDir);
          const baseDir = sanitizePath(workingDir, path);
          const git = simpleGit({ baseDir });
          const diff = await git.diff(["--cached"]);
          sendData?.({
            event: "tool-completion",
            data: diff.length > 0 ? "Changes found" : "No changes detected.",
          });
          return diff.length > 0 ? diff : "No changes detected.";
        } catch (error) {
          const errorMessage = `Error getting git diff: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),
  };
};

const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;

/**
 * execFile, but always resolves (never throws)
 */
function execFileNoThrow(
  file: string,
  args: string[],
  abortSignal?: AbortSignal,
  timeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
  preserveOutputOnError = true,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    try {
      execFile(
        file,
        args,
        {
          maxBuffer: 1_000_000,
          signal: abortSignal,
          timeout,
          cwd: process.cwd(),
        },
        (error, stdout, stderr) => {
          if (error) {
            if (preserveOutputOnError) {
              const errorCode = typeof error.code === "number" ? error.code : 1;
              resolve({
                stdout: stdout || "",
                stderr: stderr || "",
                code: errorCode,
              });
            } else {
              resolve({ stdout: "", stderr: "", code: 1 });
            }
          } else {
            resolve({ stdout, stderr, code: 0 });
          }
        },
      );
    } catch (_error) {
      resolve({ stdout: "", stderr: "", code: 1 });
    }
  });
}

function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>();

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

export const inGitDirectory = memoize(async (): Promise<boolean> => {
  const { code } = await execFileNoThrow("git", [
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  return code === 0;
});
