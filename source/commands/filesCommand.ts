import { checkbox } from "@inquirer/prompts";
import { globby } from "globby";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const filesCommand = ({
  terminal,
  fileManager,
  modelManager,
}: CommandOptions) => {
  return {
    command: "/files",
    description:
      "Finds files matching the given patterns and adds their content to the next prompt. Usage: /files or /files src/**/*.ts",
    result: "continue" as const,
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
            return;
          }

          // Process the selected files
          workingFiles = selectedFiles;
        } else {
          terminal.header("Finding files:");
          const patternList = args.filter(Boolean);
          const foundFiles = await globby(patternList, { gitignore: true });

          if (foundFiles.length === 0) {
            terminal.warn("No files found matching the pattern(s)");
            return;
          }

          terminal.header("Found files:");
          terminal.writeln("");
          for (const file of foundFiles) {
            terminal.writeln(`- ${file}`);
          }
          // Process the selected files
          workingFiles = foundFiles;
        }

        fileManager.addFiles({
          files: workingFiles,
          format: modelManager.getModelMetadata("repl").promptFormat,
        });

        terminal.writeln("");
        terminal.success(
          `File contents will be added to your next prompt (${workingFiles.length} files)`,
        );
      } catch (error) {
        terminal.error(
          `Error processing file patterns: ${(error as Error).message}`,
        );
      }
    },
  } satisfies ReplCommand;
};