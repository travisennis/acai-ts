import { readdir, readFile } from "node:fs/promises";
import path, { basename } from "node:path";
import type { ConfigManager } from "../config.ts";
import { logger } from "../logger.ts";
import { processPrompt } from "../mentions.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Spacer, Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

interface PromptMetadata {
  name: string;
  description: string;
  enabled: boolean;
  path: string;
  type: "project" | "user";
}

interface ParsedPrompt {
  content: string;
  metadata: {
    description: string;
    enabled: boolean;
  };
}

export function parsePromptFile(content: string): ParsedPrompt {
  // Check for YAML front matter
  const frontMatterMatch = content.match(
    /^---\s*\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/,
  );

  if (!frontMatterMatch) {
    // No YAML front matter - use first 50 chars of entire content as description
    return {
      content,
      metadata: {
        description:
          // Get first line, then first 50 characters of that line
          content.split("\n")[0].trim().slice(0, 50) +
          (content.split("\n")[0].trim().length > 50 ? "..." : ""),
        enabled: true,
      },
    };
  }

  const yamlContent = frontMatterMatch[1];
  const promptContent = frontMatterMatch[2] || "";

  // Default metadata for YAML front matter case
  const defaultDescription =
    promptContent.split("\n")[0].trim().slice(0, 50) +
    (promptContent.split("\n")[0].trim().length > 50 ? "..." : "");

  // Parse simple YAML fields
  let description = defaultDescription;
  let enabled = true;

  // Extract description field
  const descriptionMatch = yamlContent.match(/^description:\s*(.+)$/m);
  if (descriptionMatch) {
    description = descriptionMatch[1].trim();
  }

  // Extract enabled field
  const enabledMatch = yamlContent.match(/^enabled:\s*(true|false)$/im);
  if (enabledMatch) {
    enabled = enabledMatch[1].toLowerCase() === "true";
  }

  return {
    content: promptContent,
    metadata: {
      description,
      enabled,
    },
  };
}

export async function loadPrompts(config: ConfigManager) {
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
          // Skip this file but continue with others
        }
      }
      return prompts;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return []; // Directory doesn't exist, return empty array
      }
      logger.error(`Error reading prompts from ${dirPath}: ${error}`);
      return []; // Return empty on other errors too, but log them
    }
  };

  const userPromptDir = config.app.ensurePathSync("prompts"); // User prompts are global (~/.acai/prompts)
  const projectPromptDir = config.project.ensurePathSync("prompts"); // Project prompts are local (./.acai/prompts)

  const userPrompts = await getPromptsFromDir(userPromptDir, "user");
  const projectPrompts = await getPromptsFromDir(projectPromptDir, "project");

  // Combine and deduplicate, with project prompts taking precedence
  const promptMap = new Map<string, PromptMetadata>();

  // Add user prompts first
  for (const prompt of userPrompts) {
    promptMap.set(prompt.name, prompt);
  }

  // Override with project prompts (project prompts take precedence)
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
      // Handle no subcommand
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

        // Combine remaining arguments into a single string for input
        const inputArgs = args.slice(1);
        const inputString = inputArgs.join(" ");

        // Replace {{INPUT}} placeholder with the input string
        if (promptContent.includes("{{INPUT}}")) {
          promptContent = promptContent.replace(/{{INPUT}}/g, inputString);
        } else {
          promptContent += `\n\n${inputString}`;
        }

        container.addChild(new Spacer(1));

        container.addChild(
          new Text(
            `Loaded ${promptResult.type} prompt: ${style.blue(promptName)}`,
            1,
            0,
          ),
        );
        if (inputArgs.length > 0) {
          container.addChild(new Text(`Input: "${inputString}"`, 2, 0));
        }

        const processedPrompt = await processPrompt(promptContent.trim(), {
          baseDir: workspace.primaryDir,
          model: modelManager.getModelMetadata("repl"),
        });

        for (const context of processedPrompt.context) {
          promptManager.addContext(context);
        }
        promptManager.set(processedPrompt.message);

        // Add the loaded prompt to history
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

async function findPrompt(
  promptName: string,
  config: CommandOptions["config"],
): Promise<PromptMetadata | null> {
  // Check project prompts first (they take precedence)
  const projectPath = path.join(
    config.project.ensurePathSync("prompts"),
    `${promptName}.md`,
  );

  try {
    const content = await readFile(projectPath, "utf8");
    const parsed = parsePromptFile(content);

    if (!parsed.metadata.enabled) {
      return null; // Prompt is disabled
    }

    return {
      name: promptName,
      description: parsed.metadata.description,
      enabled: parsed.metadata.enabled,
      path: projectPath,
      type: "project",
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error; // Re-throw non-file-not-found errors
    }
  }

  // Check user prompts if not found in project
  const userPath = path.join(
    config.app.ensurePathSync("prompts"),
    `${promptName}.md`,
  );

  try {
    const content = await readFile(userPath, "utf8");
    const parsed = parsePromptFile(content);

    if (!parsed.metadata.enabled) {
      return null; // Prompt is disabled
    }

    return {
      name: promptName,
      description: parsed.metadata.description,
      enabled: parsed.metadata.enabled,
      path: userPath,
      type: "user",
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error; // Re-throw non-file-not-found errors
    }
  }

  return null; // Prompt not found in either location
}
