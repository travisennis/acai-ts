import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import type { SendData } from "./types.ts";

export const DeleteFileTool = {
  name: "deleteFile" as const,
};

export const createDeleteFileTool = async ({
  workingDir,
  sendData,
}: {
  workingDir: string;
  sendData?: SendData;
}) => {
  const allowedDirectory = workingDir;
  return {
    [DeleteFileTool.name]: tool({
      description: "Delete a file permanently.",
      inputSchema: z.object({
        path: z.string().describe("Absolute path to the file to delete"),
      }),
      execute: async ({ path: userPath }, { toolCallId }) => {
        sendData?.({
          id: toolCallId,
          event: "tool-init",
          data: `Deleting file: ${chalk.cyan(userPath)}`,
        });
        try {
          const filePath = await validatePath(
            joinWorkingDir(userPath, workingDir),
            allowedDirectory,
          );

          // Check if file exists before attempting delete
          if (!existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
          }

          // Ensure it's a file, not a directory
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            throw new Error(`Path is a directory, not a file: ${filePath}`);
          }

          // Delete the original file
          await fs.unlink(filePath);

          sendData?.({
            id: toolCallId,
            event: "tool-completion",
            data: `File deleted successfully: ${userPath}`,
          });
          return `Successfully deleted ${filePath}`;
        } catch (error) {
          const errorMessage = `Failed to delete file: ${(error as Error).message}`;
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
