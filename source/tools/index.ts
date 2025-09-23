import type { ModelManager } from "../models/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../token-tracker.ts";
import type { TokenCounter } from "../token-utils.ts";
import type { ToolExecutor } from "../tool-executor.ts";
import { createAgentTools } from "./agent.ts";
import { createBashTool } from "./bash.ts";
import { createCodeInterpreterTool } from "./code-interpreter.ts";
import { createDeleteFileTool } from "./delete-file.ts";
import { createDirectoryTreeTool } from "./directory-tree.ts";
import { loadDynamicTools } from "./dynamic-tool-loader.ts";
import { createEditFileTool } from "./edit-file.ts";
import { createGrepTool } from "./grep.ts";
import { createMoveFileTool } from "./move-file.ts";
import { createReadFileTool } from "./read-file.ts";
import { createReadMultipleFilesTool } from "./read-multiple-files.ts";
import { createSaveFileTool } from "./save-file.ts";
import { createThinkTool } from "./think.ts";
import type { Message } from "./types.ts";
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
  toolExecutor,
}: {
  terminal: Terminal;
  tokenCounter: TokenCounter;
  events: Map<string, Message[]>;
  toolExecutor?: ToolExecutor;
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
    toolExecutor,
  });

  const saveFileTool = await createSaveFileTool({
    workingDir: process.cwd(),
    sendData: sendDataFn,
    terminal,
    toolExecutor,
  });

  const moveFileTool = await createMoveFileTool({
    workingDir: process.cwd(),
    sendData: sendDataFn,
  });

  const directoryTreeTool = await createDirectoryTreeTool({
    workingDir: process.cwd(),
    sendData: sendDataFn,
    tokenCounter,
  });

  const deleteFileTool = await createDeleteFileTool({
    workingDir: process.cwd(),
    sendData: sendDataFn,
    terminal,
    toolExecutor,
  });

  const codeInterpreterTool = createCodeInterpreterTool({
    sendData: sendDataFn,
  });

  const grepTool = createGrepTool({
    sendData: sendDataFn,
    tokenCounter,
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

  const bashTool = await createBashTool({
    baseDir: process.cwd(),
    sendData: sendDataFn,
    tokenCounter,
    terminal,
    toolExecutor,
  });

  const dynamicTools = await loadDynamicTools({
    baseDir: process.cwd(),
    sendData: sendDataFn,
  });

  const tools = {
    ...readFileTool,
    ...readMultipleFilesTool,
    ...editFileTool,
    ...saveFileTool,
    ...moveFileTool,
    ...directoryTreeTool,
    ...deleteFileTool,
    ...codeInterpreterTool,
    ...grepTool,
    ...thinkTool,
    ...webFetchTool,
    ...bashTool,
    ...webSearchTool,
    ...dynamicTools,
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

  const saveFileTool = await createSaveFileTool({
    workingDir: process.cwd(),
    sendData: undefined,
    terminal: undefined,
  });

  const moveFileTool = await createMoveFileTool({
    workingDir: process.cwd(),
    sendData: undefined,
  });

  const directoryTreeTool = await createDirectoryTreeTool({
    workingDir: process.cwd(),
    sendData: undefined,
    tokenCounter,
  });

  const deleteFileTool = await createDeleteFileTool({
    workingDir: process.cwd(),
    sendData: undefined,
    terminal: undefined,
  });

  const codeInterpreterTool = createCodeInterpreterTool({
    sendData: undefined,
  });

  const grepTool = createGrepTool({
    sendData: undefined,
    tokenCounter,
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

  const bashTool = await createBashTool({
    baseDir: process.cwd(),
    sendData: undefined,
    tokenCounter,
    terminal: undefined,
  });

  const dynamicTools = await loadDynamicTools({
    baseDir: process.cwd(),
    sendData: undefined,
  });

  const tools = {
    ...readFileTool,
    ...readMultipleFilesTool,
    ...editFileTool,
    ...saveFileTool,
    ...moveFileTool,
    ...directoryTreeTool,
    ...deleteFileTool,
    ...codeInterpreterTool,
    ...grepTool,
    ...thinkTool,
    ...webFetchTool,
    ...bashTool,
    ...webSearchTool,
    ...dynamicTools,
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
