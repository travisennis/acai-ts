import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import { fileEncodingSchema, type SendData } from "./types.ts";

export const SaveFileTool = {
  name: "saveFile" as const,
};

export const createSaveFileTool = async ({
  workingDir,
  sendData,
}: {
  workingDir: string;
  sendData?: SendData;
}) => {
  const allowedDirectory = workingDir;
  return {
    [SaveFileTool.name]: tool({
      description:
        "Create a new file or completely overwrite an existing file with new content. " +
        "Use with caution as it will overwrite existing files without warning. " +
        "Handles text content with proper encoding. Only works within allowed directories.",
      parameters: z.object({
        path: z.string().describe("Absolute path to file to save to"),
        content: z.string().describe("Content to save in the file"),
        encoding: fileEncodingSchema.describe(
          'Encoding format for saving the file. Use "utf-8" as default for text files',
        ),
      }),
      execute: async (
        {
          path: userPath,
          content,
          encoding,
        }: {
          path: string;
          content: string;
          encoding: z.infer<typeof fileEncodingSchema>;
        },
        { toolCallId },
      ) => {
        sendData?.({
          id: toolCallId,
          event: "tool-init",
          data: `Saving file: ${userPath}`,
        });
        try {
          const filePath = await validatePath(
            joinWorkingDir(userPath, workingDir),
            allowedDirectory,
          );

          // Ensure parent directory exists
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, content, { encoding });

          sendData?.({
            id: toolCallId,
            event: "tool-completion",
            data: `File saved successfully: ${userPath}`,
          });
          return `File saved successfully: ${filePath}`;
        } catch (error) {
          return `Failed to save file: ${(error as Error).message}`;
        }
      },
    }),
  };
};
