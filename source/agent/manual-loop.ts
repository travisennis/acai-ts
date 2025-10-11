import { isNumber } from "@travisennis/stdlib/typeguards";
import type { AssistantModelMessage, ToolModelMessage } from "ai";
import {
  type StepResult,
  streamText,
  type Tool,
  type ToolCallRepairFunction,
  type ToolResultPart,
} from "ai";
import type { MessageHistory } from "../messages.ts";
import { AiConfig } from "../models/ai-config.ts";
import type { ModelManager } from "../models/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import type { TokenTracker } from "../tokens/tracker.ts";

export type ManualLoopOptions = {
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  tokenCounter: TokenCounter;
  terminal?: Terminal;
  messageHistory: MessageHistory;
  systemPrompt: string;
  toolDefs: Record<string, Tool>;
  executors: Map<
    string,
    (
      input: unknown,
      ctx: { toolCallId: string; abortSignal?: AbortSignal },
    ) => Promise<string> | string
  >;
  maxIterations?: number;
  abortSignal?: AbortSignal;
  temperature?: number | undefined;
  toolCallRepair?: ToolCallRepairFunction<Record<string, Tool>>;
};

export async function runManualLoop(opts: ManualLoopOptions) {
  const {
    modelManager,
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

    const aiConfig = new AiConfig({ modelMetadata: modelConfig, prompt: "" });
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
      stopWhen: () => iter >= maxIterations,
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
        if (terminal) terminal.stopProgress?.();
      } else if (chunk.type === "tool-result") {
        // Ignored here; we will add our own results
      } else {
        // finish of this step
        if (lastType === "reasoning" && terminal)
          terminal.write(style.dim("\n</think>\n\n"));
        if (accumulatedText.trim()) {
          messageHistory.appendAssistantMessage(accumulatedText);
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
      // responseMessages are Assistant/Tool messages already typed for appendResponseMessages
      messageHistory.appendResponseMessages(
        responseMessages as unknown as (
          | AssistantModelMessage
          | ToolModelMessage
        )[],
      );
    }

    // If finishReason is not tool-calls, break
    const steps: StepResult<Record<string, Tool>>[] = await result.steps;
    const lastStep = steps.at(-1);
    if (!lastStep || lastStep.finishReason !== "tool-calls") {
      // usage/cost
      const total = await result.totalUsage;
      const inputTokens = isNumber(total.inputTokens) ? total.inputTokens : 0;
      const outputTokens = isNumber(total.outputTokens)
        ? total.outputTokens
        : 0;
      tokenTracker.trackUsage("repl", total);
      if (terminal) {
        terminal.writeln(
          style.dim(`Tokens: ↑ ${inputTokens} ↓ ${outputTokens}`),
        );
      }
      break;
    }

    // Execute tools serially for T0 (scheduler comes later)
    const toolCalls = lastStep.toolCalls;

    const toolResults: ToolResultPart[] = [];
    for (const call of toolCalls) {
      const exec = executors.get(call.toolName);
      if (!exec) {
        toolResults.push({
          type: "tool-result",
          toolName: call.toolName,
          toolCallId: call.toolCallId,
          output: {
            type: "text",
            value: `No executor for tool ${call.toolName}`,
          } as never,
        });
        continue;
      }
      try {
        const output = await exec(call.input as unknown, {
          toolCallId: call.toolCallId,
          abortSignal,
        });
        toolResults.push({
          type: "tool-result",
          toolName: call.toolName,
          toolCallId: call.toolCallId,
          output: {
            type: "text",
            value: typeof output === "string" ? output : JSON.stringify(output),
          } as never,
        });
      } catch (err) {
        toolResults.push({
          type: "tool-result",
          toolName: call.toolName,
          toolCallId: call.toolCallId,
          output: {
            type: "text",
            value: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
          } as never,
        });
      }
    }

    // Append single tool message to history
    const toolMessage = {
      role: "tool",
      content: toolResults,
    } as unknown as ToolModelMessage;
    messageHistory.appendResponseMessages([toolMessage]);

    // continue iterations
    iter += 1;
  }
}
