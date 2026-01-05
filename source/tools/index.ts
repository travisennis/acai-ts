import type { AsyncReturnType } from "@travisennis/stdlib/types";
import type { Tool } from "ai";
import type { WorkspaceContext } from "../index.ts";
import { BashTool, createBashTool } from "./bash.ts";
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
import { createThinkTool, ThinkTool } from "./think.ts";

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
  const readFileTool = await createReadFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const editFileTool = await createEditFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const saveFileTool = await createSaveFileTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const directoryTreeTool = await createDirectoryTreeTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const globTool = createGlobTool();

  const grepTool = createGrepTool();

  const thinkTool = createThinkTool();

  const lsTool = await createLsTool({
    workingDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

  const bashTool = await createBashTool({
    baseDir: workspace.primaryDir,
    allowedDirs: workspace.allowedDirs,
  });

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
    [DirectoryTreeTool.name]: directoryTreeTool,
    [ThinkTool.name]: thinkTool,
    [LsTool.name]: lsTool,

    // Add dynamic tools - they already have toolDef structure
    ...Object.fromEntries(
      Object.entries(dynamicTools).map(([name, toolObj]) => [name, toolObj]),
    ),
  } as const;

  return tools;
}
