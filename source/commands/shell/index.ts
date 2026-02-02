import { initExecutionEnvironment } from "../../execution/index.ts";
import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import { Loader, SelectList, Spacer, Text } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 1.5 * 60 * 1000; // 1.5 minutes

export const shellCommand = (options: CommandOptions): ReplCommand => {
  const { promptManager, tokenCounter } = options;

  return {
    command: "/shell",
    aliases: ["/sh"],
    description: "Run a non-interactive shell command on the local machine.",

    getSubCommands: () => Promise.resolve([]),

    async handle(
      args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const commandStr = args.join(" ");
      if (!commandStr.trim()) {
        container.addChild(
          new Text(style.red("Provide a non-empty command."), 0, 1),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      const execEnv = await initExecutionEnvironment();

      const colorEnv: Record<string, string> = {
        ["FORCE_COLOR"]: "1",
        ["CLICOLOR"]: "1",
        ["CLICOLOR_FORCE"]: "1",
        ["TERM"]: process.env["TERM"] ?? "xterm-256color",
        ["COLORTERM"]: process.env["COLORTERM"] ?? "truecolor",
        ["npm_config_color"]: "true",
      };

      // Show loader before execution
      const truncatedCommand =
        commandStr.length > 50
          ? `${commandStr.substring(0, 50)}...`
          : commandStr;
      const loader = new Loader(tui, `Running: ${truncatedCommand}`);
      container.addChild(loader);
      tui.requestRender();

      const { output, exitCode, duration } = await execEnv.executeCommand(
        commandStr,
        {
          cwd: process.cwd(),
          timeout: DEFAULT_TIMEOUT,
          preserveOutputOnError: true,
          captureStderr: true,
          throwOnError: false,
          env: colorEnv,
        },
      );

      // Cleanup loader
      loader.stop();
      container.removeChild(loader);

      // Display results with spacing
      container.addChild(new Spacer(1));
      container.addChild(
        new Text(
          style.gray(`Exit code: ${exitCode}, Duration: ${duration}ms`),
          1,
          0,
        ),
      );
      container.addChild(new Spacer(1));
      container.addChild(new Text(output, 2, 0));

      // Create context selection component
      const contextSelector = new SelectList([
        {
          value: "yes",
          label: "Yes",
          description: "Add output to prompt context",
        },
        {
          value: "no",
          label: "No",
          description: "Do not add output to context",
        },
      ]);

      contextSelector.onSelect = (item) => {
        if (item.value === "yes") {
          const tokenCount = tokenCounter.count(output);
          promptManager.addContext(output);
          container.addChild(
            new Text(
              style.green(
                `Output added to prompt context. (${tokenCount} tokens)`,
              ),
              3,
              0,
            ),
          );
        } else {
          container.addChild(
            new Text(style.gray("Output not added to context."), 3, 0),
          );
        }

        // Remove the selector and show final result
        container.removeChild(contextSelector);
        tui.setFocus(editor);
        tui.requestRender();
        editor.setText("");
      };

      contextSelector.onCancel = () => {
        // User cancelled - default to not adding to context
        container.addChild(
          new Text(style.gray("Output not added to context."), 3, 0),
        );
        container.removeChild(contextSelector);
        tui.setFocus(editor);
        tui.requestRender();
        editor.setText("");
      };

      // Add the selector to the container
      container.addChild(contextSelector);
      tui.setFocus(contextSelector);
      tui.requestRender();

      return "continue";
    },
  };
};
