import type {
  ToolCallRepairFunction,
  ToolExecuteFunction,
  ToolModelMessage,
  ToolSet,
} from "ai";
import {
  generateText,
  InvalidToolInputError,
  NoOutputGeneratedError,
  NoSuchToolError,
  Output,
  streamText,
} from "ai";
import type z from "zod";
import { config } from "../config/index.ts";
import { AiConfig } from "../models/ai-config.ts";
import type { ModelManager } from "../models/manager.ts";
import type { ModelMetadata } from "../models/providers.ts";
import type { SessionManager } from "../sessions/manager.ts";
import type { TokenTracker } from "../tokens/tracker.ts";
import type {
  CompleteToolNames,
  CompleteToolSet,
  CompleteTools,
} from "../tools/index.ts";
import { toAiSdkTools } from "../tools/utils.ts";
import { logger } from "../utils/logger.ts";

type AgentOptions = {
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  sessionManager: SessionManager;
  maxIterations?: number;
  maxRetries?: number;
};

type RunOptions = {
  systemPrompt: string;
  input: string;
  tools: CompleteToolSet;
  activeTools?: CompleteToolNames[];
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

type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  inputTokenDetails: {
    noCacheTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  outputTokenDetails: {
    textTokens: number;
    reasoningTokens: number;
  };
};

export type AgentState = {
  modelId: string;
  modelConfig: ModelMetadata;
  steps: {
    toolResults: Array<{ toolName: string }>;
    toolCalls: Array<{ toolName: string }>;
  }[];
  usage: ModelUsage;
  totalUsage: ModelUsage;
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
      sessionManager,
      tokenTracker,
      maxIterations = (await config.getConfig()).loop.maxIterations,
      maxRetries = 2,
    } = this.opts;

    this.resetState();

    this._state.timestamps.start = performance.now();

    const { systemPrompt, input, tools, activeTools, abortSignal } = args;

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
    let hasEmittedTerminalEvent = false;
    while (iter < maxIterations) {
      if (abortSignal?.aborted) {
        logger.warn("The agent loop was aborted by the user.");
        yield {
          type: "agent-stop",
        };
        hasEmittedTerminalEvent = true;
        break;
      }

      yield {
        type: "step-start",
      };

      const toolsCalled: Map<string, ToolEvent[]> = new Map();

      try {
        // Check abort signal again before starting streamText
        if (abortSignal?.aborted) {
          throw new Error("Agent aborted before streamText");
        }

        const result = streamText({
          model: langModel,
          maxOutputTokens: aiConfig.maxOutputTokens(),
          system: systemPrompt,
          messages: sessionManager.get(),
          temperature: aiConfig.temperature(),
          topP: aiConfig.topP(),
          maxRetries: 2,
          providerOptions: aiConfig.providerOptions(),
          tools: toAiSdkTools(tools, false),
          activeTools,
          // biome-ignore lint/style/useNamingConvention: third-party controlled
          experimental_repairToolCall:
            toolCallRepair<CompleteTools>(modelManager),
          abortSignal,
          onAbort: ({ steps }) => {
            logger.debug(`Aborting and processing ${steps.length} steps`);
            steps.forEach((step) => {
              sessionManager.appendResponseMessages(step.response.messages);
            });
          },
          onError({ error }) {
            if (
              typeof error === "object" &&
              error != null &&
              "message" in error
            ) {
              logger.error(error.message);
            } else {
              logger.error(error);
            }
          },
        });

        let accumulatedText = "";
        let accumulatedReasoning = "";

        const thisStepToolCalls: { toolName: string }[] = [];
        const thisStepToolResults: { toolName: string }[] = [];
        this._state.steps.push({
          toolCalls: thisStepToolCalls,
          toolResults: thisStepToolResults,
        });

        const toolMessages: ToolModelMessage[] = [];

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
          } else if (chunk.type === "tool-call") {
            const call = chunk;
            const toolName = call.toolName as keyof CompleteToolSet;
            const iTool = tools[toolName];
            yield this.processToolEvent(toolsCalled, {
              type: "tool-call-start",
              name: toolName,
              toolCallId: call.toolCallId,
              // biome-ignore lint/suspicious/noExplicitAny: unknown
              msg: iTool ? iTool.display(call.input as any) : "",
              args: call.input,
            });

            if (call.invalid) {
              yield this.processToolEvent(toolsCalled, {
                type: "tool-call-error",
                name: call.toolName,
                toolCallId: call.toolCallId,
                msg: String(call.error),
                args: call.input,
              });
              continue;
            }
            let resultOutput = "Unknown result.";
            try {
              thisStepToolCalls.push({ toolName });
              thisStepToolResults.push({ toolName });

              const iTool = tools[toolName];
              if (!iTool) {
                resultOutput = `No executor for tool ${toolName}`;
              } else {
                // Pre-validate tool input to catch malformed JSON early
                if (typeof call.input === "string") {
                  // If input is a string, try to validate it's proper JSON
                  try {
                    JSON.parse(call.input);
                  } catch {
                    // Malformed JSON detected - emit error and skip execution
                    const errorMsg = `Invalid tool input: malformed JSON. Received: "${call.input.slice(0, 50)}${call.input.length > 50 ? "..." : ""}". Expected a JSON object.`;
                    yield this.processToolEvent(toolsCalled, {
                      type: "tool-call-error",
                      name: toolName,
                      toolCallId: call.toolCallId,
                      msg: errorMsg,
                      args: null,
                    });
                    continue;
                  }
                } else if (call.input === null || call.input === undefined) {
                  // Null/undefined input
                  const errorMsg =
                    "Invalid tool input: received null/undefined. Expected a JSON object matching the schema.";
                  yield this.processToolEvent(toolsCalled, {
                    type: "tool-call-error",
                    name: toolName,
                    toolCallId: call.toolCallId,
                    msg: errorMsg,
                    args: null,
                  });
                  continue;
                }

                const toolExec = iTool.execute as ToolExecuteFunction<
                  unknown,
                  string
                >;
                try {
                  const output = await toolExec(call.input, {
                    toolCallId: call.toolCallId,
                    messages: sessionManager.get(),
                    abortSignal,
                  });
                  resultOutput = formatToolResult(output);
                  yield this.processToolEvent(toolsCalled, {
                    type: "tool-call-end",
                    name: call.toolName,
                    toolCallId: call.toolCallId,
                    msg: resultOutput,
                    args: call.input,
                  });
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
        }

        // Get response and tool calls
        const response = await result.response;
        const responseMessages = response.messages;

        sessionManager.appendResponseMessages(responseMessages);

        const stepUsage = await result.usage;

        this._state.usage.inputTokens = stepUsage.inputTokens ?? 0;
        this._state.usage.outputTokens = stepUsage.outputTokens ?? 0;
        this._state.usage.totalTokens = stepUsage.totalTokens ?? 0;
        this._state.usage.cachedInputTokens =
          stepUsage.inputTokenDetails.cacheReadTokens ?? 0;
        this._state.usage.inputTokenDetails.cacheReadTokens =
          stepUsage.inputTokenDetails.cacheReadTokens ?? 0;
        this._state.usage.reasoningTokens =
          stepUsage.outputTokenDetails.reasoningTokens ?? 0;
        sessionManager.setContextWindow(stepUsage.totalTokens ?? 0);

        this._state.totalUsage.inputTokens += stepUsage.inputTokens ?? 0;
        this._state.totalUsage.outputTokens += stepUsage.outputTokens ?? 0;
        this._state.totalUsage.totalTokens += stepUsage.totalTokens ?? 0;
        this._state.totalUsage.cachedInputTokens +=
          stepUsage.inputTokenDetails.cacheReadTokens ?? 0;
        this._state.totalUsage.inputTokenDetails.cacheReadTokens +=
          stepUsage.inputTokenDetails.cacheReadTokens ?? 0;
        this._state.totalUsage.reasoningTokens +=
          stepUsage.outputTokenDetails.reasoningTokens ?? 0;

        // Record this step's usage (not cumulative total) to avoid double-counting
        sessionManager.recordTurnUsage({
          inputTokens: stepUsage.inputTokens ?? 0,
          outputTokens: stepUsage.outputTokens ?? 0,
          totalTokens: stepUsage.totalTokens ?? 0,
          cachedInputTokens: stepUsage.inputTokenDetails.cacheReadTokens ?? 0,
          reasoningTokens: stepUsage.outputTokenDetails.reasoningTokens ?? 0,
          inputTokenDetails: {
            noCacheTokens: stepUsage.inputTokenDetails.noCacheTokens ?? 0,
            cacheReadTokens: stepUsage.inputTokenDetails.cacheReadTokens ?? 0,
            cacheWriteTokens: stepUsage.inputTokenDetails.cacheWriteTokens ?? 0,
          },
          outputTokenDetails: {
            textTokens: stepUsage.outputTokenDetails.textTokens ?? 0,
            reasoningTokens: stepUsage.outputTokenDetails.reasoningTokens ?? 0,
          },
        });

        // If finishReason is not tool-calls, break
        const finishReason = await result.finishReason;

        if (finishReason !== "tool-calls") {
          // Track aggregate usage before yielding agent-stop so footer can display it
          tokenTracker.trackUsage("repl", this._state.totalUsage);
          yield {
            type: "agent-stop",
          };
          hasEmittedTerminalEvent = true;
          break;
        }

        sessionManager.appendToolMessages(toolMessages);

        // Consume the rest of the team if necessary
        // await result.consumeStream();

        yield {
          type: "step-stop",
        };

        // continue iterations
        iter += 1;
      } catch (error) {
        consecutiveErrors += 1;

        // Handle AI SDK invalid tool input errors gracefully
        if (InvalidToolInputError.isInstance(error)) {
          logger.warn(
            error,
            `Invalid tool input detected - returning error to allow recovery (attempt ${consecutiveErrors}/${maxRetries + 1})`,
          );
          yield {
            type: "agent-error",
            message: `Tool input validation failed: ${(error as Error).message}. Try again with valid arguments.`,
          };
          // Continue loop to allow user to provide corrected input
        } else {
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
            hasEmittedTerminalEvent = true;
            break;
          }
        }

        // Break loop if we exceed max retries
        if (consecutiveErrors > maxRetries) {
          yield {
            type: "agent-error",
            message: `Exceeded maximum retry attempts (${maxRetries}). Stopping manual loop.`,
          };
          hasEmittedTerminalEvent = true;
          break;
        }
      } finally {
        this._state.timestamps.stop = performance.now();
      }
    }
    // Emit agent-stop if loop ended without emitting a terminal event (maxIterations reached)
    if (!hasEmittedTerminalEvent) {
      // Track aggregate usage before yielding agent-stop so footer can display it
      tokenTracker.trackUsage("repl", this._state.totalUsage);
      yield {
        type: "agent-stop",
      };
    }
  }

  abort() {
    this.abortController.abort();
    // Reset the abort controller for the next run
    this.abortController = new AbortController();
  }

  resetState() {
    const {
      modelManager,
      // sessionManager,
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
        inputTokenDetails: {
          noCacheTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokenDetails: {
          textTokens: 0,
          reasoningTokens: 0,
        },
      },
      totalUsage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        inputTokenDetails: {
          noCacheTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokenDetails: {
          textTokens: 0,
          reasoningTokens: 0,
        },
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

const toolCallRepair = <T extends ToolSet>(modelManager: ModelManager) => {
  const fn: ToolCallRepairFunction<T> = async ({
    toolCall,
    tools,
    inputSchema,
    error,
  }) => {
    if (NoSuchToolError.isInstance(error)) {
      return null; // do not attempt to fix invalid tool names
    }

    logger.error(
      `Attemping to repair tool call: ${toolCall.toolName} - ${toolCall.input}`,
    );

    const tool = tools[toolCall.toolName as keyof typeof tools];

    try {
      const { output: repairedArgs } = await generateText({
        model: modelManager.getModel("tool-repair"),
        output: Output.object({
          schema: tool.inputSchema as z.ZodType<unknown>,
        }),
        prompt: [
          `The model tried to call the tool "${toolCall.toolName}" but the input did not match the expected schema.`,
          "",
          "<invalid_input>",
          JSON.stringify(toolCall.input, null, 2),
          "</invalid_input>",
          "",
          "<expected_schema>",
          JSON.stringify(
            await inputSchema({ toolName: toolCall.toolName }),
            null,
            2,
          ),
          "</expected_schema>",
          "",
          "If any field is missing or undefined in the corrected input, you MUST explicitly set its value to null. Do NOT omit fields - every field in the schema must be present, even if with a null value.",
          "",
          "Return a corrected version of the input that conforms to the expected schema.",
        ].join("\n"),
      });

      return { ...toolCall, args: JSON.stringify(repairedArgs) };
    } catch (err) {
      logger.error(err, `Failed to repair tool call: ${toolCall.toolName}.`);
      return null;
    }
  };
  return fn;
};
