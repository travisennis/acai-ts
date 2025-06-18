import { readdir, readFile } from "node:fs/promises";
import path, { basename } from "node:path";
import { processPrompt } from "../mentions.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

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
      const promptArg = args?.[0];
      if (!promptArg) {
        terminal.warn(
          "Please provide a prompt type and name. Usage: /prompt user:optimize or /prompt project:optimize",
        );
        return;
      }

      const [typeStr, promptName, ...rest] = promptArg.split(":");

      if (!(typeStr && promptName) || rest.length > 0) {
        terminal.warn(
          "Invalid prompt format. Use: /prompt user:name or /prompt project:name (e.g., /prompt user:my-prompt)",
        );
        return;
      }

      const type = typeStr.toLowerCase();

      try {
        const promptPath = getPromptPath(type, promptName, config, terminal);

        if (!promptPath) {
          return; // Error already logged by getPromptPath
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

        for (const context of processedPrompt.context) {
          promptManager.addContext(context);
        }
        promptManager.set(processedPrompt.message);
      } catch (error) {
        terminal.error(`Error loading prompt: ${(error as Error).message}`);
      }
    },
  };
};

function getPromptPath(
  type: string,
  promptName: string,
  config: CommandOptions["config"],
  terminal: CommandOptions["terminal"],
): string | null {
  if (type === "project") {
    return path.join(config.project.ensurePath("prompts"), `${promptName}.md`);
  }
  if (type === "user") {
    return path.join(config.app.ensurePath("prompts"), `${promptName}.md`);
  }
  terminal.warn(`Unknown prompt type: ${type}. Use 'user' or 'project'`);
  return null;
}
