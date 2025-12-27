import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import type { WorkspaceContext } from "../index.ts";
import { AiConfig } from "../models/ai-config.ts";
import type { ModelManager } from "../models/manager.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import type { TokenTracker } from "../tokens/tracker.ts";
import { DirectoryTreeTool } from "./directory-tree.ts";
import { GlobTool } from "./glob.ts";
import { GrepTool } from "./grep.ts";
import { initCliTools } from "./index.ts";
import { LsTool } from "./ls.ts";
import { ReadFileTool } from "./read-file.ts";
import type { ToolExecutionOptions, ToolResult } from "./types.ts";

export const AgentTool = {
  name: "Agent" as const,
};

const TOOLS = [
  GrepTool.name,
  GlobTool.name,
  ReadFileTool.name,
  LsTool.name,
  DirectoryTreeTool.name,
] as const;

type ToolName = (typeof TOOLS)[number];

function getToolDescription(): string {
  return `Launch a new agent that is specifically designed for file discovery and code search tasks. Use the ${AgentTool.name} tool when you need to search for files or code patterns across the codebase.

Use cases:
- Search for files matching specific patterns (e.g., "*.ts", "**/*.test.ts")
- Find code patterns or text within files
- Read specific files using

Important limitations:
- This agent cannot execute shell commands or run external tools
- It is focused purely on file discovery and content reading
- For complex operations or command execution, use the main assistant directly

Usage notes:
1. Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
3. Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. The agent's outputs should generally be trusted.`;
}

const inputSchema = z.object({
  prompt: z.string().describe("The task for the agent to perform"),
});

export const createAgentTools = (options: {
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  tokenCounter: TokenCounter;
  workspace: WorkspaceContext;
}) => {
  const { modelManager, tokenTracker, tokenCounter } = options;

  const toolDef = {
    description: getToolDescription(),
    inputSchema,
  };

  async function* execute(
    { prompt }: z.infer<typeof inputSchema>,
    { toolCallId, abortSignal }: ToolExecutionOptions,
  ): AsyncGenerator<ToolResult> {
    if (abortSignal?.aborted) {
      throw new Error("Agent execution aborted");
    }

    yield {
      name: AgentTool.name,
      event: "tool-init",
      id: toolCallId,
      data: "Invoking agent...",
    };

    yield {
      name: AgentTool.name,
      event: "tool-update",
      id: toolCallId,
      data: `## Prompt:\n\n${prompt}`,
    };

    try {
      const modelConfig = modelManager.getModelMetadata("task-agent");
      const aiConfig = new AiConfig({
        modelMetadata: modelConfig,
        prompt,
      });

      const { text, usage } = await generateText({
        model: modelManager.getModel("task-agent"),
        maxOutputTokens: aiConfig.maxOutputTokens(),
        system:
          "You are a code search assistant that will be given a task that will require you to search a code base to find relevant code and files.",
        prompt: prompt,
        temperature: aiConfig.temperature(),
        topP: aiConfig.topP(),
        stopWhen: stepCountIs(30),
        providerOptions: aiConfig.providerOptions(),
        tools: (
          await initCliTools({
            tokenCounter,
            workspace: options.workspace,
          })
        ).toolDefs,
        abortSignal: abortSignal,
        // biome-ignore lint/style/useNamingConvention: third-party code
        experimental_activeTools: [...TOOLS] as ToolName[],
      });

      tokenTracker.trackUsage("task-agent", usage);

      yield {
        name: AgentTool.name,
        event: "tool-update",
        id: toolCallId,
        data: `## Response:\n\n${text}`,
      };

      yield {
        name: AgentTool.name,
        event: "tool-completion",
        id: toolCallId,
        data: `Finished (${usage.totalTokens} tokens)`,
      };

      yield text;
    } catch (error) {
      yield {
        name: AgentTool.name,
        event: "tool-error",
        id: toolCallId,
        data: (error as Error).message,
      };
      yield (error as Error).message;
    }
  }

  return {
    toolDef,
    execute,
  };
};
