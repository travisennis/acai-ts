import type { AsyncReturnType } from "@travisennis/stdlib/types";
import { type TypedToolCall, type TypedToolResult, tool } from "ai";
import type { ModelManager } from "../models/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import type { TokenTracker } from "../tokens/tracker.ts";
import type { ToolExecutor } from "../tool-executor.ts";
import { createAgentTools } from "./agent.ts";
import { BashTool, createBashTool } from "./bash.ts";
import { createCodeInterpreterTool } from "./code-interpreter.ts";
import { createDeleteFileTool, DeleteFileTool } from "./delete-file.ts";
// import { createDirectoryTreeTool } from "./directory-tree.ts";
import { loadDynamicTools } from "./dynamic-tool-loader.ts";
import { createEditFileTool, EditFileTool } from "./edit-file.ts";
import { createGrepTool } from "./grep.ts";
import { createMoveFileTool, MoveFileTool } from "./move-file.ts";
import { createReadFileTool, ReadFileTool } from "./read-file.ts";
import {
  createReadMultipleFilesTool,
  ReadMultipleFilesTool,
} from "./read-multiple-files.ts";
import { createSaveFileTool, SaveFileTool } from "./save-file.ts";
import { createThinkTool } from "./think.ts";
import type { Message } from "./types.ts";
import { createWebFetchTool } from "./web-fetch.ts";
import { createWebSearchTool } from "./web-search.ts";

export type CompleteToolSet = AsyncReturnType<typeof initTools>["toolDefs"] &
  AsyncReturnType<typeof initAgents>["toolDefs"];

export type CompleteToolCall = TypedToolCall<CompleteToolSet>;
export type CompleteToolResult = TypedToolResult<CompleteToolSet>;

export type CompleteCliToolSet = AsyncReturnType<
  typeof initCliTools
>["toolDefs"];

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
  toolExecutor,
}: {
  terminal: Terminal;
  tokenCounter: TokenCounter;
  toolExecutor?: ToolExecutor;
}) {
  const readFileTool = await createReadFileTool({
    workingDir: process.cwd(),
    tokenCounter,
  });

  const readMultipleFilesTool = await createReadMultipleFilesTool({
    workingDir: process.cwd(),
    tokenCounter,
  });

  const editFileTool = await createEditFileTool({
    workingDir: process.cwd(),
    terminal,
    toolExecutor,
  });

  const saveFileTool = await createSaveFileTool({
    workingDir: process.cwd(),
    terminal,
    toolExecutor,
  });

  const moveFileTool = await createMoveFileTool({
    workingDir: process.cwd(),
    terminal,
    toolExecutor,
  });

  // const directoryTreeTool = await createDirectoryTreeTool({
  //   workingDir: process.cwd(),
  //   tokenCounter,
  // });

  const deleteFileTool = await createDeleteFileTool({
    workingDir: process.cwd(),
    terminal,
    toolExecutor,
  });

  const codeInterpreterTool = createCodeInterpreterTool({});

  const grepTool = createGrepTool({
    tokenCounter,
  });

  const thinkTool = createThinkTool();

  const webFetchTool = createWebFetchTool({
    tokenCounter,
  });

  const webSearchTool = createWebSearchTool({
    tokenCounter,
  });

  const bashTool = await createBashTool({
    baseDir: process.cwd(),
    tokenCounter,
    terminal,
    toolExecutor,
  });

  const dynamicTools = await loadDynamicTools({
    baseDir: process.cwd(),
  });

  // Build tools object for AI SDK
  const tools = {
    [EditFileTool.name]: tool(editFileTool.toolDef),
    [BashTool.name]: tool(bashTool.toolDef),
    [SaveFileTool.name]: tool(saveFileTool.toolDef),
    [DeleteFileTool.name]: tool(deleteFileTool.toolDef),
    [MoveFileTool.name]: tool(moveFileTool.toolDef),
    [ReadFileTool.name]: tool(readFileTool.toolDef),
    [ReadMultipleFilesTool.name]: tool(readMultipleFilesTool.toolDef),
    // TODO: Update other tools to new format as they are migrated
    // ...directoryTreeTool,
    ...codeInterpreterTool,
    ...grepTool,
    ...thinkTool,
    ...webFetchTool,
    ...webSearchTool,
    ...dynamicTools,
  } as const;

  // Build executors and permissions maps for manual loop
  const executors = new Map();
  const permissions = new Map();

  // Add bash tool
  executors.set(BashTool.name, bashTool.execute);
  if (bashTool.ask) {
    permissions.set(BashTool.name, bashTool.ask);
  }

  // Add editFile tool
  executors.set(EditFileTool.name, editFileTool.execute);
  if (editFileTool.ask) {
    permissions.set(EditFileTool.name, editFileTool.ask);
  }

  // Add saveFile tool
  executors.set(SaveFileTool.name, saveFileTool.execute);
  if (saveFileTool.ask) {
    permissions.set(SaveFileTool.name, saveFileTool.ask);
  }

  // Add deleteFile tool
  executors.set(DeleteFileTool.name, deleteFileTool.execute);
  if (deleteFileTool.ask) {
    permissions.set(DeleteFileTool.name, deleteFileTool.ask);
  }

  // Add moveFile tool
  executors.set(MoveFileTool.name, moveFileTool.execute);
  if (moveFileTool.ask) {
    permissions.set(MoveFileTool.name, moveFileTool.ask);
  }

  // Add readFile tool
  executors.set(ReadFileTool.name, readFileTool.execute);

  // Add readMultipleFiles tool
  executors.set(ReadMultipleFilesTool.name, readMultipleFilesTool.execute);

  return {
    toolDefs: tools,
    executors,
    permissions,
  };
}

export async function initCliTools({
  tokenCounter,
}: {
  tokenCounter: TokenCounter;
}) {
  const readFileTool = await createReadFileTool({
    workingDir: process.cwd(),
    tokenCounter,
  });

  const readMultipleFilesTool = await createReadMultipleFilesTool({
    workingDir: process.cwd(),
    tokenCounter,
  });

  const editFileTool = await createEditFileTool({
    workingDir: process.cwd(),
    terminal: undefined,
  });

  const saveFileTool = await createSaveFileTool({
    workingDir: process.cwd(),
    terminal: undefined,
  });

  const moveFileTool = await createMoveFileTool({
    workingDir: process.cwd(),
    terminal: undefined,
  });

  // const directoryTreeTool = await createDirectoryTreeTool({
  //   workingDir: process.cwd(),
  //   tokenCounter,
  // });

  const deleteFileTool = await createDeleteFileTool({
    workingDir: process.cwd(),
    terminal: undefined,
  });

  const codeInterpreterTool = createCodeInterpreterTool({});

  const grepTool = createGrepTool({
    tokenCounter,
  });

  const thinkTool = createThinkTool();

  const webFetchTool = createWebFetchTool({
    tokenCounter,
  });

  const webSearchTool = createWebSearchTool({
    tokenCounter,
  });

  const bashTool = await createBashTool({
    baseDir: process.cwd(),
    tokenCounter,
    terminal: undefined,
  });

  const dynamicTools = await loadDynamicTools({
    baseDir: process.cwd(),
  });

  const tools = {
    [EditFileTool.name]: tool({
      ...editFileTool.toolDef,
      execute: editFileTool.execute,
    }),
    [BashTool.name]: tool({
      ...bashTool.toolDef,
      execute: bashTool.execute,
    }),
    [SaveFileTool.name]: tool({
      ...saveFileTool.toolDef,
      execute: saveFileTool.execute,
    }),
    [DeleteFileTool.name]: tool({
      ...deleteFileTool.toolDef,
      execute: deleteFileTool.execute,
    }),
    [MoveFileTool.name]: tool({
      ...moveFileTool.toolDef,
      execute: moveFileTool.execute,
    }),
    [ReadFileTool.name]: tool({
      ...readFileTool.toolDef,
      execute: readFileTool.execute,
    }),
    [ReadMultipleFilesTool.name]: tool({
      ...readMultipleFilesTool.toolDef,
      execute: readMultipleFilesTool.execute,
    }),
    // TODO: Update other tools to new format as they are migrated
    // ...directoryTreeTool,
    ...codeInterpreterTool,
    ...grepTool,
    ...thinkTool,
    ...webFetchTool,
    ...webSearchTool,
    ...dynamicTools,
  } as const;

  return {
    toolDefs: tools,
  };
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
  } as const;

  return {
    toolDefs: tools,
  };
}
