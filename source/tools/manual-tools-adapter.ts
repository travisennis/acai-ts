import type { Tool, ToolExecuteFunction } from "ai";

// Generic type for an initialized tool from initTools/initCliTools
// Each tool entry is shaped like { myTool: tool({ description, inputSchema, execute }) }
// We need to map to a pair: schema-only toolDef + executor function.
export type ManualToolset<Ttools extends Record<string, Tool>> = {
  toolDefs: { [K in keyof Ttools]: Tool };
  executors: Map<
    keyof Ttools,
    (
      input: unknown,
      ctx: { toolCallId: string; abortSignal?: AbortSignal | undefined },
    ) => Promise<string> | string
  >;
};

export function buildManualToolset<Ttools extends Record<string, Tool>>(
  tools: Ttools,
): ManualToolset<Ttools> {
  const toolDefs = {} as { [K in keyof Ttools]: Tool };
  const executors = new Map<
    keyof Ttools,
    ToolExecuteFunction<unknown, string>
  >();

  for (const [name, def] of Object.entries(tools) as [keyof Ttools, Tool][]) {
    // Clone the tool sans execute to hand to the model
    const { description, inputSchema } = def as Tool;
    const schemaOnly: Tool = { description, inputSchema } as Tool;
    toolDefs[name] = schemaOnly as (typeof toolDefs)[keyof Ttools];

    // Capture the original execute
    const exec = (
      def as {
        execute?: ToolExecuteFunction<unknown, string>;
      }
    ).execute;

    executors.set(
      name,
      async (
        input: unknown,
        ctx: { toolCallId: string; abortSignal?: AbortSignal | undefined },
      ) => {
        if (typeof exec !== "function") {
          return "Tool has no executor bound";
        }
        try {
          const out = await exec(input as never, ctx as never);
          // Ensure string output per plan (wrap non-string)
          if (typeof out === "string") return out;
          try {
            return JSON.stringify(out);
          } catch {
            return String(out);
          }
        } catch (err) {
          return `Tool execution error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    );
  }

  return { toolDefs, executors } as ManualToolset<Ttools>;
}
