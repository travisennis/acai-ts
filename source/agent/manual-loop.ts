import type {
  LanguageModelUsage,
  ToolExecuteFunction,
  ToolModelMessage,
} from "ai";
import {
  NoOutputGeneratedError,
  streamText,
  type ToolCallRepairFunction,
} from "ai";
import { logger } from "../logger.ts";
import type { MessageHistory } from "../messages.ts";
import { AiConfig } from "../models/ai-config.ts";
import type { ModelManager } from "../models/manager.ts";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import { consumeToolAsyncIterable } from "../tools/async-iterable.ts";
import type { CompleteToolSet } from "../tools/index.ts";
import { isAsyncIterable } from "../utils/iterables.ts";

type ManualLoopOptions = {
  modelManager: ModelManager;
  terminal: Terminal;
  messageHistory: MessageHistory;
  systemPrompt: string;
  input: string;
  toolDefs: CompleteToolSet;
  executors: Map<keyof CompleteToolSet, ToolExecuteFunction<unknown, string>>;
  maxIterations?: number;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  toolCallRepair?: ToolCallRepairFunction<CompleteToolSet>;
};

type ManualLoopResult = {
  steps: {
    toolResults: Array<{ toolName: string }>;
    toolCalls: Array<{ toolName: string }>;
  }[];
  usage: { [K in keyof LanguageModelUsage]-?: number };
  totalUsage: { [K in keyof LanguageModelUsage]-?: number };
};

export async function runManualLoop(
  opts: ManualLoopOptions,
): Promise<ManualLoopResult> {
  const {
    modelManager,
    messageHistory,
    systemPrompt,
    input,
    toolDefs,
    executors,
    maxIterations = 90,
    maxRetries = 2,
    abortSignal,
    toolCallRepair,
  } = opts;

  const terminal = opts.terminal;

  const langModel = modelManager.getModel("repl");
  const modelConfig = modelManager.getModelMetadata("repl");

  const aiConfig = new AiConfig({
    modelMetadata: modelConfig,
    prompt: input,
  });

  const loopResult: ManualLoopResult = {
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
    totalUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
    steps: [],
  };

  let iter = 0;
  let consecutiveErrors = 0;
  while (iter < maxIterations) {
    if (abortSignal?.aborted) {
      logger.warn("The agent loop was aborted by the user.");
      terminal.warn("Operation aborted by user.");
      break;
    }

    try {
      const result = streamText({
        model: langModel,
        maxOutputTokens: aiConfig.maxOutputTokens(),
        system: systemPrompt,
        messages: messageHistory.get(),
        temperature: aiConfig.temperature(),
        topP: aiConfig.topP(),
        maxRetries: 2,
        providerOptions: aiConfig.providerOptions(),
        tools: toolDefs,
        // biome-ignore lint/style/useNamingConvention: third-party code
        experimental_repairToolCall: toolCallRepair,
        abortSignal,
      });

      let accumulatedText = "";
      let lastType: "reasoning" | "text" | null = null;

      for await (const chunk of result.fullStream) {
        if (chunk.type === "reasoning-delta" || chunk.type === "text-delta") {
          if (chunk.type === "reasoning-delta") {
            if (lastType !== "reasoning") {
              terminal.writeln(style.dim("<think>"));
            }
            terminal.write(style.dim(chunk.text));
            lastType = "reasoning";
          } else {
            terminal.stopProgress();
            if (lastType === "reasoning") {
              terminal.writeln(style.dim("\n</think>\n"));
            }
            accumulatedText += chunk.text;
            lastType = "text";
          }
        } else {
          // finish off this step
          if (lastType === "reasoning") {
            terminal.write(style.dim("\n</think>\n\n"));
          }
          terminal.stopProgress();
          if (accumulatedText.trim()) {
            terminal.writeln(`${style.blue.bold("● Response:")}`);
            terminal.display(accumulatedText, true);
            terminal.lineBreak();
          }
          accumulatedText = "";
          lastType = null;
        }
      }

      // Get response and tool calls
      const response = await result.response;
      const responseMessages = response.messages;

      messageHistory.appendResponseMessages(responseMessages);

      const toolCalls = await result.toolCalls;

      const thisStepToolCalls: { toolName: string }[] = [];
      const thisStepToolResults: { toolName: string }[] = [];
      loopResult.steps.push({
        toolCalls: thisStepToolCalls,
        toolResults: thisStepToolResults,
      });

      // If finishReason is not tool-calls, break
      const finishReason = await result.finishReason;

      if (finishReason !== "tool-calls") {
        const lastStepUsage = await result.usage;

        loopResult.usage.inputTokens = lastStepUsage.inputTokens ?? 0;
        loopResult.usage.outputTokens = lastStepUsage.outputTokens ?? 0;
        loopResult.usage.totalTokens = lastStepUsage.totalTokens ?? 0;
        loopResult.usage.cachedInputTokens =
          lastStepUsage.cachedInputTokens ?? 0;
        loopResult.usage.reasoningTokens = lastStepUsage.reasoningTokens ?? 0;

        loopResult.totalUsage.inputTokens += lastStepUsage.inputTokens ?? 0;
        loopResult.totalUsage.outputTokens += lastStepUsage.outputTokens ?? 0;
        loopResult.totalUsage.totalTokens += lastStepUsage.totalTokens ?? 0;
        loopResult.totalUsage.cachedInputTokens +=
          lastStepUsage.cachedInputTokens ?? 0;
        loopResult.totalUsage.reasoningTokens +=
          lastStepUsage.reasoningTokens ?? 0;

        break;
      }

      // Execute tools in parallel (order not guaranteed)

      // Check response.messages for already-processed tool results
      const alreadyProcessedToolCallIds = new Set<string>();

      // Look for tool results and tool errors in the response messages
      for (const message of responseMessages) {
        if (message.role === "tool" && Array.isArray(message.content)) {
          for (const content of message.content) {
            if (
              (content.type === "tool-result" ||
                content.type === "tool-error") &&
              content.toolCallId
            ) {
              alreadyProcessedToolCallIds.add(content.toolCallId);
            }
          }
        }
      }

      // Filter out tool calls that have already been processed or are invalid
      const validToolCalls = toolCalls.filter(
        (call) =>
          !alreadyProcessedToolCallIds.has(call.toolCallId) &&
          // Also check if the tool call is marked as invalid by the AI SDK
          !(call as { invalid?: boolean }).invalid,
      );

      if (validToolCalls.length === 0) {
        // All tool calls were already processed by the AI SDK
        logger.debug(
          `All ${toolCalls.length} tool calls were already processed by AI SDK, skipping manual execution`,
        );
        continue;
      }

      if (validToolCalls.length < toolCalls.length) {
        logger.debug(
          `Filtered out ${toolCalls.length - validToolCalls.length} already-processed tool calls, executing ${validToolCalls.length} remaining`,
        );
      }

      // Process all tools concurrently
      const toolMessagesPromise: Promise<
        PromiseSettledResult<ToolModelMessage>[]
      > = Promise.allSettled(
        validToolCalls.map(async (call) => {
          const toolName = call.toolName as keyof CompleteToolSet;
          let resultOutput = "Unknown result.";
          try {
            thisStepToolCalls.push({ toolName });
            thisStepToolResults.push({ toolName });

            const exec = executors.get(toolName);
            if (!exec) {
              resultOutput = `No executor for tool ${toolName}`;
            } else {
              try {
                const output = await exec(call.input, {
                  toolCallId: call.toolCallId,
                  messages: messageHistory.get(),
                  abortSignal,
                });
                if (isAsyncIterable(output)) {
                  const { finalValue } = await consumeToolAsyncIterable(
                    output,
                    terminal,
                  );
                  resultOutput = formatToolResult(finalValue);
                } else {
                  resultOutput = formatToolResult(output);
                }
              } catch (err) {
                resultOutput = `Tool error: ${
                  err instanceof Error ? err.message : String(err)
                }`;
              }
            }
          } catch (error) {
            resultOutput = `Tool error: ${
              error instanceof Error ? error.message : String(error)
            }`;
          }
          return {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolName,
                toolCallId: call.toolCallId,
                output: {
                  type: "text",
                  value: resultOutput,
                },
              },
            ],
          } as const;
        }),
      );

      const toolMessages: ToolModelMessage[] = (await toolMessagesPromise)
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);

      messageHistory.appendToolMessages(toolMessages);

      // Calculate usage for the current step/iteration
      const stepUsage = await result.usage;

      loopResult.totalUsage.inputTokens += stepUsage.inputTokens ?? 0;
      loopResult.totalUsage.outputTokens += stepUsage.outputTokens ?? 0;
      loopResult.totalUsage.totalTokens += stepUsage.totalTokens ?? 0;
      loopResult.totalUsage.cachedInputTokens +=
        stepUsage.cachedInputTokens ?? 0;
      loopResult.totalUsage.reasoningTokens += stepUsage.reasoningTokens ?? 0;

      // Consume the rest of the team if necessary
      // await result.consumeStream();

      // continue iterations
      iter += 1;
    } catch (error) {
      consecutiveErrors += 1;

      logger.error(
        error, // Log the full error object
        `Error on manual agent loop streamText (attempt ${consecutiveErrors}/${maxRetries + 1})`,
      );

      terminal.error("Error in manual agent loop.");
      terminal.error(
        (error as Error).message.length > 100
          ? `${(error as Error).message.slice(0, 100)}...`
          : (error as Error).message,
      );

      if (NoOutputGeneratedError.isInstance(error)) {
        break;
      }

      // Break loop if we exceed max retries
      if (consecutiveErrors > maxRetries) {
        terminal.error(
          `Exceeded maximum retry attempts (${maxRetries}). Stopping manual loop.`,
        );
        break;
      }
    }
  }

  return loopResult;
}

function formatToolResult(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized === "string") {
      return serialized;
    }
  } catch {
    // noop - fallback below
  }

  return String(value);
}
