import { editor } from "@inquirer/prompts";
import { syncTry } from "@travisennis/stdlib/try";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const editPromptCommand = ({
  terminal,
  promptManager,
}: CommandOptions): ReplCommand => {
  return {
    command: "/edit-prompt",
    description: "Edit the prompt.",
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      try {
        const prompt = syncTry(() => promptManager.get());
        const updatedPrompt = await editor({
          message: " Edit prompt?",
          postfix: "md",
          default: prompt.unwrapOr(""),
        });

        terminal.writeln(`> ${updatedPrompt}`);

        promptManager.set(updatedPrompt);
      } catch (error) {
        terminal.error(`Error updating prompt: ${(error as Error).message}`);
        return "continue";
      }
      return "use";
    },
  };
};
