import { tool } from "ai";
import { z } from "zod";
import {
  directoryTree,
  joinWorkingDir,
  validatePath,
} from "./filesystem-utils.ts";
import type { SendData } from "./types.ts";

export const createDirectoryTreeTool = async ({
  workingDir,
  sendData,
}: {
  workingDir: string;
  sendData?: SendData;
}) => {
  const allowedDirectory = workingDir;
  return {
    directoryTree: tool({
      description:
        "Get a directory tree structure for a given path. This tool will ignore any directories or files listed in a .gitignore file. Use this tool when you need to see a complete directory tree for a project. This can be used to get an understanding of how a project is organized and what files are available before using other file system tools.",
      parameters: z.object({
        path: z.string().describe("The path."),
      }),
      execute: async ({ path }, { toolCallId }) => {
        try {
          sendData?.({
            id: toolCallId,
            event: "tool-init",
            data: `Listing directory tree: ${path}`,
          });
          const validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectory,
          );
          sendData?.({
            id: toolCallId,
            event: "tool-completion",
            data: "Done",
          });
          return directoryTree(validPath);
        } catch (error) {
          return `Failed to show directory tree: ${(error as Error).message}`;
        }
      },
    }),
  };
};
