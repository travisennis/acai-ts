import { editor } from "@inquirer/prompts";
import type { CommandOptions, ReplCommand } from "./types.ts";
import { syncTry } from "@travisennis/stdlib/try";

export const editPromptCommand = ({
  terminal,
  promptManager,
}: CommandOptions) => {
  return {
    command: "/editPrompt",
    description: "Edit the prompt.",
    result: "continue" as const,
    execute: async () => {
      try {
        const prompt = syncTry(() => promptManager.get());
        const updatedPrompt = await editor({
          message: "Edit prompt?",
          postfix: "md",
          default: prompt.unwrapOr(""),
        });
        promptManager.add(updatedPrompt);
      } catch (error) {
        terminal.error(`Error updating prompt: ${(error as Error).message}`);
      }
    },
  } satisfies ReplCommand;
};
