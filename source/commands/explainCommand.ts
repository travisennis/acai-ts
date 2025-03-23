import { readFile } from "node:fs/promises";
import { select } from "@inquirer/prompts";
import { generateText } from "ai";
import { globby } from "globby";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const explainCommand = ({ terminal, modelManager }: CommandOptions) => {
  return {
    command: "/explain",
    description: "Explains code from a file or selection",
    result: "continue" as const,
    execute: async (args: string[]) => {
      let fileArg: string | undefined;
      if (!args || args.length === 0) {
        // Get all files in the current directory
        const foundFiles = await globby("**/*", { gitignore: true });

        const selectedFile = await select<string>({
          message: "Select file to include:",
          choices: foundFiles,
          pageSize: 15,
        });

        if (!selectedFile) {
          terminal.warn("No file selected.");
          return;
        }

        // Process the selected files
        fileArg = selectedFile;
      } else {
        fileArg = args[0];
      }

      if (!fileArg) {
        return;
      }

      try {
        let filePath: string;
        let lineRange: [number, number] | undefined;

        // Check if a line range is specified (e.g., file.ts:10-20)
        if (fileArg.includes(":")) {
          const [path = "", range = ""] = fileArg.split(":");
          filePath = path;

          if (range.includes("-")) {
            const [start = 0, end = 0] = range.split("-").map(Number);
            if (!(Number.isNaN(start) || Number.isNaN(end))) {
              lineRange = [start, end];
            }
          } else {
            const lineNum = Number(range);
            if (!Number.isNaN(lineNum)) {
              // If single line, create a small range around it
              lineRange = [Math.max(1, lineNum - 2), lineNum + 2];
            }
          }
        } else {
          filePath = fileArg;
        }

        // Read the file content
        const content = await readFile(filePath, "utf8");

        // Extract the relevant lines if a range was specified
        let codeToExplain = content;
        if (lineRange) {
          const lines = content.split("\n");
          codeToExplain = lines
            .slice(lineRange[0] - 1, lineRange[1])
            .join("\n");
        }

        terminal.header(
          `Explaining: ${filePath}${lineRange ? `:${lineRange[0]}-${lineRange[1]}` : ""}`,
        );

        // Generate explanation using the AI model
        const { text } = await generateText({
          model: modelManager.getModel("explain-code"),
          prompt: `Please explain the following code:
\`\`\`
${codeToExplain}
\`\`\`
Focus on:
1. What the code does
2. Key patterns or techniques used
3. Any potential issues or improvements`,
          maxSteps: 10,
        });

        terminal.display(text);
      } catch (error) {
        terminal.error(`Error explaining code: ${(error as Error).message}`);
      }
    },
  } satisfies ReplCommand;
};
