import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import type { AskResponse, ToolExecutor } from "../tool-executor.ts";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import type { SendData } from "./types.ts";

export const DeleteFileTool = {
  name: "deleteFile" as const,
};

export const createDeleteFileTool = async ({
  workingDir,
  terminal,
  sendData,
  toolExecutor,
}: {
  workingDir: string;
  terminal?: Terminal;
  sendData?: SendData;
  toolExecutor?: ToolExecutor;
}) => {
  const allowedDirectory = workingDir;

  return {
    [DeleteFileTool.name]: tool({
      description: "Delete a file permanently.",
      inputSchema: z.object({
        path: z.string().describe("Absolute path to the file to delete"),
      }),
      execute: async ({ path: userPath }, { toolCallId, abortSignal }) => {
        // Check if execution has been aborted
        if (abortSignal?.aborted) {
          throw new Error("File deletion aborted");
        }
        sendData?.({
          id: toolCallId,
          event: "tool-init",
          data: `Deleting file: ${style.cyan(userPath)}`,
        });
        try {
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

          if (terminal) {
            terminal.writeln(
              `\n${style.red.bold("●")} Proposing file deletion: ${style.cyan(userPath)}`,
            );

            terminal.lineBreak();
            terminal.writeln("This action cannot be undone.");
            terminal.lineBreak();

            let userResponse: AskResponse | undefined;
            if (toolExecutor) {
              const ctx = {
                toolName: DeleteFileTool.name,
                toolCallId,
                message: "What would you like to do with this deletion?",
                choices: {
                  accept: "Accept this deletion",
                  acceptAll: "Accept all future deletions (including this)",
                  reject: "Reject this deletion",
                },
              };
              try {
                userResponse = await toolExecutor.ask(ctx, { abortSignal });
              } catch (e) {
                if ((e as Error).name === "AbortError") {
                  throw new Error("File deletion aborted during user input");
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
                style.yellow("✓ Auto-accept mode enabled for all deletions"),
              );
              terminal.lineBreak();
            }

            if (userChoice === "reject") {
              terminal.lineBreak();

              const rejectionReason = reason || "No reason provided";
              sendData?.({
                id: toolCallId,
                event: "tool-completion",
                data: `Deletion rejected by user. Reason: ${rejectionReason}`,
              });
              return `The user rejected this deletion. Reason: ${rejectionReason}`;
            }
          }

          // Pre-side-effect check
          if (abortSignal?.aborted) {
            throw new Error("File deletion aborted before unlink");
          }
          // Delete the file with signal
          await fs.unlink(filePath);

          sendData?.({
            id: toolCallId,
            event: "tool-completion",
            data: "File deleted successfully",
          });
          return `Successfully deleted ${filePath}`;
        } catch (error) {
          const errorMessage = `Failed to delete file: ${(error as Error).message}`;
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
