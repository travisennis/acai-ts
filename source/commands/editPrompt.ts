import { editor } from "@inquirer/prompts";
import type { CommandOptions, ReplCommand } from "./types.ts";

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
        const prompt = promptManager.get();
        const updatedPrompt = await editor({
          message: "Edit prompt?",
          postfix: "md",
          default: prompt,
        });
        promptManager.add(updatedPrompt);
      } catch (error) {
        terminal.error(`Error updating prompt: ${(error as Error).message}`);
      }
    },
  } satisfies ReplCommand;
};
