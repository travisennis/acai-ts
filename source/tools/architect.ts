import crypto from "node:crypto";
import { generateText, tool } from "ai";
import { z } from "zod";
import { AiConfig } from "../models/ai-config.ts";
import type { ModelManager } from "../models/manager.ts";
import type { TokenTracker } from "../token-tracker.ts";
import { FS_READ_ONLY, GIT_READ_ONLY, initTools } from "./index.ts";
import type { SendData } from "./types.ts";

const ARCHITECT_SYSTEM_PROMPT = `You are an expert software architect. Your role is to analyze technical requirements and produce clear, actionable implementation plans.
These plans will then be carried out by a junior software engineer so you need to be specific and detailed. However do not actually write the code, just explain the plan.

Follow these steps for each request:
1. Carefully analyze requirements to identify core functionality and constraints
2. Define clear technical approach with specific technologies and patterns
3. Break down implementation into concrete, actionable steps at the appropriate level of abstraction

Keep responses focused, specific and actionable. 

IMPORTANT: Do not ask the user if you should implement the changes at the end. Just provide the plan as described above.
IMPORTANT: Do not attempt to write the code or use any string modification tools. Just provide the plan.`;

const DESCRIPTION =
  "Your go-to tool for any technical or coding task. Analyzes requirements and breaks them down into clear, actionable implementation steps. Use this whenever you need help planning how to implement a feature, solve a technical problem, or structure your code.";

const inputSchema = z.strictObject({
  prompt: z
    .string()
    .describe("The technical request or coding task to analyze"),
  context: z
    .string()
    .describe("Optional context from previous conversation or system state")
    .optional(),
});

export const createArchitectTools = (options: {
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  sendData?: SendData | undefined;
}) => {
  const { modelManager, tokenTracker, sendData } = options;
  return {
    architect: tool({
      description: DESCRIPTION,
      parameters: inputSchema,
      execute: async ({ prompt, context }, { abortSignal }) => {
        const uuid = crypto.randomUUID();
        try {
          sendData?.({
            event: "tool-init",
            id: uuid,
            data: "Initializing the architecture tool.",
          });

          const modelConfig = modelManager.getModelMetadata("architect");
          const aiConfig = new AiConfig({
            modelMetadata: modelConfig,
            prompt: prompt,
          });

          const content = context
            ? `<context>${context}</context>\n\n${prompt}`
            : prompt;

          const { text, usage } = await generateText({
            model: modelManager.getModel("architect"),
            maxTokens: aiConfig.getMaxTokens(),
            system: ARCHITECT_SYSTEM_PROMPT,
            prompt: content,
            maxSteps: 30,
            providerOptions: aiConfig.getProviderOptions(),
            tools: await initTools({}),
            abortSignal: abortSignal,
            // biome-ignore lint/style/useNamingConvention: <explanation>
            experimental_activeTools: [
              ...FS_READ_ONLY,
              ...GIT_READ_ONLY,
              "grepFiles",
            ],
          });

          tokenTracker.trackUsage("architect", usage);

          sendData?.({
            event: "tool-completion",
            id: uuid,
            data: "Finished running the architecture tool.",
          });

          return text;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: uuid,
            data: "Error running architecture tool.",
          });
          return Promise.resolve((error as Error).message);
        }
      },
    }),
  };
};
