import { input } from "@inquirer/prompts";
import { tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
import type { Terminal } from "../terminal/index.ts";
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
  const msgStore: Map<string, string[]> = new Map();
  return async (msg: Message) => {
    if (msg.event === "tool-init") {
      msgStore.set(msg.id, [`${msg.data}`]);
    } else if (msg.event === "tool-update") {
      const secondaryMsgs = msg.data.secondary ?? [];
      msgStore.get(msg.id)?.push(`└── ${msg.data.primary}`);
      for (const line of secondaryMsgs) {
        msgStore.get(msg.id)?.push(line);
      }
      terminal.lineBreak();
    } else if (msg.event === "tool-completion") {
      msgStore.get(msg.id)?.push(`└── ${msg.data}`);
      const msgHistory = msgStore.get(msg.id) ?? [];
      if (msgHistory.length > 0) {
        msgHistory[0] = `\n${chalk.blue.bold("●")} ${msgHistory[0]}`;
      }
      await Promise.all(msgHistory.map((msg) => terminal.display(msg)));
      msgStore.delete(msg.id);
      terminal.lineBreak();
    } else if (msg.event === "tool-error") {
      const msgHistory = msgStore.get(msg.id) ?? [];
      if (msgHistory.length > 0) {
        msgHistory[0] = `\n${chalk.red.bold("●")} ${msgHistory[0]}`;
      }
      await Promise.all(msgHistory.map((msg) => terminal.display(msg)));
      msgStore.delete(msg.id);
      terminal.error(msg.data);
      terminal.lineBreak();
    }
  };
};

export async function initTools({
  terminal,
}: {
  terminal?: Terminal;
}) {
  const sendDataFn = terminal ? sendDataHandler(terminal) : undefined;
  const fsTools = await createFileSystemTools({
    workingDir: process.cwd(),
    sendData: sendDataFn,
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
  });

  const webSearchTools = createWebSearchTools({
    sendData: sendDataFn,
  });

  const bashTools = createBashTools({
    baseDir: process.cwd(),
    sendData: sendDataFn,
  });

  const askUserTool = {
    askUser: tool({
      description:
        "A tool to ask the user for input. Use this ask the user for clarification when you need it. This tool will display the question to the user.",
      parameters: z.object({
        question: z.string().describe("The question to ask the user."),
      }),
      execute: async ({ question }) => {
        if (terminal) {
          terminal.lineBreak();
          await terminal.display(question);
          const result = await input({ message: "? " });
          terminal.lineBreak();

          return result;
        }
        return "Terminal is not configured. Can't ask user.";
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

// biome-ignore lint/performance/noBarrelFile: <explanation>
export * from "./code-interpreter.ts";
export * from "./filesystem.ts";
export * from "./git.ts";
export * from "./grep.ts";
export * from "./memory.ts";
export * from "./think.ts";
export * from "./types.ts";
export * from "./url.ts";
