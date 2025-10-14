import type {
  LanguageModelUsage,
  ToolCallOptions,
  ToolExecuteFunction,
  ToolModelMessage,
} from "ai";
import { streamText, type Tool, type ToolCallRepairFunction } from "ai";
import { logger } from "../logger.ts";
import type { MessageHistory } from "../messages.ts";
import { AiConfig } from "../models/ai-config.ts";
import type { ModelManager } from "../models/manager.ts";
import { displayToolMessages } from "../repl/display-tool-messages.ts";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import type { CompleteToolSet } from "../tools/index.ts";
import type { Message } from "../tools/types.ts";
import { isAsyncIterable } from "../utils/iterables.ts";

// - readOnly=true (parallel): readFile, readMultipleFiles, grep, webFetch, webSearch, think
// - serialize (readOnly=false): editFile, saveFile, moveFile, deleteFile, bash, codeInterpreter

export type ManualLoopOptions = {
  modelManager: ModelManager;
  terminal: Terminal;
  messageHistory: MessageHistory;
  systemPrompt: string;
  input: string;
  toolDefs: CompleteToolSet;
  executors: Map<keyof CompleteToolSet, ToolExecuteFunction<unknown, string>>;
  permissions: Record<
    keyof CompleteToolSet,
    | ((
        input: unknown,
        options: ToolCallOptions,
      ) => Promise<{ approve: true } | { approve: false; reason: string }>)
    | undefined
  >;
  maxIterations?: number;
  abortSignal?: AbortSignal;
  temperature?: number | undefined;
  toolCallRepair?: ToolCallRepairFunction<Record<string, Tool>>;
};

export type ManualLoopResult = {
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
    permissions,
    maxIterations = 90,
    abortSignal,
    temperature,
    toolCallRepair,
  } = opts;

  const terminal = opts.terminal;

  const langModel = modelManager.getModel("repl");
  const modelConfig = modelManager.getModelMetadata("repl");

  const aiConfig = new AiConfig({
    modelMetadata: modelConfig,
    prompt: input,
  });
  const maxTokens = aiConfig.getMaxTokens();

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
  while (iter < maxIterations) {
    if (abortSignal?.aborted) {
      logger.warn("The agent loop was aborted by the user.");
      terminal.warn("Operation aborted by user.");
      break;
    }

    try {
      const result = streamText({
        model: langModel,
        maxOutputTokens: maxTokens,
        system: systemPrompt,
        messages: messageHistory.get(),
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
            if (lastType !== "reasoning") {
              terminal.writeln(style.dim("<think>"));
            }
            terminal.write(style.dim(chunk.text));
            lastType = "reasoning";
          } else {
            if (lastType === "reasoning") {
              terminal.writeln(style.dim("\n</think>\n"));
            }
            accumulatedText += chunk.text;
            lastType = "text";
          }
        } else if (chunk.type === "tool-call") {
          // We will handle after stream completes
          terminal.stopProgress();
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

      const thisStepToolCalls: { toolName: string }[] = [];
      const thisStepToolResults: { toolName: string }[] = [];
      loopResult.steps.push({
        toolCalls: thisStepToolCalls,
        toolResults: thisStepToolResults,
      });

      // Execute tools in parallel (order not guaranteed)
      const toolCalls = await result.toolCalls;

      const toolEventMessages = new Map<string, Message[]>();

      // Split toolCalls into two groups: those with permission functions and those without
      const toolsWithPermission: typeof toolCalls = [];
      const toolsWithoutPermission: typeof toolCalls = [];

      for (const call of toolCalls) {
        const toolName = call.toolName as keyof CompleteToolSet;
        const permFunc = permissions[toolName];
        if (permFunc) {
          toolsWithPermission.push(call);
        } else {
          toolsWithoutPermission.push(call);
        }
      }

      // Process tools with permission sequentially
      const sequentialToolMessages: ToolModelMessage[] = [];
      for (const call of toolsWithPermission) {
        const toolName = call.toolName as keyof CompleteToolSet;
        const exec = executors.get(toolName);
        let resultOutput = "Unknown result.";

        if (!exec) {
          resultOutput = `No executor for tool ${toolName}`;
        } else {
          thisStepToolCalls.push({ toolName });
          thisStepToolResults.push({ toolName });

          let approved = true;
          const permFunc = permissions[toolName];
          if (permFunc) {
            const permResult = await permFunc(call.input, {
              toolCallId: call.toolCallId,
              messages: [], // TODO: is this right?
              abortSignal,
            });

            if (!permResult.approve) {
              approved = false;
              resultOutput = permResult.reason;
            }
          }

          if (approved) {
            try {
              const output = await exec(call.input, {
                toolCallId: call.toolCallId,
                messages: [], // TODO: is this right?
                abortSignal,
              });
              if (isAsyncIterable(output)) {
                const { finalValue, messages } =
                  await consumeToolAsyncIterable(output);
                resultOutput = formatToolResult(finalValue);
                if (messages.length > 0) {
                  toolEventMessages.set(call.toolCallId, messages);
                }
              } else {
                resultOutput = formatToolResult(output);
              }
            } catch (err) {
              resultOutput = `Tool error: ${
                err instanceof Error ? err.message : String(err)
              }`;
            }
          }
        }

        sequentialToolMessages.push({
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
        });
      }

      // Process tools without permission concurrently
      const concurrentToolMessages: ToolModelMessage[] = await Promise.all(
        toolsWithoutPermission.map(async (call) => {
          const toolName = call.toolName as keyof CompleteToolSet;
          const exec = executors.get(toolName);
          let resultOutput = "Unknown result.";
          if (!exec) {
            resultOutput = `No executor for tool ${toolName}`;
          } else {
            thisStepToolCalls.push({ toolName });
            thisStepToolResults.push({ toolName });

            try {
              const output = await exec(call.input, {
                toolCallId: call.toolCallId,
                messages: [], // TODO: is this right?
                abortSignal,
              });
              if (isAsyncIterable(output)) {
                const { finalValue, messages } =
                  await consumeToolAsyncIterable(output);
                resultOutput = formatToolResult(finalValue);
                if (messages.length > 0) {
                  toolEventMessages.set(call.toolCallId, messages);
                }
              } else {
                resultOutput = formatToolResult(output);
              }
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
                toolName,
                toolCallId: call.toolCallId,
                output: {
                  type: "text",
                  value: resultOutput,
                },
              },
            ],
          };
        }),
      );

      // Combine all tool messages
      const toolMessages: ToolModelMessage[] = [
        ...sequentialToolMessages,
        ...concurrentToolMessages,
      ];

      for (const call of toolCalls) {
        const messages = toolEventMessages.get(call.toolCallId);
        if (messages) {
          terminal.stopProgress();
          displayToolMessages(messages, terminal);
          toolEventMessages.delete(call.toolCallId);
        }
      }

      const stepUsage = await result.usage;

      loopResult.totalUsage.inputTokens += stepUsage.inputTokens ?? 0;
      loopResult.totalUsage.outputTokens += stepUsage.outputTokens ?? 0;
      loopResult.totalUsage.totalTokens += stepUsage.totalTokens ?? 0;
      loopResult.totalUsage.cachedInputTokens +=
        stepUsage.cachedInputTokens ?? 0;
      loopResult.totalUsage.reasoningTokens += stepUsage.reasoningTokens ?? 0;

      messageHistory.appendResponseMessages(toolMessages);

      // continue iterations
      iter += 1;
    } catch (error) {
      logger.error(
        error, // Log the full error object
        "Error on REPL streamText",
      );
      terminal.error(
        (error as Error).message.length > 100
          ? `${(error as Error).message.slice(0, 100)}...`
          : (error as Error).message,
      );
    }
  }

  return loopResult;
}

export async function consumeToolAsyncIterable(
  iterable: AsyncIterable<unknown>,
): Promise<{ finalValue: unknown; messages: Message[] }> {
  const iterator = iterable[Symbol.asyncIterator]();
  const messages: Message[] = [];
  const nonMessageValues: unknown[] = [];

  let next = await iterator.next();

  while (!next.done) {
    const value = next.value;
    if (isToolMessage(value)) {
      messages.push(value);
    } else {
      nonMessageValues.push(value);
    }
    next = await iterator.next();
  }

  const finalValue =
    next.value ??
    (nonMessageValues.length > 0
      ? nonMessageValues[nonMessageValues.length - 1]
      : undefined);

  return { finalValue, messages };
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

function isToolMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Message> & {
    event?: unknown;
    id?: unknown;
  };
  return (
    typeof candidate.event === "string" &&
    typeof candidate.id === "string" &&
    ("data" in candidate || "retry" in candidate)
  );
}
