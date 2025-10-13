import type { Tool, ToolCallOptions, ToolExecuteFunction } from "ai";
import { isAsyncIterable } from "../utils/iterables.ts";
import type { Message } from "./types.ts";

// Generic type for an initialized tool from initTools/initCliTools
// Each tool entry is shaped like { myTool: tool({ description, inputSchema, execute }) }
// We need to map to a pair: schema-only toolDef + executor function.
export type ManualToolset<Ttools extends Record<string, Tool>> = {
  toolDefs: Ttools;
  executors: Map<keyof Ttools, ToolExecuteFunction<unknown, string>>;
};

type BuildManualToolsetOptions<Ttools extends Record<string, Tool>> = {
  fallbackExecutors?: Partial<
    Record<keyof Ttools, ToolExecuteFunction<unknown, string>>
  >;
  onMessage?: (toolCallId: string, message: Message) => void;
};

export function buildManualToolset<Ttools extends Record<string, Tool>>(
  tools: Ttools,
  options: BuildManualToolsetOptions<Ttools> = {},
): ManualToolset<Ttools> {
  const { fallbackExecutors, onMessage } = options;
  const toolDefs = {} as { [K in keyof Ttools]: Tool };
  const executors = new Map<
    keyof Ttools,
    ToolExecuteFunction<unknown, string>
  >();

  for (const [name, def] of Object.entries(tools) as [keyof Ttools, Tool][]) {
    const { execute: maybeExecute, ...rest } = def as Tool & {
      execute?: ToolExecuteFunction<unknown, string>;
    };
    const schemaOnly: Tool = { ...rest } as Tool;
    toolDefs[name] = schemaOnly as (typeof toolDefs)[keyof Ttools];

    const fallback = fallbackExecutors?.[name];

    executors.set(name, async (input: unknown, ctx: ToolCallOptions) => {
      const exec = maybeExecute ?? fallback;
      if (typeof exec !== "function") {
        return "Tool has no executor bound";
      }
      try {
        const result = exec(input, ctx);
        if (isAsyncIterable(result)) {
          const iterator = result[Symbol.asyncIterator]();
          let next = await iterator.next();
          while (!next.done) {
            const value = next.value;
            if (
              value &&
              typeof value === "object" &&
              "event" in value &&
              "id" in value
            ) {
              onMessage?.(ctx.toolCallId, value as Message);
            }
            next = await iterator.next();
          }
          const finalValue = next.value;
          if (typeof finalValue === "string") {
            return finalValue;
          }
          try {
            return JSON.stringify(finalValue);
          } catch {
            return String(finalValue);
          }
        }
        const awaited = await result;
        if (typeof awaited === "string") {
          return awaited;
        }
        try {
          return JSON.stringify(awaited);
        } catch {
          return String(awaited);
        }
      } catch (err) {
        return `Tool execution error: ${err instanceof Error ? err.message : String(err)}`;
      }
    });
  }

  return { toolDefs, executors } as ManualToolset<Ttools>;
}
