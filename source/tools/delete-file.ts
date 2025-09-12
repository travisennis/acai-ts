import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { input, select } from "@inquirer/prompts";
import { tool } from "ai";
import { z } from "zod";
import chalk from "../terminal/chalk.ts";
import type { Terminal } from "../terminal/index.ts";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import type { SendData } from "./types.ts";

export const DeleteFileTool = {
  name: "deleteFile" as const,
};

export const createDeleteFileTool = async ({
  workingDir,
  sendData,
  terminal,
  autoAcceptAll,
}: {
  workingDir: string;
  sendData?: SendData;
  terminal?: Terminal;
  autoAcceptAll?: boolean;
}) => {
  const allowedDirectory = workingDir;
  let autoAcceptDeletes = autoAcceptAll ?? false;

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
          data: `Deleting file: ${chalk.cyan(userPath)}`,
        });
        try {
          const filePath = await validatePath(
            joinWorkingDir(userPath, workingDir),
            allowedDirectory,
            abortSignal,
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
              `\n${chalk.red.bold("●")} Proposing file deletion: ${chalk.cyan(userPath)}`,
            );

            terminal.lineBreak();
            terminal.writeln("This action cannot be undone.");
            terminal.lineBreak();

            let userChoice: string;
            if (autoAcceptDeletes) {
              terminal.writeln(
                chalk.green(
                  "✓ Auto-accepting deletions (all future deletions will be accepted)",
                ),
              );
              userChoice = "accept";
            } else {
              try {
                userChoice = await select(
                  {
                    message: "What would you like to do with this file?",
                    choices: [
                      { name: "Accept and delete this file", value: "accept" },
                      {
                        name: "Accept all future deletions (including this)",
                        value: "accept-all",
                      },
                      { name: "Reject this deletion", value: "reject" },
                    ],
                    default: "accept",
                  },
                  { signal: abortSignal },
                );
              } catch (e) {
                if ((e as Error).name === "AbortError") {
                  throw new Error("File deletion aborted during user input");
                }
                throw e;
              }
            }

            terminal.lineBreak();

            if (userChoice === "accept-all") {
              autoAcceptDeletes = true;
              terminal.writeln(
                chalk.yellow(
                  "✓ Auto-accept mode enabled for all future deletions",
                ),
              );
              terminal.lineBreak();
            }

            if (userChoice === "reject") {
              let reason: string;
              try {
                reason = await input(
                  { message: "Feedback: " },
                  { signal: abortSignal },
                );
              } catch (e) {
                if ((e as Error).name === "AbortError") {
                  throw new Error("File deletion aborted during user input");
                }
                throw e;
              }

              terminal.lineBreak();

              sendData?.({
                id: toolCallId,
                event: "tool-completion",
                data: `Deletion rejected by user. Reason: ${reason}`,
              });

              return `The user rejected this deletion. Reason: ${reason}`;
            }

            // If accepted, proceed to delete file
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
