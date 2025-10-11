import { syncTry } from "@travisennis/stdlib/try";
import { editor } from "../terminal/editor-prompt.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const editPromptCommand = ({
  terminal,
  promptManager,
  promptHistory,
}: CommandOptions): ReplCommand => {
  return {
    command: "/edit-prompt",
    description:
      "Edit the prompt. Accepts optional arguments as initial content.",
    getSubCommands: () => Promise.resolve([]),
    execute: async (args: string[] = []) => {
      try {
        const prompt = syncTry(() => promptManager.get());
        const initialContent =
          args.length > 0 ? args.join(" ") : prompt.unwrapOr("");
        const updatedPrompt = await editor({
          message: " Edit prompt?",
          postfix: "md",
          default: initialContent,
          skipPrompt: true,
        });

        if (updatedPrompt.trim().length === 0) {
          throw new Error("Prompt was empty.");
        }

        terminal.writeln(`> ${updatedPrompt}`);

        promptManager.set(updatedPrompt);

        // Add the edited prompt to history
        promptHistory.push(updatedPrompt);
      } catch (error) {
        terminal.error(`Error editing prompt: ${(error as Error).message}`);
        return "continue";
      }
      return "use";
    },
  };
};
