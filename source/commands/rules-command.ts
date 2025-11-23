import { config } from "../config.ts";
import { editor } from "../terminal/editor-prompt.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const rulesCommand = ({ terminal }: CommandOptions): ReplCommand => {
  return {
    command: "/rules",
    description:
      "View, add, or edit rules. Usage: /rules [view|add <text>|edit]",

    getSubCommands: () => Promise.resolve(["view", "add", "edit"]),
    execute: async (args: string[]): Promise<"break" | "continue" | "use"> => {
      const subCommand = args[0] ?? "view"; // Default to 'view'
      const commandArgs = args.slice(1).join(" ");

      try {
        switch (subCommand) {
          case "view": {
            const currentContent = await config.readAgentsFile();
            if (currentContent) {
              terminal.writeln("--- Current Rules ---");
              terminal.writeln(currentContent);
              terminal.writeln("---------------------");
            } else {
              terminal.writeln(
                "No rules defined yet. Use '/rules add' or '/rules edit'.",
              );
            }
            break;
          }

          case "add": {
            const newMemory = commandArgs.trim();
            if (!newMemory) {
              terminal.error("Error: Memory text cannot be empty for 'add'.");
              terminal.writeln("Usage: /memory add <new memory text>");
              return "continue";
            }
            const currentContent = await config.readAgentsFile();
            const updatedContent = currentContent
              ? `${currentContent.trim()}\n- ${newMemory}` // Ensure space after dash
              : `- ${newMemory}`; // Start with dash if new file
            await config.writeAgentsFile(updatedContent);
            break;
          }

          case "edit": {
            const currentContent = await config.readAgentsFile();
            const updatedContent = await editor({
              message: "Edit rules:",
              postfix: "md",
              default: currentContent,
              skipPrompt: true,
            });
            // Check if the user cancelled the edit (editor returns the original content)
            // Or if the content is actually different
            if (updatedContent !== currentContent) {
              await config.writeAgentsFile(updatedContent);
            } else {
              terminal.writeln("Edit cancelled or no changes made.");
            }
            break;
          }

          default:
            terminal.writeln(
              "Invalid subcommand. Usage: /rules [view|add <text>|edit]",
            );
            break;
        }
        return "continue";
      } catch (_error) {
        // Errors from read/write helpers are already logged
        terminal.error("Failed to execute memory command.");
        return "continue";
      }
    },
    async handle(
      args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const subCommand = args[0] ?? "view"; // Default to 'view'
      const commandArgs = args.slice(1).join(" ");

      try {
        switch (subCommand) {
          case "view": {
            const currentContent = await config.readAgentsFile();
            if (currentContent) {
              container.addChild(new Text("--- Current Rules ---", 0, 1));
              container.addChild(new Text(currentContent, 2, 0));
              container.addChild(new Text("---------------------", 3, 0));
            } else {
              container.addChild(
                new Text(
                  style.yellow(
                    "No rules defined yet. Use '/rules add' or '/rules edit'.",
                  ),
                  1,
                  0,
                ),
              );
            }
            break;
          }

          case "add": {
            const newMemory = commandArgs.trim();
            if (!newMemory) {
              container.addChild(
                new Text(
                  style.red("Error: Memory text cannot be empty for 'add'."),
                  1,
                  0,
                ),
              );
              container.addChild(
                new Text("Usage: /memory add <new memory text>", 2, 0),
              );
              tui.requestRender();
              editor.setText("");
              return "continue";
            }
            const currentContent = await config.readAgentsFile();
            const updatedContent = currentContent
              ? `${currentContent.trim()}\n- ${newMemory}` // Ensure space after dash
              : `- ${newMemory}`; // Start with dash if new file
            await config.writeAgentsFile(updatedContent);
            container.addChild(
              new Text(style.green("Rule added successfully"), 0, 1),
            );
            break;
          }

          case "edit": {
            const currentContent = await config.readAgentsFile();
            // For TUI mode, we can't use the editor prompt, so we'll just show current content
            if (currentContent) {
              container.addChild(new Text("Current rules:", 0, 1));
              container.addChild(new Text(currentContent, 2, 0));
              container.addChild(
                new Text(
                  style.dim("Note: Rule editing not available in TUI mode"),
                  3,
                  0,
                ),
              );
            } else {
              container.addChild(
                new Text(
                  style.yellow(
                    "No rules defined yet. Use '/rules add' or '/rules edit'.",
                  ),
                  1,
                  0,
                ),
              );
            }
            break;
          }

          default:
            container.addChild(
              new Text(
                style.red(
                  "Invalid subcommand. Usage: /rules [view|add <text>|edit]",
                ),
                1,
                0,
              ),
            );
            break;
        }

        tui.requestRender();
        editor.setText("");
        return "continue";
      } catch (_error) {
        // Errors from read/write helpers are already logged
        container.addChild(
          new Text(style.red("Failed to execute memory command."), 0, 1),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
    },
  };
};
