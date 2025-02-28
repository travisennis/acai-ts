import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { input } from "@inquirer/prompts";
import {
  MessageHistory,
  ModelConfig,
  type ModelName,
  TokenTracker,
  createAssistantMessage,
  createUserMessage,
  formatFile,
  getLanguageModel,
  isSupportedModel,
} from "@travisennis/acai-core";
import {
  createCodeInterpreterTool,
  createCodeTools,
  createFileSystemTools,
  createGitTools,
  createGrepTools,
  createThinkTools,
} from "@travisennis/acai-core/tools";
import { envPaths } from "@travisennis/stdlib/env";
import {
  type CoreMessage,
  NoSuchToolError,
  generateObject,
  generateText,
  streamText,
} from "ai";
import chalk from "chalk";
import Table from "cli-table3";
import {
  write,
  writeBox,
  writeError,
  writeHeader,
  writeln,
} from "./command.ts";
import { readProjectConfig } from "./config.ts";
import { retrieveFilesForTask } from "./fileRetriever.ts";
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";
import { systemPrompt } from "./prompts.ts";
import { optimizePrompt } from "./promptOptimizer.ts";

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

async function saveMessageHistory(messages: CoreMessage[]): Promise<void> {
  const stateDir = envPaths("acai").state;
  await mkdir(stateDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const fileName = `message-history-${timestamp}.json`;
  const filePath = path.join(stateDir, fileName);

  await writeFile(filePath, JSON.stringify(messages, null, 2));
}

interface ReplCommand {
  command: string;
  description: string;
}

const resetCommand = {
  command: "/reset",
  description: "Saves the chat history and then resets it.",
};

const saveCommand = {
  command: "/save",
  description: "Saves the chat history.",
};

const compactCommand = {
  command: "/compact",
  description: "Saves, summarizes and resets the chat history.",
};

const exitCommand = {
  command: "/exit",
  description: "Exits and saves the chat history.",
};

const byeCommand = {
  command: "/bye",
  description: "Exits and saves the chat history.",
};

const helpCommand = {
  command: "/help",
  description: "Shows usage table.",
};

const replCommands: ReplCommand[] = [
  resetCommand,
  saveCommand,
  compactCommand,
  byeCommand,
  exitCommand,
  helpCommand,
];

function displayUsage() {
  const table = new Table({
    head: ["command", "description"],
  });

  table.push(
    ...replCommands
      .sort((a, b) => (a.command > b.command ? 1 : -1))
      .map((cmd) => [cmd.command, cmd.description]),
  );

  writeln(table.toString());
}
export async function repl({
  initialPrompt,
  stdin,
  args,
  config,
}: {
  initialPrompt: string | undefined;
  stdin: string | undefined;
  args: Flags;
  config: Record<PropertyKey, unknown>;
}) {
  logger.info(config, "Config:");

  // const now = new Date();

  const chosenModel: ModelName = isSupportedModel(args.model)
    ? args.model
    : "anthropic:sonnet";

  const modelConfig = ModelConfig[chosenModel];

  const langModel = getLanguageModel({
    model: chosenModel,
    stateDir: envPaths("acai").state,
    app: "repl",
  });

  const tokenTracker = new TokenTracker();
  const messages = new MessageHistory();

  let firstPrompt =
    args.prompt && args.prompt.length > 0
      ? args.prompt
      : initialPrompt && initialPrompt.length > 0
        ? `${stdin ?? ""}\n${initialPrompt}`.trim()
        : "";

  while (true) {
    writeHeader("Input:");
    writeln(`Model: ${langModel.modelId}`);
    writeln("");

    const userInput =
      firstPrompt.length > 0 ? firstPrompt : await input({ message: ">" });
    firstPrompt = "";

    if (
      userInput.trim() === exitCommand.command ||
      userInput.trim() === byeCommand.command
    ) {
      if (!messages.isEmpty()) {
        await saveMessageHistory(messages.get());
      }
      break;
    }

    if (userInput.trim() === helpCommand.command) {
      displayUsage();
      continue;
    }

    if (userInput.trim() === resetCommand.command) {
      if (!messages.isEmpty()) {
        await saveMessageHistory(messages.get());
        messages.clear();
      }
      tokenTracker.reset();
      continue;
    }

    if (userInput.trim() === compactCommand.command) {
      if (!messages.isEmpty()) {
        // save existing message history
        await saveMessageHistory(messages.get());
        // summarize message history
        messages.appendUserMessage(
          createUserMessage(
            "Provide a detailed but concise summary of our conversation above. Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next.",
          ),
        );
        const { text, usage } = await generateText({
          model: langModel,
          system:
            "You are a helpful AI assistant tasked with summarizing conversations.",
          messages: messages.get(),
        });
        //clear messages
        messages.clear();
        // reset messages with the summary
        messages.appendAssistantMessage(createAssistantMessage(text));
        // update token counts with new message history
        tokenTracker.reset();
        tokenTracker.trackUsage("repl", {
          promptTokens: 0,
          completionTokens: usage.completionTokens,
          totalTokens: usage.completionTokens,
        });
      }
      continue;
    }

    // determine our thinking token budget for this request
    let thinkingBudget = 2000; // Default
    for (const tier of THINKING_TIERS) {
      if (tier.pattern.test(userInput)) {
        thinkingBudget = tier.budget;
        break; // Use highest priority match
      }
    }

    let finalPrompt = userInput;

    // models that can't support toolcalling will be limited, but this step can at least give them some context to answer questions. very early in the development of this.
    if (!modelConfig.supportsToolCalling) {
      writeln("Adding files for task:");
      const usefulFiles = await retrieveFilesForTask({
        model: chosenModel,
        prompt: userInput,
        tokenTracker,
      });

      writeHeader("Reading files:");
      for (const file of usefulFiles) {
        writeln(file);
      }

      finalPrompt = `${usefulFiles
        .map((filePath) => {
          return formatFile(
            filePath,
            readFileSync(
              path.isAbsolute(filePath)
                ? filePath
                : path.join(process.cwd(), "..", filePath),
              "utf-8",
            ),
            "bracket",
          );
        })
        .join("\n\n")}${userInput}`;
    }

    if (!modelConfig.reasoningModel) {
      writeln("Optimizing prompt:");
      finalPrompt = await optimizePrompt({
        model: chosenModel,
        prompt: finalPrompt,
        tokenTracker,
      });
    }

    messages.appendUserMessage(createUserMessage(finalPrompt));

    try {
      const fsTools = await createFileSystemTools({
        workingDir: process.cwd(),
        sendData: async (msg) =>
          writeBox(msg.event ?? "tool-event", await msg.data),
      });

      const gitTools = await createGitTools({
        workingDir: process.cwd(),
        sendData: async (msg) =>
          writeBox(msg.event ?? "tool-event", await msg.data),
      });

      const codeTools = createCodeTools({
        baseDir: process.cwd(),
        config: await readProjectConfig(),
        sendData: async (msg) =>
          writeBox(msg.event ?? "tool-event", await msg.data),
      });

      const codeInterpreterTool = createCodeInterpreterTool({
        sendData: async (msg) =>
          writeBox(msg.event ?? "tool-event", await msg.data),
      });

      const grepTool = createGrepTools({
        sendData: async (msg) =>
          writeBox(msg.event ?? "tool-event", await msg.data),
      });

      const thinkTool = createThinkTools({
        sendData: async (msg) =>
          writeBox(msg.event ?? "tool-event", await msg.data),
      });

      const allTools = {
        ...codeTools,
        ...fsTools,
        ...gitTools,
        ...codeInterpreterTool,
        ...grepTool,
        ...thinkTool,
      } as const;

      const result = streamText({
        model: langModel,
        maxTokens: Math.max(8096, thinkingBudget * 1.5),
        system: systemPrompt,
        messages: messages.get(),
        maxSteps: 30,
        providerOptions: {
          anthropic: {
            thinking: { type: "enabled", budgetTokens: thinkingBudget },
          },
        },
        tools: allTools,
        // biome-ignore lint/style/useNamingConvention: <explanation>
        experimental_repairToolCall: async ({
          toolCall,
          tools,
          parameterSchema,
          error,
        }) => {
          if (NoSuchToolError.isInstance(error)) {
            return null; // do not attempt to fix invalid tool names
          }

          writeError("Attempting to repair tool call.");

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
        },
        onStepFinish: (event) => {
          if (
            event.stepType === "initial" &&
            event.toolCalls.length > 0 &&
            event.text.length > 0
          ) {
            writeBox(
              "Step",
              `Assistant: ${event.text}\nTool: ${event.toolCalls[0]?.toolName}\nResult: ${event.toolResults[0]?.result}`,
            );
          }
        },
        onFinish: (result) => {
          messages.appendResponseMessages(result.response.messages);

          writeln("\n\n"); // this puts an empty line after the streamed response.
          writeHeader("Tool use:");
          writeln(`Steps: ${result.steps.length}`);

          writeHeader("Usage:");
          writeln(
            chalk.green(
              `Prompt tokens: ${result.usage.promptTokens}, Completion tokens: ${result.usage.completionTokens}, Total tokens: ${result.usage.totalTokens}`,
            ),
          );
          writeln(
            chalk.yellow(
              `Cache creation: ${result.providerMetadata?.anthropic.cacheCreationInputTokens}, Cache read: ${result.providerMetadata?.anthropic.cacheReadInputTokens}`,
            ),
          );
          writeHeader("Total Usage:");
          tokenTracker.trackUsage("repl", result.usage);
          const totalUsage = tokenTracker.getTotalUsage();
          writeln(
            chalk.green(
              `Prompt tokens: ${totalUsage.promptTokens}, Completion tokens: ${totalUsage.completionTokens}, Total tokens: ${totalUsage.totalTokens}`,
            ),
          );
        },
        onError: ({ error }) => {
          writeError(JSON.stringify(error, null, 2));
        },
      });

      writeHeader("Assistant:");
      let lastType: "reasoning" | "text-delta" | null = null;
      for await (const chunk of result.fullStream) {
        if (chunk.type === "reasoning" || chunk.type === "text-delta") {
          if (lastType !== "reasoning" && chunk.type === "reasoning") {
            write("\n<think>\n");
          } else if (lastType === "reasoning" && chunk.type !== "reasoning") {
            write("\n</think>\n\n");
          }
          write(chunk.textDelta);
          lastType = chunk.type;
        }
      }
      if (lastType === "reasoning") {
        write("\n</think>\n\n");
      }

      result.consumeStream();

      // if prompt was provided via flag then exit repl loop
      if (args.prompt && args.prompt.length > 0) {
        return;
      }
    } catch (e) {
      writeError((e as Error).message);
      if (e instanceof Error) {
        logger.error(e);
      } else {
        logger.error(JSON.stringify(e, null, 2));
      }
    }
  }
}
