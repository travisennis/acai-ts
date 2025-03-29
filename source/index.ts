import { text } from "node:stream/consumers";
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

const cli = meow(
  `
	Usage
	  $ acai <input>

	Options
    --model, -m  Sets the model to use
    --prompt, -p  Sets the prompt
    --oneshot, -o  Run once and exit
    --lsp Run the Language Service Provider

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

  const chosenModel: ModelName = isSupportedModel(cli.flags.model)
    ? cli.flags.model
    : "anthropic:sonnet-token-efficient-tools";

  const modelManager = new ModelManager({
    stateDir: appDir.ensurePath("audit"),
  });
  modelManager.setModel("repl", chosenModel);
  modelManager.setModel("architect", chosenModel);
  modelManager.setModel("title-conversation", "anthropic:haiku");
  modelManager.setModel("conversation-summarizer", "anthropic:haiku");
  modelManager.setModel("file-retiever", "anthropic:haiku");
  modelManager.setModel("tool-repair", "openai:gpt-4o-structured");
  modelManager.setModel("meta-prompt", "google:flash2");
  modelManager.setModel("lsp-code-action", "anthropic:sonnet");
  modelManager.setModel("init-project", chosenModel);
  modelManager.setModel("task-agent", chosenModel);
  modelManager.setModel("explain-code", "deepseek:deepseek-reasoner");

  const positionalPrompt = cli.input.at(0);

  let stdInPrompt: string | undefined;
  // Check if there's data available on stdin
  if (process.stdin.isTTY) {
    // Terminal is interactive, no piped input
    // Continue with empty prompt
  } else {
    try {
      // Non-TTY stdin means data is being piped in
      const stdinData = await text(process.stdin);
      stdInPrompt = stdinData;
    } catch (error) {
      console.error(`Error reading stdin: ${(error as Error).message}`);
    }
  }

  const initialPrompt =
    cli.flags.prompt && cli.flags.prompt.length > 0
      ? cli.flags.prompt
      : positionalPrompt && positionalPrompt.length > 0
        ? positionalPrompt
        : stdInPrompt && stdInPrompt.length > 0
          ? stdInPrompt
          : undefined;

  const promptManager = new PromptManager();
  if (isDefined(initialPrompt)) {
    promptManager.set(initialPrompt);
  }

  const terminal = initTerminal();
  terminal.setTitle(`acai: ${process.cwd()}`);

  const tokenTracker = new TokenTracker();

  const messageHistory = new MessageHistory({
    stateDir: appDir.ensurePath("message-history"),
    modelManager,
    tokenTracker,
  });
  messageHistory.on("update-title", (title) => terminal.setTitle(title));

  const commands = new CommandManager({
    promptManager,
    modelManager,
    terminal,
    messageHistory,
    tokenTracker,
  });

  const repl = new Repl({
    promptManager,
    terminal,
    config: appConfig,
    messageHistory,
    modelManager,
    tokenTracker,
    commands,
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
