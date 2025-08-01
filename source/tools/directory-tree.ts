import { tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
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
}: {
  workingDir: string;
  sendData?: SendData;
}) => {
  const allowedDirectory = workingDir;
  return {
    [DirectoryTreeTool.name]: tool({
      description:
        "Get a directory tree structure for a given path. This tool will ignore any directories or files listed in a .gitignore file. Use this tool when you need to see a complete directory tree for a project. This can be used to get an understanding of how a project is organized and what files are available before using other file system tools.",
      inputSchema: z.object({
        path: z.string().describe("The path."),
      }),
      execute: async ({ path }, { toolCallId }) => {
        let validPath: string;
        try {
          sendData?.({
            id: toolCallId,
            event: "tool-init",
            data: `Listing directory tree: ${chalk.cyan(path)}`,
          });
          validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectory,
          );
          sendData?.({
            id: toolCallId,
            event: "tool-completion",
            data: "Done",
          });
        } catch (error) {
          return `Failed to show directory tree: ${(error as Error).message}`;
        }
        return directoryTree(validPath);
      },
    }),
  };
};
