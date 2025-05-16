import { input } from "@inquirer/prompts";
import { tool } from "ai";
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
import { createMemoryTools } from "./memory.ts";

const sendDataHandler = (events: Map<string, Message[]>) => {
  const msgStore: Map<string, Message[]> = events;
  return (msg: Message) => {
    if (msgStore.has(msg.id)) {
      msgStore.get(msg.id)?.push(msg);
    } else {
      msgStore.set(msg.id, [msg]);
    }
  };
};

export async function initTools({
  terminal,
  tokenCounter,
  events,
}: {
  terminal: Terminal;
  tokenCounter: TokenCounter;
  events: Map<string, Message[]>;
}) {
  const sendDataFn = sendDataHandler(events);

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
    tokenCounter,
  });

  const bashTools = createBashTools({
    baseDir: process.cwd(),
    sendData: sendDataFn,
    tokenCounter,
  });

  const memoryTools = createMemoryTools({
    sendData: sendDataFn,
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
    ...memoryTools,
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
    tokenCounter,
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
