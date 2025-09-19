import { tool } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import chalk from "../terminal/chalk.ts";
import { manageOutput, type TokenCounter } from "../token-utils.ts";
import {
  directoryTree,
  joinWorkingDir,
  validatePath,
} from "./filesystem-utils.ts";
import type { SendData } from "./types.ts";

export const DirectoryTreeTool = {
  name: "directoryTree" as const,
};

export const createDirectoryTreeTool = async ({
  workingDir,
  sendData,
  tokenCounter,
}: {
  workingDir: string;
  sendData?: SendData;
  tokenCounter: TokenCounter;
}) => {
  const allowedDirectory = workingDir;
  return {
    [DirectoryTreeTool.name]: tool({
      description:
        "Get a directory tree structure for a given path. This tool will ignore any directories or files listed in a .gitignore file. Use this tool when you need to see a complete directory tree for a project. This can be used to get an understanding of how a project is organized and what files are available before using other file system tools.",
      inputSchema: z.object({
        path: z.string().describe("The path."),
      }),
      execute: async ({ path }, { toolCallId, abortSignal }) => {
        // Check if execution has been aborted
        if (abortSignal?.aborted) {
          throw new Error("Directory tree listing aborted");
        }
        let validPath: string;
        try {
          if (abortSignal?.aborted) {
            throw new Error(
              "Directory tree listing aborted before path validation",
            );
          }

          sendData?.({
            id: toolCallId,
            event: "tool-init",
            data: `Listing directory tree: ${chalk.cyan(path)}`,
          });

          validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectory,
            abortSignal,
          );

          const maxTokens = (await config.readProjectConfig()).tools.maxTokens;

          const rawTree = await directoryTree(validPath);
          const managed = manageOutput(rawTree, {
            tokenCounter,
            threshold: maxTokens,
          });

          if (managed.truncated) {
            sendData?.({
              id: toolCallId,
              event: "tool-update",
              data: { primary: managed.warning },
            });
          }

          sendData?.({
            id: toolCallId,
            event: "tool-completion",
            data: `Done (${managed.tokenCount} tokens)`,
          });
          return managed.content;
        } catch (error) {
          sendData?.({
            id: toolCallId,
            event: "tool-error",
            data: "Failed to show directory tree.",
          });
          return `Failed to show directory tree: ${(error as Error).message}`;
        }
      },
    }),
  };
};
