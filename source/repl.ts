import { isDefined, isRecord } from "@travisennis/stdlib/typeguards";
import type { AsyncReturnType } from "@travisennis/stdlib/types";
import {
  NoSuchToolError,
  type ToolCallRepairFunction,
  generateObject,
  streamText,
} from "ai";
import chalk, { type ChalkInstance } from "chalk";
import type { CommandManager } from "./commands/manager.ts";
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";
import type { MessageHistory } from "./messages.ts";
import { AiConfig } from "./models/ai-config.ts";
import type { ModelManager } from "./models/manager.js";
import { systemPrompt } from "./prompts.ts";
import type { PromptManager } from "./prompts/manager.ts";
import { ReplPrompt } from "./repl-prompt.ts";
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

    let contextWindow = 0;
    while (true) {
      const langModel = modelManager.getModel("repl");
      const modelConfig = modelManager.getModelMetadata("repl");

      terminal.writeln(chalk.dim(langModel.modelId));
      terminal.displayProgressBar(contextWindow, modelConfig.contextWindow);

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
            ? toolCallRepair(modelManager)
            : undefined,
          abortSignal: signal,
          onFinish: async (result) => {
            if (result.response.messages.length > 0) {
              messageHistory.appendResponseMessages(result.response.messages);
            }

            terminal.lineBreak();
            terminal.hr(chalk.dim);

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
            for (const step of result.steps) {
              if (step.stepType === "tool-result") {
                for (const toolResult of step.toolResults) {
                  const toolName = toolResult.toolName;
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

            if (toolsCalled.length > 0) {
              terminal.writeln(chalk.dim("Tools:"));
              for (const toolCalled of toolsCalled) {
                const colorFn = toolColors.get(toolCalled) ?? chalk.white;
                terminal.write(colorFn("█"));
              }
              terminal.lineBreak();

              terminal.write(" ");
              for (const [index, toolCalled] of Array.from(
                new Set(toolsCalled),
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

            const tokenSummary = `Tokens: ↑ ${result.usage.promptTokens} ↓ ${result.usage.completionTokens}`;
            terminal.writeln(chalk.dim(tokenSummary));

            contextWindow = result.usage.totalTokens;

            tokenTracker.trackUsage("repl", result.usage);

            terminal.hr(chalk.dim);
          },
          onError: ({ error }) => {
            terminal.error(JSON.stringify(error, null, 2));
          },
        });

        terminal.lineBreak();
        let lastType: "reasoning" | "text-delta" | null = null;
        for await (const chunk of result.fullStream) {
          // Handle text-related chunks (reasoning or text-delta)
          if (chunk.type === "reasoning" || chunk.type === "text-delta") {
            if (lastType !== "reasoning" && chunk.type === "reasoning") {
              terminal.write(chalk.gray("\n<think>\n"));
            } else if (lastType === "reasoning" && chunk.type !== "reasoning") {
              terminal.write(chalk.gray("\n</think>\n\n"));
            }
            terminal.write(
              chunk.type === "reasoning"
                ? chalk.gray(chunk.textDelta)
                : chunk.textDelta,
            );
            lastType = chunk.type;
          }
          // Close thinking tags when moving from reasoning to any other chunk type
          else if (lastType === "reasoning") {
            terminal.write(chalk.gray("\n</think>\n\n"));
            lastType = null;
          }
        }
        if (lastType === "reasoning") {
          terminal.write(chalk.gray("\n</think>\n\n"));
        }

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

const toolCallRepair = (modelManager: ModelManager) => {
  const fn: ToolCallRepairFunction<AsyncReturnType<typeof initTools>> = async ({
    toolCall,
    tools,
    parameterSchema,
    error,
  }) => {
    if (NoSuchToolError.isInstance(error)) {
      return null; // do not attempt to fix invalid tool names
    }

    console.error("Attempting to repair tool call.");

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
