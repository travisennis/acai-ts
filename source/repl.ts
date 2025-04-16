import { isDefined, isRecord } from "@travisennis/stdlib/typeguards";
import type { AsyncReturnType } from "@travisennis/stdlib/types";
import {
  NoSuchToolError,
  type ToolCallRepairFunction,
  generateObject,
  streamText,
} from "ai";
import chalk, { type ChalkInstance } from "chalk";
import logUpdate from "log-update";
import type { CommandManager } from "./commands/manager.ts";
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";
import type { MessageHistory } from "./messages.ts";
import { AiConfig } from "./models/ai-config.ts";
import type { ModelManager } from "./models/manager.js";
import { systemPrompt } from "./prompts.ts";
import type { PromptManager } from "./prompts/manager.ts";
import { ReplPrompt } from "./repl-prompt.ts";
import { formatOutput } from "./terminal/formatting.ts";
import type { Terminal } from "./terminal/index.ts";
import type { TokenTracker } from "./token-tracker.ts";
import {
  getDiffStat,
  initAnthropicTools,
  initCodingTools,
  initTools,
} from "./tools/index.ts";

export interface ReplOptions {
  messageHistory: MessageHistory;
  promptManager: PromptManager;
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  terminal: Terminal;
  commands: CommandManager;
  config: Record<PropertyKey, unknown>;
}

const abortController = new AbortController();
const { signal } = abortController;

// Handle Ctrl+C (SIGINT)
process.on("SIGINT", () => {
  abortController.abort();
});

export class Repl {
  private options: ReplOptions;
  constructor(options: ReplOptions) {
    this.options = options;
  }

  async run({
    args,
  }: {
    args: Flags;
  }) {
    const {
      config,
      promptManager,
      terminal,
      modelManager,
      tokenTracker,
      messageHistory,
      commands,
    } = this.options;

    logger.info(config, "Config:");

    terminal.displayWelcome();

    const promptHistory: string[] = [];

    let currentContextWindow = 0;
    messageHistory.on("clear-history", () => {
      currentContextWindow = 0;
    });

    while (true) {
      const langModel = modelManager.getModel("repl");
      const modelConfig = modelManager.getModelMetadata("repl");

      terminal.writeln(chalk.dim(langModel.modelId));
      terminal.displayProgressBar(
        currentContextWindow,
        modelConfig.contextWindow,
      );

      if (!promptManager.isPending()) {
        // For interactive input
        const prompt = new ReplPrompt({ commands, history: promptHistory });
        const userInput = await prompt.input();
        prompt.close();

        // see if the userInput contains a command
        const commandResult = await commands.handle({ userInput });
        if (commandResult.break) {
          break;
        }
        if (commandResult.continue) {
          continue;
        }

        if (!userInput.trim()) {
          continue;
        }

        // if there is no pending prompt then use the user's input. otherwise, the prompt was loaded from a command
        if (!promptManager.isPending()) {
          promptManager.set(userInput);
        }
      }

      // flag to see if the user prompt has added context
      const hasAddedContext = promptManager.hasContext();

      if (hasAddedContext) {
        terminal.lineBreak();
        terminal.info("Context will be added to prompt.");
      }

      const userPrompt = promptManager.get();

      const userMsg = promptManager.getUserMessage();

      messageHistory.appendUserMessage(userMsg);

      const finalSystemPrompt = await systemPrompt({
        supportsToolCalling: modelConfig.supportsToolCalling,
      });

      const aiConfig = new AiConfig({
        modelMetadata: modelConfig,
        prompt: userPrompt,
      });

      const maxTokens = aiConfig.getMaxTokens();

      const baseTools = modelConfig.supportsToolCalling
        ? await initTools({ terminal })
        : undefined;

      const codingTools = modelConfig.supportsToolCalling
        ? initCodingTools({ modelManager, tokenTracker, terminal })
        : undefined;

      const providerTools =
        modelConfig.supportsToolCalling &&
        modelConfig.id.includes("sonnet-invalid") // do this for now to remove this tool from the mix
          ? initAnthropicTools({ model: langModel, terminal })
          : undefined;

      const tools =
        isDefined(baseTools) &&
        isDefined(codingTools) &&
        isDefined(providerTools)
          ? Object.assign(baseTools, Object.assign(codingTools, providerTools))
          : isDefined(baseTools) && isDefined(codingTools)
            ? Object.assign(baseTools, codingTools)
            : undefined;

      try {
        const result = streamText({
          model: langModel,
          maxTokens,
          messages: [
            {
              role: "system",
              content: finalSystemPrompt,
              providerOptions: {
                anthropic: { cacheControl: { type: "ephemeral" } },
              },
            },
            ...messageHistory.get(),
          ],
          temperature: modelConfig.defaultTemperature,
          maxSteps: 30,
          maxRetries: 5,
          providerOptions: aiConfig.getProviderOptions(),
          tools,
          // biome-ignore lint/style/useNamingConvention: <explanation>
          experimental_repairToolCall: modelConfig.supportsToolCalling
            ? toolCallRepair(modelManager, terminal)
            : undefined,
          abortSignal: signal,
          onFinish: async (result) => {
            if (result.response.messages.length > 0) {
              messageHistory.appendResponseMessages(result.response.messages);
            }

            terminal.lineBreak();
            terminal.hr(chalk.dim);

            terminal.writeln(chalk.dim(`Steps: ${result.steps.length}`));

            // Create a more visual representation of steps
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
            logger.debug(
              { steps: result.steps.length },
              "Processing steps in onFinish",
            );
            for (const step of result.steps) {
              logger.debug({ stepType: step.stepType }, "Processing step");
              if (step.stepType === "tool-result") {
                for (const toolResult of step.toolResults) {
                  const toolName = toolResult.toolName;
                  logger.debug({ toolName }, "Adding tool to toolsCalled list");
                  if (!toolColors.has(toolName)) {
                    const availableColors = chalkColors.filter(
                      (color) =>
                        !Array.from(toolColors.values()).some(
                          (c) => c === chalk[color],
                        ),
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
            }
            logger.debug(
              { toolsCalled: toolsCalled.length },
              "Final toolsCalled list before display",
            );

            if (toolsCalled.length > 0) {
              terminal.writeln(chalk.dim("Tools:"));
              for (const toolCalled of toolsCalled) {
                const colorFn = toolColors.get(toolCalled) ?? chalk.white;
                terminal.write(colorFn("██"));
              }
              terminal.lineBreak();

              const uniqueTools = new Set(toolsCalled);
              logger.debug(
                { uniqueTools: Array.from(uniqueTools) },
                "Unique tools to display",
              );
              for (const [index, toolCalled] of Array.from(
                uniqueTools,
              ).entries()) {
                const colorFn = toolColors.get(toolCalled) ?? chalk.white;
                terminal.write(colorFn(toolCalled));
                if (index < new Set(toolsCalled).size - 1) {
                  terminal.write(" - ");
                }
              }
              terminal.lineBreak();
              terminal.lineBreak();
            }

            const stats = await getDiffStat();
            terminal.writeln(
              `${chalk.dim("Files changed:")} ${chalk.yellow(stats.filesChanged)} ` +
                `${chalk.green(`+${stats.insertions}`)} ` +
                `${chalk.red(`-${stats.deletions}`)}`,
            );

            const tokenSummary = `Tokens: ↑ ${result.usage.promptTokens ?? 0} ↓ ${result.usage.completionTokens ?? 0}`;
            terminal.writeln(chalk.dim(tokenSummary));

            // this tracks the usage of every step in the call to streamText. it's a cumulative usage.
            tokenTracker.trackUsage("repl", result.usage);

            // this gets the usage of the final step. This more accurately reflex what will be in the context window in the next loop
            for (const step of result.steps) {
              if (step.finishReason === "stop") {
                const usage = step.usage;
                currentContextWindow = Number.isNaN(usage.totalTokens) ? 0 : usage.totalTokens ?? 0;
              }
            }

            if (currentContextWindow > 70000) {
              await messageHistory.summarizeAndReset();
              logger.info(
                `Condensing history from ${currentContextWindow} to 0 (not true)`,
              );
            }

            terminal.hr(chalk.dim);
          },
          onError: ({ error }) => {
            logger.error(error, "Error on REPL streamText");
            terminal.error(
              (error as Error).message.length > 100
                ? `${(error as Error).message.slice(0, 100)}...`
                : (error as Error).message,
            );
          },
        });

        terminal.lineBreak();
        let accumulatedText = "";
        let lastType: "reasoning" | "text-delta" | null = null;

        for await (const chunk of result.fullStream) {
          // Handle text-related chunks (reasoning or text-delta)
          if (chunk.type === "reasoning" || chunk.type === "text-delta") {
            if (chunk.type === "reasoning") {
              if (lastType !== "reasoning") {
                // Starting reasoning: Clear log-update, print accumulated text if any, print <think>
                logUpdate.clear();
                if (accumulatedText) {
                  terminal.write(await formatOutput(accumulatedText)); // Write final state before think
                  terminal.lineBreak(); // Ensure newline after formatted text
                }
                terminal.write(chalk.gray("<think>\n"));
              }
              terminal.write(chalk.gray(chunk.textDelta)); // Stream reasoning directly
              lastType = "reasoning";
            } else if (chunk.type === "text-delta") {
              if (lastType === "reasoning") {
                // Finishing reasoning: Print </think>, then update log-update with accumulated text
                terminal.write(chalk.gray("\n</think>\n\n"));
              }
              accumulatedText += chunk.textDelta;
              logUpdate(await formatOutput(accumulatedText)); // Update the display with formatted text
              lastType = "text-delta";
            }
            // Handle other chunk types or transitions if needed
            else if (lastType === "reasoning") {
              // If we transition from reasoning to something else (e.g., tool call), close the tag.
              terminal.write(chalk.gray("\n</think>\n\n"));
              logUpdate(await formatOutput(accumulatedText)); // Redraw accumulated text
              lastType = null;
            }
          }
          // Close thinking tags when moving from reasoning to any other chunk type
          else if (lastType === "reasoning") {
            terminal.write(chalk.gray("\n</think>\n\n"));
            lastType = null;
          } else {
            // it's not reasoning or text then we are dealing with tool calls within the stream
            logUpdate.done();
          }
        }
        // Ensure the final closing tag for reasoning is written if it was the last type
        if (lastType === "reasoning") {
          terminal.write(chalk.gray("\n</think>\n\n"));
        } else {
          // If the stream ended with text-delta, ensure log-update is finalized
          logUpdate.done();
        }
        terminal.lineBreak(); // Add a final newline for clarity

        result.consumeStream();

        // Only exit if explicitly requested by oneshot flag
        if (args.oneshot === true) {
          return;
        }
      } catch (e) {
        if (isRecord(e) && isRecord(e["data"]) && "error" in e["data"]) {
          terminal.error(
            (e["data"]["error"] as Record<"message", string>).message,
          );
        } else {
          terminal.error(
            (e as Error).message.length > 100
              ? `${(e as Error).message.slice(0, 100)}...`
              : (e as Error).message,
          );
        }
        terminal.lineBreak();
        if (e instanceof Error) {
          logger.error(e);
        } else {
          logger.error(JSON.stringify(e, null, 2));
        }
      }
    }
  }
}

const toolCallRepair = (modelManager: ModelManager, terminal: Terminal) => {
  const fn: ToolCallRepairFunction<AsyncReturnType<typeof initTools>> = async ({
    toolCall,
    tools,
    parameterSchema,
    error,
  }) => {
    if (NoSuchToolError.isInstance(error)) {
      return null; // do not attempt to fix invalid tool names
    }

    terminal.lineBreak();
    terminal.warn("Attempting to repair tool call.");

    const tool = tools[toolCall.toolName as keyof typeof tools];

    try {
      const { object: repairedArgs } = await generateObject({
        model: modelManager.getModel("tool-repair"),
        schema: tool.parameters,
        prompt: [
          `The model tried to call the tool "${toolCall.toolName}" with the following arguments:`,
          JSON.stringify(toolCall.args),
          "The tool accepts the following schema:",
          JSON.stringify(parameterSchema(toolCall)),
          "Please fix the arguments.",
        ].join("\n"),
      });

      return { ...toolCall, args: JSON.stringify(repairedArgs) };
    } catch (err) {
      logger.error(err, "Failed to repair tool call.");
      return null;
    }
  };
  return fn;
};
