import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { logger } from "../logger.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import { manageTokenLimit } from "../tokens/threshold.ts";
import type { ToolResult } from "./types.ts";

export const BatchTool = {
  name: "batch" as const,
};

const toolCallSchema = z.object({
  tool: z.string().describe("Name of the tool to execute"),
  arguments: z
    .record(z.any(), z.any())
    .describe("Arguments to pass to the tool"),
  id: z
    .string()
    .optional()
    .describe("Optional ID for tracking this specific call"),
});

const inputSchema = z.object({
  calls: z
    .array(toolCallSchema)
    .min(1)
    .max(10)
    .describe("Array of tool calls to execute in sequence"),
});

type BatchInputSchema = z.infer<typeof inputSchema>;
type ToolExecutor = (
  args: Record<string, unknown>,
  options: ToolCallOptions,
) => AsyncGenerator<ToolResult> | Promise<string>;

export const createBatchTool = async ({
  tokenCounter,
  executors,
}: {
  tokenCounter: TokenCounter;
  executors: Map<string, ToolExecutor>;
}) => {
  return {
    toolDef: {
      description:
        "Execute multiple tool calls in a single request. Reduces roundtrips by batching operations. Tools are executed sequentially in the order provided.",
      inputSchema,
    },
    async *execute(
      { calls }: BatchInputSchema,
      { toolCallId, messages, abortSignal }: ToolCallOptions,
    ): AsyncGenerator<ToolResult> {
      try {
        if (abortSignal?.aborted) {
          throw new Error("Batch execution aborted");
        }

        const totalCalls = calls.length;
        yield {
          name: BatchTool.name,
          event: "tool-init",
          id: toolCallId,
          data: `Starting batch execution of ${totalCalls} tool calls`,
        };

        const results: Array<{
          tool: string;
          id?: string;
          status: "success" | "error";
          result?: unknown;
          error?: string;
        }> = [];

        for (let i = 0; i < calls.length; i++) {
          const call = calls[i];
          const { tool: toolName, arguments: args, id: callId } = call;
          const callNumber = i + 1;

          if (abortSignal?.aborted) {
            results.push({
              tool: toolName,
              id: callId,
              status: "error",
              error: "Batch execution aborted",
            });
            continue;
          }

          const executor = executors.get(toolName);
          if (!executor) {
            results.push({
              tool: toolName,
              id: callId,
              status: "error",
              error: `Unknown tool '${toolName}'`,
            });
            continue;
          }

          yield {
            name: BatchTool.name,
            event: "tool-update",
            id: toolCallId,
            data: `[${callNumber}/${totalCalls}] Executing ${style.cyan(toolName)}${callId ? ` (${callId})` : ""}`,
          };

          try {
            const executorResult = executor(args, {
              toolCallId: callId || `${toolCallId}-${i}`,
              messages,
              abortSignal,
            });

            let toolOutput = "";

            // Handle both async generators and regular async functions
            if (
              typeof (executorResult as AsyncGenerator<ToolResult>)[
                Symbol.asyncIterator
              ] === "function"
            ) {
              // It's an async generator
              const generator = executorResult as AsyncGenerator<ToolResult>;
              for await (const chunk of generator) {
                if (typeof chunk === "string") {
                  toolOutput += chunk;
                } else if (chunk.event === "tool-completion") {
                  // Capture completion message
                  toolOutput += chunk.data;
                }
              }
            } else {
              // It's a regular async function returning a string
              toolOutput = await (executorResult as Promise<string>);
            }

            results.push({
              tool: toolName,
              id: callId,
              status: "success",
              result: toolOutput,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            logger.error(
              { error, toolName, args },
              "Batch tool execution failed",
            );
            results.push({
              tool: toolName,
              id: callId,
              status: "error",
              error: errorMessage,
            });
          }
        }

        // Format results as JSON
        const jsonResults = JSON.stringify(results, null, 2);

        const result = await manageTokenLimit(
          jsonResults,
          tokenCounter,
          "Batch",
          "Consider reducing the number of calls or using more specific tool calls",
        );

        yield {
          name: BatchTool.name,
          event: "tool-completion",
          id: toolCallId,
          data: `Batch execution completed: ${results.filter((r) => r.status === "success").length}/${totalCalls} successful`,
        };

        yield result.content;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error({ error }, "Batch tool failed");
        yield {
          name: BatchTool.name,
          event: "tool-error",
          id: toolCallId,
          data: errorMessage,
        };
        yield errorMessage;
      }
    },
  };
};
