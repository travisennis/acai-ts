import fs from "node:fs/promises";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import style from "../terminal/style.ts";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import type { ToolResult } from "./types.ts";

export const MoveFileTool = {
  name: "moveFile" as const,
};

const inputSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

type MoveFileInputSchema = z.infer<typeof inputSchema>;

export const createMoveFileTool = async ({
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
        "Move or rename files and directories. Can move files between directories " +
        "and rename them in a single operation. If the destination exists, the " +
        "operation will fail. Works across different directories and can be used " +
        "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
      inputSchema,
    },
    async *execute(
      { source, destination }: MoveFileInputSchema,
      { toolCallId, abortSignal }: ToolCallOptions,
    ): AsyncGenerator<ToolResult> {
      try {
        if (abortSignal?.aborted) {
          throw new Error("File move aborted");
        }

        yield {
          name: MoveFileTool.name,
          id: toolCallId,
          event: "tool-init",
          data: `${style.cyan(source)} => ${style.cyan(destination)}`,
        };

        const validSourcePath = await validatePath(
          joinWorkingDir(source, workingDir),
          allowedDirectory,
          { abortSignal },
        );

        const validDestPath = await validatePath(
          joinWorkingDir(destination, workingDir),
          allowedDirectory,
          { requireExistence: false, abortSignal },
        );

        if (abortSignal?.aborted) {
          throw new Error("File move aborted before file operation");
        }

        await fs.rename(validSourcePath, validDestPath);

        yield {
          name: MoveFileTool.name,
          id: toolCallId,
          event: "tool-completion",
          data: "File moved",
        };

        yield `Successfully moved ${source} to ${destination}`;
      } catch (error) {
        yield {
          name: MoveFileTool.name,
          event: "tool-error",
          id: toolCallId,
          data: (error as Error).message,
        };
        yield `Failed to move file: ${(error as Error).message}`;
      }
    },
  };
};
