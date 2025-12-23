import {
  generateObject,
  generateText,
  NoSuchToolError,
  stepCountIs,
  type ToolCallRepairFunction,
  type ToolSet,
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
import { CodeInterpreterTool } from "./tools/code-interpreter.ts";
import { EditFileTool } from "./tools/edit-file.ts";
import { GlobTool } from "./tools/glob.ts";
import { GrepTool } from "./tools/grep.ts";
import { type CompleteCliToolSet, initCliTools } from "./tools/index.ts";
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
  CodeInterpreterTool.name,
];

export class Cli {
  private options: CliOptions;
  private skillsEnabled: boolean;
  constructor(options: CliOptions) {
    this.options = options;
    this.skillsEnabled = options.skillsEnabled ?? true;
  }

  async run() {
    const {
      promptManager,
      modelManager,
      tokenTracker,
      messageHistory,
      tokenCounter,
    } = this.options;

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

    const finalSystemPrompt = await systemPrompt({
      type: "cli",
      activeTools,
      allowedDirs: this.options.workspace.allowedDirs,
      skillsEnabled: this.skillsEnabled,
    });

    const aiConfig = new AiConfig({
      modelMetadata: modelConfig,
      prompt: userPrompt,
    });

    const tools = await initCliTools({
      tokenCounter,
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
        stopWhen: stepCountIs(60),
        maxRetries: 2,
        providerOptions: aiConfig.providerOptions(),
        tools: tools.toolDefs,
        activeTools,
        // biome-ignore lint/style/useNamingConvention: third-party controlled
        experimental_repairToolCall:
          toolCallRepair<CompleteCliToolSet>(modelManager),
        abortSignal: signal,
      });

      if (result.response.messages.length > 0) {
        messageHistory.appendResponseMessages(result.response.messages);
      }

      // this tracks the usage of every step in the call to streamText. it's a cumulative usage.
      tokenTracker.trackUsage("cli", result.usage);

      messageHistory.save();

      process.stdout.end(
        result.text.endsWith("\n") ? result.text : `${result.text}\n`,
      );
      cleanup();
    } catch (e) {
      // Always cleanup signal handler
      cleanup();

      // Check if it's an abort error
      const isAbortError =
        e instanceof Error &&
        (e.name === "AbortError" ||
          e.message.includes("aborted") ||
          e.message.includes("No output generated"));

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
      const { object: repairedArgs } = await generateObject({
        model: modelManager.getModel("tool-repair"),
        schema: tool.inputSchema as z.ZodSchema<unknown>,
        prompt: [
          `The model tried to call the tool "${toolCall.toolName}" with the following arguments:`,
          JSON.stringify(toolCall.input),
          "The tool accepts the following schema:",
          JSON.stringify(inputSchema(toolCall)),
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
