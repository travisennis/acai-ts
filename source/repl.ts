import { isNumber, isRecord } from "@travisennis/stdlib/typeguards";
import type { AsyncReturnType } from "@travisennis/stdlib/types";
import {
  generateObject,
  NoSuchToolError,
  type StepResult,
  streamText,
  type ToolCallRepairFunction,
  type ToolSet,
} from "ai";
import chalk, { type ChalkInstance } from "chalk";
import type z from "zod";
import type { CommandManager } from "./commands/manager.ts";
import { config as configManager } from "./config.ts";
import { logger } from "./logger.ts";
import { processPrompt } from "./mentions.ts";
import type { MessageHistory } from "./messages.ts";
import { AiConfig } from "./models/ai-config.ts";
import type { ModelManager } from "./models/manager.js";
import type { PromptManager } from "./prompts/manager.ts";
import { systemPrompt } from "./prompts.ts";
import { ReplPrompt } from "./repl-prompt.ts";
import type { Terminal } from "./terminal/index.ts";
import { isMarkdown } from "./terminal/markdown-utils.ts";
import type { TokenTracker } from "./token-tracker.ts";
import type { TokenCounter } from "./token-utils.ts";
import { getDiffStat, inGitDirectory } from "./tools/git.ts"; // Modified import
import { initAgents, initTools } from "./tools/index.ts";
import type { Message } from "./tools/types.ts";

interface ReplOptions {
  messageHistory: MessageHistory;
  promptManager: PromptManager;
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  terminal: Terminal;
  commands: CommandManager;
  config: Record<PropertyKey, unknown>;
  tokenCounter: TokenCounter;
  toolEvents: Map<string, Message[]>;
}

type CompleteToolSet = AsyncReturnType<typeof initTools> &
  AsyncReturnType<typeof initAgents>;

type OnFinishResult<Tools extends ToolSet = CompleteToolSet> = Omit<
  StepResult<Tools>,
  "stepType" | "isContinued"
> & {
  /**
Details for all steps.
   */
  readonly steps: StepResult<Tools>[];
};

export class Repl {
  private options: ReplOptions;
  constructor(options: ReplOptions) {
    this.options = options;
  }

  async run() {
    const {
      config,
      promptManager,
      terminal,
      modelManager,
      tokenTracker,
      messageHistory,
      commands,
      tokenCounter,
      toolEvents,
    } = this.options;

    logger.info(config, "Config:");

    terminal.displayWelcome();

    const promptHistory: string[] = [];

    let currentContextWindow = 0;
    messageHistory.on("clear-history", () => {
      currentContextWindow = 0;
    });

    let prevCb: (() => void) | null = null;

    while (true) {
      const abortController = new AbortController();
      const { signal } = abortController;

      const cb = () => {
        abortController.abort();
      };

      if (prevCb) {
        process.removeListener("SIGINT", prevCb);
      }

      // Handle Ctrl+C (SIGINT)
      process.on("SIGINT", cb);
      prevCb = cb;

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
          terminal.lineBreak();
          continue;
        }

        if (!userInput.trim()) {
          continue;
        }

        // if there is no pending prompt then use the user's input. otherwise, the prompt was loaded from a command
        if (!promptManager.isPending()) {
          const processedPrompt = await processPrompt(userInput, {
            baseDir: process.cwd(),
            model: modelConfig,
          });
          for (const context of processedPrompt.context) {
            promptManager.addContext(context);
          }
          promptManager.set(processedPrompt.message);
        }

        terminal.lineBreak();
      }

      // flag to see if the user prompt has added context
      const hasAddedContext = promptManager.hasContext();

      if (hasAddedContext) {
        terminal.info("Context will be added to prompt.");
        terminal.lineBreak();
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

      const tools = modelConfig.supportsToolCalling
        ? {
            ...(await initTools({
              terminal,
              tokenCounter,
              events: toolEvents,
            })),
            ...(await initAgents({
              terminal,
              modelManager,
              tokenTracker,
              tokenCounter,
              events: toolEvents,
            })),
          }
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
          maxSteps: 60,
          maxRetries: 2,
          providerOptions: aiConfig.getProviderOptions(),
          tools,
          // biome-ignore lint/style/useNamingConvention: third-party controlled
          experimental_repairToolCall: modelConfig.supportsToolCalling
            ? toolCallRepair(modelManager, terminal)
            : undefined,
          abortSignal: signal,
          onFinish: async (result) => {
            logger.debug("onFinish called");
            if (result.response.messages.length > 0) {
              messageHistory.appendResponseMessages(result.response.messages);
            }

            terminal.hr();

            // Notify if configured in project config (acai.json)
            const projectConfig = await configManager.readProjectConfig();
            if (projectConfig.notify) {
              terminal.alert();
            }

            // Create a more visual representation of steps/tool usage
            this.displayToolUse(result, terminal);

            if (await inGitDirectory()) {
              // Added check
              const stats = await getDiffStat();
              terminal.writeln(
                `${chalk.dim("Files changed:")} ${chalk.yellow(stats.filesChanged)} ` +
                  `${chalk.green(`+${stats.insertions}`)} ` + // Insertions first (green)
                  `${chalk.red(`-${stats.deletions}`)}`, // Deletions last (red)
              );
            }

            const outgoingTokens = isNumber(result.usage.promptTokens)
              ? result.usage.promptTokens
              : 0;
            const incomingTokens = isNumber(result.usage.completionTokens)
              ? result.usage.completionTokens
              : 0;
            const tokenSummary = `Tokens: ↑ ${outgoingTokens} ↓ ${incomingTokens}`;
            terminal.writeln(chalk.dim(tokenSummary));

            // this tracks the usage of every step in the call to streamText. it's a cumulative usage.
            tokenTracker.trackUsage("repl", result.usage);

            // this gets the usage of the final step. This more accurately reflex what will be in the context window in the next loop
            for (const step of result.steps) {
              if (step.finishReason === "stop") {
                const usage = step.usage;
                currentContextWindow = Number.isNaN(usage.totalTokens)
                  ? 0
                  : (usage.totalTokens ?? 0);
              }
            }

            if (currentContextWindow > 70000) {
              await messageHistory.summarizeAndReset();
              logger.info(
                `Condensing history from ${currentContextWindow} to 0 (not true)`,
              );
            }

            terminal.hr();
          },
          onError: ({ error }) => {
            logger.error(
              error, // Log the full error object
              "Error on REPL streamText",
            );
            terminal.error(
              (error as Error).message.length > 100
                ? `${(error as Error).message.slice(0, 100)}...`
                : (error as Error).message,
            );
          },
        });

        let accumulatedText = "";
        let lastType: "reasoning" | "text-delta" | null = null;

        for await (const chunk of result.fullStream) {
          // Handle text-related chunks (reasoning or text-delta)
          if (chunk.type === "reasoning" || chunk.type === "text-delta") {
            if (chunk.type === "reasoning") {
              if (lastType !== "reasoning") {
                terminal.writeln(chalk.dim("<think>"));
              }
              terminal.write(chalk.dim(chunk.textDelta)); // Stream reasoning directly
              lastType = "reasoning";
            } else if (chunk.type === "text-delta") {
              if (lastType === "reasoning") {
                // Finishing reasoning: Print </think>
                terminal.writeln(chalk.dim("\n</think>\n"));
              }
              accumulatedText += chunk.textDelta;
              lastType = "text-delta";
            }
          } else if (chunk.type === "tool-result") {
            const messages = toolEvents.get(chunk.toolCallId);
            if (messages) {
              displayToolMessages(messages, terminal);
              toolEvents.delete(chunk.toolCallId);
            } else {
              logger.warn(`No tool events found for ${chunk.toolCallId}`);
            }
          } else {
            // Close thinking tags when moving from reasoning to any other chunk type
            if (lastType === "reasoning") {
              terminal.write(chalk.dim("\n</think>\n\n"));
            }
            // if there is accumulatedText, display it
            if (accumulatedText) {
              terminal.writeln(`${chalk.blue.bold("●")} Response:`);
              terminal.display(accumulatedText, true);
              terminal.lineBreak();
            }
            accumulatedText = "";
            lastType = null;
          }
        }

        // Ensure the final closing tag for reasoning is written if it was the last type
        if (lastType === "reasoning") {
          terminal.write(chalk.gray("\n</think>\n\n"));
        }

        // if there is accumulatedText, display it
        if (accumulatedText) {
          terminal.writeln(`${chalk.green.bold("●")} Response:`);
          terminal.display(accumulatedText, true);
          terminal.lineBreak();
        }

        terminal.lineBreak(); // Add a final newline for clarity

        await result.consumeStream();
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

  private displayToolUse(result: OnFinishResult, terminal: Terminal) {
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

      if (step.stepType === "tool-result" && step.toolResults) {
        currentToolCalls = step.toolResults;
      } else if (step.stepType === "initial" && step.toolCalls) {
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
}

function displayToolMessages(messages: Message[], terminal: Terminal) {
  const isError = messages[messages.length - 1]?.event === "tool-error";
  const indicator = isError ? chalk.red.bold("●") : chalk.blue.bold("●");
  const initMessage =
    messages.find((m) => m.event === "tool-init")?.data ?? "Tool Execution";

  terminal.write(`${indicator} `); // Write indicator without newline (sync)
  terminal.display(initMessage); // Display initial message (async)

  for (const msg of messages) {
    switch (msg.event) {
      case "tool-update":
        _handleToolUpdateMessage(msg.data, terminal);
        break;
      case "tool-completion":
        _handleToolCompletionMessage(msg.data, terminal);
        break;
      case "tool-error":
        _handleToolErrorMessage(msg.data, terminal);
        break;
      // 'tool-init' is handled before the loop, so no case needed here.
      default:
        // Optional: Log an unexpected event type for debugging, or do nothing.
        logger.debug(`Unhandled tool message event: ${msg.event}`);
        break;
    }
  }
  terminal.lineBreak();
}

// Helper function to handle tool update messages
function _handleToolUpdateMessage(
  data: { primary: string; secondary?: string[] },
  terminal: Terminal,
) {
  if (data.secondary && data.secondary.length > 0) {
    terminal.display(`└── ${data.primary}`);
    const content = data.secondary.join("\n");
    if (isMarkdown(content)) {
      terminal.display(content, true);
    } else {
      terminal.write(chalk.green(content));
      terminal.lineBreak();
    }
  } else {
    terminal.display(`└── ${data.primary}`);
  }
}

// Helper function to handle tool completion messages
function _handleToolCompletionMessage(data: string, terminal: Terminal) {
  terminal.display(`└── ${data}`);
}

// Helper function to handle tool error messages
function _handleToolErrorMessage(data: string, terminal: Terminal) {
  terminal.write("└── ");
  terminal.error(data);
}

const toolCallRepair = (modelManager: ModelManager, terminal: Terminal) => {
  const fn: ToolCallRepairFunction<CompleteToolSet> = async ({
    toolCall,
    tools,
    parameterSchema,
    error,
  }) => {
    if (NoSuchToolError.isInstance(error)) {
      return null; // do not attempt to fix invalid tool names
    }

    terminal.warn(`Attempting to repair tool call: ${toolCall.toolName}.`);
    terminal.lineBreak();

    const tool = tools[toolCall.toolName as keyof typeof tools];

    try {
      const { object: repairedArgs } = await generateObject({
        model: modelManager.getModel("tool-repair"),
        schema: tool.parameters as z.ZodSchema<unknown>,
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
      logger.error(err, `Failed to repair tool call: ${toolCall.toolName}.`);
      return null;
    }
  };
  return fn;
};
