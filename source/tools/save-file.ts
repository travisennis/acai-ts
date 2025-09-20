import fs from "node:fs/promises";
import path from "node:path";
import { input, select } from "@inquirer/prompts";
import { tool } from "ai";
import { z } from "zod";
import { formatCodeBlock } from "../formatting.ts";
import chalk from "../terminal/chalk.ts";
import type { Terminal } from "../terminal/index.ts";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import { fileEncodingSchema, type SendData } from "./types.ts";

export const SaveFileTool = {
  name: "saveFile" as const,
};

export const createSaveFileTool = async ({
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
  let autoAcceptSaves = autoAcceptAll ?? false;

  return {
    [SaveFileTool.name]: tool({
      description:
        "Create a new file or completely overwrite an existing file with new content. " +
        "Automatically creates all missing parent directories. " +
        "Use with caution as it will overwrite existing files without warning. " +
        "Handles text content with proper encoding. Only works within allowed directories.",
      inputSchema: z.object({
        path: z.string().describe("Absolute path to file to save to"),
        content: z.string().describe("Content to save in the file"),
        encoding: fileEncodingSchema.describe(
          'Encoding format for saving the file. Use "utf-8" as default for text files',
        ),
      }),
      execute: async (
        {
          path: userPath,
          content,
          encoding,
        }: {
          path: string;
          content: string;
          encoding: z.infer<typeof fileEncodingSchema>;
        },
        { toolCallId, abortSignal },
      ) => {
        // Check if execution has been aborted
        if (abortSignal?.aborted) {
          throw new Error("File saving aborted");
        }
        sendData?.({
          id: toolCallId,
          event: "tool-init",
          data: `Saving file: ${chalk.cyan(userPath)}`,
        });
        try {
          const filePath = await validatePath(
            joinWorkingDir(userPath, workingDir),
            allowedDirectory,
            abortSignal,
          );

          if (terminal) {
            terminal.writeln(
              `\n${chalk.blue.bold("●")} Proposing file save: ${chalk.cyan(userPath)}`,
            );

            terminal.lineBreak();
            terminal.writeln("Proposed file content:");
            terminal.lineBreak();
            terminal.display(formatCodeBlock(filePath, content));
            terminal.lineBreak();

            let userChoice: string;
            // Determine overwrite status for display
            let overwriteMessage = "";
            try {
              const stat = await fs.stat(filePath);
              if (stat.isFile()) {
                overwriteMessage = chalk.yellow(
                  "(Will overwrite existing file)",
                );
              }
            } catch {
              overwriteMessage = chalk.green("(Will create new file)");
            }

            if (autoAcceptSaves) {
              terminal.writeln(
                chalk.green(
                  "✓ Auto-accepting saves (all future saves will be accepted)",
                ),
              );
              userChoice = "accept";
            } else {
              try {
                userChoice = await select(
                  {
                    message: `What would you like to do with this file? ${overwriteMessage}`,
                    choices: [
                      { name: "Accept and save this file", value: "accept" },
                      {
                        name: "Accept all future saves (including this)",
                        value: "accept-all",
                      },
                      { name: "Reject this save", value: "reject" },
                    ],
                    default: "accept",
                  },
                  { signal: abortSignal },
                );
              } catch (e) {
                if ((e as Error).name === "AbortError") {
                  throw new Error("File saving aborted during user input");
                }
                throw e;
              }
            }

            terminal.lineBreak();

            if (userChoice === "accept-all") {
              autoAcceptSaves = true;
              terminal.writeln(
                chalk.yellow("✓ Auto-accept mode enabled for all future saves"),
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
                  throw new Error("File saving aborted during user input");
                }
                throw e;
              }

              terminal.lineBreak();

              sendData?.({
                id: toolCallId,
                event: "tool-completion",
                data: `Save rejected by user. Reason: ${reason}`,
              });

              return `The user rejected this save. Reason: ${reason}`;
            }

            // If accepted, proceed to write file
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

          sendData?.({
            id: toolCallId,
            event: "tool-completion",
            data: `File saved successfully: ${userPath}`,
          });
          return `File saved successfully: ${filePath}`;
        } catch (error) {
          sendData?.({
            id: toolCallId,
            event: "tool-error",
            data: `Failed to save file: ${(error as Error).message}`,
          });
          return `Failed to save file: ${(error as Error).message}`;
        }
      },
    }),
  };
};
