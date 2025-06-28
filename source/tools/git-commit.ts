import fs from "node:fs";
import path from "node:path";

import { tool } from "ai";
import { simpleGit } from "simple-git";
import { z } from "zod";
import type { SendData } from "./types.ts";

const CONVENTIONAL_COMMIT_MESSAGE =
  /^(feat|fix|docs|style|refactor|perf|test|chore)(\([\w-]+\))?!?: .+/;

function validateConventionalCommit(message: string): boolean {
  return CONVENTIONAL_COMMIT_MESSAGE.test(message);
}

interface GitOptions {
  workingDir: string;
  sendData?: SendData | undefined;
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

export const createGitCommitTool = async ({
  workingDir,
  sendData,
}: GitOptions) => {
  return {
    gitCommit: tool({
      description:
        "Commits a new git changeset for the given files with the provided commit message. It will stage the files given if they aren't already staged. The commit message should adhere to the Conventional Commits standard. (Git command: `git add` + `git commit`)",
      parameters: z.object({
        path: z.string().describe("The absolute path to the git repo."),
        message: z.string().describe("The commit message."),
        files: z
          .string()
          .describe(
            "A comma-separated list of files to include in this commit. IMPORTANT: use absolute paths for all files",
          ),
      }),
      execute: async ({ path, message, files }, { toolCallId }) => {
        sendData?.({
          id: toolCallId,
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
              id: toolCallId,
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
              id: toolCallId,
              event: "tool-error",
              data: errorMessage,
            });
            return errorMessage;
          }

          if (!files || files.trim() === "") {
            const errorMessage = "No files provided.";
            sendData?.({
              id: toolCallId,
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
            id: toolCallId,
            event: "tool-update",
            data: {
              primary: "Staging files:",
              secondary: fileArr.map((file) => `- ${file}`),
            },
          });

          // Add the changes and commit
          await git.add(fileArr);

          sendData?.({
            id: toolCallId,
            event: "tool-update",
            data: { primary: "Message", secondary: [message] },
          });

          const commitResult = await git.commit(message);

          sendData?.({
            id: toolCallId,
            event: "tool-completion",
            data: "Commit created successfully.",
          });

          const successMessage = `Commit created successfully:\n${commitResult.commit} - ${message}`;
          return successMessage;
        } catch (error) {
          const errorMessage = `Error creating commit: ${(error as Error).message}`;
          sendData?.({
            id: toolCallId,
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),
  };
};
