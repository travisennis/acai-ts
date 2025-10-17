import fs from "node:fs/promises";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import type { AskResponse, ToolExecutor } from "../tool-executor.ts";
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
  terminal,
  toolExecutor,
}: {
  workingDir: string;
  terminal?: Terminal;
  toolExecutor?: ToolExecutor;
}) => {
  const allowedDirectory = workingDir;
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
          id: toolCallId,
          event: "tool-init",
          data: `Moving file from ${style.cyan(source)} to ${style.cyan(destination)}`,
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
          id: toolCallId,
          event: "tool-completion",
          data: "File moved successfully",
        };

        yield `Successfully moved ${source} to ${destination}`;
      } catch (error) {
        yield {
          event: "tool-error",
          id: toolCallId,
          data: `Failed to move file: ${(error as Error).message}`,
        };
        yield `Failed to move file: ${(error as Error).message}`;
      }
    },
    ask: async (
      { source, destination }: MoveFileInputSchema,
      {
        toolCallId,
        abortSignal,
      }: { toolCallId: string; abortSignal?: AbortSignal },
    ): Promise<{ approve: true } | { approve: false; reason: string }> => {
      if (terminal) {
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

        // Show move preview
        terminal.writeln(
          `\n${style.blue.bold("●")} Proposing to move file: ${style.cyan(source)} → ${style.cyan(destination)}`,
        );

        terminal.lineBreak();

        terminal.writeln(
          `The agent is proposing to move:\n  ${style.cyan(validSourcePath)}\n  → ${style.cyan(validDestPath)}`,
        );

        terminal.hr();

        let userResponse: AskResponse | undefined;
        // Prompt only when a toolExecutor is present
        if (toolExecutor) {
          const ctx = {
            toolName: MoveFileTool.name,
            toolCallId,
            message: "What would you like to do with this file move?",
            choices: {
              accept: "Accept this file move",
              acceptAll: "Accept all future file moves (including this)",
              reject: "Reject this file move",
            },
          };
          try {
            userResponse = await toolExecutor.ask(ctx, { abortSignal });
          } catch (e) {
            if ((e as Error).name === "AbortError") {
              throw new Error("File move aborted during user input");
            }
            throw e;
          }
        }

        const { result: userChoice, reason } = userResponse ?? {
          result: "accept",
        };

        terminal.lineBreak();

        if (userChoice === "accept-all") {
          terminal.writeln(
            style.yellow("✓ Auto-accept mode enabled for all file moves"),
          );
          terminal.lineBreak();
        }

        if (userChoice === "reject") {
          terminal.lineBreak();

          const rejectionReason = reason || "No reason provided";
          return {
            approve: false,
            reason: `The user rejected this file move. Reason: ${rejectionReason}`,
          };
        }
      }
      return {
        approve: true,
      };
    },
  };
};
