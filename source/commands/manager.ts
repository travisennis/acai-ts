import { readFile } from "node:fs/promises";
import type { ConfigManager } from "../config.ts";
import type { WorkspaceContext } from "../index.ts";
import { logger } from "../logger.ts";
import { processPrompt } from "../mentions.ts";
import type { ModelManager } from "../models/manager.ts";
import type { PromptManagerApi } from "../prompts/manager.ts";
import type { SessionManager } from "../sessions/manager.ts";
import { loadSkills } from "../skills.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import type { TokenTracker } from "../tokens/tracker.ts";
import type {
  AutocompleteItem,
  Container,
  Editor,
  SlashCommand,
  TUI,
} from "../tui/index.ts";
import { Spacer, Text } from "../tui/index.ts";
import { replaceArgumentPlaceholders } from "../utils/templates.ts";
import { parseFrontMatter } from "../utils/yaml.ts";
import { addDirectoryCommand } from "./add-directory/index.ts";
import { clearCommand } from "./clear/index.ts";
import { copyCommand } from "./copy/index.ts";
import { generateRulesCommand } from "./generate-rules/index.ts";
import { handoffCommand } from "./handoff/index.ts";
import { healthCommand } from "./health/index.ts";
import { helpCommand } from "./help/index.ts";
import { historyCommand } from "./history/index.ts";
import { initCommand } from "./init/index.ts";
import { initProjectCommand } from "./init-project/index.ts";
import { listDirectoriesCommand } from "./list-directories/index.ts";
import { listToolsCommand } from "./list-tools/index.ts";
import { modelCommand } from "./model/index.ts";

import { pasteCommand } from "./paste/index.ts";
import { pickupCommand } from "./pickup/index.ts";
import { removeDirectoryCommand } from "./remove-directory/index.ts";
import { resourcesCommand } from "./resources/index.ts";
import { reviewCommand } from "./review/index.ts";
import { sessionCommand } from "./session/index.ts";
import { shareCommand } from "./share/index.ts";
import { shellCommand } from "./shell/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export class CommandManager {
  private commands: Map<string, ReplCommand>;
  private promptManager: PromptManagerApi;
  private modelManager: ModelManager;
  private sessionManager: SessionManager;
  private tokenTracker: TokenTracker;
  private config: ConfigManager;
  private tokenCounter: TokenCounter;
  private promptHistory: string[];
  private workspace: WorkspaceContext;
  private initialized: boolean;

  constructor({
    promptManager,
    modelManager,
    sessionManager,
    tokenTracker,
    config,
    tokenCounter,
    promptHistory,
    workspace,
  }: CommandOptions) {
    this.commands = new Map();
    this.promptManager = promptManager;
    this.modelManager = modelManager;
    this.sessionManager = sessionManager;
    this.tokenTracker = tokenTracker;
    this.config = config;
    this.tokenCounter = tokenCounter;
    this.promptHistory = promptHistory;
    this.workspace = workspace;
    this.initialized = false;
  }

  async initializeCommmands() {
    if (this.initialized) {
      return;
    }
    // Import and register each command
    const options: CommandOptions = {
      promptManager: this.promptManager,
      modelManager: this.modelManager,
      sessionManager: this.sessionManager,
      tokenTracker: this.tokenTracker,
      config: this.config,
      tokenCounter: this.tokenCounter,
      promptHistory: this.promptHistory,
      workspace: this.workspace,
    };

    // Register all commands
    const cmds = [
      addDirectoryCommand(options),
      clearCommand(options),
      healthCommand(options),
      historyCommand(options),
      initCommand(options),
      initProjectCommand(options),
      listDirectoriesCommand(options),
      pasteCommand(options),
      pickupCommand(options),
      removeDirectoryCommand(options),
      reviewCommand(options),
      modelCommand(options),
      sessionCommand(options),
      generateRulesCommand(options),
      handoffCommand(options),
      copyCommand(options),
      listToolsCommand(options),
      resourcesCommand(options),
      shareCommand(options),
      shellCommand(options),
    ];

    // Add help command with access to all commands
    const helpCmd = helpCommand(options, this.commands);
    cmds.push(helpCmd);

    // Register all commands
    for (const cmd of cmds) {
      this.commands.set(cmd.command, cmd);
      // const aliases: string[] = cmd.aliases ?? [];
      // for (const alias of aliases) {
      //   this.commands.set(alias, cmd);
      // }
    }

    await this.registerSkillCommands(options);

    this.initialized = true;
  }

  private async registerSkillCommands(options: CommandOptions): Promise<void> {
    const skills = await loadSkills();

    for (const skill of skills) {
      if (!skill.userInvocable) {
        continue;
      }

      const commandName = `/${skill.name}`;

      if (this.commands.has(commandName)) {
        logger.warn(
          `Skill "${skill.name}" conflicts with built-in command "${commandName}", skipping skill registration`,
        );
        continue;
      }

      const { promptManager, modelManager, promptHistory, workspace } = options;
      const skillFilePath = skill.filePath;
      const skillDescription = skill.description;

      this.commands.set(commandName, {
        command: commandName,
        description: skillDescription,
        getSubCommands: (): Promise<string[]> => Promise.resolve([]),
        async handle(
          args: string[],
          {
            tui,
            container,
            editor,
          }: {
            tui: TUI;
            container: Container;
            inputContainer: Container;
            editor: Editor;
          },
        ): Promise<"break" | "continue" | "use"> {
          try {
            const fileContent = await readFile(skillFilePath, "utf8");
            const { content: body } = parseFrontMatter(fileContent);

            const content = replaceArgumentPlaceholders(body.trim(), args);

            container.addChild(new Spacer(1));

            const processedPrompt = await processPrompt(content.trim(), {
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
                style.red(`Error loading skill: ${(error as Error).message}`),
                1,
                0,
              ),
            );
            tui.requestRender();
            editor.setText("");
            return "continue";
          }
        },
      });
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "Commands have not been initialized. Call initializeCommmands() first.",
      );
    }
  }

  async getCompletions(): Promise<SlashCommand[]> {
    this.ensureInitialized();
    return Promise.all(
      Array.from(this.commands.entries()).map(async (entry) => {
        const subs = await entry[1].getSubCommands();
        return {
          name: entry[0].slice(1),
          // value: entry[0].slice(1),
          // label: entry[0].slice(1),
          description: entry[1].description,
          getArgumentCompletions(
            _argumentPrefix: string,
          ): AutocompleteItem[] | null {
            return subs.map((sub) => ({
              value: sub,
              label: sub,
            }));
          },
        };
      }),
    );
  }

  getCommands() {
    this.ensureInitialized();
    return Array.from(this.commands.keys()).sort();
  }

  async getSubCommands(command: string): Promise<string[]> {
    this.ensureInitialized();
    return (await this.commands.get(command)?.getSubCommands()) ?? [];
  }

  async handle(
    { userInput }: { userInput: string },
    options: {
      tui: TUI;
      container: Container;
      inputContainer: Container;
      editor: Editor;
    },
  ) {
    this.ensureInitialized();
    const commandArgs = userInput.split(" ");
    const command = commandArgs.at(0);
    const args = commandArgs.slice(1);

    if (command !== undefined) {
      const replCommand = this.commands.get(command);
      if (replCommand) {
        const result = await replCommand.handle(args, options);
        if (result === "continue") {
          return {
            continue: true,
            break: false,
          };
        }
        if (result === "break") {
          return {
            continue: false,
            break: true,
          };
        }
      }
    }
    return {
      continue: false,
      break: false,
    };
  }
}
