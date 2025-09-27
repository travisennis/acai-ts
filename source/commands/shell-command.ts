import type { Interface as ReadlineInterface } from "node:readline";
import { createInterface } from "node:readline";
import { initExecutionEnvironment } from "../execution/index.ts";
import style from "../terminal/style.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 1.5 * 60 * 1000; // 1.5 minutes
const INTERACTIVE_REGEX = /tty|terminal|interactive|no input/i;

// Helper to promisify rl.question
function questionAsync(rl: ReadlineInterface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer: string) => {
      resolve(answer);
    });
  });
}

export const shellCommand = (options: CommandOptions): ReplCommand => {
  const { terminal, promptManager, tokenCounter } = options;

  return {
    command: "/shell",
    aliases: ["/sh"],
    description: "Run a non-interactive shell command on the local machine.",
    result: "continue" as const,
    getSubCommands: () => Promise.resolve([]),
    execute: async (args: string[]) => {
      const commandStr = args.join(" ");
      if (!commandStr.trim()) {
        terminal.error("Provide a non-empty command.");
        return;
      }

      const execEnv = await initExecutionEnvironment();
      const { output, exitCode, duration } = await execEnv.executeCommand(
        commandStr,
        {
          cwd: process.cwd(),
          timeout: DEFAULT_TIMEOUT,
          preserveOutputOnError: true,
          captureStderr: true,
          throwOnError: false,
        },
      );

      terminal.lineBreak();
      terminal.writeln(
        style.gray(`Exit code: ${exitCode}, Duration: ${duration}ms`),
      );

      terminal.write(output);

      // Check for interactive
      if (exitCode !== 0 && INTERACTIVE_REGEX.test(output)) {
        terminal.error("Interactive commands are not supported.");
        return;
      }

      // Prompt for context addition
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      try {
        const answer = await questionAsync(
          rl,
          "\nWould you like to add this output to the prompt context for AI reference? [y/N]: ",
        );
        rl.close();
        if (answer.toLowerCase() === "y") {
          const tokenCount = tokenCounter.count(output);
          promptManager.addContext(output);
          terminal.success(
            `Output added to prompt context. ${tokenCount} tokens)`,
          );
        }
      } catch (_e) {
        rl.close();
        // Ignore, optional
      }
    },
  };
};
