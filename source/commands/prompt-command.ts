import { readFile, readdir } from "node:fs/promises";
import path, { basename } from "node:path";
import type { CommandOptions, ReplCommand } from "./types.ts";
import { processPrompt } from "../mentions.ts";

export const promptCommand = ({
  terminal,
  modelManager,
  promptManager,
  config,
}: CommandOptions): ReplCommand => {
  return {
    command: "/prompt",
    description:
      "Loads and executes user (global) and project (local) prompts.",
    result: "use" as const,
    getSubCommands: async (): Promise<string[]> => {
      const getPromptNamesFromDir = async (
        dirPath: string,
        type: "user" | "project",
      ): Promise<string[]> => {
        try {
          const dirents = await readdir(dirPath, { withFileTypes: true });
          return dirents
            .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".md"))
            .map((dirent) => `${type}:${basename(dirent.name, ".md")}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return []; // Directory doesn't exist, return empty array
          }
          terminal.error(`Error reading prompts from ${dirPath}: ${error}`);
          return []; // Return empty on other errors too, but log them
        }
      };

      const userPromptDir = config.app.ensurePath("prompts"); // User prompts are global (~/.acai/prompts)
      const projectPromptDir = config.project.ensurePath("prompts"); // Project prompts are local (./.acai/prompts)

      const userPrompts = await getPromptNamesFromDir(userPromptDir, "user");
      const projectPrompts = await getPromptNamesFromDir(
        projectPromptDir,
        "project",
      );

      return [...userPrompts, ...projectPrompts];
    },
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
          // Project prompts are stored in the project's .acai directory
          promptPath = path.join(
            config.project.ensurePath("prompts"),
            `${promptName}.md`,
          );
        } else if (type === "user") {
          // User prompts are stored in the global ~/.acai directory
          promptPath = path.join(
            config.app.ensurePath("prompts"),
            `${promptName}.md`,
          );
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
              `Prompt not found: ${promptName} (${type}). Looked in: ${promptPath}`,
            );
            return;
          }
          throw error;
        }

        terminal.info(`Loaded ${type} prompt: ${promptName}`);

        const processedPrompt = await processPrompt(promptContent, {
          baseDir: process.cwd(),
          model: modelManager.getModelMetadata("repl"),
        });

        promptManager.set(processedPrompt);
      } catch (error) {
        terminal.error(`Error loading prompt: ${(error as Error).message}`);
      }
    },
  };
};
