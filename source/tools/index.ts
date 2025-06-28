import { input } from "@inquirer/prompts";
import { tool } from "ai";
import { z } from "zod";
import type { ModelManager } from "../models/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../token-tracker.ts";
import type { TokenCounter } from "../token-utils.ts";
import { createAgentTools } from "./agent.ts";
import { createBashTools } from "./bash.ts";
import { createCodeInterpreterTool } from "./code-interpreter.ts";
import { createDeleteFileTool } from "./delete-file.ts";
import { createDirectoryTreeTool } from "./directory-tree.ts";
import { createEditFileTool } from "./edit-file.ts";
import { createGitCommitTool } from "./git-commit.ts";
import { createGrepTool } from "./grep.ts";
import { createMemoryReadTool } from "./memory-read.ts";
import { createMemoryWriteTool } from "./memory-write.ts";
import { createMoveFileTool } from "./move-file.ts";
import { createReadFileTool } from "./read-file.ts";
import { createReadMultipleFilesTool } from "./read-multiple-files.ts";
import { createSaveFileTool } from "./save-file.ts";
import { createThinkTool } from "./think.ts";
import type { Message } from "./types.ts";
import { createUndoEditTool } from "./undo-edit.ts";
import { createWebFetchTool } from "./web-fetch.ts";
import { createWebSearchTool } from "./web-search.ts";

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

  const readFileTool = await createReadFileTool({
    workingDir: process.cwd(),
    sendData: sendDataFn,
    tokenCounter,
  });

  const readMultipleFilesTool = await createReadMultipleFilesTool({
    workingDir: process.cwd(),
    sendData: sendDataFn,
    tokenCounter,
  });

  const editFileTool = await createEditFileTool({
    workingDir: process.cwd(),
    terminal,
    sendData: sendDataFn,
  });

  const undoEditTool = await createUndoEditTool({
    workingDir: process.cwd(),
    sendData: sendDataFn,
  });

  const saveFileTool = await createSaveFileTool({
    workingDir: process.cwd(),
    sendData: sendDataFn,
  });

  const moveFileTool = await createMoveFileTool({
    workingDir: process.cwd(),
    sendData: sendDataFn,
  });

  const directoryTreeTool = await createDirectoryTreeTool({
    workingDir: process.cwd(),
    sendData: sendDataFn,
  });

  const deleteFileTool = await createDeleteFileTool({
    workingDir: process.cwd(),
    sendData: sendDataFn,
  });

  const gitCommitTool = await createGitCommitTool({
    workingDir: process.cwd(),
    sendData: sendDataFn,
  });

  const codeInterpreterTool = createCodeInterpreterTool({
    sendData: sendDataFn,
  });

  const grepTool = createGrepTool({
    sendData: sendDataFn,
  });

  const thinkTool = createThinkTool({
    sendData: sendDataFn,
  });

  const webFetchTool = createWebFetchTool({
    sendData: sendDataFn,
    tokenCounter,
  });

  const webSearchTool = createWebSearchTool({
    sendData: sendDataFn,
    tokenCounter,
  });

  const bashTools = createBashTools({
    baseDir: process.cwd(),
    sendData: sendDataFn,
    tokenCounter,
  });

  const memoryReadTool = createMemoryReadTool({
    sendData: sendDataFn,
  });

  const memoryWriteTool = createMemoryWriteTool({
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
    ...readFileTool,
    ...readMultipleFilesTool,
    ...editFileTool,
    ...undoEditTool,
    ...saveFileTool,
    ...moveFileTool,
    ...directoryTreeTool,
    ...deleteFileTool,
    ...gitCommitTool,
    ...codeInterpreterTool,
    ...grepTool,
    ...thinkTool,
    ...webFetchTool,
    ...askUserTool,
    ...bashTools,
    ...webSearchTool,
    ...memoryReadTool,
    ...memoryWriteTool,
  } as const;

  return tools;
}

export async function initCliTools({
  tokenCounter,
}: {
  tokenCounter: TokenCounter;
}) {
  const readFileTool = await createReadFileTool({
    workingDir: process.cwd(),
    sendData: undefined,
    tokenCounter,
  });

  const readMultipleFilesTool = await createReadMultipleFilesTool({
    workingDir: process.cwd(),
    sendData: undefined,
    tokenCounter,
  });

  const editFileTool = await createEditFileTool({
    workingDir: process.cwd(),
    terminal: undefined,
    sendData: undefined,
  });

  const undoEditTool = await createUndoEditTool({
    workingDir: process.cwd(),
    sendData: undefined,
  });

  const saveFileTool = await createSaveFileTool({
    workingDir: process.cwd(),
    sendData: undefined,
  });

  const moveFileTool = await createMoveFileTool({
    workingDir: process.cwd(),
    sendData: undefined,
  });

  const directoryTreeTool = await createDirectoryTreeTool({
    workingDir: process.cwd(),
    sendData: undefined,
  });

  const deleteFileTool = await createDeleteFileTool({
    workingDir: process.cwd(),
    sendData: undefined,
  });

  const gitCommitTool = await createGitCommitTool({
    workingDir: process.cwd(),
    sendData: undefined,
  });

  const codeInterpreterTool = createCodeInterpreterTool({
    sendData: undefined,
  });

  const grepTool = createGrepTool({
    sendData: undefined,
  });

  const thinkTool = createThinkTool({
    sendData: undefined,
  });

  const webFetchTool = createWebFetchTool({
    sendData: undefined,
    tokenCounter,
  });

  const webSearchTool = createWebSearchTool({
    sendData: undefined,
    tokenCounter,
  });

  const bashTools = createBashTools({
    baseDir: process.cwd(),
    sendData: undefined,
    tokenCounter,
  });

  const memoryReadTool = createMemoryReadTool({
    sendData: undefined,
  });

  const memoryWriteTool = createMemoryWriteTool({
    sendData: undefined,
  });

  const tools = {
    ...readFileTool,
    ...readMultipleFilesTool,
    ...editFileTool,
    ...undoEditTool,
    ...saveFileTool,
    ...moveFileTool,
    ...directoryTreeTool,
    ...deleteFileTool,
    ...gitCommitTool,
    ...codeInterpreterTool,
    ...grepTool,
    ...thinkTool,
    ...webFetchTool,
    ...bashTools,
    ...webSearchTool,
    ...memoryReadTool,
    ...memoryWriteTool,
  } as const;

  return tools;
}

export async function initAgents({
  modelManager,
  tokenTracker,
  tokenCounter,
  events,
}: {
  terminal: Terminal;
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  tokenCounter: TokenCounter;
  events: Map<string, Message[]>;
}) {
  const sendDataFn = sendDataHandler(events);

  const agentTools = createAgentTools({
    modelManager,
    tokenTracker,
    tokenCounter,
    sendData: sendDataFn,
  });

  const tools = {
    ...agentTools,
  };

  return tools;
}
