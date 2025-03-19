import path from "node:path";
import { type Interface, createInterface } from "node:readline/promises";
import { isDefined } from "@travisennis/stdlib/typeguards";
import type { AsyncReturnType } from "@travisennis/stdlib/types";
import {
  NoSuchToolError,
  type ToolCallRepairFunction,
  generateObject,
  streamText,
} from "ai";
import chalk from "chalk";
import type { CommandManager } from "./commands/manager.ts";
import { config as configManager } from "./config.ts";
import type { ContextManager } from "./context/manager.ts";
import { retrieveFilesForTask } from "./fileRetriever.ts";
import type { FileManager } from "./files/manager.ts";
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";
import { type MessageHistory, createUserMessage } from "./messages.ts";
import type { ModelManager } from "./models/manager.js";
import { optimizePrompt } from "./promptOptimizer.ts";
import { systemPrompt } from "./prompts.ts";
import type { PromptManager } from "./prompts/manager.ts";
import type { Terminal } from "./terminal/index.ts";
import type { TokenTracker } from "./tokenTracker.ts";
import { initAnthropicTools, initTools } from "./tools/index.ts";

const THINKING_TIERS = [
  {
    pattern:
      /\b(ultrathink|think super hard|think really hard|think intensely)\b/i,
    budget: 31999,
    effort: "high",
  },
  {
    pattern: /\b(megathink|think (very )?hard|think (a lot|more|about it))\b/i,
    budget: 10000,
    effort: "medium",
  },
  {
    pattern: /\bthink\b/i, // Catch-all for standalone "think"
    budget: 4000,
    effort: "low",
  },
];

class ReplPrompt {
  private rl: Interface;
  constructor({ commands }: { commands: CommandManager }) {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: (line) => {
        const completions = commands.getCommands();
        const hits = completions.filter((c) => c.startsWith(line));
        // Show all completions if none found
        return [hits.length > 0 ? hits : completions, line];
      },
    });
  }

  input() {
    return this.rl.question("> ");
  }

  close() {
    this.rl.close();
  }

  [Symbol.dispose]() {
    this.close();
  }
}

export interface ReplOptions {
  messageHistory: MessageHistory;
  contextManager: ContextManager;
  promptManager: PromptManager;
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  terminal: Terminal;
  commands: CommandManager;
  fileManager: FileManager;
  config: Record<PropertyKey, unknown>;
}

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
      // contextManager,
      terminal,
      modelManager,
      fileManager,
      tokenTracker,
      messageHistory,
      commands,
    } = this.options;

    logger.info(config, "Config:");

    terminal.displayWelcome();

    const langModel = modelManager.getModel("repl");
    const modelConfig = modelManager.getModelMetadata("repl");

    while (true) {
      terminal.box(
        "State:",
        `Model:          ${langModel.modelId}\nContext Window: ${tokenTracker.getTotalUsage().totalTokens} tokens`,
      );
      terminal.header("Input:");
      terminal.writeln("");

      if (!promptManager.isPending()) {
        // For interactive input
        const prompt = new ReplPrompt({ commands });
        const userInput = await prompt.input();
        prompt.close();
        const commandResult = await commands.handle({ userInput });
        if (commandResult.break) {
          break;
        }
        if (commandResult.continue) {
          continue;
        }
        // if there is no pending prompt then use the user's input. otherwise, the prompt was loaded from a command
        if (!promptManager.isPending()) {
          // const enrichedPrompt = await contextManager.enrichPrompt(userInput);
          promptManager.push(userInput);
        }
      }

      const userPrompt = promptManager.pop();

      // determine our thinking level for this request
      const thinkingLevel = calculateThinkingLevel(userPrompt);

      // Add any pending file contents to the user input
      let finalPrompt = userPrompt;
      if (fileManager.hasPendingContent()) {
        finalPrompt = fileManager.getPendingContent() + userPrompt;
        fileManager.clearPendingContent(); // Clear after using
        terminal.lineBreak();
        terminal.info("Added file contents to prompt.");
      }

      // flag to see if the user prompt has been modified with file content
      const isUsingFileContent = finalPrompt !== userPrompt;

      // models that can't support toolcalling will be limited, but this step can at least give them some context to answer questions. very early in the development of this.
      if (!modelConfig.supportsToolCalling) {
        if (!isUsingFileContent) {
          terminal.info("Adding files for task:");
          const usefulFiles = await retrieveFilesForTask({
            model: modelManager.getModel("file-retiever"),
            prompt: userPrompt,
            tokenTracker,
          });

          const absFiles = usefulFiles.map((filePath) => {
            return path.isAbsolute(filePath)
              ? filePath
              : path.join(process.cwd(), "..", filePath);
          });

          fileManager.addFiles({
            files: absFiles,
            format: modelConfig.promptFormat,
          });

          terminal.header("Reading files:");
          for (const file of absFiles) {
            terminal.writeln(file);
          }

          finalPrompt = fileManager.getPendingContent() + userPrompt;

          fileManager.clearPendingContent();
        }
      }

      if (!modelConfig.supportsReasoning) {
        terminal.writeln("Optimizing prompt:");
        finalPrompt = await optimizePrompt({
          model: modelManager.getModel("meta-prompt"),
          prompt: finalPrompt,
          tokenTracker,
          terminal,
        });
      }

      // Track if we're using file content in this prompt to set cache control appropriately
      const userMsg = createUserMessage(finalPrompt);
      if (isUsingFileContent && modelConfig.provider === "anthropic") {
        userMsg.providerOptions = {
          anthropic: { cacheControl: { type: "ephemeral" } },
        };
      }
      messageHistory.appendUserMessage(userMsg);

      // Read rules from project directory
      const rules = await configManager.readRulesFile();
      const finalSystemPrompt = systemPrompt(rules);

      const maxTokens =
        modelConfig.provider === "anthropic" && modelConfig.supportsReasoning
          ? modelConfig.maxOutputTokens - thinkingLevel.tokenBudget
          : modelConfig.maxOutputTokens;

      const baseTools = modelConfig.supportsToolCalling
        ? await initTools({ terminal })
        : undefined;

      const providerTools =
        modelConfig.supportsToolCalling &&
        modelConfig.id.includes("sonnet-invalid") // do this for now to remove this tool from the mix
          ? initAnthropicTools({ model: langModel, terminal })
          : undefined;

      const tools =
        isDefined(baseTools) && isDefined(providerTools)
          ? Object.assign(baseTools, providerTools)
          : isDefined(baseTools)
            ? baseTools
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
          providerOptions:
            modelConfig.provider === "anthropic" &&
            modelConfig.supportsReasoning
              ? {
                  anthropic: {
                    thinking: {
                      type: "enabled",
                      budgetTokens: thinkingLevel.tokenBudget,
                    },
                  },
                }
              : modelConfig.supportsReasoning &&
                  modelConfig.provider === "openai"
                ? { openai: { reasoningEffort: thinkingLevel.effort } }
                : {},
          tools,
          // biome-ignore lint/style/useNamingConvention: <explanation>
          experimental_repairToolCall: modelConfig.supportsToolCalling
            ? toolCallRepair(modelManager)
            : undefined,
          onStepFinish: (event) => {
            if (
              (event.stepType === "initial" ||
                event.stepType === "tool-result") &&
              event.toolCalls.length > 0 &&
              event.text.length > 0
            ) {
              terminal.box(
                "Tool Step",
                `Assistant: ${event.text}\nTools: ${event.toolCalls.map((t) => t.toolName).join(", ")}\nResult: ${event.toolResults[0]?.result}`,
              );
            }
          },
          onFinish: (result) => {
            if (result.response.messages.length > 0) {
              messageHistory.appendResponseMessages(result.response.messages);
            }
            terminal.writeln("\n\n"); // this puts an empty line after the streamed response.
            terminal.header("Tool use:");
            terminal.writeln(`Steps: ${result.steps.length}`);

            for (const step of result.steps) {
              terminal.writeln(`Step type: ${step.stepType}`);
              terminal.writeln(
                `Results from tools: ${step.toolResults.map((tc) => tc.toolName).join(", ")}`,
              );
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

function calculateThinkingLevel(userInput: string) {
  let tokenBudget = 2000; // Default
  let effort = "low";
  for (const tier of THINKING_TIERS) {
    if (tier.pattern.test(userInput)) {
      tokenBudget = tier.budget;
      effort = tier.effort;
      break; // Use highest priority match
    }
  }
  return { tokenBudget, effort };
}
