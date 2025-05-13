import { input } from "@inquirer/prompts";
import { tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
import type { Terminal } from "../terminal/index.ts";
import type { TokenCounter } from "../token-utils.ts";
import { createBashTools } from "./bash-tool.ts";
import { createCodeInterpreterTool } from "./code-interpreter.ts";
import { createFileSystemTools } from "./filesystem.ts";
import { createGitTools } from "./git.ts";
import { createGrepTools } from "./grep.ts";
import { createThinkTools } from "./think.ts";
import type { Message } from "./types.ts";
import { createUrlTools } from "./url.ts";
import { createWebSearchTools } from "./web-search.ts";

const sendDataHandler = (terminal: Terminal) => {
  const msgStore: Map<string, Message[]> = new Map();
  let printChain = Promise.resolve();
  return (msg: Message) => {
    if (msgStore.has(msg.id)) {
      msgStore.get(msg.id)?.push(msg);
    } else {
      msgStore.set(msg.id, [msg]);
    }

    if (msg.event === "tool-completion" || msg.event === "tool-error") {
      const messages = msgStore.get(msg.id) ?? [];
      msgStore.delete(msg.id);
      printChain = printChain
        .then(async () => {
          // --- Printing logic for the current tool (uuid, messages) goes here ---
          const isError = messages[messages.length - 1]?.event === "tool-error";
          const indicator = isError
            ? chalk.red.bold("●")
            : chalk.blue.bold("●");
          const initMessage =
            messages.find((m) => m.event === "tool-init")?.data ??
            "Tool Execution";

          terminal.write(`\n${indicator} `); // Write indicator without newline (sync)
          terminal.display(initMessage); // Display initial message (async)

          for (const msg of messages) {
            if (msg.event === "tool-update") {
              if (msg.data.secondary && msg.data.secondary.length > 0) {
                terminal.header(msg.data.primary, chalk.blue);
                terminal.display(msg.data.secondary.join("\n"), true);
                terminal.hr(chalk.blue);
              } else {
                terminal.display(`└── ${msg.data.primary}`);
              }
            } else if (msg.event === "tool-completion") {
              terminal.display(`└── ${msg.data}`);
            } else if (msg.event === "tool-error") {
              terminal.error(msg.data); // Use terminal.error for errors
            }
            // 'init' message already handled
          }
          terminal.lineBreak(); // Add a line break after all messages for this tool (sync)
          // --- End of printing logic ---
        })
        .catch((err) => {
          // Catch potential errors within the printing logic itself
          console.error("Error during terminal output:", err);
          // Ensure the chain continues even if one print job fails
          return Promise.resolve();
        });
    }
  };
};

export async function initTools({
  terminal,
  tokenCounter,
}: {
  terminal: Terminal;
  tokenCounter: TokenCounter;
}) {
  const sendDataFn = sendDataHandler(terminal);

  const fsTools = await createFileSystemTools({
    workingDir: process.cwd(),
    terminal,
    sendData: sendDataFn,
    tokenCounter,
  });

  const gitTools = await createGitTools({
    workingDir: process.cwd(),
    sendData: sendDataFn,
  });

  const codeInterpreterTool = createCodeInterpreterTool({
    sendData: sendDataFn,
  });

  const grepTool = createGrepTools({
    sendData: sendDataFn,
  });

  const thinkTool = createThinkTools({
    sendData: sendDataFn,
  });

  const urlTools = createUrlTools({
    sendData: sendDataFn,
    tokenCounter,
  });

  const webSearchTools = createWebSearchTools({
    sendData: sendDataFn,
  });

  const bashTools = createBashTools({
    baseDir: process.cwd(),
    sendData: sendDataFn,
    tokenCounter,
  });

  const askUserTool = {
    askUser: tool({
      description:
        "A tool to ask the user for input. Use this to ask the user for clarification or permission when you need it. This tool will display the question to the user, so you DO NOT need to return the question separately.",
      parameters: z.object({
        question: z.string().describe("The question to ask the user."),
      }),
      execute: async ({ question }) => {
        terminal.lineBreak();
        terminal.display(question, true);
        terminal.lineBreak();
        const result = await input({ message: "? " });
        terminal.lineBreak();

        return result;
      },
    }),
  };

  const tools = {
    ...fsTools,
    ...gitTools,
    ...codeInterpreterTool,
    ...grepTool,
    ...thinkTool,
    ...urlTools,
    ...askUserTool,
    ...bashTools,
    ...webSearchTools,
  } as const;

  return tools;
}

export async function initCliTools({
  tokenCounter,
}: {
  tokenCounter: TokenCounter;
}) {
  const fsTools = await createFileSystemTools({
    workingDir: process.cwd(),
    terminal: undefined,
    sendData: undefined,
    tokenCounter,
  });

  const gitTools = await createGitTools({
    workingDir: process.cwd(),
    sendData: undefined,
  });

  const codeInterpreterTool = createCodeInterpreterTool({
    sendData: undefined,
  });

  const grepTool = createGrepTools({
    sendData: undefined,
  });

  const thinkTool = createThinkTools({
    sendData: undefined,
  });

  const urlTools = createUrlTools({
    sendData: undefined,
    tokenCounter,
  });

  const webSearchTools = createWebSearchTools({
    sendData: undefined,
  });

  const bashTools = createBashTools({
    baseDir: process.cwd(),
    sendData: undefined,
    tokenCounter,
  });

  const tools = {
    ...fsTools,
    ...gitTools,
    ...codeInterpreterTool,
    ...grepTool,
    ...thinkTool,
    ...urlTools,
    ...bashTools,
    ...webSearchTools,
  } as const;

  return tools;
}

// biome-ignore lint/performance/noBarrelFile: <explanation>
export * from "./code-interpreter.ts";
export * from "./filesystem.ts";
export * from "./git.ts";
export * from "./grep.ts";
export * from "./memory.ts";
export * from "./think.ts";
export * from "./types.ts";
export * from "./url.ts";
