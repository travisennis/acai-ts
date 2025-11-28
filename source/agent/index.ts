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
import { config } from "../config.ts";
import { logger } from "../logger.ts";
import type { MessageHistory } from "../messages.ts";
import { AiConfig } from "../models/ai-config.ts";
import type { ModelManager } from "../models/manager.ts";
import type { ModelMetadata } from "../models/providers.ts";
import type { TokenTracker } from "../tokens/tracker.ts";
import type { CompleteToolSet } from "../tools/index.ts";
import { isToolMessage } from "../tools/types.ts";
import { isAsyncIterable } from "../utils/iterables.ts";

type AgentOptions = {
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  messageHistory: MessageHistory;
  maxIterations?: number;
  maxRetries?: number;
  toolCallRepair?: ToolCallRepairFunction<CompleteToolSet>;
};

type RunOptions = {
  systemPrompt: string;
  input: string;
  toolDefs: CompleteToolSet;
  executors: Map<keyof CompleteToolSet, ToolExecuteFunction<unknown, string>>;
  abortSignal?: AbortSignal;
};

export type ToolEvent =
  | {
      type: "tool-call-start";
      name: string;
      toolCallId: string;
      msg: string;
      args: unknown;
    }
  | {
      type: "tool-call-update";
      name: string;
      toolCallId: string;
      msg: string;
      args: unknown;
    }
  | {
      type: "tool-call-end";
      name: string;
      toolCallId: string;
      msg: string;
      args: unknown;
    }
  | {
      type: "tool-call-error";
      name: string;
      toolCallId: string;
      msg: string;
      args: unknown;
    };

type ToolCallLifeCycle = {
  type: "tool-call-lifecycle";
  toolCallId: string;
  events: ToolEvent[];
};

export type AgentEvent =
  // Agent lifecycle
  | { type: "agent-start" }
  | { type: "agent-stop" }
  | { type: "agent-error"; message: string }
  // Step lifecycle
  | { type: "step-start" }
  | { type: "step-stop" }
  // Thinking and message streaming
  | { type: "thinking-start"; content: string }
  | { type: "thinking"; content: string }
  | { type: "thinking-end"; content: string }
  | { type: "message"; role: "user"; content: string }
  | { type: "message-start"; role: "assistant"; content: string }
  | { type: "message"; role: "assistant"; content: string }
  | { type: "message-end"; role: "assistant"; content: string }
  // Tool execution lifecycle
  | ToolCallLifeCycle;

// export interface AgentState {
// systemPrompt: string;
// model: Model<any>;
// thinkingLevel: ThinkingLevel;
// tools: AgentTool<any>[];
// messages: AppMessage[]; // Can include attachments + custom message types
// isStreaming: boolean;
// streamMessage: Message | null;
// pendingToolCalls: Set<string>;
// error?: string;
// }

export type AgentState = {
  modelId: string;
  modelConfig: ModelMetadata;
  steps: {
    toolResults: Array<{ toolName: string }>;
    toolCalls: Array<{ toolName: string }>;
  }[];
  usage: { [K in keyof LanguageModelUsage]-?: number };
  totalUsage: { [K in keyof LanguageModelUsage]-?: number };
  timestamps: {
    start: number;
    stop: number;
  };
};

export class Agent {
  private opts: AgentOptions;
  private _state: AgentState;
  private abortController: AbortController;

  constructor(opts: AgentOptions) {
    this.opts = opts;
    this.abortController = new AbortController();
    this._state = this.resetState();
  }

  get state() {
    return this._state;
  }

  get abortSignal() {
    return this.abortController.signal;
  }

  async *run(args: RunOptions): AsyncGenerator<AgentEvent> {
    const {
      modelManager,
      messageHistory,
      tokenTracker,
      maxIterations = (await config.readProjectConfig()).loop.maxIterations,
      maxRetries = 2,
      toolCallRepair,
    } = this.opts;

    this.resetState();

    this._state.timestamps.start = performance.now();

    const { systemPrompt, input, toolDefs, executors, abortSignal } = args;

    const langModel = modelManager.getModel("repl");
    const modelConfig = modelManager.getModelMetadata("repl");

    const aiConfig = new AiConfig({
      modelMetadata: modelConfig,
      prompt: input,
    });

    yield {
      type: "agent-start",
    };

    yield {
      type: "message",
      role: "user",
      content: input,
    };

    let iter = 0;
    let consecutiveErrors = 0;
    while (iter < maxIterations) {
      if (abortSignal?.aborted) {
        logger.warn("The agent loop was aborted by the user.");
        // terminal.warn("Operation aborted by user.");
        yield {
          type: "agent-stop",
        };
        break;
      }

      yield {
        type: "step-start",
      };

      const toolsCalled: Map<string, ToolEvent[]> = new Map();

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
        let accumulatedReasoning = "";

        for await (const chunk of result.fullStream) {
          if (chunk.type === "reasoning-start") {
            yield {
              type: "thinking-start",
              content: "",
            };
          } else if (chunk.type === "reasoning-delta") {
            accumulatedReasoning += chunk.text;
            yield {
              type: "thinking",
              content: accumulatedReasoning,
            };
          } else if (chunk.type === "reasoning-end") {
            yield {
              type: "thinking-end",
              content: accumulatedReasoning,
            };
          } else if (chunk.type === "text-start") {
            yield {
              type: "message-start",
              role: "assistant",
              content: "",
            };
          } else if (chunk.type === "text-delta") {
            accumulatedText += chunk.text;
            yield {
              type: "message",
              role: "assistant",
              content: accumulatedText,
            };
          } else if (chunk.type === "text-end") {
            yield {
              type: "message-end",
              role: "assistant",
              content: accumulatedText,
            };
          }
        }

        // Get response and tool calls
        const response = await result.response;
        const responseMessages = response.messages;

        messageHistory.appendResponseMessages(responseMessages);

        const toolCalls = await result.toolCalls;

        const thisStepToolCalls: { toolName: string }[] = [];
        const thisStepToolResults: { toolName: string }[] = [];
        this._state.steps.push({
          toolCalls: thisStepToolCalls,
          toolResults: thisStepToolResults,
        });

        // Calculate usage for the current step/iteration
        const stepUsage = await result.usage;

        this._state.usage.inputTokens = stepUsage.inputTokens ?? 0;
        this._state.usage.outputTokens = stepUsage.outputTokens ?? 0;
        this._state.usage.totalTokens = stepUsage.totalTokens ?? 0;
        this._state.usage.cachedInputTokens = stepUsage.cachedInputTokens ?? 0;
        this._state.usage.reasoningTokens = stepUsage.reasoningTokens ?? 0;
        messageHistory.setContextWindow(stepUsage.totalTokens ?? 0);

        this._state.totalUsage.inputTokens += stepUsage.inputTokens ?? 0;
        this._state.totalUsage.outputTokens += stepUsage.outputTokens ?? 0;
        this._state.totalUsage.totalTokens += stepUsage.totalTokens ?? 0;
        this._state.totalUsage.cachedInputTokens +=
          stepUsage.cachedInputTokens ?? 0;
        this._state.totalUsage.reasoningTokens +=
          stepUsage.reasoningTokens ?? 0;

        // If finishReason is not tool-calls, break
        const finishReason = await result.finishReason;

        if (finishReason !== "tool-calls") {
          yield {
            type: "agent-stop",
          };

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
                logger.debug(content, "Invalid tool call:");
                yield this.processToolEvent(toolsCalled, {
                  type: "tool-call-start",
                  name: content.toolName,
                  toolCallId: content.toolCallId,
                  args: toolCalls.find(
                    (call) => call.toolCallId === content.toolCallId,
                  )?.input,
                  msg: "",
                });
                yield this.processToolEvent(toolsCalled, {
                  type: "tool-call-error",
                  name: content.toolName,
                  toolCallId: content.toolCallId,
                  msg: "invalid tool call",
                  args: toolCalls.find(
                    (call) => call.toolCallId === content.toolCallId,
                  )?.input,
                });
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

        // Process all tools
        const toolMessages: ToolModelMessage[] = [];
        for (const call of validToolCalls) {
          const toolName = call.toolName as keyof CompleteToolSet;
          yield this.processToolEvent(toolsCalled, {
            type: "tool-call-start",
            name: toolName,
            toolCallId: call.toolCallId,
            msg: "",
            args: call.input,
          });
          let resultOutput = "Unknown result.";
          try {
            thisStepToolCalls.push({ toolName });
            thisStepToolResults.push({ toolName });

            const toolExec = executors.get(toolName);
            if (!toolExec) {
              resultOutput = `No executor for tool ${toolName}`;
            } else {
              try {
                const output = await toolExec(call.input, {
                  toolCallId: call.toolCallId,
                  messages: messageHistory.get(),
                  abortSignal,
                });
                if (isAsyncIterable(output)) {
                  const toolResultValues: unknown[] = [];
                  for await (const value of output) {
                    if (isToolMessage(value)) {
                      if (call.toolCallId !== value.id) {
                        logger.debug(
                          `Tool ${call.toolName} ids don't match: ${call.toolCallId} != ${value.id}`,
                        );
                      }
                      switch (value.event) {
                        case "tool-completion":
                          yield this.processToolEvent(toolsCalled, {
                            type: "tool-call-end",
                            name: value.name,
                            toolCallId: call.toolCallId,
                            msg: value.data,
                            args: call.input,
                          });
                          break;
                        case "tool-error":
                          yield this.processToolEvent(toolsCalled, {
                            type: "tool-call-error",
                            name: value.name,
                            toolCallId: call.toolCallId,
                            msg: value.data,
                            args: call.input,
                          });
                          break;
                        case "tool-init":
                          yield this.processToolEvent(toolsCalled, {
                            type: "tool-call-update",
                            name: value.name,
                            toolCallId: call.toolCallId,
                            msg: value.data,
                            args: call.input,
                          });
                          break;
                        default:
                          logger.debug(
                            `Unhandled tool message event: ${(value as { event: string }).event}`,
                          );
                          break;
                      }
                    } else {
                      toolResultValues.push(value);
                    }
                  }

                  const finalValue =
                    toolResultValues.length > 0
                      ? toolResultValues.at(-1)
                      : undefined;

                  resultOutput = formatToolResult(finalValue);
                } else {
                  resultOutput = formatToolResult(output);
                  yield this.processToolEvent(toolsCalled, {
                    type: "tool-call-end",
                    name: call.toolName,
                    toolCallId: call.toolCallId,
                    msg: "success",
                    args: null,
                  });
                }
              } catch (err) {
                resultOutput = `Tool error: ${
                  err instanceof Error ? err.message : String(err)
                }`;
                yield this.processToolEvent(toolsCalled, {
                  type: "tool-call-error",
                  name: toolName,
                  toolCallId: call.toolCallId,
                  msg: resultOutput,
                  args: null,
                });
              }
            }
          } catch (error) {
            resultOutput = `Tool error: ${
              error instanceof Error ? error.message : String(error)
            }`;
            yield this.processToolEvent(toolsCalled, {
              type: "tool-call-error",
              name: toolName,
              toolCallId: call.toolCallId,
              msg: resultOutput,
              args: null,
            });
          }
          toolMessages.push({
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
          } as const);
        }

        messageHistory.appendToolMessages(toolMessages);

        // Consume the rest of the team if necessary
        // await result.consumeStream();

        yield {
          type: "step-stop",
        };

        // continue iterations
        iter += 1;
      } catch (error) {
        consecutiveErrors += 1;

        logger.error(
          error, // Log the full error object
          `Error on manual agent loop streamText (attempt ${consecutiveErrors}/${maxRetries + 1})`,
        );

        const errorMsg =
          (error as Error).message.length > 100
            ? `${(error as Error).message.slice(0, 100)}...`
            : (error as Error).message;

        yield {
          type: "agent-error",
          message: errorMsg,
        };

        if (NoOutputGeneratedError.isInstance(error)) {
          break;
        }

        // Break loop if we exceed max retries
        if (consecutiveErrors > maxRetries) {
          yield {
            type: "agent-error",
            message: `Exceeded maximum retry attempts (${maxRetries}). Stopping manual loop.`,
          };
          break;
        }
      } finally {
        this._state.timestamps.stop = performance.now();
      }
    }
    // Track aggregate usage across all steps when available
    tokenTracker.trackUsage("repl", this._state.totalUsage);
  }

  abort() {
    this.abortController.abort();
    // Reset the abort controller for the next run
    this.abortController = new AbortController();
  }

  resetState() {
    const {
      modelManager,
      // messageHistory,
    } = this.opts;

    this._state = {
      modelId: modelManager.getModel("repl").modelId,
      modelConfig: modelManager.getModelMetadata("repl"),
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
      timestamps: {
        start: 0,
        stop: 0,
      },
    };

    return this._state;
  }

  private processToolEvent(
    toolsCalled: Map<string, ToolEvent[]>,
    event: ToolEvent,
  ): ToolCallLifeCycle {
    const toolCallId = event.toolCallId;
    let events: ToolEvent[];
    if (toolsCalled.has(toolCallId)) {
      const currentEvents = toolsCalled.get(toolCallId);
      if (currentEvents) {
        events = currentEvents;
        events.push(event);
      } else {
        events = [event];
        toolsCalled.set(toolCallId, events);
      }
    } else {
      events = [event];
      toolsCalled.set(toolCallId, events);
    }
    return {
      type: "tool-call-lifecycle",
      toolCallId: toolCallId,
      events,
    };
  }
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
