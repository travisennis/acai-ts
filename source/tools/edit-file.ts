import { tool } from "ai";
import { z } from "zod";
import chalk from "../terminal/chalk.ts";
import type { Terminal } from "../terminal/index.ts";
import type { AskResponse, ToolExecutor } from "../tool-executor.ts";
import {
  applyFileEdits,
  joinWorkingDir,
  validatePath,
} from "./filesystem-utils.ts";
import type { SendData } from "./types.ts";

export const EditFileTool = {
  name: "editFile" as const,
};

export const createEditFileTool = async ({
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
    [EditFileTool.name]: tool({
      description:
        "Make line-based edits to a text file. Each edit replaces exact line sequences " +
        "with new content. Returns a git-style diff showing the changes made. " +
        "Only works within allowed directories. " +
        "Note: Special characters in oldText must be properly escaped for JSON (e.g., backticks as \\`...\\`). " +
        "Multi-line strings require exact character-by-character matching including whitespace.",
      inputSchema: z.object({
        path: z.string().describe("The path of the file to edit."),
        edits: z.array(
          z.object({
            oldText: z
              .string()
              .describe(
                "Text to search for - must match exactly and enough context must be provided to uniquely match the target text. " +
                  "Special characters require JSON escaping: backticks (\\`...\\`), quotes, backslashes. " +
                  "For multi-line content, include exact newlines and indentation.",
              ),
            newText: z.string().describe("Text to replace with"),
          }),
        ),
      }),
      execute: async ({ path, edits }, { toolCallId, abortSignal }) => {
        // Check if execution has been aborted
        if (abortSignal?.aborted) {
          throw new Error("File editing aborted");
        }
        sendData?.({
          id: toolCallId,
          event: "tool-init",
          data: `Editing file: ${chalk.cyan(path)}`,
        });
        try {
          const validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectory,
            { abortSignal },
          );

          if (terminal) {
            terminal.writeln(
              `\n${chalk.blue.bold("●")} Proposing file changes: ${chalk.cyan(path)}`,
            );

            terminal.lineBreak();

            const result = await applyFileEdits(
              validPath,
              edits,
              true,
              abortSignal,
            );

            terminal.writeln(
              `The agent is proposing the following ${chalk.cyan(edits.length)} edits:`,
            );

            terminal.lineBreak();

            terminal.display(result);

            terminal.lineBreak();

            let userResponse: AskResponse | undefined;
            if (toolExecutor) {
              const ctx = {
                toolName: EditFileTool.name,
                toolCallId,
                message: "What would you like to do with these changes?",
                choices: {
                  accept: "Accept these changes",
                  acceptAll: "Accept all future edits (including these)",
                  reject: "Reject these changes",
                },
              };
              try {
                userResponse = await toolExecutor.ask(ctx, { abortSignal });
              } catch (e) {
                if ((e as Error).name === "AbortError") {
                  throw new Error("File editing aborted during user input");
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
                chalk.yellow("✓ Auto-accept mode enabled for all edits"),
              );
              terminal.lineBreak();
            }

            if (userChoice === "accept" || userChoice === "accept-all") {
              const finalEdits = await applyFileEdits(
                validPath,
                edits,
                false,
                abortSignal,
              );
              // Send completion message indicating success
              sendData?.({
                id: toolCallId,
                event: "tool-completion",
                data: "Edits accepted and applied successfully.",
              });
              return finalEdits;
            }

            terminal.lineBreak();

            // Send completion message indicating rejection
            const rejectionReason = reason || "No reason provided";
            sendData?.({
              id: toolCallId,
              event: "tool-completion",
              data: `Edits rejected by user. Reason: ${rejectionReason}`,
            });
            return `The user rejected these changes. Reason: ${rejectionReason}`;
          }

          const finalEdits = await applyFileEdits(
            validPath,
            edits,
            false,
            abortSignal,
          );
          // Send completion message indicating success
          sendData?.({
            id: toolCallId,
            event: "tool-completion",
            data: "Edits accepted and applied successfully.",
          });
          return finalEdits;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: toolCallId,
            data: `Failed to edit file: ${(error as Error).message}`,
          });
          return `Failed to edit file: ${(error as Error).message}`;
        }
      },
    }),
  };
};
