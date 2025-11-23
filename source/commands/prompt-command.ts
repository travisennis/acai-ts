import { readdir, readFile } from "node:fs/promises";
import path, { basename } from "node:path";
import { processPrompt } from "../mentions.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const promptCommand = ({
  terminal,
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
      const getPromptNamesFromDir = async (
        dirPath: string,
      ): Promise<string[]> => {
        try {
          const dirents = await readdir(dirPath, { withFileTypes: true });
          return dirents
            .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".md"))
            .map((dirent) => basename(dirent.name, ".md"));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return []; // Directory doesn't exist, return empty array
          }
          terminal.error(`Error reading prompts from ${dirPath}: ${error}`);
          return []; // Return empty on other errors too, but log them
        }
      };

      const userPromptDir = config.app.ensurePathSync("prompts"); // User prompts are global (~/.acai/prompts)
      const projectPromptDir = config.project.ensurePathSync("prompts"); // Project prompts are local (./.acai/prompts)

      const userPrompts = await getPromptNamesFromDir(userPromptDir);
      const projectPrompts = await getPromptNamesFromDir(projectPromptDir);

      // Combine and deduplicate, with project prompts taking precedence
      const allPrompts = new Set([...userPrompts, ...projectPrompts]);
      const promptList = Array.from(allPrompts).sort();

      // Add 'list' as a special subcommand for listing all prompts
      return ["list", ...promptList];
    },
    execute: async (args: string[]) => {
      const promptName = args?.[0];
      if (!promptName) {
        await listAllPrompts(terminal, config);
        return "continue";
      }

      // Handle 'list' subcommand
      if (promptName === "list") {
        await listAllPrompts(terminal, config);
        return "continue";
      }

      // Check for old format and provide helpful error
      if (promptName.includes(":")) {
        terminal.warn(
          "The old format (user:name or project:name) is no longer supported. Use: /prompt <prompt-name> [input...]",
        );
        return "continue";
      }

      try {
        const promptResult = await findPrompt(promptName, config);

        if (!promptResult) {
          terminal.error(
            `Prompt not found: ${promptName}. Available prompts can be seen with tab completion.`,
          );
          return "continue";
        }

        let promptContent: string;
        try {
          promptContent = await readFile(promptResult.path, "utf8");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            terminal.error(
              `Prompt file not found: ${promptName} at ${promptResult.path}`,
            );
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
        }

        terminal.info(`Loaded ${promptResult.type} prompt: ${promptName}`);
        if (inputArgs.length > 0) {
          terminal.info(`Input: "${inputString}"`);
        }

        const processedPrompt = await processPrompt(promptContent, {
          baseDir: workspace.primaryDir,
          model: modelManager.getModelMetadata("repl"),
        });

        for (const context of processedPrompt.context) {
          promptManager.addContext(context);
        }
        promptManager.set(processedPrompt.message);

        // Add the loaded prompt to history
        promptHistory.push(processedPrompt.message);

        terminal.lineBreak();
        terminal.display(processedPrompt.message);
        terminal.lineBreak();
        terminal.hr();

        return "use";
      } catch (error) {
        terminal.error(`Error loading prompt: ${(error as Error).message}`);
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
      const promptName = args?.[0];
      // Handle no subcommand or 'list' subcommand
      if (!promptName || promptName === "list") {
        await listAllPromptsTui(container, config);
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      // Check for old format and provide helpful error
      if (promptName.includes(":")) {
        container.addChild(
          new Text(
            style.yellow(
              "The old format (user:name or project:name) is no longer supported. Use: /prompt <prompt-name> [input...]",
            ),
            1,
            0,
          ),
        );
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
          promptContent = await readFile(promptResult.path, "utf8");
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
        }

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

        const processedPrompt = await processPrompt(promptContent, {
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
): Promise<{ path: string; type: "project" | "user" } | null> {
  // Check project prompts first (they take precedence)
  const projectPath = path.join(
    config.project.ensurePathSync("prompts"),
    `${promptName}.md`,
  );

  try {
    await readFile(projectPath, "utf8");
    return { path: projectPath, type: "project" };
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
    await readFile(userPath, "utf8");
    return { path: userPath, type: "user" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error; // Re-throw non-file-not-found errors
    }
  }

  return null; // Prompt not found in either location
}

async function listAllPrompts(
  terminal: CommandOptions["terminal"],
  config: CommandOptions["config"],
): Promise<void> {
  const getPromptNamesFromDir = async (dirPath: string): Promise<string[]> => {
    try {
      const dirents = await readdir(dirPath, { withFileTypes: true });
      return dirents
        .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".md"))
        .map((dirent) => basename(dirent.name, ".md"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return []; // Directory doesn't exist, return empty array
      }
      terminal.error(`Error reading prompts from ${dirPath}: ${error}`);
      return []; // Return empty on other errors too, but log them
    }
  };

  const userPromptDir = config.app.ensurePathSync("prompts");
  const projectPromptDir = config.project.ensurePathSync("prompts");

  const userPrompts = await getPromptNamesFromDir(userPromptDir);
  const projectPrompts = await getPromptNamesFromDir(projectPromptDir);

  if (userPrompts.length === 0 && projectPrompts.length === 0) {
    terminal.warn(
      "No prompts found. Create prompts in ~/.acai/prompts/ or ./.acai/prompts/",
    );
    return;
  }

  terminal.info("Available prompts:");

  if (projectPrompts.length > 0) {
    terminal.info("  Project prompts (./.acai/prompts/):");
    projectPrompts.sort().forEach((prompt) => {
      terminal.info(`    • ${prompt}`);
    });
  }

  if (userPrompts.length > 0) {
    terminal.info("  User prompts (~/.acai/prompts/):");
    userPrompts.sort().forEach((prompt) => {
      terminal.info(`    • ${prompt}`);
    });
  }

  terminal.info("\nUsage: /prompt <prompt-name> [input...]");
  terminal.info("Example: /prompt project-status");
}

async function listAllPromptsTui(
  container: Container,
  config: CommandOptions["config"],
): Promise<void> {
  const getPromptNamesFromDir = async (dirPath: string): Promise<string[]> => {
    try {
      const dirents = await readdir(dirPath, { withFileTypes: true });
      return dirents
        .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".md"))
        .map((dirent) => basename(dirent.name, ".md"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return []; // Directory doesn't exist, return empty array
      }
      return []; // Return empty on other errors
    }
  };

  const userPromptDir = config.app.ensurePathSync("prompts");
  const projectPromptDir = config.project.ensurePathSync("prompts");

  const userPrompts = await getPromptNamesFromDir(userPromptDir);
  const projectPrompts = await getPromptNamesFromDir(projectPromptDir);

  if (userPrompts.length === 0 && projectPrompts.length === 0) {
    container.addChild(
      new Text(
        style.yellow(
          "No prompts found. Create prompts in ~/.acai/prompts/ or ./.acai/prompts/",
        ),
        1,
        0,
      ),
    );
    return;
  }

  container.addChild(new Text("Available prompts:", 0, 1));

  let lineIndex = 2;

  if (projectPrompts.length > 0) {
    container.addChild(
      new Text("  Project prompts (./.acai/prompts/):", lineIndex, 0),
    );
    lineIndex++;
    projectPrompts.sort().forEach((prompt) => {
      container.addChild(new Text(`    • ${prompt}`, lineIndex, 0));
      lineIndex++;
    });
  }

  if (userPrompts.length > 0) {
    container.addChild(
      new Text("  User prompts (~/.acai/prompts/):", lineIndex, 0),
    );
    lineIndex++;
    userPrompts.sort().forEach((prompt) => {
      container.addChild(new Text(`    • ${prompt}`, lineIndex, 0));
      lineIndex++;
    });
  }

  container.addChild(
    new Text("\nUsage: /prompt <prompt-name> [input...]", lineIndex, 0),
  );
  container.addChild(
    new Text("Example: /prompt project-status", lineIndex + 1, 1),
  );
}
