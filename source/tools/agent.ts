import crypto from "node:crypto";
import { generateText, tool } from "ai";
import { z } from "zod";
import { AiConfig } from "../models/ai-config.ts";
import type { ModelManager } from "../models/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../token-tracker.ts";
import { FS_READ_ONLY, initTools } from "./index.ts";
import type { SendData } from "./types.ts";

export function getToolDescription(): string {
  const toolNames = ["grepFiles", "basheTool", ...FS_READ_ONLY].join(", ");
  return `Launch a new agent that has access to the following tools: ${toolNames}. When you are searching for a keyword or file and are not confident that you will find the right match on the first try, use the Agent tool to perform the search for you. For example:

- If you are searching for a keyword like "config" or "logger", the Agent tool is appropriate
- If you want to read a specific file path, use the readFile or searchFiles tool instead of the Agent tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the grepFiles tool instead, to find the match more quickly

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
  terminal: Terminal;
  sendData?: SendData | undefined;
}) => {
  const { modelManager, tokenTracker, terminal, sendData } = options;
  return {
    launchAgent: tool({
      description: getToolDescription(),
      parameters: inputSchema,
      execute: async ({ prompt }, { abortSignal }) => {
        const uuid = crypto.randomUUID();
        try {
          sendData?.({
            event: "tool-init",
            id: uuid,
            data: "Initializing the agent tool.",
          });

          const modelConfig = modelManager.getModelMetadata("task-agent");
          const aiConfig = new AiConfig({
            modelMetadata: modelConfig,
            prompt: prompt,
          });

          const { text, usage } = await generateText({
            model: modelManager.getModel("task-agent"),
            maxTokens: aiConfig.getMaxTokens(),
            system:
              "You are a code search assistant that will be given a task that will require you to search a code base to find relevant code and files.",
            prompt: prompt,
            maxSteps: 30,
            providerOptions: aiConfig.getProviderOptions(),
            tools: await initTools({ terminal }),
            abortSignal: abortSignal,
            // biome-ignore lint/style/useNamingConvention: <explanation>
            experimental_activeTools: [
              ...FS_READ_ONLY,
              "grepFiles",
              "bashTool",
            ],
          });

          tokenTracker.trackUsage("task-agent", usage);

          sendData?.({
            event: "tool-completion",
            id: uuid,
            data: "Finished running the agent tool.",
          });

          return text;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: uuid,
            data: "Error running agent tool.",
          });
          return Promise.resolve((error as Error).message);
        }
      },
    }),
  };
};
