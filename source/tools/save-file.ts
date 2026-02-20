import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "../config/index.ts";
import type { WorkspaceContext } from "../index.ts";
import { clearProjectStatusCache } from "../repl/project-status.ts";
import style from "../terminal/style.ts";
import { toDisplayPath } from "../utils/filesystem/path-display.ts";
import {
  joinWorkingDir,
  validateFileNotReadOnly,
  validatePath,
} from "../utils/filesystem/security.ts";
import { fileEncodingSchema, type ToolExecutionOptions } from "./types.ts";

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

export const createSaveFileTool = async (options: {
  workspace: WorkspaceContext;
}) => {
  const { primaryDir, allowedDirs } = options.workspace;
  const allowedDirectory = allowedDirs ?? [primaryDir];

  return {
    toolDef: {
      description: "Create or overwrite a file with new content.",
      inputSchema,
    },
    display({ path }: SaveFileInputSchema) {
      const displayPath = toDisplayPath(path);
      return `${style.cyan(displayPath)}`;
    },
    async execute(
      { path: userPath, content, encoding }: SaveFileInputSchema,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("File saving aborted");
      }

      const filePath = await validatePath(
        joinWorkingDir(userPath, primaryDir),
        allowedDirectory,
        { requireExistence: false, abortSignal },
      );

      try {
        await fs.stat(filePath);
        const projectConfig = await config.getConfig();
        validateFileNotReadOnly(filePath, projectConfig, primaryDir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      try {
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          throw new Error(
            `Cannot save file - path is a directory: ${filePath}`,
          );
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("is a directory")
        ) {
          throw error;
        }
      }

      if (abortSignal?.aborted) {
        throw new Error("File saving aborted before writing");
      }

      const parentDir = path.dirname(filePath);
      await fs.mkdir(parentDir, { recursive: true });
      await fs.writeFile(filePath, content, {
        encoding,
        signal: abortSignal,
      });

      clearProjectStatusCache();

      return `File saved successfully: ${filePath}`;
    },
  };
};
