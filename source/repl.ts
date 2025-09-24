import { isNumber, isRecord } from "@travisennis/stdlib/typeguards";
import { stepCountIs, streamText } from "ai";
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
import chalk from "./terminal/chalk.ts";
import type { Terminal } from "./terminal/index.ts";
import type { TokenTracker } from "./token-tracker.ts";
import type { TokenCounter } from "./token-utils.ts";
import type { ToolExecutor } from "./tool-executor.ts";
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
  showLastMessage: boolean; // For displaying last message when continuing/resuming
  toolExecutor?: ToolExecutor;
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
    } = this.options;

    logger.info(config, "Config:");

    terminal.displayWelcome();

    const promptHistory: string[] = [];

    let currentContextWindow = 0;
    messageHistory.on("clear-history", () => {
      currentContextWindow = 0;
    });

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

      // Display last message when continuing/resuming a conversation
      if (this.showLastMessage) {
        const lastMessage = messageHistory.getLastMessage();
        if (lastMessage) {
          terminal.lineBreak();
          terminal.writeln(chalk.dim("Continuing conversation:"));
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
              continue; // Continue the REPL loop
            }
            throw error; // Re-throw other errors
          }
        }

        terminal.lineBreak();
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
              toolExecutor,
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

      // Enable raw-mode key capture to suppress ^C echo while streaming
      const cleanupKeyCapture = (() => {
        if (!process.stdin.isTTY) return () => {};
        const stdin = process.stdin;
        // biome-ignore lint/suspicious/noExplicitAny: Node's isRaw is not in types
        const wasRaw = (stdin as any).isRaw === true;
        if (!wasRaw) {
          stdin.setRawMode(true);
        }
        const onData = (data: Buffer) => {
          // Ctrl+C
          if (data.length === 1 && data[0] === 0x03) {
            currentAbortController?.abort();
          }
        };
        stdin.on("data", onData);
        return () => {
          stdin.off("data", onData);
          if (!wasRaw) {
            try {
              stdin.setRawMode(false);
            } catch {
              // ignore
            }
          }
        };
      })();

      try {
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
          stopWhen: stepCountIs(60),
          maxRetries: 2,
          providerOptions: aiConfig.getProviderOptions(),
          tools,
          // biome-ignore lint/style/useNamingConvention: third-party controlled
          experimental_repairToolCall: modelConfig.supportsToolCalling
            ? toolCallRepair(modelManager, terminal)
            : undefined,
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
            const projectConfig = await configManager.readProjectConfig();
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
            terminal.writeln(chalk.dim(tokenSummary));

            const inputCost = modelConfig.costPerInputToken * inputTokens;
            const outputCost = modelConfig.costPerOutputToken * outputTokens;
            terminal.writeln(
              chalk.dim(`Cost: $${(inputCost + outputCost).toFixed(2)}`),
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

            // comment out auto-summarization for now. it's been causing issues.
            // if (currentContextWindow > 70000) {
            //   logger.info(
            //     `Condensing history from ${currentContextWindow} to 0`,
            //   );
            //   await messageHistory.summarizeAndReset();
            // }

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
          if (chunk.type === "reasoning-delta" || chunk.type === "text-delta") {
            if (chunk.type === "reasoning-delta") {
              if (lastType !== "reasoning") {
                terminal.writeln(chalk.dim("<think>"));
              }
              terminal.write(chalk.dim(chunk.text)); // Stream reasoning directly
              lastType = "reasoning";
            } else if (chunk.type === "text-delta") {
              if (lastType === "reasoning") {
                // Finishing reasoning: Print </think>
                terminal.writeln(chalk.dim("\n</think>\n"));
              }
              accumulatedText += chunk.text;
              lastType = "text";
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
            if (accumulatedText.trim()) {
              terminal.writeln(`${chalk.blue.bold("● Response:")}`);
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
        if (accumulatedText.trim()) {
          terminal.writeln(`${chalk.green.bold("● Response:")}`);
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
      } finally {
        // Restore terminal mode and listeners
        cleanupKeyCapture();
      }
    }
  }
}
