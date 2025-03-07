import path from "node:path";
import { input } from "@inquirer/prompts";
import {
  type MessageHistory,
  ModelConfig,
  type ModelName,
  type TokenTracker,
  createUserMessage,
  getLanguageModel,
  isSupportedModel,
} from "@travisennis/acai-core";
import { envPaths } from "@travisennis/stdlib/env";
import type { AsyncReturnType } from "@travisennis/stdlib/types";
import {
  NoSuchToolError,
  type ToolCallRepairFunction,
  generateObject,
  streamText,
} from "ai";
import chalk from "chalk";
import { readRulesFile } from "./config.ts";
import type { FileManager } from "./fileManager.ts";
import { retrieveFilesForTask } from "./fileRetriever.ts";
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";
import { optimizePrompt } from "./promptOptimizer.ts";
import { systemPrompt } from "./prompts.ts";
import type { ReplCommands } from "./replCommands.ts";
import type { Terminal } from "./terminal/index.ts";
import { initTools } from "./tools.ts";

const THINKING_TIERS = [
  {
    pattern:
      /\b(ultrathink|think super hard|think really hard|think intensely)\b/i,
    budget: 31999,
  },
  {
    pattern: /\b(megathink|think (very )?hard|think (a lot|more|about it))\b/i,
    budget: 10000,
  },
  {
    pattern: /\bthink\b/i, // Catch-all for standalone "think"
    budget: 4000,
  },
];

export interface ReplOptions {
  messageHistory: MessageHistory;
  tokenTracker: TokenTracker;
  terminal: Terminal;
  commands: ReplCommands;
  fileManager: FileManager;
  config: Record<PropertyKey, unknown>;
}

export class Repl {
  private options: ReplOptions;
  constructor(options: ReplOptions) {
    this.options = options;
  }

  async run({
    initialPrompt,
    stdin,
    args,
  }: {
    initialPrompt: string | undefined;
    stdin: string | undefined;
    args: Flags;
  }) {
    const {
      config,
      terminal,
      fileManager,
      tokenTracker,
      messageHistory,
      commands,
    } = this.options;

    logger.info(config, "Config:");

    terminal.displayWelcome();

    const chosenModel: ModelName = isSupportedModel(args.model)
      ? args.model
      : "anthropic:sonnet-token-efficient-tools";

    const modelConfig = ModelConfig[chosenModel];

    const langModel = getLanguageModel({
      model: chosenModel,
      stateDir: envPaths("acai").state,
      app: "repl",
    });

    let firstPrompt =
      args.prompt && args.prompt.length > 0
        ? args.prompt
        : initialPrompt && initialPrompt.length > 0
          ? initialPrompt
          : stdin && stdin.length > 0
            ? stdin
            : "";

    while (true) {
      terminal.box("Model:", langModel.modelId);
      terminal.header("Input:");
      terminal.writeln("");

      let userInput = "";
      if (firstPrompt.length > 0) {
        userInput = firstPrompt;
        firstPrompt = ""; // Clear firstPrompt after using it
      } else {
        // For interactive input
        userInput = await input({ message: ">" });
      }

      // If this is stdin input and oneshot flag is not set, make sure we don't exit after first iteration
      const isStdinInput = stdin && stdin.length > 0 && stdin === userInput;
      const shouldContinue = isStdinInput && !args.oneshot;

      const commandResult = await commands.handle({ userInput });
      if (commandResult.break) {
        break;
      }
      if (commandResult.continue) {
        continue;
      }

      // determine our thinking token budget for this request
      const thinkingBudget = calculateThinkingBudget(userInput);

      // Add any pending file contents to the user input
      let finalPrompt = userInput;
      if (fileManager.hasPendingContent()) {
        finalPrompt = fileManager.getPendingContent() + userInput;
        fileManager.clearPendingContent(); // Clear after using
        terminal.info("\nAdded file contents to prompt");
      }

      // models that can't support toolcalling will be limited, but this step can at least give them some context to answer questions. very early in the development of this.
      if (!modelConfig.supportsToolCalling) {
        terminal.info("Adding files for task:");
        const usefulFiles = await retrieveFilesForTask({
          model: "anthropic:haiku",
          prompt: userInput,
          tokenTracker,
        });

        const absFiles = usefulFiles.map((filePath) => {
          return path.isAbsolute(filePath)
            ? filePath
            : path.join(process.cwd(), "..", filePath);
        });

        fileManager.addFile(...absFiles);

        terminal.header("Reading files:");
        for (const file of absFiles) {
          terminal.writeln(file);
        }

        finalPrompt = fileManager.getPendingContent() + userInput;

        fileManager.clearPendingContent();
      }

      if (!modelConfig.reasoningModel) {
        terminal.writeln("Optimizing prompt:");
        finalPrompt = await optimizePrompt({
          model: "anthropic:sonnet35",
          prompt: finalPrompt,
          tokenTracker,
          terminal,
        });
      }

      // Track if we're using file content in this prompt to set cache control appropriately
      const isUsingFileContent = finalPrompt !== userInput;
      const userMsg = createUserMessage(finalPrompt);
      if (isUsingFileContent && langModel.modelId.includes("claude")) {
        userMsg.providerOptions = {
          anthropic: { cacheControl: { type: "ephemeral" } },
        };
      }
      messageHistory.appendUserMessage(userMsg);

      // Read rules from project directory
      const rules = await readRulesFile();
      const finalSystemPrompt = rules
        ? `${systemPrompt}

Project Rules:
${rules}`
        : systemPrompt;

      try {
        const result = streamText({
          model: langModel,
          maxTokens: Math.max(8096, thinkingBudget * 1.5),
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
          temperature: langModel.modelId.includes("deepseek-reasoner")
            ? 0.6
            : 0.3,
          maxSteps: 30,
          maxRetries: 5,
          providerOptions: langModel.modelId.includes("3-7-sonnet")
            ? {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: thinkingBudget },
                },
              }
            : langModel.modelId.includes("o3")
              ? { openai: { reasoningEffort: "medium" } }
              : {},
          tools: modelConfig.supportsToolCalling
            ? await initTools({ terminal })
            : undefined,
          // biome-ignore lint/style/useNamingConvention: <explanation>
          experimental_repairToolCall: modelConfig.supportsToolCalling
            ? toolCallRepair
            : undefined,
          onStepFinish: (event) => {
            if (
              event.stepType === "initial" &&
              event.toolCalls.length > 0 &&
              event.text.length > 0
            ) {
              terminal.box(
                "Step",
                `Assistant: ${event.text}\nTool: ${event.toolCalls[0]?.toolName}\nResult: ${event.toolResults[0]?.result}`,
              );
            }
          },
          onFinish: (result) => {
            if (result.response.messages.length > 0) {
              // I keep getting assistant messages that have empty content arrays
              const validMessages = result.response.messages.filter(
                (msg) => msg.content.length > 0,
              );
              messageHistory.appendResponseMessages(validMessages);
            }
            terminal.writeln("\n\n"); // this puts an empty line after the streamed response.
            terminal.header("Tool use:");
            terminal.writeln(`Steps: ${result.steps.length}`);

            for (const step of result.steps) {
              terminal.writeln(`Step type: ${step.stepType}`);
              terminal.writeln(
                `Tools called: ${step.toolCalls.map((tc) => tc.toolName).join(", ")}`,
              );
              terminal.writeln(`Step tokens: ${step.usage.totalTokens}`);
            }

            terminal.header("Usage:");
            terminal.writeln(
              chalk.green(
                `Prompt tokens: ${result.usage.promptTokens}, Completion tokens: ${result.usage.completionTokens}, Total tokens: ${result.usage.totalTokens}`,
              ),
            );
            terminal.writeln(
              chalk.yellow(
                `Cache creation: ${result.providerMetadata?.anthropic?.cacheCreationInputTokens}, Cache read: ${result.providerMetadata?.anthropic?.cacheReadInputTokens}`,
              ),
            );
            terminal.header("Total Usage:");
            tokenTracker.trackUsage("repl", result.usage);
            const totalUsage = tokenTracker.getTotalUsage();
            terminal.writeln(
              chalk.green(
                `Prompt tokens: ${totalUsage.promptTokens}, Completion tokens: ${totalUsage.completionTokens}, Total tokens: ${totalUsage.totalTokens}`,
              ),
            );
            terminal.hr(chalk.yellow);
          },
          onError: ({ error }) => {
            terminal.error(JSON.stringify(error, null, 2));
          },
        });

        terminal.header("Assistant:");
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
              lastType === "reasoning"
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
        // Don't exit if stdin was used to provide first input without oneshot flag
        if (args.oneshot === true && !shouldContinue) {
          return;
        }
      } catch (e) {
        terminal.error((e as Error).message);
        if (e instanceof Error) {
          logger.error(e);
        } else {
          logger.error(JSON.stringify(e, null, 2));
        }
      }
    }
  }
}

const toolCallRepair: ToolCallRepairFunction<
  AsyncReturnType<typeof initTools>
> = async ({ toolCall, tools, parameterSchema, error }) => {
  if (NoSuchToolError.isInstance(error)) {
    return null; // do not attempt to fix invalid tool names
  }

  console.error("Attempting to repair tool call.");

  const tool = tools[toolCall.toolName as keyof typeof tools];

  const { object: repairedArgs } = await generateObject({
    model: getLanguageModel({
      model: "openai:gpt-4o-structured",
      app: "tool-repair",
      stateDir: envPaths("acai").state,
    }),
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
};

function calculateThinkingBudget(userInput: string) {
  let thinkingBudget = 2000; // Default
  for (const tier of THINKING_TIERS) {
    if (tier.pattern.test(userInput)) {
      thinkingBudget = tier.budget;
      break; // Use highest priority match
    }
  }
  return thinkingBudget;
}
