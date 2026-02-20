import { z } from "zod";
import { SubAgent } from "../agent/sub-agent.ts";
import type { WorkspaceContext } from "../index.ts";
import { isSupportedModel } from "../models/providers.ts";
import { environmentInfo } from "../prompts/system-prompt.ts";
import { getSubagent, loadSubagents } from "../subagents/index.ts";
import style from "../terminal/style.ts";
import type { ToolExecutionOptions } from "./types.ts";

export const AgentTool = {
  name: "Agent" as const,
};

async function getToolDescription(): Promise<string> {
  return "Delegate a task to a specialized subagent.";
}

const inputSchema = z.object({
  prompt: z.string().describe("The task for the agent to perform"),
  type: z.string().describe("The subagent type to use (matches subagent name)"),
  timeout: z
    .number()
    .optional()
    .describe("Override default timeout in seconds"),
});

async function loadSubAgentDefinition(type: string): Promise<{
  model: string;
  system: string;
  tools?: string[];
  timeout: number;
}> {
  const subagent = await getSubagent(type);
  if (!subagent) {
    const available = await loadSubagents();
    const names = available.map((s) => s.name).join(", ");
    throw new Error(`Unknown subagent type: "${type}". Available: ${names}`);
  }
  return {
    model: subagent.model ?? "",
    system: subagent.systemPrompt,
    tools: subagent.tools,
    timeout: subagent.timeout,
  };
}

export const createAgentTools = async (options: {
  workspace: WorkspaceContext;
}) => {
  const description = await getToolDescription();

  const toolDef = {
    description,
    inputSchema,
  };

  function display({ prompt, type }: z.infer<typeof inputSchema>) {
    return `${style.cyan(type)} - ${style.dim(prompt.substring(0, 25))}`;
  }
  async function execute(
    { prompt, type, timeout }: z.infer<typeof inputSchema>,
    { abortSignal }: ToolExecutionOptions,
  ): Promise<string> {
    if (abortSignal?.aborted) {
      throw new Error("Agent execution aborted");
    }

    const {
      model,
      system,
      tools,
      timeout: defaultTimeout,
    } = await loadSubAgentDefinition(type);

    const systemPrompt = `${system}

${await environmentInfo(options.workspace.primaryDir, options.workspace.allowedDirs)}`;

    const subagent = new SubAgent({ workspace: options.workspace });

    const effectiveTimeout = timeout ?? defaultTimeout;

    try {
      const result = await subagent.execute({
        model: isSupportedModel(model) ? model : "opencode:minimax-m2.5-free",
        system: systemPrompt,
        prompt,
        abortSignal,
        allowedTools: tools,
        timeout: effectiveTimeout,
      });

      return result;
    } catch (error) {
      const err = error as Error;
      const message = err.message || "Unknown error";
      if (
        message.includes("timed out") ||
        err.name === "AbortError" ||
        err.name === "TimeoutError"
      ) {
        return `Agent failed: ${message}. The timeout was ${effectiveTimeout} seconds. Consider increasing the timeout or breaking the task into smaller subtasks.`;
      }
      return `Agent failed: ${message}`;
    }
  }

  return {
    toolDef,
    display,
    execute,
  };
};
