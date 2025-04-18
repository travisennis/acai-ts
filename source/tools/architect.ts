import crypto from "node:crypto";
import { platform } from "node:os";
import { generateText, tool } from "ai";
import { z } from "zod";
import { AiConfig } from "../models/ai-config.ts";
import type { ModelManager } from "../models/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../token-tracker.ts";
import {
  FS_READ_ONLY,
  GIT_READ_ONLY,
  inGitDirectory,
  initTools,
} from "./index.ts";
import type { SendData } from "./types.ts";

const systemPrompt = async () => {
  return `You are an expert software architect. Your role is to analyze technical requirements and produce clear, actionable implementation plans.
These plans will then be carried out by a junior software engineer so you need to be specific and detailed. However do not actually write the code, just explain the plan.

Follow these steps for each request:
1. Carefully analyze requirements to identify core functionality and constraints
2. Define clear technical approach with specific technologies and patterns
3. Break down implementation into concrete, actionable steps at the appropriate level of abstraction

Keep responses focused, specific and actionable. 

IMPORTANT: Do not ask the user if you should implement the changes at the end. Just provide the plan as described above.
IMPORTANT: Do not attempt to write the code or use any string modification tools. Just provide the plan.
IMPORTANT: Use the tools you have available to understand the code base and its history. Use that context to create a plan that is specific to this code base.

Your current working directory is ${process.cwd()}. Use this value directly instead of calling the \`currentDirectory\` tool unless you have a specific reason to verify it.
Is directory a git repo: ${(await inGitDirectory()) ? "Yes" : "No"}
Platform: ${platform()}
Today's date is ${(new Date()).toISOString()}`;
};

const DESCRIPTION =
  "Your go-to tool for any technical or coding task. Analyzes requirements and breaks them down into clear, actionable implementation steps. Use this whenever you need help planning how to implement a feature, solve a technical problem, or structure your code.";

const inputSchema = z.strictObject({
  prompt: z
    .string()
    .describe(
      "The technical request or coding task to analyze. Be detailed and include any files that have been referenced in the request.",
    ),
  context: z
    .string()
    .describe("Optional context from previous conversation or system state.")
    .optional(),
});

export const createArchitectTools = (options: {
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  terminal: Terminal;
  sendData?: SendData | undefined;
}) => {
  const { modelManager, tokenTracker, terminal, sendData } = options;
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
            system: await systemPrompt(),
            prompt: content,
            maxSteps: 30,
            providerOptions: aiConfig.getProviderOptions(),
            tools: await initTools({ terminal }),
            abortSignal: abortSignal,
            // biome-ignore lint/style/useNamingConvention: <explanation>
            experimental_activeTools: [
              ...FS_READ_ONLY,
              ...GIT_READ_ONLY,
              "grepFiles",
              "bashTool",
            ],
          });

          tokenTracker.trackUsage("architect", usage);

          sendData?.({
            event: "tool-update",
            id: uuid,
            data: { primary: "Plan:", secondary: [text] },
          });

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
