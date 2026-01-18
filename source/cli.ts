import {
  generateText,
  NoSuchToolError,
  Output,
  stepCountIs,
  type ToolCallRepairFunction,
  type ToolExecuteFunction,
  type ToolSet,
  tool,
} from "ai";
import type z from "zod";
import type { WorkspaceContext } from "./index.ts";
import { logger } from "./logger.ts";
import { AiConfig } from "./models/ai-config.ts";
import type { ModelManager } from "./models/manager.js";
import type { PromptManager } from "./prompts/manager.ts";
import { systemPrompt } from "./prompts.ts";
import type { SessionManager } from "./sessions/manager.ts";
import type { TokenCounter } from "./tokens/counter.ts";
import type { TokenTracker } from "./tokens/tracker.ts";
import { BashTool } from "./tools/bash.ts";
import { EditFileTool } from "./tools/edit-file.ts";
import { GlobTool } from "./tools/glob.ts";
import { GrepTool } from "./tools/grep.ts";
import { type CompleteTools, initTools } from "./tools/index.ts";
import { ReadFileTool } from "./tools/read-file.ts";

interface CliOptions {
  messageHistory: SessionManager;
  promptManager: PromptManager;
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  tokenCounter: TokenCounter;
  workspace: WorkspaceContext;
  skillsEnabled?: boolean;
}

const activeTools = [
  EditFileTool.name,
  ReadFileTool.name,
  BashTool.name,
  GrepTool.name,
  GlobTool.name,
];

export class Cli {
  private options: CliOptions;
  private skillsEnabled: boolean;
  constructor(options: CliOptions) {
    this.options = options;
    this.skillsEnabled = options.skillsEnabled ?? true;
  }

  async run() {
    const { promptManager, modelManager, tokenTracker, messageHistory } =
      this.options;

    const abortController = new AbortController();
    const { signal } = abortController;

    const cb = () => {
      abortController.abort();
    };

    // Handle Ctrl+C (SIGINT)
    process.on("SIGINT", cb);

    const langModel = modelManager.getModel("cli");
    const modelConfig = modelManager.getModelMetadata("cli");

    const userPrompt = promptManager.get();

    const userMsg = promptManager.getUserMessage();

    messageHistory.appendUserMessage(userMsg);

    const finalSystemPromptResult = await systemPrompt({
      activeTools,
      allowedDirs: this.options.workspace.allowedDirs,
      skillsEnabled: this.skillsEnabled,
    });
    const finalSystemPrompt = finalSystemPromptResult.prompt;

    const aiConfig = new AiConfig({
      modelMetadata: modelConfig,
      prompt: userPrompt,
    });

    const tools = await initTools({
      workspace: this.options.workspace,
    });

    // Cleanup function to remove signal handler
    const cleanup = () => {
      process.removeListener("SIGINT", cb);
    };

    try {
      const result = await generateText({
        model: langModel,
        maxOutputTokens: aiConfig.maxOutputTokens(),
        system: finalSystemPrompt,
        messages: messageHistory.get(),
        temperature: aiConfig.temperature(),
        topP: aiConfig.topP(),
        stopWhen: stepCountIs(200),
        maxRetries: 2,
        providerOptions: aiConfig.providerOptions(),
        tools: Object.fromEntries(
          Object.entries(tools).map((t) => [
            t[0],
            tool({
              ...t[1]["toolDef"],
              execute: t[1]["execute"] as unknown as ToolExecuteFunction<
                unknown,
                string
              >,
            }),
          ]),
        ) as CompleteTools,
        activeTools,
        // biome-ignore lint/style/useNamingConvention: third-party controlled
        experimental_repairToolCall:
          toolCallRepair<CompleteTools>(modelManager),
        abortSignal: signal,
      });

      if (result.response.messages.length > 0) {
        messageHistory.appendResponseMessages(result.response.messages);
      }

      // this tracks the usage of every step in the call to streamText. it's a cumulative usage.
      tokenTracker.trackUsage("cli", result.usage);

      await messageHistory.save();

      process.stdout.end(
        result.text.endsWith("\n") ? result.text : `${result.text}\n`,
      );
      cleanup();
    } catch (e) {
      // Always cleanup signal handler
      cleanup();

      // Check if it's an abort error or if the signal was aborted
      const isAbortError =
        (e instanceof Error &&
          (e.name === "AbortError" ||
            e.message.includes("aborted") ||
            e.message.includes("No output generated"))) ||
        signal.aborted;

      if (isAbortError) {
        logger.info("CLI execution interrupted by user");
        // Try to save message history before exiting
        try {
          await messageHistory.save();
        } catch (_saveError) {
          // Ignore save errors on abort
          logger.warn("Failed to save message history on interrupt");
        }
        process.exit(0); // Exit gracefully
      } else {
        if (e instanceof Error) {
          logger.error(e);
        } else {
          logger.error(JSON.stringify(e, null, 2));
        }
        process.exit(1);
      }
    }
  }
}

const toolCallRepair = <T extends ToolSet>(modelManager: ModelManager) => {
  const fn: ToolCallRepairFunction<T> = async ({
    toolCall,
    tools,
    inputSchema,
    error,
  }) => {
    if (NoSuchToolError.isInstance(error)) {
      return null; // do not attempt to fix invalid tool names
    }
    const tool = tools[toolCall.toolName as keyof typeof tools];

    try {
      const { output: repairedArgs } = await generateText({
        model: modelManager.getModel("tool-repair"),
        output: Output.object({
          schema: tool.inputSchema as z.ZodType<unknown>,
        }),
        prompt: [
          `The model tried to call the tool "${toolCall.toolName}" with the following inputs:`,
          JSON.stringify(toolCall.input),
          "The tool accepts the following schema:",
          JSON.stringify(inputSchema(toolCall)),
          "Please fix the inputs.",
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
