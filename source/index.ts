import { text } from "node:stream/consumers";
import { asyncTry } from "@travisennis/stdlib/try";
import meow from "meow";
import { readAppConfig } from "./config.ts";
import { logger } from "./logger.ts";
import { repl } from "./repl.ts";
import { writeError } from "./terminal/output.ts";

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
      writeError(`Error reading stdin: ${(error as Error).message}`);
    }
  }

  const config = await readAppConfig("acai");

  (
    await asyncTry(
      repl({
        initialPrompt,
        stdin: stdInPrompt,
        args: cli.flags,
        config,
      }),
    )
  ).recover(handleError);
}

main();
