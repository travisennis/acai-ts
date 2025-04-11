import crypto from "node:crypto";
import { generateText, tool } from "ai";
import { z } from "zod";
import type { ModelManager } from "../models/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenTracker } from "../token-tracker.ts";
import { initTools } from "./index.ts";
import type { SendData } from "./types.ts";

const SYSTEM_PROMPT = `You are an expert code editor. Your role is to faithfully apply the list of code edits you have been given. You have access to the editFile tool. The edits you have been given have already been approved, so you can call editFile with dryRun=false. Your goal is to quickly, efficiently, and accurately apply the given code edits.

IMPORTANT: Do not ask the user if you should make the edits. They have already been approved so make them.`;

const DESCRIPTION =
  "Your go-to tool for code editing tasks. This tool is especially good for when you have lots of small, simple edits that need to be made in a file.";

const inputSchema = z.strictObject({
  path: z.string().describe("The path of the file to edit."),
  edits: z.array(
    z.object({
      oldText: z
        .string()
        .min(1)
        .describe("Text to search for - must match exactly"),
      newText: z.string().describe("Text to replace with"),
    }),
  ),
});

export const createCodeEditorTools = (options: {
  terminal: Terminal;
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  sendData?: SendData | undefined;
}) => {
  const { terminal, modelManager, tokenTracker, sendData } = options;
  return {
    codeEditor: tool({
      description: DESCRIPTION,
      parameters: inputSchema,
      execute: async (input, { abortSignal }) => {
        const uuid = crypto.randomUUID();
        try {
          sendData?.({
            event: "tool-init",
            id: uuid,
            data: "Initializing the code-editor tool.",
          });

          const modelConfig = modelManager.getModelMetadata("code-editor");

          const content = `<edits>\n${JSON.stringify(input, null, 2)}\n</edits>\n\n Apply these edits.`;

          const { text, usage } = await generateText({
            model: modelManager.getModel("code-editor"),
            maxTokens: modelConfig.maxOutputTokens,
            system: SYSTEM_PROMPT,
            prompt: content,
            maxSteps: 30,
            tools: await initTools({ terminal }),
            abortSignal: abortSignal,
            // biome-ignore lint/style/useNamingConvention: <explanation>
            experimental_activeTools: ["editFile"],
          });

          tokenTracker.trackUsage("code-editor", usage);

          sendData?.({
            event: "tool-completion",
            id: uuid,
            data: "Finished running the code editor tool.",
          });

          return text;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: uuid,
            data: "Error running code editor tool.",
          });
          return Promise.resolve((error as Error).message);
        }
      },
    }),
  };
};
