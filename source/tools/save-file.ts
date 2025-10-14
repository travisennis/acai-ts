import fs from "node:fs/promises";
import path from "node:path";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { formatCodeBlock } from "../formatting.ts";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import type { AskResponse, ToolExecutor } from "../tool-executor.ts";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import { fileEncodingSchema, type Message } from "./types.ts";

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
        "Create a new file or completely overwrite an existing file with new content. " +
        "Automatically creates all missing parent directories. " +
        "Use with caution as it will overwrite existing files without warning. " +
        "Handles text content with proper encoding. Only works within allowed directories.",
      inputSchema,
    },
    async *execute(
      { path: userPath, content, encoding }: SaveFileInputSchema,
      { toolCallId, abortSignal }: ToolCallOptions,
    ): AsyncGenerator<Message, string> {
      try {
        if (abortSignal?.aborted) {
          throw new Error("File saving aborted");
        }

        yield {
          event: "tool-init",
          id: toolCallId,
          data: `Saving file: ${style.cyan(userPath)}`,
        };

        const filePath = await validatePath(
          joinWorkingDir(userPath, workingDir),
          allowedDirectory,
          { requireExistence: false, abortSignal },
        );

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
        return `File saved successfully: ${filePath}`;
      } catch (error) {
        yield {
          event: "tool-error",
          id: toolCallId,
          data: `Failed to save file: ${(error as Error).message}`,
        };
        return `Failed to save file: ${(error as Error).message}`;
      }
    },
    ask: async (
      { path: userPath, content }: SaveFileInputSchema,
      {
        toolCallId,
        abortSignal,
      }: { toolCallId: string; abortSignal?: AbortSignal },
    ): Promise<{ approve: true } | { approve: false; reason: string }> => {
      if (terminal) {
        const filePath = await validatePath(
          joinWorkingDir(userPath, workingDir),
          allowedDirectory,
          { requireExistence: false, abortSignal },
        );

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
    },
  };
};
