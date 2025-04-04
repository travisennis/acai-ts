import { input } from "@inquirer/prompts";
import { type LanguageModel, tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
import { config } from "../config.ts";
import type { ModelManager } from "../models/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../token-tracker.ts";
import { createAgentTools } from "./agent.ts";
import { createArchitectTools } from "./architect.ts";
import { createBashTools } from "./bash-tool.ts";
import { createCodeInterpreterTool } from "./code-interpreter.ts";
import { createCodeTools } from "./code-tools.ts";
import { createFileSystemTools } from "./filesystem.ts";
import { createGitTools } from "./git.ts";
import { createGrepTools } from "./grep.ts";
import { createThinkTools } from "./tau-think.ts";
import { createTextEditorTool } from "./text-editor-tool.ts";
import type { Message } from "./types.ts";
import { createUrlTools } from "./url.ts";
// import { createRaindropTools } from "./raindrop.ts";

const sendDataHandler = (terminal: Terminal) => {
  return async (msg: Message) => {
    if (msg.event === "tool-init") {
      terminal.writeln("\n");
      terminal.display(`${chalk.blue.bold("●")} ${await msg.data}`);
    } else if (msg.event === "tool-update") {
      terminal.display(`${await msg.data}`);
    } else if (msg.event === "tool-completion") {
      terminal.display(`└── ${await msg.data}`);
      terminal.writeln("");
    } else if (msg.event === "tool-error") {
      terminal.error(await msg.data);
      terminal.writeln("");
    } else {
      terminal.display(await msg.data);
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

  const codeTools = createCodeTools({
    baseDir: process.cwd(),
    config: await config.readProjectConfig(),
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

  // const bookmarkTools = createRaindropTools({
  //   apiKey: process.env.RAINDROP_API_KEY ?? "",
  //   sendData: sendDataFn,
  // });

  const urlTools = createUrlTools({
    sendData: sendDataFn,
  });

  const bashTools = createBashTools({
    baseDir: process.cwd(),
    sendData: sendDataFn,
  });

  const askUserTool = {
    askUser: tool({
      description:
        "A tool to ask the user for input. Use this ask the user for clarification when you need it.",
      parameters: z.object({
        question: z.string().describe("The question to ask the user."),
      }),
      execute: async ({ question }) => {
        const result = await input({ message: `${question} >` });

        return result;
      },
    }),
  };

  const tools = {
    ...codeTools,
    ...fsTools,
    ...gitTools,
    ...codeInterpreterTool,
    ...grepTool,
    ...thinkTool,
    ...urlTools,
    // ...bookmarkTools,
    ...askUserTool,
    ...bashTools,
  } as const;

  return tools;
}

export function initCodingTools({
  terminal,
  modelManager,
  tokenTracker,
}: {
  terminal: Terminal;
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
}) {
  const sendDataFn = sendDataHandler(terminal);

  const agentTools = createAgentTools({
    modelManager,
    tokenTracker,
    sendData: sendDataFn,
  });

  const architectTools = createArchitectTools({
    modelManager,
    tokenTracker,
    sendData: sendDataFn,
  });

  const tools = {
    ...agentTools,
    ...architectTools,
  } as const;

  return tools;
}

export function initAnthropicTools({
  model,
  terminal,
}: { model: LanguageModel; terminal: Terminal }) {
  const textEditorTool = createTextEditorTool({
    modelId: model.modelId,
    workingDir: process.cwd(),
    sendData: sendDataHandler(terminal),
  });

  const tools = {
    ...textEditorTool,
  } as const;

  return tools;
}

// biome-ignore lint/performance/noBarrelFile: <explanation>
export * from "./code-interpreter.ts";
export * from "./code-tools.ts";
export * from "./filesystem.ts";
export * from "./git.ts";
export * from "./grep.ts";
export * from "./memory.ts";
export * from "./raindrop.ts";
export * from "./tau-think.ts";
export * from "./types.ts";
export * from "./url.ts";
export * from "./agent.ts";
export * from "./architect.ts";
