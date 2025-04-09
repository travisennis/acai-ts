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
    result: "use" as const,
    getSubCommands: () => [],
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
      }
    },
  } satisfies ReplCommand;
};
