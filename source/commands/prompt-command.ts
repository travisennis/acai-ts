import { readFile } from "node:fs/promises";
import path from "node:path";
import { join } from "node:path";
import type { CommandOptions, ReplCommand } from "./types.ts";
import { config } from "../config.ts";

export const promptCommand = ({ terminal, promptManager }: CommandOptions) => {
  return {
    command: "/prompt",
    description: "Loads and executes user and project prompts.",
    result: "use" as const,
    getSubCommands: () => [],
    execute: async (args: string[]) => {
      if (!args || args.length === 0) {
        terminal.warn(
          "Please provide a prompt type and name. Usage: /prompt user:optimize or /prompt project:optimize",
        );
        return;
      }

      const promptArg = args[0] ?? "";
      const [typeStr, promptName] = promptArg.split(":");

      if (!(typeStr && promptName)) {
        terminal.warn(
          "Invalid prompt format. Use: /prompt user:name or /prompt project:name",
        );
        return;
      }

      let promptPath = "";
      const type = typeStr.toLowerCase();

      try {
        if (type === "project") {
          // Project prompts are stored in the project config directory
          promptPath = path.join(
            config.app.ensurePath("prompts"),
            `${promptName}.md`,
          );
        } else if (type === "user") {
          // User prompts are stored in the user data directory
          const userPromptDir = config.project.ensurePath("prompts");
          promptPath = join(userPromptDir, `${promptName}.md`);
        } else {
          terminal.warn(
            `Unknown prompt type: ${type}. Use 'user' or 'project'`,
          );
          return;
        }

        let promptContent: string;
        try {
          promptContent = await readFile(promptPath, "utf8");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            terminal.error(
              `Prompt not found: ${promptName} (${type}). Check that the file exists at ${promptPath}`,
            );
            return;
          }
          throw error;
        }

        terminal.info(`Loaded prompt: ${promptName} (${type})`);
        promptManager.set(promptContent);
      } catch (error) {
        terminal.error(`Error loading prompt: ${(error as Error).message}`);
      }
    },
  } satisfies ReplCommand;
};
