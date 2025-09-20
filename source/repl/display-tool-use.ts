import chalk, { type ChalkInstance } from "../terminal/chalk.ts";
import type { Terminal } from "../terminal/index.ts";

// Minimal shape needed from the onFinish result to render tool usage
interface MinimalStep {
  toolResults: Array<{ toolName: string }>;
  toolCalls: Array<{ toolName: string }>;
}

export function displayToolUse(
  result: { steps: MinimalStep[] },
  terminal: Terminal,
) {
  const toolsCalled: string[] = [];
  const toolColors = new Map<string, ChalkInstance>();

  const chalkColors = [
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "cyan",
    "white",
    "gray",
    "redBright",
    "greenBright",
    "yellowBright",
    "blueBright",
    "magentaBright",
    "cyanBright",
    "whiteBright",
    "blackBright",
  ] as const;

  terminal.writeln(chalk.dim(`Steps: ${result.steps.length}`));

  for (const step of result.steps) {
    let currentToolCalls: Array<{ toolName: string }> = [];

    if (step.toolResults.length > 0) {
      currentToolCalls = step.toolResults;
    } else if (step.toolCalls.length > 0) {
      currentToolCalls = step.toolCalls;
    }

    for (const toolCallOrResult of currentToolCalls) {
      const toolName = toolCallOrResult.toolName;
      if (!toolColors.has(toolName)) {
        const availableColors = chalkColors.filter(
          (color) =>
            !Array.from(toolColors.values()).some((c) => c === chalk[color]),
        );
        const color =
          availableColors.length > 0
            ? (availableColors[
                Math.floor(Math.random() * availableColors.length)
              ] ?? "white")
            : "white";
        toolColors.set(toolName, chalk[color]);
      }
      toolsCalled.push(toolName);
    }
  }

  if (toolsCalled.length > 0) {
    terminal.lineBreak();
    terminal.writeln(chalk.dim("Tools:"));
    for (const toolCalled of toolsCalled) {
      const colorFn = toolColors.get(toolCalled) ?? chalk.white;
      terminal.write(`${colorFn("██")} `);
    }
    terminal.lineBreak();

    const uniqueTools = new Set(toolsCalled);
    for (const [index, toolCalled] of Array.from(uniqueTools).entries()) {
      const colorFn = toolColors.get(toolCalled) ?? chalk.white;
      terminal.write(colorFn(toolCalled));
      if (index < new Set(toolsCalled).size - 1) {
        terminal.write(" - ");
      }
    }
    terminal.lineBreak();
    terminal.lineBreak();
  }
}
