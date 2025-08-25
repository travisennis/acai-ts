import path from "node:path";
import { input, select } from "@inquirer/prompts";
import { tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
import { config } from "../config.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenCounter } from "../token-utils.ts";
import { executeCommand } from "../utils/process.ts";
import { CommandValidation } from "./command-validation.ts";
import type { SendData } from "./types.ts";

export const BashTool = {
  name: "bash" as const,
};

type Token = { raw: string; unquoted: string };

function tokenize(inputStr: string): Token[] {
  const tokens: Token[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < inputStr.length; i++) {
    const ch: string = inputStr[i] as string;
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    if (!inSingle && !inDouble && /\s/.test(ch)) {
      if (current.length > 0) {
        const raw = current;
        const unquoted = raw.replace(/^['"]|['"]$/g, "");
        tokens.push({ raw, unquoted });
        current = "";
      }
      continue;
    }
    if (ch === "\\" && inDouble && i + 1 < inputStr.length) {
      const next = inputStr[i + 1];
      if (next === '"' || next === "\\") {
        current += next;
        i++;
        continue;
      }
    }
    current += ch;
  }
  if (current.length > 0) {
    const raw = current;
    const unquoted = raw.replace(/^['"]|['"]$/g, "");
    tokens.push({ raw, unquoted });
  }
  return tokens;
}

function shouldSkipPathValidation(tokens: Token[], index: number): boolean {
  if (index === 0) return false;
  const cmd = tokens[0]?.unquoted;
  if (cmd !== "git") return false;
  const sub = tokens[1]?.unquoted;
  if (
    sub !== "commit" &&
    sub !== "tag" &&
    !(sub === "notes" && tokens[2]?.unquoted === "add")
  ) {
    return false;
  }
  const prev = tokens[index - 1]?.unquoted;
  if (prev === "-m" || prev === "--message") return true;
  return false;
}

function looksLikeUrl(str: string): boolean {
  return str.startsWith("http://") || str.startsWith("https://");
}

// Whitelist of allowed commands
const ALLOWED_COMMANDS = [
  "chmod",
  "ls",
  "pwd",
  "cat",
  "grep",
  "find",
  "echo",
  "mkdir",
  "touch",
  "cp",
  "mv",
  "pwd",
  "wc",
  "diff",
  "sort",
  "head",
  "tail",
  "sleep",
  "npm",
  "npx",
  "node",
  "git",
  "gh",
  "rg",
  "jq",
  "sed",
  "awk",
];

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 1.5 * 60 * 1000; // 1.5 minutes

// Ensure path is within base directory
function isPathWithinBaseDir(requestedPath: string, baseDir: string): boolean {
  const normalizedRequestedPath = path.normalize(requestedPath);
  const normalizedBaseDir = path.normalize(baseDir);

  return normalizedRequestedPath.startsWith(normalizedBaseDir);
}

// Initialize command validator with allowed commands
const commandValidator = new CommandValidation(ALLOWED_COMMANDS);

export const createBashTool = ({
  baseDir,
  sendData,
  tokenCounter,
  terminal,
  autoAcceptAll,
}: {
  baseDir: string;
  sendData?: SendData | undefined;
  tokenCounter: TokenCounter;
  terminal?: Terminal;
  autoAcceptAll: boolean;
}) => {
  let autoAcceptCommands = autoAcceptAll;
  return {
    [BashTool.name]: tool({
      description: `Execute bash commands and return their output. Limited to a whitelist of safe commands: ${ALLOWED_COMMANDS.join(", ")}. Commands will only execute within the project directory for security. Always specify absolute paths to avoid errors.`,
      inputSchema: z.object({
        command: z.string().describe("Full CLI command to execute."),
        args: z
          .array(z.string())
          .optional()
          .describe(
            "Optional explicit argv array. When provided, the command will be executed without a shell using the provided args.",
          ),
        mode: z
          .enum(["auto", "args", "shell"])
          .default("auto")
          .describe(
            "Execution mode: 'auto' = prefer execFile with argv when safe, 'args' = require argv and run without shell, 'shell' = run via shell.",
          ),
        cwd: z
          .string()
          .nullable()
          .describe(
            "Working directory (default: project root). Must be within the project directory.",
          ),
        timeout: z
          .number()
          .nullable()
          .describe(
            `Command execution timeout in milliseconds. Default: ${DEFAULT_TIMEOUT}ms`,
          ),
      }),
      execute: async (
        { command, args, mode, cwd, timeout },
        { toolCallId },
      ) => {
        // Guard against null cwd and timeout
        const safeCwd = cwd == null ? baseDir : cwd;
        const safeTimeout = timeout == null ? DEFAULT_TIMEOUT : timeout;

        const originalCommand = command;

        // Helper: POSIX-safe shell quoting for a single arg
        function shellQuoteArg(arg: string): string {
          if (arg.length === 0) return "''";
          // Characters that require quoting
          if (!/[ \t\n\r`"$\\|&;<>*?()[\]{}]/.test(arg)) return arg;
          if (!arg.includes("'")) return `'${arg}'`;
          // Replace single quotes with the POSIX-safe sequence: '\''
          return `'${arg.replace(/'/g, `'\\''`)}'`;
        }

        function buildQuotedCommandFromTokens(tokens: Token[]): string {
          return tokens.map((t) => shellQuoteArg(t.unquoted)).join(" ");
        }

        // Determine tokens for validation
        const tokensForValidation: Token[] = args
          ? args.map((a) => ({ raw: a, unquoted: a }))
          : tokenize(command);

        // Validate working directory
        if (!isPathWithinBaseDir(safeCwd, baseDir)) {
          const errorMsg = `Working directory must be within the project directory: ${baseDir}`;
          sendData?.({ event: "tool-error", id: toolCallId, data: errorMsg });
          return errorMsg;
        }

        // Use CommandValidation to decide if shell operators are present and to validate subcommands
        const isValidWithOperators = commandValidator.isValid(command);
        const requiresShell = !isValidWithOperators;

        // Validate base command allowed (fallback)
        const baseCmd = args?.[0] || tokenize(command)[0]?.unquoted || "";
        if (!ALLOWED_COMMANDS.includes(baseCmd)) {
          const errorMsg = `Command not allowed. Base command '${baseCmd}' is not in the approved list: ${ALLOWED_COMMANDS.join(", ")}`;
          sendData?.({ event: "tool-error", id: toolCallId, data: errorMsg });
          return errorMsg;
        }

        // If this command requires shell and we're in auto mode without a terminal, reject and instruct caller
        if (requiresShell && mode === "auto" && !terminal) {
          const errorMsg = `Command appears to use shell operators (pipes, redirects, command substitution). In non-interactive mode provide explicit args or set mode='shell' to run via shell.`;
          sendData?.({ event: "tool-error", id: toolCallId, data: errorMsg });
          return errorMsg;
        }

        // Validate path-like arguments
        for (let i = 0; i < tokensForValidation.length; i++) {
          const token = tokensForValidation[i];
          if (token == null) continue;
          const part = token.unquoted;

          if (shouldSkipPathValidation(tokensForValidation, i)) {
            continue;
          }

          if (looksLikeUrl(part)) {
            continue;
          }

          if (
            part.startsWith("/") ||
            part.includes("../") ||
            part.includes("./") ||
            (part.includes("/") && !part.startsWith("-"))
          ) {
            try {
              const resolvedPath = path.resolve(safeCwd, part);
              if (!isPathWithinBaseDir(resolvedPath, baseDir)) {
                const errorMsg = `Command argument references path outside the project directory: ${part} (resolved to ${resolvedPath})`;
                sendData?.({
                  event: "tool-error",
                  id: toolCallId,
                  data: errorMsg,
                });
                return errorMsg;
              }
            } catch (e) {
              console.info(
                `Could not resolve potential path argument: ${part}`,
                e as unknown as string,
              );
            }
          }
        }

        // Prompt user for command execution approval (only in interactive mode)
        if (terminal) {
          if (!autoAcceptCommands) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          terminal.lineBreak();
          terminal.writeln(
            `${chalk.blue.bold("●")} About to execute command: ${chalk.cyan(originalCommand)}`,
          );
          terminal.writeln(`${chalk.gray("Working directory:")} ${safeCwd}`);
          terminal.lineBreak();

          let userChoice: string;
          if (autoAcceptCommands) {
            terminal.writeln(
              chalk.green(
                "✓ Auto-accepting command (all future commands will be accepted)",
              ),
            );
            userChoice = "accept";
          } else {
            userChoice = await select({
              message: "What would you like to do with this command?",
              choices: [
                { name: "Execute this command", value: "accept" },
                {
                  name: "Execute all future commands (including this)",
                  value: "accept-all",
                },
                { name: "Reject this command", value: "reject" },
              ],
              default: "accept",
            });
          }

          terminal.lineBreak();

          if (userChoice === "accept-all") {
            autoAcceptCommands = true;
            terminal.writeln(
              chalk.yellow(
                "✓ Auto-accept mode enabled for all future commands",
              ),
            );
            terminal.lineBreak();
          }

          if (userChoice === "reject") {
            const reason = await input({ message: "Feedback: " });
            terminal.lineBreak();

            const rejectionMsg = `Command rejected by user. Reason: ${reason}`;
            sendData?.({
              event: "tool-completion",
              id: toolCallId,
              data: rejectionMsg,
            });
            return rejectionMsg;
          }
        }

        // Execute according to mode and safety
        try {
          // If explicit args provided and mode allows, run without shell
          if (args && (mode === "args" || mode === "auto")) {
            sendData?.({
              event: "tool-init",
              id: toolCallId,
              data: `Executing (argv spawn): ${chalk.cyan(baseCmd)} ${chalk.cyan(args.slice(1).join(" "))} in ${chalk.cyan(safeCwd)}`,
            });

            const result = await executeCommand(
              [baseCmd, ...(args.slice(1) as string[])],
              {
                cwd: safeCwd,
                timeout: safeTimeout,
                shell: false,
                throwOnError: false,
              },
            );

            if (result.signal === "SIGTERM") {
              const timeoutMessage = `Command timed out after ${safeTimeout}ms. This might be because the command is waiting for input.`;
              sendData?.({
                event: "tool-error",
                id: toolCallId,
                data: timeoutMessage,
              });
              return timeoutMessage;
            }

            const formattedResult = format(result);

            sendData?.({
              event: "tool-update",
              id: toolCallId,
              data: {
                primary: "Result",
                secondary: formattedResult.split("\n").slice(-5),
              },
            });

            let tokenCount = 0;
            try {
              tokenCount = tokenCounter.count(formattedResult);
            } catch (tokenError) {
              console.error("Error calculating token count:", tokenError);
            }

            const maxTokens = (await config.readProjectConfig()).tools
              .maxTokens;
            const maxTokenMessage = `Output of command (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Please adjust how you call the command to get back more specific results`;

            const finalResult =
              tokenCount <= maxTokens ? formattedResult : maxTokenMessage;

            sendData?.({
              event: "tool-completion",
              id: toolCallId,
              data:
                tokenCount <= maxTokens
                  ? "Command executed successfully."
                  : `Output of commmand (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}).`,
            });
            return finalResult;
          }

          // Otherwise, build quoted command and run via shell
          const tokens = tokenize(command);
          const quoted = buildQuotedCommandFromTokens(tokens);

          sendData?.({
            event: "tool-init",
            id: toolCallId,
            data: `Executing (shell): ${chalk.cyan(quoted)} in ${chalk.cyan(safeCwd)}`,
          });

          const result = await executeCommand(quoted, {
            cwd: safeCwd,
            timeout: safeTimeout,
            shell: true,
            throwOnError: false,
          });

          if (result.signal === "SIGTERM") {
            const timeoutMessage = `Command timed out after ${safeTimeout}ms. This might be because the command is waiting for input.`;
            sendData?.({
              event: "tool-error",
              id: toolCallId,
              data: timeoutMessage,
            });
            return timeoutMessage;
          }

          const formattedResult = format(result);

          sendData?.({
            event: "tool-update",
            id: toolCallId,
            data: {
              primary: "Result",
              secondary: formattedResult.split("\n").slice(-5),
            },
          });

          let tokenCount = 0;
          try {
            tokenCount = tokenCounter.count(formattedResult);
          } catch (tokenError) {
            console.error("Error calculating token count:", tokenError);
            // Log or handle error, but don't block file return
          }

          const maxTokens = (await config.readProjectConfig()).tools.maxTokens;
          // Adjust max token check message if line selection was used
          const maxTokenMessage = `Output of commmand (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Please adjust how you call the command to get back more specific results`;

          const finalResult =
            tokenCount <= maxTokens ? formattedResult : maxTokenMessage;

          sendData?.({
            event: "tool-completion",
            id: toolCallId,
            data:
              tokenCount <= maxTokens
                ? "Command executed successfully."
                : `Output of commmand (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}).`,
          });
          return finalResult;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: toolCallId,
            data: `Command failed: ${(error as Error).message}`,
          });
          return `Command failed: ${(error as Error).message}`;
        }
      },
    }),
  };
};

function format({
  stdout,
  stderr,
}: {
  stdout: string;
  stderr: string;
  code: number;
}) {
  return `${stdout}\n${stderr}`;
}
