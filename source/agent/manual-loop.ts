import { isNumber } from "@travisennis/stdlib/typeguards";
import type { ToolExecuteFunction, ToolModelMessage } from "ai";
import { streamText, type Tool, type ToolCallRepairFunction } from "ai";
import type { MessageHistory } from "../messages.ts";
import { AiConfig } from "../models/ai-config.ts";
import type { ModelManager } from "../models/manager.ts";
import type { PromptManager } from "../prompts/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import type { TokenTracker } from "../tokens/tracker.ts";

export type ManualLoopOptions = {
  modelManager: ModelManager;
  promptManager: PromptManager;
  tokenTracker: TokenTracker;
  terminal?: Terminal;
  messageHistory: MessageHistory;
  systemPrompt: string;
  toolDefs: Record<string, Tool>;
  executors: Map<string, ToolExecuteFunction<unknown, string>>;
  maxIterations?: number;
  abortSignal?: AbortSignal;
  temperature?: number | undefined;
  toolCallRepair?: ToolCallRepairFunction<Record<string, Tool>>;
};

export async function runManualLoop(opts: ManualLoopOptions) {
  const {
    modelManager,
    promptManager,
    tokenTracker,
    messageHistory,
    systemPrompt,
    toolDefs,
    executors,
    maxIterations = 90,
    abortSignal,
    temperature,
    toolCallRepair,
  } = opts;

  const terminal = opts.terminal;

  let iter = 0;
  while (iter < maxIterations) {
    if (abortSignal?.aborted) break;

    const langModel = modelManager.getModel("repl");
    const modelConfig = modelManager.getModelMetadata("repl");

    const aiConfig = new AiConfig({
      modelMetadata: modelConfig,
      prompt: promptManager.get(),
    });
    const maxTokens = aiConfig.getMaxTokens();

    const result = streamText<Record<string, Tool>>({
      model: langModel,
      maxOutputTokens: maxTokens,
      messages: [
        {
          role: "system",
          content: systemPrompt,
          providerOptions: {
            anthropic: { cacheControl: { type: "ephemeral" } },
          },
        },
        ...messageHistory.get(),
      ],
      temperature:
        typeof temperature === "number"
          ? temperature
          : modelConfig.defaultTemperature > -1
            ? modelConfig.defaultTemperature
            : undefined,
      maxRetries: 2,
      providerOptions: aiConfig.getProviderOptions(),
      tools: toolDefs,
      // biome-ignore lint/style/useNamingConvention: third-party controlled
      experimental_repairToolCall: toolCallRepair,
      abortSignal,
    });

    let accumulatedText = "";
    let lastType: "reasoning" | "text" | null = null;

    for await (const chunk of result.fullStream) {
      if (chunk.type === "reasoning-delta" || chunk.type === "text-delta") {
        if (chunk.type === "reasoning-delta") {
          if (terminal) {
            if (lastType !== "reasoning")
              terminal.writeln(style.dim("<think>"));
            terminal.write(style.dim(chunk.text));
          }
          lastType = "reasoning";
        } else {
          if (lastType === "reasoning" && terminal)
            terminal.writeln(style.dim("\n</think>\n"));
          accumulatedText += chunk.text;
          lastType = "text";
        }
      } else if (chunk.type === "tool-call") {
        // We will handle after stream completes
        if (terminal) terminal.stopProgress();
      } else {
        // finish of this step
        if (lastType === "reasoning" && terminal)
          terminal.write(style.dim("\n</think>\n\n"));
        if (accumulatedText.trim()) {
          if (terminal) {
            terminal.writeln(`${style.blue.bold("● Response:")}`);
            terminal.display(accumulatedText, true);
            terminal.lineBreak();
          }
        }
        accumulatedText = "";
        lastType = null;
      }
    }

    await result.consumeStream();

    // Append streamed assistant/tool messages from model
    const response = await result.response;
    const responseMessages = response.messages;
    if (responseMessages.length > 0) {
      messageHistory.appendResponseMessages(responseMessages);
    }

    // If finishReason is not tool-calls, break
    const finishReason = await result.finishReason;
    if (finishReason !== "tool-calls") {
      // usage/cost
      const total = await result.totalUsage;
      const inputTokens = isNumber(total.inputTokens) ? total.inputTokens : 0;
      const outputTokens = isNumber(total.outputTokens)
        ? total.outputTokens
        : 0;

      if (terminal) {
        terminal.writeln(
          style.dim(`Tokens: ↑ ${inputTokens} ↓ ${outputTokens}`),
        );
        const inputCost = modelConfig.costPerInputToken * inputTokens;
        const outputCost = modelConfig.costPerOutputToken * outputTokens;
        terminal.writeln(
          style.dim(`Cost: $${(inputCost + outputCost).toFixed(2)}`),
        );
      }

      tokenTracker.trackUsage("repl", total);
      break;
    }

    // Execute tools in parallel (order not guaranteed)
    const toolCalls = await result.toolCalls;

    const toolMessages: ToolModelMessage[] = await Promise.all(
      toolCalls.map(async (call) => {
        const exec = executors.get(call.toolName);
        let resultOutput: string;
        if (!exec) {
          resultOutput = `No executor for tool ${call.toolName}`;
        } else {
          try {
            const output = await exec(call.input, {
              toolCallId: call.toolCallId,
              messages: [], // TODO: is this right?
              abortSignal,
            });
            resultOutput =
              typeof output === "string" ? output : JSON.stringify(output);
          } catch (err) {
            resultOutput = `Tool error: ${
              err instanceof Error ? err.message : String(err)
            }`;
          }
        }
        return {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolName: call.toolName,
              toolCallId: call.toolCallId,
              output: {
                type: "text",
                value: resultOutput,
              } as never,
            },
          ],
        } as unknown as ToolModelMessage;
      }),
    );

    messageHistory.appendResponseMessages(toolMessages);

    // continue iterations
    iter += 1;
  }
}
