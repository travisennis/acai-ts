import { generateText, stepCountIs } from "ai";
import { config } from "../config.ts";
import type { WorkspaceContext } from "../index.ts";
import { AiConfig } from "../models/ai-config.ts";
import { getLanguageModel, getModelMetadata } from "../models/manager.ts";
import type { ModelName } from "../models/providers.ts";
import { initTools } from "../tools/index.ts";
import { toAiSdkTools } from "../tools/utils.ts";

export class SubAgent {
  workspace: WorkspaceContext;

  constructor(options: {
    workspace: WorkspaceContext;
  }) {
    this.workspace = options.workspace;
  }

  async execute({
    model,
    system,
    prompt,
    abortSignal,
    allowedTools,
    timeout,
  }: {
    model: ModelName;
    system: string;
    prompt: string;
    abortSignal?: AbortSignal;
    allowedTools?: string[];
    timeout?: number;
  }) {
    try {
      const modelConfig = getModelMetadata({ model });
      const aiConfig = new AiConfig({
        modelMetadata: modelConfig,
        prompt,
      });

      let tools = await initTools({
        workspace: this.workspace,
      });

      // Filter tools if allowedTools is specified
      if (allowedTools && allowedTools.length > 0) {
        const filteredTools: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(tools)) {
          if (allowedTools.includes(key)) {
            filteredTools[key] = value;
          }
        }
        tools = filteredTools as typeof tools;
      }

      const stateDir = await config.app.ensurePath("audit");

      // Create abort signal with timeout
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let timeoutSignal: AbortSignal | undefined;
      if (timeout && timeout > 0) {
        const controller = new AbortController();
        timeoutSignal = controller.signal;
        timeoutId = setTimeout(
          controller.abort.bind(controller),
          timeout * 1000,
        );
      }

      // Combine abort signals
      const combinedAbortSignal = timeoutSignal || abortSignal;

      try {
        const result = await generateText({
          model: getLanguageModel({ model, app: "subagent", stateDir }),
          maxOutputTokens: aiConfig.maxOutputTokens(),
          system,
          prompt,
          temperature: aiConfig.temperature(),
          topP: aiConfig.topP(),
          stopWhen: stepCountIs(100),
          providerOptions: aiConfig.providerOptions(),
          tools: toAiSdkTools(tools),
          abortSignal: combinedAbortSignal,
        });

        return result.text;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      return (error as Error).message;
    }
  }
}
