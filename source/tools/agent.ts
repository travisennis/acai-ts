import { z } from "zod";
import { SubAgent } from "../agent/sub-agent.ts";
import type { WorkspaceContext } from "../index.ts";
import { isSupportedModel } from "../models/providers.ts";
import { environmentInfo } from "../prompts.ts";
import {
  formatSubagentsForDescription,
  getSubagent,
  loadSubagents,
} from "../subagents.ts";
import style from "../terminal/style.ts";
import type { ToolExecutionOptions } from "./types.ts";

export const AgentTool = {
  name: "Agent" as const,
};

async function getToolDescription(): Promise<string> {
  const subagents = await loadSubagents();
  const subagentList = formatSubagentsForDescription(subagents);

  return `Launch a new agent to handle complex, multi-step tasks autonomously.

The Agent tool launches specialized agents (subagents) that autonomously handle complex tasks. Each agent type has specific capabilities and tools available to it.

Available agent types and the tools they have access to:
${subagentList}

Usage notes:
1. Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
3. Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. The agent's outputs should generally be trusted.

Timeout behavior:
- Default timeout is 15 minutes (900 seconds) unless the subagent specifies otherwise.
- You can override with the timeout parameter (in seconds, valid range: 1-3600).
- For complex multi-step tasks, use a longer timeout (e.g., 1800-3600 seconds).
- If an agent times out, you will receive an error message indicating the timeout duration.`;
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
