import type { AsyncReturnType } from "@travisennis/stdlib/types";
import { tool } from "ai";
import type { WorkspaceContext } from "../index.ts";
import type { ModelManager } from "../models/manager.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import type { TokenTracker } from "../tokens/tracker.ts";
import {
  AdvancedEditFileTool,
  createAdvancedEditFileTool,
} from "./advanced-edit-file.ts";
import { AgentTool, createAgentTools } from "./agent.ts";
import { BashTool, createBashTool } from "./bash.ts";
import {
  CodeInterpreterTool,
  createCodeInterpreterTool,
} from "./code-interpreter.ts";
import { createDeleteFileTool, DeleteFileTool } from "./delete-file.ts";
import {
  createDirectoryTreeTool,
  DirectoryTreeTool,
} from "./directory-tree.ts";
import { loadDynamicTools } from "./dynamic-tool-loader.ts";
import { createEditFileTool, EditFileTool } from "./edit-file.ts";
import { createGlobTool, GlobTool } from "./glob.ts";
import { createGrepTool, GrepTool } from "./grep.ts";
import { createMoveFileTool, MoveFileTool } from "./move-file.ts";
import { createReadFileTool, ReadFileTool } from "./read-file.ts";
import {
  createReadMultipleFilesTool,
  ReadMultipleFilesTool,
} from "./read-multiple-files.ts";
import { createSaveFileTool, SaveFileTool } from "./save-file.ts";
import { createThinkTool, ThinkTool } from "./think.ts";
import { createWebFetchTool, WebFetchTool } from "./web-fetch.ts";
import { createWebSearchTool, WebSearchTool } from "./web-search.ts";

export type CompleteToolSet = {
  -readonly [K in keyof (AsyncReturnType<typeof initTools>["toolDefs"] &
    AsyncReturnType<typeof initAgents>["toolDefs"])]: (AsyncReturnType<
    typeof initTools
  >["toolDefs"] &
    AsyncReturnType<typeof initAgents>["toolDefs"])[K];
};

export type CompleteCliToolSet = AsyncReturnType<
  typeof initCliTools
>["toolDefs"];

export async function initTools({
  tokenCounter,
  workspace,
  modelManager,
  tokenTracker,
}: {
  tokenCounter: TokenCounter;
  workspace: WorkspaceContext;
  modelManager?: ModelManager;
  tokenTracker?: TokenTracker;
}) {
  const readFileTool = await createReadFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
    tokenCounter,
  });

  const readMultipleFilesTool = await createReadMultipleFilesTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
    tokenCounter,
  });

  const editFileTool = await createEditFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
    modelManager,
    tokenTracker,
  });

  const advancedEditFileTool = await createAdvancedEditFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const saveFileTool = await createSaveFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const moveFileTool = await createMoveFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const directoryTreeTool = await createDirectoryTreeTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
    tokenCounter,
  });

  const deleteFileTool = await createDeleteFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const codeInterpreterTool = await createCodeInterpreterTool({
    tokenCounter,
  });

  const globTool = createGlobTool({
    tokenCounter,
  });

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
    baseDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
    tokenCounter,
  });

  const dynamicTools = await loadDynamicTools({
    baseDir: workspace.primaryDir,
  });

  // Build tools object for AI SDK
  const tools = {
    [EditFileTool.name]: tool(editFileTool.toolDef),
    [AdvancedEditFileTool.name]: tool(advancedEditFileTool.toolDef),
    [BashTool.name]: tool(bashTool.toolDef),
    [SaveFileTool.name]: tool(saveFileTool.toolDef),
    [DeleteFileTool.name]: tool(deleteFileTool.toolDef),
    [MoveFileTool.name]: tool(moveFileTool.toolDef),
    [ReadFileTool.name]: tool(readFileTool.toolDef),
    [ReadMultipleFilesTool.name]: tool(readMultipleFilesTool.toolDef),
    [GlobTool.name]: tool(globTool.toolDef),
    [GrepTool.name]: tool(grepTool.toolDef),
    [DirectoryTreeTool.name]: tool(directoryTreeTool.toolDef),
    [CodeInterpreterTool.name]: tool(codeInterpreterTool.toolDef),
    [ThinkTool.name]: tool(thinkTool.toolDef),
    [WebFetchTool.name]: tool(webFetchTool.toolDef),
    [WebSearchTool.name]: tool(webSearchTool.toolDef),
    // Add dynamic tools - they already have toolDef structure
    ...Object.fromEntries(
      Object.entries(dynamicTools).map(([name, toolObj]) => [
        name,
        tool(toolObj.toolDef),
      ]),
    ),
  } as const;

  // Build executors map for manual loop
  const executors = new Map();

  // Add bash tool
  executors.set(BashTool.name, bashTool.execute);

  // Add editFile tool
  executors.set(EditFileTool.name, editFileTool.execute);

  // Add advancedEditFile tool
  executors.set(AdvancedEditFileTool.name, advancedEditFileTool.execute);

  // Add saveFile tool
  executors.set(SaveFileTool.name, saveFileTool.execute);

  // Add deleteFile tool
  executors.set(DeleteFileTool.name, deleteFileTool.execute);

  // Add moveFile tool
  executors.set(MoveFileTool.name, moveFileTool.execute);

  // Add readFile tool
  executors.set(ReadFileTool.name, readFileTool.execute);

  // Add readMultipleFiles tool
  executors.set(ReadMultipleFilesTool.name, readMultipleFilesTool.execute);

  // Add glob tool
  executors.set(GlobTool.name, globTool.execute);

  // Add grep tool
  executors.set(GrepTool.name, grepTool.execute);

  // Add directoryTree tool
  executors.set(DirectoryTreeTool.name, directoryTreeTool.execute);

  // Add webFetch tool
  executors.set(WebFetchTool.name, webFetchTool.execute);

  // Add webSearch tool
  executors.set(WebSearchTool.name, webSearchTool.execute);

  // Add think tool
  executors.set(ThinkTool.name, thinkTool.execute);

  // Add codeInterpreter tool
  executors.set(CodeInterpreterTool.name, codeInterpreterTool.execute);

  // Add dynamic tools to executors
  for (const [name, toolObj] of Object.entries(dynamicTools)) {
    executors.set(name, toolObj.execute);
  }

  return {
    toolDefs: tools,
    executors,
  };
}

export async function initCliTools({
  tokenCounter,
  workspace,
  modelManager,
  tokenTracker,
}: {
  tokenCounter: TokenCounter;
  workspace: WorkspaceContext;
  modelManager?: ModelManager;
  tokenTracker?: TokenTracker;
}) {
  const readFileTool = await createReadFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
    tokenCounter,
  });

  const readMultipleFilesTool = await createReadMultipleFilesTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
    tokenCounter,
  });

  const editFileTool = await createEditFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
    modelManager,
    tokenTracker,
  });

  const advancedEditFileTool = await createAdvancedEditFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const saveFileTool = await createSaveFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const moveFileTool = await createMoveFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const directoryTreeTool = await createDirectoryTreeTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
    tokenCounter,
  });

  const deleteFileTool = await createDeleteFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const codeInterpreterTool = await createCodeInterpreterTool({
    tokenCounter,
  });

  const globTool = createGlobTool({
    tokenCounter,
  });

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
    baseDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
    tokenCounter,
  });

  const dynamicTools = await loadDynamicTools({
    baseDir: workspace.primaryDir,
  });

  const tools = {
    [EditFileTool.name]: tool({
      ...editFileTool.toolDef,
      execute: editFileTool.execute,
    }),
    [AdvancedEditFileTool.name]: tool({
      ...advancedEditFileTool.toolDef,
      execute: advancedEditFileTool.execute,
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
    [GlobTool.name]: tool({
      ...globTool.toolDef,
      execute: globTool.execute,
    }),
    [GrepTool.name]: tool({
      ...grepTool.toolDef,
      execute: grepTool.execute,
    }),
    [DirectoryTreeTool.name]: tool({
      ...directoryTreeTool.toolDef,
      execute: directoryTreeTool.execute,
    }),
    [CodeInterpreterTool.name]: tool({
      ...codeInterpreterTool.toolDef,
      execute: codeInterpreterTool.execute,
    }),
    [ThinkTool.name]: tool({
      ...thinkTool.toolDef,
      execute: thinkTool.execute,
    }),
    [WebFetchTool.name]: tool({
      ...webFetchTool.toolDef,
      execute: webFetchTool.execute,
    }),
    [WebSearchTool.name]: tool({
      ...webSearchTool.toolDef,
      execute: webSearchTool.execute,
    }),
    // Add dynamic tools with execute functions
    ...Object.fromEntries(
      Object.entries(dynamicTools).map(([name, toolObj]) => [
        name,
        tool({
          ...toolObj.toolDef,
          execute: toolObj.execute,
        }),
      ]),
    ),
  } as const;

  return {
    toolDefs: tools,
  };
}

export async function initAgents({
  modelManager,
  tokenTracker,
  tokenCounter,
  workspace,
}: {
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  tokenCounter: TokenCounter;
  workspace: WorkspaceContext;
}) {
  const agentTools = createAgentTools({
    modelManager,
    tokenTracker,
    tokenCounter,
    workspace,
  });

  const tools = {
    [AgentTool.name]: tool(agentTools.toolDef),
  } as const;

  // Build executors map for manual loop
  const executors = new Map();
  executors.set(AgentTool.name, agentTools.execute);

  return {
    toolDefs: tools,
    executors,
  };
}

export async function initCliAgents({
  modelManager,
  tokenTracker,
  tokenCounter,
  workspace,
}: {
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  tokenCounter: TokenCounter;
  workspace: WorkspaceContext;
}) {
  const agentTools = createAgentTools({
    modelManager,
    tokenTracker,
    tokenCounter,
    workspace,
  });

  const tools = {
    [AgentTool.name]: tool({
      ...agentTools.toolDef,
      execute: agentTools.execute,
    }),
  } as const;

  return { toolDefs: tools };
}
