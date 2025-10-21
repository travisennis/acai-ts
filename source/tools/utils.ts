import type { Tool } from "ai";
import z from "zod";

export function prepareTools(tools: { [toolName: string]: Tool }): {
  tools:
    | undefined
    | Array<{
        type: "function";
        function: {
          name: string;
          description: string | undefined;
          parameters: unknown;
        };
      }>;
} {
  const openaiCompatTools: Array<{
    type: "function";
    function: {
      name: string;
      description: string | undefined;
      parameters: unknown;
    };
  }> = [];

  for (const tool of Object.entries(tools)) {
    openaiCompatTools.push({
      type: "function",
      function: {
        name: tool[0],
        description: tool[1].description,
        // biome-ignore lint/suspicious/noExplicitAny:  try to figure it out for now
        parameters: z.toJSONSchema(tool[1].inputSchema as any),
      },
    });
  }

  return { tools: openaiCompatTools };
}
