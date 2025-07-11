import { input, select } from "@inquirer/prompts";
import { tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
import type { Terminal } from "../terminal/index.ts";
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
  autoAcceptAll,
}: {
  workingDir: string;
  terminal?: Terminal;
  sendData?: SendData;
  autoAcceptAll: boolean;
}) => {
  const allowedDirectory = workingDir;
  let autoAcceptEdits = autoAcceptAll;
  return {
    [EditFileTool.name]: tool({
      description:
        "Make line-based edits to a text file. Each edit replaces exact line sequences " +
        "with new content. Creates a backup file (.backup) before saving changes. " +
        "Returns a git-style diff showing the changes made. " +
        "Only works within allowed directories.",
      parameters: z.object({
        path: z.string().describe("The path of the file to edit."),
        edits: z.array(
          z.object({
            oldText: z
              .string()
              .describe(
                "Text to search for - must match exactly and enough context must be provided to uniquely match the target text",
              ),
            newText: z.string().describe("Text to replace with"),
          }),
        ),
      }),
      execute: async ({ path, edits }, { toolCallId }) => {
        sendData?.({
          id: toolCallId,
          event: "tool-init",
          data: `Editing file: ${chalk.cyan(path)}`,
        });
        try {
          const validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectory,
          );

          if (terminal) {
            terminal.writeln(
              `\n${chalk.blue.bold("●")} Proposing file changes: ${chalk.cyan(path)}`,
            );

            terminal.lineBreak();

            const result = await applyFileEdits(validPath, edits, true);

            terminal.writeln(
              `The agent is proposing the following ${chalk.cyan(edits.length)} edits:`,
            );

            terminal.lineBreak();

            terminal.display(result);

            terminal.lineBreak();

            let userChoice: string;
            if (autoAcceptEdits) {
              terminal.writeln(
                chalk.green(
                  "✓ Auto-accepting edits (all future edits will be accepted)",
                ),
              );
              userChoice = "accept";
            } else {
              userChoice = await select({
                message: "What would you like to do with these changes?",
                choices: [
                  { name: "Accept these changes", value: "accept" },
                  {
                    name: "Accept all future edits (including these)",
                    value: "accept-all",
                  },
                  { name: "Reject these changes", value: "reject" },
                ],
                default: "accept",
              });
            }

            terminal.lineBreak();

            if (userChoice === "accept-all") {
              autoAcceptEdits = true;
              terminal.writeln(
                chalk.yellow("✓ Auto-accept mode enabled for all future edits"),
              );
              terminal.lineBreak();
            }

            if (userChoice === "accept" || userChoice === "accept-all") {
              const finalEdits = await applyFileEdits(validPath, edits, false);
              // Send completion message indicating success
              sendData?.({
                id: toolCallId,
                event: "tool-completion",
                data: "Edits accepted and applied successfully.",
              });
              return finalEdits;
            }

            const reason = await input({ message: "Feedback: " });

            terminal.lineBreak();

            // Send completion message indicating rejection
            sendData?.({
              id: toolCallId,
              event: "tool-completion",
              data: `Edits rejected by user. Reason: ${reason}`,
            });
            return `The user rejected these changes. Reason: ${reason}`;
          }
          const finalEdits = await applyFileEdits(validPath, edits, false);
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
