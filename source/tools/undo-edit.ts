import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import type { SendData } from "./types.ts";

export const UndoEditTool = {
  name: "undoEdit" as const,
};

export const createUndoEditTool = async ({
  workingDir,
  sendData,
}: {
  workingDir: string;
  sendData?: SendData;
}) => {
  const allowedDirectory = workingDir;
  return {
    [UndoEditTool.name]: tool({
      description:
        "Reverts the last edit made to a file using the editFile tool by restoring from its backup file (.backup).",
      parameters: z.object({
        path: z
          .string()
          .describe("The path to the file whose last edit should be undone."),
      }),
      execute: async ({ path: userPath }, { toolCallId }) => {
        sendData?.({
          id: toolCallId,
          event: "tool-init",
          data: `Undoing edit for file: ${userPath}`,
        });
        try {
          const filePath = await validatePath(
            joinWorkingDir(userPath, workingDir),
            allowedDirectory,
          );
          const backupPath = `${filePath}.backup`;

          // Check if backup file exists
          if (!existsSync(backupPath)) {
            return `No backup file found for ${filePath}`;
          }

          // Check if original file exists (it should, but good practice)
          if (!existsSync(filePath)) {
            return `Original file not found: ${filePath}`;
          }

          // Restore from backup
          const backupContent = await fs.readFile(backupPath, "utf8");
          await fs.writeFile(filePath, backupContent);

          // Remove backup content (but keep file for tracking purposes)
          await fs.writeFile(backupPath, "");

          sendData?.({
            id: toolCallId,
            event: "tool-completion",
            data: `Successfully restored ${userPath} from backup.`,
          });
          return `Successfully restored ${filePath} from backup`;
        } catch (error) {
          const errorMessage = `Error restoring from backup: ${(error as Error).message}`;
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
