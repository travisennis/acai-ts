import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "../config.ts";
import { clearProjectStatusCache } from "../repl/project-status-line.ts";
import style from "../terminal/style.ts";
import {
  joinWorkingDir,
  validateFileNotReadOnly,
  validatePath,
} from "../utils/filesystem/security.ts";
import {
  fileEncodingSchema,
  type ToolCallOptions,
  type ToolResult,
} from "./types.ts";

export const SaveFileTool = {
  name: "Write" as const,
};

const inputSchema = z.object({
  path: z.string().describe("Absolute path to file to save to"),
  content: z.string().describe("Content to save in the file"),
  encoding: fileEncodingSchema
    .describe(
      'Encoding format for saving the file. Use "utf-8" as default for text files',
    )
    .default("utf-8"),
});

type SaveFileInputSchema = z.infer<typeof inputSchema>;

export const createSaveFileTool = async ({
  workingDir,
  allowedDirs,
}: {
  workingDir: string;
  allowedDirs?: string[];
}) => {
  const allowedDirectory = allowedDirs ?? [workingDir];

  return {
    toolDef: {
      description:
        "Create a new file or completely overwrite an existing file with new content. " +
        "Automatically creates all missing parent directories. " +
        "Use with caution as it will overwrite existing files without warning. " +
        "Handles text content with proper encoding. Only works within allowed directories.",
      inputSchema,
    },
    async *execute(
      { path: userPath, content, encoding }: SaveFileInputSchema,
      { toolCallId, abortSignal }: ToolCallOptions,
    ): AsyncGenerator<ToolResult> {
      try {
        if (abortSignal?.aborted) {
          throw new Error("File saving aborted");
        }

        yield {
          name: SaveFileTool.name,
          event: "tool-init",
          id: toolCallId,
          data: `${style.cyan(userPath)}`,
        };

        const filePath = await validatePath(
          joinWorkingDir(userPath, workingDir),
          allowedDirectory,
          { requireExistence: false, abortSignal },
        );

        // Check if file is read-only (only if it exists)
        try {
          await fs.stat(filePath);
          const projectConfig = await config.getConfig();
          validateFileNotReadOnly(filePath, projectConfig, workingDir);
        } catch (error) {
          // File doesn't exist, so it's not read-only
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }

        // Check if path exists and is a directory
        try {
          const stat = await fs.stat(filePath);
          if (stat.isDirectory()) {
            throw new Error(
              `Cannot save file - path is a directory: ${filePath}`,
            );
          }
        } catch (error) {
          // Only re-throw if it's our directory error, otherwise continue (file doesn't exist)
          if (
            error instanceof Error &&
            error.message.includes("is a directory")
          ) {
            throw error;
          }
        }

        // Pre-side-effect check
        if (abortSignal?.aborted) {
          throw new Error("File saving aborted before writing");
        }

        // Ensure parent directory exists (create missing parents)
        const parentDir = path.dirname(filePath);
        await fs.mkdir(parentDir, { recursive: true });
        await fs.writeFile(filePath, content, {
          encoding,
          signal: abortSignal,
        });

        const lines = content.split("\n").length;
        const bytes = Buffer.byteLength(content, encoding);

        yield {
          name: SaveFileTool.name,
          event: "tool-completion",
          id: toolCallId,
          data: `Saved ${lines} lines, ${bytes} bytes`,
        };

        // Clear project status cache since file operations change git status
        clearProjectStatusCache();

        yield `File saved successfully: ${filePath}`;
      } catch (error) {
        yield {
          name: SaveFileTool.name,
          event: "tool-error",
          id: toolCallId,
          data: (error as Error).message,
        };
        yield `Failed to save file: ${(error as Error).message}`;
      }
    },
  };
};
