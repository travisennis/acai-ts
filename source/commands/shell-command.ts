import { initExecutionEnvironment } from "../execution/index.ts";
import { input } from "../terminal/input-prompt.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 1.5 * 60 * 1000; // 1.5 minutes

export const shellCommand = (options: CommandOptions): ReplCommand => {
  const { terminal, promptManager, tokenCounter } = options;

  return {
    command: "/shell",
    aliases: ["/sh"],
    description: "Run a non-interactive shell command on the local machine.",

    getSubCommands: () => Promise.resolve([]),
    execute: async (args: string[]): Promise<"break" | "continue" | "use"> => {
      const commandStr = args.join(" ");
      if (!commandStr.trim()) {
        terminal.error("Provide a non-empty command.");
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

      terminal.lineBreak();
      terminal.writeln(
        style.gray(`Exit code: ${exitCode}, Duration: ${duration}ms`),
      );

      terminal.writeln(output);

      // Prompt for context addition
      const message =
        "Would you like to add this output to the prompt context for AI reference? [y/N]";
      const userChoice = await input({
        message,
        validate: (input: string) => {
          const normalized = input.toLowerCase().trim();
          if (normalized === "y" || normalized === "n" || normalized === "") {
            return true;
          }
          return "Please enter 'y' for yes or 'n' for no";
        },
        default: "N",
      });
      if (userChoice.toLowerCase() === "y") {
        const tokenCount = tokenCounter.count(output);
        promptManager.addContext(output);
        terminal.success(
          `Output added to prompt context. (${tokenCount} tokens)`,
        );
      }
      return "continue";
    },
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
          new Text(style.red("Provide a non-empty command."), 1, 0),
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

      container.addChild(
        new Text(
          style.gray(`Exit code: ${exitCode}, Duration: ${duration}ms`),
          1,
          0,
        ),
      );
      container.addChild(new Text(output, 2, 0));

      // For TUI mode, we'll automatically add the output to context
      const tokenCount = tokenCounter.count(output);
      promptManager.addContext(output);
      container.addChild(
        new Text(
          style.green(`Output added to prompt context. (${tokenCount} tokens)`),
          3,
          0,
        ),
      );

      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
};
