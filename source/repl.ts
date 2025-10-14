import { isNumber, isRecord } from "@travisennis/stdlib/typeguards";
import { stepCountIs, streamText } from "ai";
import { runManualLoop } from "./agent/manual-loop.ts";
import type { CommandManager } from "./commands/manager.ts";
import { config as configManager } from "./config.ts";
import { logger } from "./logger.ts";
import { PromptError, processPrompt } from "./mentions.ts";
import type { MessageHistory } from "./messages.ts";
import { AiConfig } from "./models/ai-config.ts";
import type { ModelManager } from "./models/manager.js";
import type { PromptManager } from "./prompts/manager.ts";
import { systemPrompt } from "./prompts.ts";
import { displayToolMessages } from "./repl/display-tool-messages.ts";
import { displayToolUse } from "./repl/display-tool-use.ts";
import { getPromptHeader } from "./repl/get-prompt-header.ts";
import { toolCallRepair } from "./repl/tool-call-repair.ts";
import { ReplPrompt } from "./repl-prompt.ts";
import type { Terminal } from "./terminal/index.ts";
import style from "./terminal/style.ts";
import type { TokenCounter } from "./tokens/counter.ts";
import type { TokenTracker } from "./tokens/tracker.ts";
import type { ToolExecutor } from "./tool-executor.ts";
import { initAgents, initCliTools, initTools } from "./tools/index.ts";

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
  showLastMessage: boolean; // For displaying last message when continuing/resuming
  toolExecutor?: ToolExecutor;
  promptHistory: string[];
}

export class Repl {
  private options: ReplOptions;
  private showLastMessage: boolean;

  constructor(options: ReplOptions) {
    this.options = options;
    this.showLastMessage = options.showLastMessage;
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
      toolExecutor,
      promptHistory,
    } = this.options;

    logger.info(config, "Config:");

    terminal.displayWelcome();

    let currentContextWindow = 0;
    messageHistory.on("clear-history", () => {
      currentContextWindow = 0;
    });

    const finalSystemPrompt = await systemPrompt();

    // Initialize tools once outside the loop - all models support tool calling
    const coreTools = await initTools({
      terminal,
      tokenCounter,
      toolExecutor,
    });

    const agentTools = await initAgents({
      terminal,
      modelManager,
      tokenTracker,
      tokenCounter,
    });

    const completeToolDefs = {
      ...coreTools.toolDefs,
      ...agentTools.toolDefs,
    };

    const tools = {
      toolDefs: completeToolDefs,
      executors: new Map([...coreTools.executors, ...agentTools.executors]),
      permissions: coreTools.permissions,
    } as const;

    let currentAbortController: AbortController | null = null;

    // Handle Ctrl+C (SIGINT) as a fallback when not in raw mode
    process.on("SIGINT", () => {
      currentAbortController?.abort();
    });

    while (true) {
      currentAbortController = new AbortController();
      const { signal } = currentAbortController;

      const langModel = modelManager.getModel("repl");
      const modelConfig = modelManager.getModelMetadata("repl");

      // agent header/status line
      await getPromptHeader({
        terminal,
        modelId: langModel.modelId,
        contextWindow: modelConfig.contextWindow,
        currentContextWindow,
      });

      const projectConfig = await configManager.readProjectConfig();

      // Display last message when continuing/resuming a conversation
      if (this.showLastMessage) {
        const lastMessage = messageHistory.getLastMessage();
        if (lastMessage) {
          terminal.lineBreak();
          terminal.writeln(style.dim("Continuing conversation:"));
          terminal.display(lastMessage);
          terminal.lineBreak();
          terminal.hr();
        }
        // don't show the last message after showing it once
        this.showLastMessage = false;
      }

      if (!promptManager.isPending()) {
        // For interactive input
        const prompt = new ReplPrompt({ commands, history: promptHistory });
        const userInput = await prompt.input();
        prompt.close();

        terminal.startProgress();

        // see if the userInput contains a command
        const commandResult = await commands.handle({ userInput });
        if (commandResult.break) {
          terminal.stopProgress();
          break;
        }
        if (commandResult.continue) {
          terminal.stopProgress();
          terminal.lineBreak();
          continue;
        }

        if (!userInput.trim()) {
          terminal.stopProgress();
          continue;
        }

        // if there is no pending prompt then use the user's input. otherwise, the prompt was loaded from a command
        if (!promptManager.isPending()) {
          try {
            const processedPrompt = await processPrompt(userInput, {
              baseDir: process.cwd(),
              model: modelConfig,
            });
            for (const context of processedPrompt.context) {
              promptManager.addContext(context);
            }
            promptManager.set(processedPrompt.message);
          } catch (error) {
            if (error instanceof PromptError) {
              terminal.error(`Prompt processing failed: ${error.message}`);
              if (
                error.cause &&
                typeof error.cause === "object" &&
                "command" in error.cause &&
                typeof error.cause.command === "string"
              ) {
                terminal.error(`Command: ${error.cause.command}`);
              }
              terminal.lineBreak();
              terminal.stopProgress();
              continue; // Continue the REPL loop
            }
            throw error; // Re-throw other errors
          }
        }

        terminal.lineBreak();
      } else {
        terminal.startProgress();
      }

      // flag to see if the user prompt has added context
      const hasAddedContext = promptManager.hasContext();

      if (hasAddedContext) {
        const contextTokenCount = promptManager.getContextTokenCount();
        terminal.info(
          `Context will be added to prompt. (${contextTokenCount} tokens)`,
        );
        terminal.lineBreak();
      }

      const userPrompt = promptManager.get();
      const userMsg = promptManager.getUserMessage();

      messageHistory.appendUserMessage(userMsg);

      try {
        if (projectConfig.agentLoop === "manual") {
          const { toolDefs, executors, permissions } = tools;
          const result = await runManualLoop({
            modelManager,
            terminal,
            messageHistory,
            systemPrompt: finalSystemPrompt,
            input: userPrompt,
            toolDefs,
            executors: executors,
            permissions: permissions,
            maxIterations: projectConfig.loop.maxIterations,
            abortSignal: signal,
            temperature:
              modelConfig.defaultTemperature > -1
                ? modelConfig.defaultTemperature
                : undefined,
            toolCallRepair: toolCallRepair(modelManager),
          });

          terminal.hr();

          // Notify if configured in project config (acai.json)
          if (projectConfig.notify) {
            terminal.alert();
          }

          // Create a more visual representation of steps/tool usage
          displayToolUse(result, terminal);

          const total = result.totalUsage;
          const inputTokens = total.inputTokens;
          const outputTokens = total.outputTokens;
          const tokenSummary = `Tokens: ↑ ${inputTokens} ↓ ${outputTokens}`;
          terminal.writeln(style.dim(tokenSummary));

          const inputCost = modelConfig.costPerInputToken * inputTokens;
          const outputCost = modelConfig.costPerOutputToken * outputTokens;
          terminal.writeln(
            style.dim(`Cost: $${(inputCost + outputCost).toFixed(2)}`),
          );

          // Track aggregate usage across all steps when available
          tokenTracker.trackUsage("repl", total);

          // Derive current context window from final step usage
          currentContextWindow = result.usage.totalTokens;

          terminal.hr();

          terminal.lineBreak();
        } else {
          const aiConfig = new AiConfig({
            modelMetadata: modelConfig,
            prompt: userPrompt,
          });

          const maxTokens = aiConfig.getMaxTokens();

          const result = streamText({
            model: langModel,
            maxOutputTokens: maxTokens,
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
            temperature:
              modelConfig.defaultTemperature > -1
                ? modelConfig.defaultTemperature
                : undefined,
            stopWhen: stepCountIs(90),
            maxRetries: 2,
            providerOptions: aiConfig.getProviderOptions(),
            tools: (await initCliTools({ tokenCounter })).toolDefs,
            // biome-ignore lint/style/useNamingConvention: third-party controlled
            experimental_repairToolCall: toolCallRepair(modelManager),
            abortSignal: signal,
            onAbort(_event) {
              logger.warn("The agent loop was aborted by the user.");
              terminal.warn("Operation aborted by user.");
            },
            onFinish: async (result) => {
              logger.debug("onFinish called");
              if (result.response.messages.length > 0) {
                messageHistory.appendResponseMessages(result.response.messages);
              }

              terminal.hr();

              // Notify if configured in project config (acai.json)
              if (projectConfig.notify) {
                terminal.alert();
              }

              // Create a more visual representation of steps/tool usage
              displayToolUse(result, terminal);

              const total =
                (result as { totalUsage?: typeof result.usage }).totalUsage ??
                result.usage;
              const inputTokens = isNumber(total.inputTokens)
                ? total.inputTokens
                : 0;
              const outputTokens = isNumber(total.outputTokens)
                ? total.outputTokens
                : 0;
              const tokenSummary = `Tokens: ↑ ${inputTokens} ↓ ${outputTokens}`;
              terminal.writeln(style.dim(tokenSummary));

              const inputCost = modelConfig.costPerInputToken * inputTokens;
              const outputCost = modelConfig.costPerOutputToken * outputTokens;
              terminal.writeln(
                style.dim(`Cost: $${(inputCost + outputCost).toFixed(2)}`),
              );

              // Track aggregate usage across all steps when available
              tokenTracker.trackUsage("repl", total);

              // Derive current context window from final step usage
              const finalTotalTokens = result.usage.totalTokens;
              if (isNumber(finalTotalTokens)) {
                currentContextWindow = finalTotalTokens ?? 0;
              } else {
                // Fallback: find the stopped step
                for (const step of result.steps) {
                  if (step.finishReason === "stop") {
                    const usage = step.usage;
                    currentContextWindow = Number.isNaN(usage.totalTokens)
                      ? 0
                      : (usage.totalTokens ?? 0);
                  }
                }
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
          let lastType: "reasoning" | "text" | null = null;

          for await (const chunk of result.fullStream) {
            // Handle text-related chunks (reasoning or text-delta)
            if (
              chunk.type === "reasoning-delta" ||
              chunk.type === "text-delta"
            ) {
              if (chunk.type === "reasoning-delta") {
                if (lastType !== "reasoning") {
                  terminal.writeln(style.dim("<think>"));
                }
                terminal.write(style.dim(chunk.text)); // Stream reasoning directly
                lastType = "reasoning";
              } else if (chunk.type === "text-delta") {
                if (lastType === "reasoning") {
                  // Finishing reasoning: Print </think>
                  terminal.writeln(style.dim("\n</think>\n"));
                }
                accumulatedText += chunk.text;
                lastType = "text";
              }
            } else if (chunk.type === "tool-call") {
              terminal.stopProgress();
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
                terminal.write(style.dim("\n</think>\n\n"));
              }
              terminal.stopProgress();
              // if there is accumulatedText, display it
              if (accumulatedText.trim()) {
                terminal.writeln(`${style.blue.bold("● Response:")}`);
                terminal.display(accumulatedText, true);
                terminal.lineBreak();
              }
              accumulatedText = "";
              lastType = null;
            }
          }

          // Ensure the final closing tag for reasoning is written if it was the last type
          if (lastType === "reasoning") {
            terminal.write(style.gray("\n</think>\n\n"));
          }

          // if there is accumulatedText, display it
          if (accumulatedText.trim()) {
            terminal.writeln(`${style.green.bold("● Response:")}`);
            terminal.display(accumulatedText, true);
            terminal.lineBreak();
          }

          terminal.lineBreak(); // Add a final newline for clarity

          await result.consumeStream();
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
