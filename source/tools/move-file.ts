import fs from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import type { SendData } from "./types.ts";

export const createMoveFileTool = async ({
  workingDir,
  sendData,
}: {
  workingDir: string;
  sendData?: SendData;
}) => {
  const allowedDirectory = workingDir;
  return {
    moveFile: tool({
      description:
        "Move or rename files and directories. Can move files between directories " +
        "and rename them in a single operation. If the destination exists, the " +
        "operation will fail. Works across different directories and can be used " +
        "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
      parameters: z.object({
        source: z.string(),
        destination: z.string(),
      }),
      execute: async ({ source, destination }, { toolCallId }) => {
        try {
          sendData?.({
            id: toolCallId,
            event: "tool-init",
            data: `Moving file from ${source} to ${destination}`,
          });
          const validSourcePath = await validatePath(
            joinWorkingDir(source, workingDir),
            allowedDirectory,
          );
          const validDestPath = await validatePath(
            joinWorkingDir(destination, workingDir),
            allowedDirectory,
          );
          await fs.rename(validSourcePath, validDestPath);
          sendData?.({
            id: toolCallId,
            event: "tool-completion",
            data: "Done",
          });
          return `Successfully moved ${source} to ${destination}`;
        } catch (error) {
          return `Failed to move file: ${(error as Error).message}`;
        }
      },
    }),
  };
};
