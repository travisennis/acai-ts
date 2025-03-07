import { input } from "@inquirer/prompts";
import {
  type Message,
  createCodeInterpreterTool,
  createCodeTools,
  createFileSystemTools,
  createGitTools,
  createGrepTools,
  createThinkTools,
} from "@travisennis/acai-core/tools";
import { tool } from "ai";
import { z } from "zod";
import { readProjectConfig } from "./config.ts";
import type { Terminal } from "./terminal/index.ts";

const sendDataHandler = (terminal: Terminal) => {
  return async (msg: Message) => {
    terminal.writeln("");
    if (msg.event === "tool-init") {
      terminal.display(`> ${await msg.data}`);
    } else if (msg.event === "tool-update") {
      terminal.display(`└── ${await msg.data}`);
    } else if (msg.event === "tool-completion") {
      terminal.display(`└── ${await msg.data}`);
    } else if (msg.event === "tool-error") {
      terminal.error(await msg.data);
    } else {
      terminal.display(await msg.data);
    }
    terminal.writeln("");
  };
};

export async function initTools({ terminal }: { terminal: Terminal }) {
  const fsTools = await createFileSystemTools({
    workingDir: process.cwd(),
    sendData: sendDataHandler(terminal),
  });

  const gitTools = await createGitTools({
    workingDir: process.cwd(),
    sendData: sendDataHandler(terminal),
  });

  const codeTools = createCodeTools({
    baseDir: process.cwd(),
    config: await readProjectConfig(),
    sendData: sendDataHandler(terminal),
  });

  const codeInterpreterTool = createCodeInterpreterTool({
    sendData: sendDataHandler(terminal),
  });

  const grepTool = createGrepTools({
    sendData: sendDataHandler(terminal),
  });

  const thinkTool = createThinkTools({
    sendData: sendDataHandler(terminal),
  });

  const askUserTool = {
    askUser: tool({
      description: "A tool to ask the user for input.",
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
    ...askUserTool,
  } as const;

  return tools;
}
