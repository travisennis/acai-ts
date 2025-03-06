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

const sendDataHandler = async (msg: Message) => {
  if (msg.event === "tool-init") {
    console.info(`> ${await msg.data}`);
  } else if (msg.event === "tool-completion") {
    console.info(`└─${await msg.data}`);
  }
  console.info(await msg.data);
};

const fsTools = await createFileSystemTools({
  workingDir: process.cwd(),
  sendData: sendDataHandler,
});

const gitTools = await createGitTools({
  workingDir: process.cwd(),
  sendData: sendDataHandler,
});

const codeTools = createCodeTools({
  baseDir: process.cwd(),
  config: await readProjectConfig(),
  sendData: sendDataHandler,
});

const codeInterpreterTool = createCodeInterpreterTool({
  sendData: sendDataHandler,
});

const grepTool = createGrepTools({
  sendData: sendDataHandler,
});

const thinkTool = createThinkTools({
  sendData: sendDataHandler,
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

export const tools = {
  ...codeTools,
  ...fsTools,
  ...gitTools,
  ...codeInterpreterTool,
  ...grepTool,
  ...thinkTool,
  ...askUserTool,
} as const;
//
