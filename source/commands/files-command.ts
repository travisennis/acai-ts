import { readFile } from "node:fs/promises";
import { checkbox } from "@inquirer/prompts";
import { globby } from "globby";
import { formatFile } from "../formatting.ts";
import { TokenCounter } from "../token-utils.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const filesCommand = ({
  terminal,
  promptManager,
  modelManager,
}: CommandOptions): ReplCommand => {
  return {
    command: "/files",
    description:
      "Finds files matching the given patterns and adds their content to the next prompt. Usage: /files or /files src/**/*.ts",
    getSubCommands: () => Promise.resolve([]),
    execute: async (args: string[]) => {
      try {
        let workingFiles: string[] = [];
        if (!args || args.length === 0) {
          // Get all files in the current directory
          const foundFiles = await globby("**/*", { gitignore: true });

          const selectedFiles = await checkbox<string>({
            message: "Select files to include:",
            choices: foundFiles,
            pageSize: 15,
          });

          if (selectedFiles.length === 0) {
            terminal.warn("No files selected.");
            return "continue";
          }

          // Process the selected files
          workingFiles = selectedFiles;
        } else {
          const patternList = args.filter(Boolean);
          const foundFiles = await globby(patternList, { gitignore: true });

          if (foundFiles.length === 0) {
            terminal.warn("No files found matching the pattern(s)");
            return "continue";
          }

          // Process the selected files
          workingFiles = foundFiles;
        }

        // Read the content of the files and format them for the next prompt
        const format = modelManager.getModelMetadata("repl").promptFormat;
        let tokenCount = 0;

        const tokenCounter = new TokenCounter();

        await Promise.all(
          workingFiles.map(async (filePath) => {
            try {
              const content = await readFile(filePath, "utf-8");
              const formattedFile = formatFile(filePath, content, format);
              tokenCount += tokenCounter.count(formattedFile);
              promptManager.addContext(formattedFile);
            } catch (error) {
              terminal.error(
                `Error reading file ${filePath}: ${(error as Error).message}`,
              );
            }
          }),
        );

        tokenCounter.free();

        terminal.success(
          `File contents will be added to your next prompt (${workingFiles.length} files, ${tokenCount} tokens)`,
        );
        return "continue";
      } catch (error) {
        terminal.error(
          `Error processing file patterns: ${(error as Error).message}`,
        );
        return "continue";
      }
    },
  };
};
