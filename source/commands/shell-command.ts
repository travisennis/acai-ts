import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Interface as ReadlineInterface } from "node:readline";
import { createInterface } from "node:readline";
import {
  type ShellStreamResult,
  streamShellCommand,
} from "../execution/index.ts";
import chalk from "../terminal/chalk.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

const TRUNCATION_LIMIT = 10000;
const RISKY_REGEX = /(sudo|rm\\s+-rf|dd\\s+if=|mkfs|:\\(\\)\\{\\})/i;
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
  const { terminal, promptManager } = options;

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

      // High-risk confirmation
      if (RISKY_REGEX.test(commandStr)) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        try {
          const answer = await questionAsync(
            rl,
            chalk.yellow(
              `This command looks potentially dangerous: ${commandStr}\\nContinue? [y/N]: `,
            ),
          );
          rl.close();
          if (answer.toLowerCase() !== "y") {
            terminal.warn("Command aborted by user.");
            return;
          }
        } catch (_e) {
          rl.close();
          terminal.error("Confirmation interrupted.");
          return;
        }
      }

      // Prepare callbacks for streaming
      const onStdout = (chunk: string) => {
        terminal.write(chunk);
      };
      const onStderr = (chunk: string) => {
        terminal.write(chalk.red(`[ERR] ${chunk}`));
      };

      let result: ShellStreamResult;
      try {
        result = await streamShellCommand(commandStr, {
          onStdout,
          onStderr,
        });
      } catch (error) {
        terminal.error(
          `Failed to execute command: ${(error as Error).message}`,
        );
        return;
      }

      const { fullStdout, fullStderr, code, duration, signal } = result;
      const fullOutput = fullStdout + fullStderr;

      terminal.lineBreak();
      terminal.writeln(
        chalk.gray(
          `Exit code: ${code}${signal ? ` (signaled: ${signal})` : ""}, Duration: ${duration}ms`,
        ),
      );

      const truncated = fullOutput.length > TRUNCATION_LIMIT;
      if (truncated) {
        const truncatedOutput = fullOutput.slice(0, TRUNCATION_LIMIT);
        terminal.write(truncatedOutput);
        terminal.warn(
          `\\nOutput truncated (first ${TRUNCATION_LIMIT} chars shown). Full output saved to temp file.`,
        );
        const tempPath = join(tmpdir(), `acai-shell-${Date.now()}.txt`);
        try {
          writeFileSync(tempPath, fullOutput, "utf8");
          terminal.info(`Full output: ${tempPath}`);
        } catch (e) {
          terminal.error(`Failed to save full output: ${(e as Error).message}`);
        }
      } else {
        if (fullOutput) {
          terminal.write(fullOutput);
        }
      }

      // Check for interactive
      if (code !== 0 && INTERACTIVE_REGEX.test(fullStderr)) {
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
          "\\nWould you like to add this output to the prompt context for AI reference? [y/N]: ",
        );
        rl.close();
        if (answer.toLowerCase() === "y") {
          promptManager.addContext(fullOutput);
          terminal.success("Output added to prompt context.");
        }
      } catch (_e) {
        rl.close();
        // Ignore, optional
      }
    },
  };
};
