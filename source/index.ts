import { text } from "node:stream/consumers";
import { select } from "@inquirer/prompts";
import { asyncTry } from "@travisennis/stdlib/try";
import { isDefined } from "@travisennis/stdlib/typeguards";
import meow from "meow";
import { CommandManager } from "./commands/manager.ts";
import { config } from "./config.ts";
import { logger } from "./logger.ts";
import { MessageHistory } from "./messages.ts";
import { ModelManager } from "./models/manager.ts";
import { type ModelName, isSupportedModel } from "./models/providers.ts";
import { PromptManager } from "./prompts/manager.ts";
import { Repl } from "./repl.ts";
import { initTerminal } from "./terminal/index.ts";
import { TokenTracker } from "./token-tracker.ts";
import { TokenCounter } from "./token-utils.ts";

const cli = meow(
  `
	Usage
	  $ acai <input>

	Options
    --model, -m  Sets the model to use
    --prompt, -p  Sets the prompt
    --oneshot, -o  Run once and exit
    --continue Load the most recent conversation
    --resume Select a recent conversation to resume

	Examples
	  $ acai --model anthopric:sonnet
	  $ acai -p "one-shot prompt"
	  $ acai -p "one-shot prompt" -o
`,
  {
    importMeta: import.meta, // This is required
    flags: {
      model: {
        type: "string",
        shortFlag: "m",
      },
      prompt: {
        type: "string",
        shortFlag: "p",
      },
      oneshot: {
        type: "boolean",
        shortFlag: "o",
        default: false,
      },
      continue: {
        type: "boolean",
        default: false,
      },
      resume: {
        type: "boolean",
        default: false,
      },
    },
  },
);

/**
 * Global error handler function.
 * @param {Error} error - The error to be handled.
 * @throws {Error} Rethrows the error after logging it.
 */
export function handleError(error: Error): void {
  logger.error({ error: error.name }, error.message, error);
}

export type Flags = typeof cli.flags;

async function main() {
  const appConfig = await config.readAppConfig("acai");

  const appDir = config.app;
  const messageHistoryDir = appDir.ensurePath("message-history");

  // --- Argument Validation ---
  if (cli.flags.continue && cli.flags.resume) {
    console.error("Cannot use --continue and --resume flags together.");
    process.exit(1);
  }

  const hasContinueOrResume = cli.flags.continue || cli.flags.resume;

  if (hasContinueOrResume && cli.flags.oneshot) {
    console.error("Cannot use --continue or --resume with --oneshot.");
    process.exit(1);
  }

  // --- Determine Initial Prompt (potential conflict) ---
  const positionalPrompt = cli.input.at(0);
  let stdInPrompt: string | undefined;
  // Check if there's data available on stdin
  if (!process.stdin.isTTY) {
    try {
      // Non-TTY stdin means data is being piped in
      stdInPrompt = await text(process.stdin);
    } catch (error) {
      console.error(`Error reading stdin: ${(error as Error).message}`);
    }
  }

  const initialPromptInput =
    cli.flags.prompt && cli.flags.prompt.length > 0
      ? cli.flags.prompt
      : positionalPrompt && positionalPrompt.length > 0
        ? positionalPrompt
        : stdInPrompt && stdInPrompt.length > 0
          ? stdInPrompt
          : undefined;

  if (hasContinueOrResume && isDefined(initialPromptInput)) {
    console.error("Cannot use --continue or --resume with an initial prompt.");
    process.exit(1);
  }

  const terminal = initTerminal();
  terminal.setTitle(`acai: ${process.cwd()}`);

  const chosenModel: ModelName = isSupportedModel(cli.flags.model)
    ? cli.flags.model
    : "google:pro25";

  const modelManager = new ModelManager({
    stateDir: appDir.ensurePath("audit"),
  });
  modelManager.setModel("repl", chosenModel);
  modelManager.setModel("architect", chosenModel);
  modelManager.setModel("title-conversation", "anthropic:haiku");
  modelManager.setModel("conversation-summarizer", "anthropic:haiku");
  modelManager.setModel("file-retiever", "anthropic:haiku");
  modelManager.setModel("tool-repair", "openai:gpt-4o-structured");
  modelManager.setModel("conversation-analyzer", "google:flash2");
  modelManager.setModel("lsp-code-action", "anthropic:sonnet");
  modelManager.setModel("init-project", chosenModel);
  modelManager.setModel("task-agent", "google:flash2");
  modelManager.setModel("explain-code", "deepseek:deepseek-reasoner");
  modelManager.setModel("code-editor", "google:flash2");

  const tokenTracker = new TokenTracker();
  const tokenCounter = new TokenCounter();

  const messageHistory = new MessageHistory({
    stateDir: messageHistoryDir,
    modelManager,
    tokenTracker,
  });
  messageHistory.on("update-title", (title) => terminal.setTitle(title));

  if (cli.flags.continue) {
    const histories = await MessageHistory.load(messageHistoryDir, 1);
    const latestHistory = histories.at(0);
    if (latestHistory) {
      messageHistory.restore(latestHistory);
      console.info(`Resuming conversation: ${latestHistory.title}`);
      // Set terminal title after restoring
      terminal.setTitle(latestHistory.title || `acai: ${process.cwd()}`);
    } else {
      logger.info("No previous conversation found to continue.");
    }
  } else if (cli.flags.resume) {
    const histories = await MessageHistory.load(messageHistoryDir, 10);
    if (histories.length > 0) {
      const choice = await select({
        message: "Select a conversation to resume:",
        choices: histories.map((h, index) => ({
          name: `${index + 1}: ${h.title} (${h.updatedAt.toLocaleString()})`,
          value: index,
          description: `${h.messages.length} messages`,
        })),
      });
      const selectedHistory = histories.at(choice);
      if (selectedHistory) {
        messageHistory.restore(selectedHistory);
        logger.info(`Resuming conversation: ${selectedHistory.title}`);
        // Set terminal title after restoring
        terminal.setTitle(selectedHistory.title || `acai: ${process.cwd()}`);
      } else {
        // This case should theoretically not happen if choice is valid
        logger.error("Selected history index out of bounds.");
      }
    } else {
      logger.info("No previous conversations found to resume.");
    }
  }

  // --- Setup Prompt Manager (only if not continuing/resuming) ---
  const promptManager = new PromptManager(tokenCounter);
  if (!hasContinueOrResume && isDefined(initialPromptInput)) {
    promptManager.set(initialPromptInput);
  }

  const commands = new CommandManager({
    promptManager,
    modelManager,
    terminal,
    messageHistory,
    tokenTracker,
    config,
    tokenCounter,
  });

  const repl = new Repl({
    promptManager,
    terminal,
    config: appConfig,
    messageHistory,
    modelManager,
    tokenTracker,
    commands,
    tokenCounter,
  });

  (
    await asyncTry(
      repl.run({
        args: cli.flags,
      }),
    )
  ).recover(handleError);
}

main();
