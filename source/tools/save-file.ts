import fs from "node:fs/promises";
import path from "node:path";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { formatCodeBlock } from "../formatting.ts";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import type { AskResponse, ToolExecutor } from "../tool-executor.ts";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import { fileEncodingSchema, type ToolResult } from "./types.ts";

export const SaveFileTool = {
  name: "saveFile" as const,
};

const inputSchema = z.object({
  path: z.string().describe("Absolute path to file to save to"),
  content: z.string().describe("Content to save in the file"),
  encoding: fileEncodingSchema.describe(
    'Encoding format for saving the file. Use "utf-8" as default for text files',
  ),
});

type SaveFileInputSchema = z.infer<typeof inputSchema>;

export const createSaveFileTool = async ({
  workingDir,
  allowedDirs,
  terminal,
  toolExecutor,
}: {
  workingDir: string;
  allowedDirs?: string[];
  terminal?: Terminal;
  toolExecutor?: ToolExecutor;
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
          event: "tool-init",
          id: toolCallId,
          data: `SaveFile: ${style.cyan(userPath)}`,
        };

        const filePath = await validatePath(
          joinWorkingDir(userPath, workingDir),
          allowedDirectory,
          { requireExistence: false, abortSignal },
        );

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

        yield {
          event: "tool-completion",
          id: toolCallId,
          data: `File saved successfully: ${userPath}`,
        };
        yield `File saved successfully: ${filePath}`;
      } catch (error) {
        yield {
          event: "tool-error",
          id: toolCallId,
          data: `Failed to save file: ${(error as Error).message}`,
        };
        yield `Failed to save file: ${(error as Error).message}`;
      }
    },
    ask: async (
      { path: userPath, content }: SaveFileInputSchema,
      {
        toolCallId,
        abortSignal,
      }: { toolCallId: string; abortSignal?: AbortSignal },
    ): Promise<{ approve: true } | { approve: false; reason: string }> => {
      try {
        if (terminal) {
          const filePath = await validatePath(
            joinWorkingDir(userPath, workingDir),
            allowedDirectory,
            { requireExistence: false, abortSignal },
          );

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

          terminal.writeln(
            `\n${style.blue.bold("●")} Proposing file save: ${style.cyan(userPath)}`,
          );

          terminal.lineBreak();
          terminal.writeln("Proposed file content:");
          terminal.hr();
          terminal.display(formatCodeBlock(userPath, content));
          terminal.hr();

          // Determine overwrite status for display
          let overwriteMessage = "";
          try {
            const stat = await fs.stat(filePath);
            if (stat.isFile()) {
              overwriteMessage = style.yellow("(Will overwrite existing file)");
            }
          } catch {
            overwriteMessage = style.green("(Will create new file)");
          }

          let userResponse: AskResponse | undefined;
          if (toolExecutor) {
            const ctx = {
              toolName: SaveFileTool.name,
              toolCallId,
              message: `What would you like to do with this save? ${overwriteMessage}`,
              choices: {
                accept: "Accept this save",
                acceptAll: "Accept all future saves (including this)",
                reject: "Reject this save",
              },
            };
            try {
              userResponse = await toolExecutor.ask(ctx, { abortSignal });
            } catch (e) {
              if ((e as Error).name === "AbortError") {
                throw new Error("File saving aborted during user input");
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
              style.yellow("✓ Auto-accept mode enabled for all saves"),
            );
            terminal.lineBreak();
          }

          if (userChoice === "reject") {
            terminal.lineBreak();

            const rejectionReason = reason || "No reason provided";
            return {
              approve: false,
              reason: `The user rejected this save. Reason: ${rejectionReason}`,
            };
          }
        }
        return {
          approve: true,
        };
      } catch (error) {
        const errMsg = (error as Error).message ?? "Unknown error";
        return {
          approve: false,
          reason: `Approval failed during pre-checks: ${errMsg}. Ensure the path is valid, not a directory, and within the allowed project directory, then try again.`,
        };
      }
    },
  };
};
