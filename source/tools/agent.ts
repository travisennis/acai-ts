import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { AiConfig } from "../models/ai-config.ts";
import type { ModelManager } from "../models/manager.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import type { TokenTracker } from "../tokens/tracker.ts";
import { BashTool } from "./bash.ts";
// import { DirectoryTreeTool } from "./directory-tree.ts";
import { GrepTool } from "./grep.ts";
import { initCliTools } from "./index.ts";
import { ReadFileTool } from "./read-file.ts";
import { ReadMultipleFilesTool } from "./read-multiple-files.ts";
import type { SendData } from "./types.ts";

export const AgentTool = {
  name: "agent" as const,
};

const TOOLS = [
  GrepTool.name,
  BashTool.name,
  ReadFileTool.name,
  ReadMultipleFilesTool.name,
  // DirectoryTreeTool.name,
] as const;

type ToolName = (typeof TOOLS)[number];

function getToolDescription(): string {
  const toolNames = TOOLS.join(", ");
  return `Launch a new agent that has access to the following tools: ${toolNames}. When you are searching for a keyword or file and are not confident that you will find the right match on the first try, use the ${AgentTool.name} tool to perform the search for you. For example:

- If you are searching for a keyword like "config" or "logger", the ${AgentTool.name} tool is appropriate
- If you want to read a specific file path, use the ${ReadFileTool.name} or appropriate command via the ${BashTool.name} tool instead of this tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the ${GrepTool.name} tool instead, to find the match more quickly

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
  sendData?: SendData | undefined;
}) => {
  const { modelManager, tokenTracker, tokenCounter, sendData } = options;
  return {
    [AgentTool.name]: tool({
      description: getToolDescription(),
      inputSchema: inputSchema,
      execute: async ({ prompt }, { abortSignal, toolCallId }) => {
        if (abortSignal?.aborted) {
          throw new Error("Agent execution aborted");
        }

        sendData?.({
          event: "tool-init",
          id: toolCallId,
          data: `Initializing agent with prompt: ${style.cyan(prompt)}`,
        });
        try {
          const modelConfig = modelManager.getModelMetadata("task-agent");
          const aiConfig = new AiConfig({
            modelMetadata: modelConfig,
            prompt: prompt,
          });

          const { text, usage } = await generateText({
            model: modelManager.getModel("task-agent"),
            maxOutputTokens: aiConfig.getMaxTokens(),
            system:
              "You are a code search assistant that will be given a task that will require you to search a code base to find relevant code and files.",
            prompt: prompt,
            stopWhen: stepCountIs(30),
            providerOptions: aiConfig.getProviderOptions(),
            tools: await initCliTools({ tokenCounter }),
            abortSignal: abortSignal,
            // biome-ignore lint/style/useNamingConvention: third-party code
            experimental_activeTools: [...TOOLS] as ToolName[],
          });

          tokenTracker.trackUsage("task-agent", usage);

          sendData?.({
            event: "tool-completion",
            id: toolCallId,
            data: "Finished running the agent tool.",
          });

          return text;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: toolCallId,
            data: "Error running agent tool.",
          });
          return Promise.resolve((error as Error).message);
        }
      },
    }),
  };
};
