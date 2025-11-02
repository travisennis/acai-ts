import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import style from "../terminal/style.ts";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import type { ToolResult } from "./types.ts";

export const DeleteFileTool = {
  name: "deleteFile" as const,
};

const inputSchema = z.object({
  path: z.string().describe("Absolute path to the file to delete"),
});

type DeleteFileInputSchema = z.infer<typeof inputSchema>;

export const createDeleteFileTool = async ({
  workingDir,
  allowedDirs,
}: {
  workingDir: string;
  allowedDirs?: string[];
}) => {
  const allowedDirectory = allowedDirs ?? [workingDir];

  return {
    toolDef: {
      description: "Delete a file permanently.",
      inputSchema,
    },
    async *execute(
      { path: userPath }: DeleteFileInputSchema,
      { toolCallId, abortSignal }: ToolCallOptions,
    ): AsyncGenerator<ToolResult> {
      try {
        if (abortSignal?.aborted) {
          throw new Error("File deletion aborted");
        }
        yield {
          id: toolCallId,
          event: "tool-init",
          data: `DeleteFile: ${style.cyan(userPath)}`,
        };

        const filePath = await validatePath(
          joinWorkingDir(userPath, workingDir),
          allowedDirectory,
          { abortSignal },
        );

        // Check if file exists before attempting delete
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }

        // Pre-check for stat
        if (abortSignal?.aborted) {
          throw new Error("File deletion aborted before stat");
        }
        // Ensure it's a file, not a directory
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          throw new Error(`Path is a directory, not a file: ${filePath}`);
        }

        // Pre-side-effect check
        if (abortSignal?.aborted) {
          throw new Error("File deletion aborted before unlink");
        }
        // Delete the file with signal
        await fs.unlink(filePath);

        yield {
          id: toolCallId,
          event: "tool-completion",
          data: "DeleteFile: File deleted successfully",
        };
        yield `Successfully deleted ${filePath}`;
      } catch (error) {
        const errorMessage = `DeleteFile: ${(error as Error).message}`;
        yield {
          id: toolCallId,
          event: "tool-error",
          data: errorMessage,
        };
        yield errorMessage;
      }
    },
  };
};
