import { text } from "node:stream/consumers";
import { envPaths } from "@travisennis/stdlib/env";
import { asyncTry } from "@travisennis/stdlib/try";
import meow from "meow";
import { CommandManager } from "./commands/manager.ts";
import { readAppConfig } from "./config.ts";
import { FileManager } from "./files/manager.ts";
import { logger } from "./logger.ts";
import { MessageHistory } from "./messages.ts";
import { ModelManager } from "./models/manager.ts";
import { type ModelName, isSupportedModel } from "./models/providers.ts";
import { Repl } from "./repl.ts";
import { initTerminal } from "./terminal/index.ts";
import { TokenTracker } from "./tokenTracker.ts";

const cli = meow(
  `
	Usage
	  $ acai <input>

	Options
    --model, -m  Sets the model to use
    --prompt, -p  Sets the prompt
    --oneshot, -o  Run once and exit

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
  const initialPrompt = cli.input.at(0);

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

  const config = await readAppConfig("acai");

  const chosenModel: ModelName = isSupportedModel(cli.flags.model)
    ? cli.flags.model
    : "anthropic:sonnet-token-efficient-tools";

  const stateDir = envPaths("acai").state;

  const terminal = initTerminal();
  terminal.setTitle(`acai: ${process.cwd()}`);

  const modelManager = new ModelManager({ stateDir });
  modelManager.setModel("repl", chosenModel);
  modelManager.setModel("title-conversation", "anthropic:haiku");
  modelManager.setModel("conversation-summarizer", "anthropic:haiku");
  modelManager.setModel("file-retiever", "anthropic:haiku");
  modelManager.setModel("tool-repair", "openai:gpt-4o-structured");
  modelManager.setModel("meta-prompt", "anthropic:sonnet35");

  const fileManager = new FileManager({ terminal });

  const tokenTracker = new TokenTracker();

  const messageHistory = new MessageHistory({
    stateDir,
    modelManager,
    tokenTracker,
  });
  messageHistory.on("update-title", (title) => terminal.setTitle(title));

  const commands = new CommandManager({
    modelManager,
    terminal,
    messageHistory,
    tokenTracker,
    fileManager,
  });

  const repl = new Repl({
    terminal,
    config,
    messageHistory,
    modelManager,
    fileManager,
    tokenTracker,
    commands,
  });

  (
    await asyncTry(
      repl.run({
        initialPrompt,
        stdin: stdInPrompt,
        args: cli.flags,
      }),
    )
  ).recover(handleError);
}

main();
