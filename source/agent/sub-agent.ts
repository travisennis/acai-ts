import { generateText, stepCountIs } from "ai";
import { config } from "../config/index.ts";
import type { WorkspaceContext } from "../index.ts";
import { AiConfig } from "../models/ai-config.ts";
import { getLanguageModel, getModelMetadata } from "../models/manager.ts";
import type { ModelName } from "../models/providers.ts";
import type { CompleteToolSet } from "../tools/index.ts";
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
      const {
        tools,
        abortSignal: combinedSignal,
        timeoutId,
      } = await this.prepareExecution({
        allowedTools,
        timeout,
        abortSignal,
      });

      try {
        const result = await this.runGenerateText({
          model,
          system,
          prompt,
          tools,
          abortSignal: combinedSignal,
        });

        return result.text;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      throw this.transformError(error as Error);
    }
  }

  private async prepareExecution({
    allowedTools,
    timeout,
    abortSignal,
  }: {
    allowedTools?: string[];
    timeout?: number;
    abortSignal?: AbortSignal;
  }): Promise<{
    tools: CompleteToolSet;
    abortSignal: AbortSignal | undefined;
    timeoutId: ReturnType<typeof setTimeout> | undefined;
  }> {
    let tools = await initTools({
      workspace: this.workspace,
    });

    tools = this.filterTools(tools, allowedTools);

    const { signal: timeoutSignal, timeoutId } =
      this.createTimeoutSignal(timeout);

    const combinedSignal = this.combineAbortSignals(timeoutSignal, abortSignal);

    return { tools, abortSignal: combinedSignal, timeoutId };
  }

  private filterTools(
    tools: CompleteToolSet,
    allowedTools?: string[],
  ): CompleteToolSet {
    if (!allowedTools || allowedTools.length === 0) {
      return tools;
    }

    const filteredTools: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tools)) {
      if (allowedTools.includes(key)) {
        filteredTools[key] = value;
      }
    }
    return filteredTools as CompleteToolSet;
  }

  private createTimeoutSignal(timeout?: number): {
    signal: AbortSignal | undefined;
    timeoutId: ReturnType<typeof setTimeout> | undefined;
  } {
    if (!timeout || timeout <= 0) {
      return { signal: undefined, timeoutId: undefined };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(
        new Error(`SubAgent timed out after ${timeout} seconds`),
      );
    }, timeout * 1000);

    return { signal: controller.signal, timeoutId };
  }

  private combineAbortSignals(
    timeoutSignal: AbortSignal | undefined,
    abortSignal: AbortSignal | undefined,
  ): AbortSignal | undefined {
    const signals = [timeoutSignal, abortSignal].filter(
      (s): s is AbortSignal => s != null,
    );

    if (signals.length === 0) {
      return undefined;
    }

    if (signals.length === 1) {
      return signals[0];
    }

    return AbortSignal.any(signals);
  }

  private async runGenerateText({
    model,
    system,
    prompt,
    tools,
    abortSignal,
  }: {
    model: ModelName;
    system: string;
    prompt: string;
    tools: CompleteToolSet;
    abortSignal: AbortSignal | undefined;
  }) {
    const modelConfig = getModelMetadata({ model });
    const aiConfig = new AiConfig({
      modelMetadata: modelConfig,
      prompt,
    });

    const stateDir = await config.app.ensurePath("audit");

    return generateText({
      model: getLanguageModel({ model, app: "subagent", stateDir }),
      maxOutputTokens: aiConfig.maxOutputTokens(),
      system,
      prompt,
      temperature: aiConfig.temperature(),
      topP: aiConfig.topP(),
      stopWhen: stepCountIs(100),
      providerOptions: aiConfig.providerOptions(),
      tools: toAiSdkTools(tools),
      abortSignal,
    });
  }

  private transformError(error: Error): Error {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      if (error.message.includes("timed out")) {
        return new Error(error.message);
      }
      return new Error(`SubAgent execution was aborted: ${error.message}`);
    }
    return error;
  }
}
