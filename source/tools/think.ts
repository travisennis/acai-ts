import { tool } from "ai";
import { z } from "zod";
import type { SendData } from "./types.ts";

export const ThinkTool = {
  name: "think" as const,
};

const toolDescription = `Use the tool to think about something. It will not obtain new information or make any changes to the repository, but just log the thought. Use it when complex reasoning or brainstorming is needed.
Common use cases:
1. When exploring a repository and discovering the source of a bug, call this tool to brainstorm several unique ways of fixing the bug, and assess which change(s) are likely to be simplest and most effective
2. After receiving test results, use this tool to brainstorm ways to fix failing tests
3. When planning a complex refactoring, use this tool to outline different approaches and their tradeoffs
4. When designing a new feature, use this tool to think through architecture decisions and implementation details
5. When debugging a complex issue, use this tool to organize your thoughts and hypotheses
The tool simply logs your thought process for better transparency and does not execute any code or make changes.`;

// This is a no-op tool that logs a thought. It is inspired by the tau-bench think tool.
export const createThinkTool = (
  options: { sendData?: SendData | undefined } = {},
) => {
  const { sendData } = options;
  return {
    [ThinkTool.name]: tool({
      description: toolDescription,
      inputSchema: z.object({
        thought: z.string().describe("Your thought"),
      }),
      execute: ({ thought }, { toolCallId }) => {
        // Replace literal '\\n' with actual newline characters
        const formattedThought = thought.replace(/\\n/g, "\n");
        sendData?.({
          event: "tool-init",
          id: toolCallId,
          data: "Logging Thought",
        });
        sendData?.({
          event: "tool-update",
          id: toolCallId,
          data: { primary: "Thought:", secondary: [formattedThought] },
        });
        sendData?.({
          event: "tool-completion",
          id: toolCallId,
          data: "Done",
        });
        return Promise.resolve("Your thought has been logged.");
      },
    }),
  };
};
