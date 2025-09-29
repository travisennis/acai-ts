import { syncTry } from "@travisennis/stdlib/try";
import { editor } from "../terminal/editor-prompt.ts";
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
          skipPrompt: true,
        });

        if (updatedPrompt.trim().length === 0) {
          throw new Error("Prompt was empty.");
        }

        terminal.writeln(`> ${updatedPrompt}`);

        promptManager.set(updatedPrompt);
      } catch (error) {
        terminal.error(`Error editing prompt: ${(error as Error).message}`);
        return "continue";
      }
      return "use";
    },
  };
};
