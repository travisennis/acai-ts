import { readFile } from "node:fs/promises";
import { formatFile } from "../formatting.ts";
import { checkbox } from "../terminal/checkbox-prompt.ts";
import style from "../terminal/style.ts";
import { TokenCounter } from "../tokens/counter.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import { glob } from "../utils/glob.ts";
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
          const foundFiles = await glob("**/*", { gitignore: true });

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
          const foundFiles = await glob(patternList, { gitignore: true });

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
    async handle(
      args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      try {
        let workingFiles: string[] = [];
        if (!args || args.length === 0) {
          // Get all files in the current directory
          const foundFiles = await glob("**/*", { gitignore: true });

          // For TUI mode, we'll just use the first few files
          workingFiles = foundFiles.slice(0, 5);

          if (workingFiles.length === 0) {
            container.addChild(new Text(style.yellow("No files found"), 0, 1));
            tui.requestRender();
            editor.setText("");
            return "continue";
          }
        } else {
          const patternList = args.filter(Boolean);
          const foundFiles = await glob(patternList, { gitignore: true });

          if (foundFiles.length === 0) {
            container.addChild(
              new Text(
                style.yellow("No files found matching the pattern(s)"),
                1,
                0,
              ),
            );
            tui.requestRender();
            editor.setText("");
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
              container.addChild(
                new Text(
                  style.red(
                    `Error reading file ${filePath}: ${(error as Error).message}`,
                  ),
                  1,
                  0,
                ),
              );
            }
          }),
        );

        tokenCounter.free();

        container.addChild(
          new Text(
            style.green(
              `File contents will be added to your next prompt (${workingFiles.length} files, ${tokenCount} tokens)`,
            ),
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      } catch (error) {
        container.addChild(
          new Text(
            style.red(
              `Error processing file patterns: ${(error as Error).message}`,
            ),
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
    },
  };
};
