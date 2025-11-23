import { syncTry } from "@travisennis/stdlib/try";
import { editor } from "../terminal/editor-prompt.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
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
    async handle(
      args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      try {
        const prompt = syncTry(() => promptManager.get());
        const initialContent =
          args.length > 0 ? args.join(" ") : prompt.unwrapOr("");

        // For TUI mode, we can't use the editor prompt, so we'll just set the prompt
        if (initialContent.trim().length === 0) {
          container.addChild(
            new Text(style.red("Prompt cannot be empty"), 0, 1),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }

        promptManager.set(initialContent);

        // Add the edited prompt to history
        promptHistory.push(initialContent);

        container.addChild(
          new Text(`Prompt set to: ${style.blue(initialContent)}`, 0, 1),
        );
        tui.requestRender();
        editor.setText("");
      } catch (error) {
        container.addChild(
          new Text(
            style.red(`Error editing prompt: ${(error as Error).message}`),
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
      return "use";
    },
  };
};
