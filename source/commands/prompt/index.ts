import { readdir, readFile } from "node:fs/promises";
import path, { basename } from "node:path";
import { logger } from "../../logger.ts";
import { processPrompt } from "../../mentions.ts";
import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import { Spacer, Text } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import type { PromptMetadata } from "./types.ts";
import {
  findPrompt,
  parsePromptFile,
  replaceArgumentPlaceholders,
} from "./utils.ts";

export async function loadPrompts(config: CommandOptions["config"]) {
  const getPromptsFromDir = async (
    dirPath: string,
    type: "project" | "user",
  ): Promise<PromptMetadata[]> => {
    try {
      const dirents = await readdir(dirPath, { withFileTypes: true });
      const mdFiles = dirents.filter(
        (dirent) => dirent.isFile() && dirent.name.endsWith(".md"),
      );

      const prompts: PromptMetadata[] = [];
      for (const dirent of mdFiles) {
        const filePath = path.join(dirPath, dirent.name);
        try {
          const content = await readFile(filePath, "utf8");
          const parsed = parsePromptFile(content);

          if (parsed.metadata.enabled) {
            prompts.push({
              name: basename(dirent.name, ".md"),
              description: parsed.metadata.description,
              enabled: parsed.metadata.enabled,
              path: filePath,
              type,
            });
          }
        } catch (error) {
          logger.error(`Error reading prompt file ${filePath}: ${error}`);
        }
      }
      return prompts;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      logger.error(`Error reading prompts from ${dirPath}: ${error}`);
      return [];
    }
  };

  const userPromptDir = config.app.getPath("prompts");
  const projectPromptDir = config.project.getPath("prompts");

  const userPrompts = await getPromptsFromDir(userPromptDir, "user");
  const projectPrompts = await getPromptsFromDir(projectPromptDir, "project");

  const promptMap = new Map<string, PromptMetadata>();

  for (const prompt of userPrompts) {
    promptMap.set(prompt.name, prompt);
  }

  for (const prompt of projectPrompts) {
    promptMap.set(prompt.name, prompt);
  }

  return promptMap;
}

export const promptCommand = ({
  modelManager,
  promptManager,
  config,
  promptHistory,
  workspace,
}: CommandOptions): ReplCommand => {
  return {
    command: "/prompt",
    description:
      "Loads and executes prompts. Project prompts override user prompts with the same name.",
    getSubCommands: async (): Promise<string[]> => {
      const promptMap = await loadPrompts(config);

      const promptList = Array.from(promptMap.values())
        .map((p) => p.name)
        .sort();

      return promptList;
    },

    async handle(
      args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const promptName = args?.[0];

      if (!promptName) {
        container.addChild(new Text(style.red("No prompt given."), 1, 0));
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      try {
        const promptResult = await findPrompt(promptName, config);

        if (!promptResult) {
          container.addChild(
            new Text(
              style.red(
                `Prompt not found: ${promptName}. Available prompts can be seen with tab completion.`,
              ),
              1,
              0,
            ),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }

        let promptContent: string;
        try {
          const fileContent = await readFile(promptResult.path, "utf8");
          const parsed = parsePromptFile(fileContent);
          promptContent = parsed.content;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            container.addChild(
              new Text(
                style.red(
                  `Prompt file not found: ${promptName} at ${promptResult.path}`,
                ),
                1,
                0,
              ),
            );
            tui.requestRender();
            editor.setText("");
            return "continue";
          }
          throw error;
        }

        const inputArgs = args.slice(1);

        promptContent = replaceArgumentPlaceholders(promptContent, inputArgs);

        container.addChild(new Spacer(1));

        const processedPrompt = await processPrompt(promptContent.trim(), {
          baseDir: workspace.primaryDir,
          model: modelManager.getModelMetadata("repl"),
        });

        for (const context of processedPrompt.context) {
          promptManager.addContext(context);
        }
        promptManager.set(processedPrompt.message);

        promptHistory.push(processedPrompt.message);

        tui.requestRender();
        editor.setText("");
        return "use";
      } catch (error) {
        container.addChild(
          new Text(
            style.red(`Error loading prompt: ${(error as Error).message}`),
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
