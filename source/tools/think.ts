import { z } from "zod";
import type { ToolExecutionOptions } from "./types.ts";

export const ThinkTool = {
  name: "Think" as const,
};

const toolDescription = "Think through a problem step-by-step.";

const inputSchema = z.object({
  thought: z.string().describe("Your thought"),
});

// This is a no-op tool that logs a thought. It is inspired by the tau-bench think tool.
export const createThinkTool = () => {
  return {
    toolDef: {
      description: toolDescription,
      inputSchema,
    },
    display() {
      return "Logging thought";
    },
    async execute(
      { thought }: z.infer<typeof inputSchema>,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("Thinking process aborted");
      }

      const formattedThought = thought.replace(/\\n/g, "\n");

      return `Thought: ${formattedThought}`;
    },
  };
};
