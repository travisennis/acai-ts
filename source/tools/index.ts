import type { AsyncReturnType } from "@travisennis/stdlib/types";
import type { Tool } from "ai";
import { config } from "../config/index.ts";
import type { WorkspaceContext } from "../index.ts";
import { AgentTool, createAgentTools } from "./agent.ts";
import { BashTool, createBashTool } from "./bash.ts";
import { CodeSearchTool, createCodeSearchTool } from "./code-search.ts";
import {
  createDirectoryTreeTool,
  DirectoryTreeTool,
} from "./directory-tree.ts";
import { loadDynamicTools } from "./dynamic-tool-loader.ts";
import { createEditFileTool, EditFileTool } from "./edit-file.ts";
import { createGlobTool, GlobTool } from "./glob.ts";
import { createGrepTool, GrepTool } from "./grep.ts";
import { createLsTool, LsTool } from "./ls.ts";
import { createReadFileTool, ReadFileTool } from "./read-file.ts";
import { createSaveFileTool, SaveFileTool } from "./save-file.ts";
import { createSkillTool, SkillTool } from "./skill.ts";
import { createThinkTool, ThinkTool } from "./think.ts";
import { createWebFetchTool, WebFetchTool } from "./web-fetch.ts";
import { createWebSearchTool, WebSearchTool } from "./web-search.ts";

export type CompleteToolSet = {
  -readonly [K in keyof AsyncReturnType<typeof initTools>]: AsyncReturnType<
    typeof initTools
  >[K];
};

export type CompleteTools = {
  -readonly [K in keyof AsyncReturnType<typeof initTools>]: Tool<
    unknown,
    string
  >;
};

export type CompleteToolNames = keyof CompleteToolSet;

export async function initTools({
  workspace,
}: {
  workspace: WorkspaceContext;
}) {
  const readFileTool = await createReadFileTool({ workspace });

  const editFileTool = await createEditFileTool({ workspace });

  const saveFileTool = await createSaveFileTool({ workspace });

  const directoryTreeTool = await createDirectoryTreeTool({ workspace });

  const globTool = createGlobTool();

  const grepTool = createGrepTool();

  const codeSearchTool = createCodeSearchTool();

  const thinkTool = createThinkTool();

  const lsTool = await createLsTool({ workspace });

  const projectConfig = await config.getConfig();
  const bashTool = await createBashTool({ workspace, env: projectConfig.env });

  const skillTool = await createSkillTool();

  const agentTool = await createAgentTools({ workspace });

  const webSearchTool = await createWebSearchTool();

  const webFetchTool = await createWebFetchTool();

  const dynamicTools = await loadDynamicTools({
    baseDir: workspace.primaryDir,
  });

  // Build tools object for AI SDK
  const tools = {
    [EditFileTool.name]: editFileTool,
    [BashTool.name]: bashTool,
    [SaveFileTool.name]: saveFileTool,
    [ReadFileTool.name]: readFileTool,
    [GlobTool.name]: globTool,
    [GrepTool.name]: grepTool,
    [CodeSearchTool.name]: codeSearchTool,
    [DirectoryTreeTool.name]: directoryTreeTool,
    [ThinkTool.name]: thinkTool,
    [LsTool.name]: lsTool,
    [SkillTool.name]: skillTool,
    [AgentTool.name]: agentTool,
    [WebSearchTool.name]: webSearchTool,
    [WebFetchTool.name]: webFetchTool,

    // Add dynamic tools - they already have toolDef structure
    ...Object.fromEntries(
      Object.entries(dynamicTools).map(([name, toolObj]) => [name, toolObj]),
    ),
  } as const;

  return tools;
}
