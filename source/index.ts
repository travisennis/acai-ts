#!/usr/bin/env node
import { text } from "node:stream/consumers";
import { parseArgs } from "node:util";
import { asyncTry } from "@travisennis/stdlib/try";
import { isDefined } from "@travisennis/stdlib/typeguards";
import { Cli } from "./cli.ts";
import { CommandManager } from "./commands/manager.ts";
import { config } from "./config.ts";
import { logger } from "./logger.ts";
import { MessageHistory } from "./messages.ts";
import { ModelManager } from "./models/manager.ts";
import { isSupportedModel, type ModelName } from "./models/providers.ts";
import { PromptManager } from "./prompts/manager.ts";
import { Repl } from "./repl.ts";
import { initTerminal } from "./terminal/index.ts";
import { select } from "./terminal/select-prompt.ts";
import { TokenCounter } from "./tokens/counter.ts";
import { TokenTracker } from "./tokens/tracker.ts";
import { ToolExecutor } from "./tool-executor.ts";
import { getPackageVersion } from "./version.ts";

const helpText = `
Usage
  $ acai <input>

Options
  --model, -m        Sets the model to use
  --prompt, -p       Sets the prompt (runs in CLI mode)
  --continue         Load the most recent conversation
  --resume           Select a recent conversation to resume
  --autoAcceptAll    Accept all commands and edits without prompting
  --help, -h         Show help
  --version, -v      Show version

Examples
  $ acai --model anthopric:sonnet
  $ acai -p "initial prompt"
`;

const parsed = parseArgs({
  options: {
    model: { type: "string", short: "m" },
    prompt: { type: "string", short: "p" },
    continue: { type: "boolean", default: false },
    resume: { type: "boolean", default: false },
    autoAcceptAll: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  },
  allowPositionals: true,
});

const flags = parsed.values;
const input = parsed.positionals;

/**
 * Global error handler function.
 * @param {Error} error - The error to be handled.
 * @throws {Error} Rethrows the error after logging it.
 */
export function handleError(error: Error): void {
  logger.error({ error: error }, error.message);
}

export type Flags = typeof flags;

async function main() {
  const appConfig = await config.ensureAppConfig("acai");

  if (flags.version === true) {
    console.info(getPackageVersion());
    process.exit(0);
  }

  if (flags.help === true) {
    console.info(helpText);
    process.exit(0);
  }

  const appDir = config.app;
  const messageHistoryDir = await appDir.ensurePath("message-history");

  // --- Argument Validation ---
  if (flags.continue === true && flags.resume === true) {
    console.error("Cannot use --continue and --resume flags together.");
    process.exit(1);
  }

  const hasContinueOrResume = flags.continue === true || flags.resume === true;

  // --- Determine Initial Prompt (potential conflict) ---
  const positionalPrompt = input.at(0);
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
    typeof flags.prompt === "string" && flags.prompt.length > 0
      ? flags.prompt
      : positionalPrompt && positionalPrompt.length > 0
        ? positionalPrompt
        : undefined;

  if (hasContinueOrResume && isDefined(initialPromptInput)) {
    console.error("Cannot use --continue or --resume with an initial prompt.");
    process.exit(1);
  }

  const terminal = initTerminal();
  terminal.setTitle(`acai: ${process.cwd()}`);

  const chosenModel: ModelName = isSupportedModel(flags.model)
    ? (flags.model as ModelName)
    : "openrouter:glm-4.6";

  const modelManager = new ModelManager({
    stateDir: await appDir.ensurePath("audit"),
  });
  modelManager.setModel("repl", chosenModel);
  modelManager.setModel("cli", chosenModel);
  modelManager.setModel("title-conversation", "openrouter:gemini-flash25");
  modelManager.setModel("conversation-summarizer", "openrouter:gemini-flash25");
  modelManager.setModel("tool-repair", "openai:gpt-4.1");
  modelManager.setModel("conversation-analyzer", "openrouter:gemini-flash25");
  modelManager.setModel("init-project", chosenModel);
  modelManager.setModel("task-agent", "openrouter:gpt-5-mini");

  const tokenTracker = new TokenTracker();
  const tokenCounter = new TokenCounter();

  const messageHistory = new MessageHistory({
    stateDir: messageHistoryDir,
    modelManager,
    tokenTracker,
  });
  messageHistory.on("update-title", (title) => terminal.setTitle(title));

  if (flags.continue === true) {
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
  } else if (flags.resume === true) {
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

  const toolExecutor = new ToolExecutor(flags.autoAcceptAll === true);

  // --- Setup Prompt Manager (only if not continuing/resuming) ---
  const promptManager = new PromptManager(tokenCounter);
  if (!hasContinueOrResume && isDefined(initialPromptInput)) {
    promptManager.set(initialPromptInput);
  }

  if (stdInPrompt) {
    promptManager.addContext(stdInPrompt);
  }

  const promptHistory: string[] = [];

  const commands = new CommandManager({
    promptManager,
    modelManager,
    terminal,
    messageHistory,
    tokenTracker,
    config,
    tokenCounter,
    toolExecutor,
    promptHistory,
  });

  await commands.initializeCommmands();

  if (isDefined(initialPromptInput)) {
    const cliProcess = new Cli({
      promptManager,
      config: appConfig,
      messageHistory,
      modelManager,
      tokenTracker,
      tokenCounter,
    });
    return (await asyncTry(cliProcess.run())).recover(handleError);
  }

  const repl = new Repl({
    promptManager,
    terminal,
    config: appConfig,
    messageHistory,
    modelManager,
    tokenTracker,
    commands,
    tokenCounter,
    toolExecutor,
    promptHistory,
    showLastMessage: hasContinueOrResume
      ? !!(messageHistory.get() && messageHistory.get().length > 0)
      : false,
  });

  return (await asyncTry(repl.run())).recover(handleError);
}

main();
