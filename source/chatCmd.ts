import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { input } from "@inquirer/prompts";
import {
  MessageHistory,
  type ModelName,
  createAssistantMessage,
  createUserMessage,
  isSupportedModel,
  languageModel,
  wrapLanguageModel,
} from "@travisennis/acai-core";
import { auditMessage } from "@travisennis/acai-core/middleware";
import {
  createCodeInterpreterTool,
  createCodeTools,
  createFileSystemTools,
  createGitTools,
  createGrepTools,
  createThinkTools,
} from "@travisennis/acai-core/tools";
import envPaths from "@travisennis/stdlib/env";
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
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";
import { systemPrompt } from "./prompts.ts";

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

interface ChatCommand {
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

const chatCommands: ChatCommand[] = [
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
    ...chatCommands
      .sort((a, b) => (a.command > b.command ? 1 : -1))
      .map((cmd) => [cmd.command, cmd.description]),
  );

  writeln(table.toString());
}
export async function chatCmd(
  prompt: string,
  args: Flags,
  config: Record<PropertyKey, unknown>,
) {
  logger.info(config, "Config:");

  const now = new Date();

  const chosenModel: ModelName = isSupportedModel(args.model)
    ? args.model
    : "anthropic:sonnet";

  const stateDir = envPaths("acai").state;
  const messagesFilePath = path.join(
    stateDir,
    `${now.toISOString()}-chat-message.json`,
  );

  const langModel = wrapLanguageModel(
    languageModel(chosenModel),
    auditMessage({ path: messagesFilePath, app: "chat" }),
  );

  let totalPromptTokens = 0;
  let totalCompletionsTokens = 0;
  let totalTokens = 0;

  const messages = new MessageHistory();

  let initialPrompt = prompt;
  while (true) {
    writeHeader("Input:");
    writeln(`Model: ${langModel.modelId}`);
    writeln("");

    const userInput =
      initialPrompt.length > 0 ? initialPrompt : await input({ message: ">" });
    initialPrompt = "";
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
      totalPromptTokens = 0;
      totalCompletionsTokens = 0;
      totalTokens = 0;
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
        totalPromptTokens = 0;
        totalCompletionsTokens = usage.completionTokens;
        totalTokens = usage.completionTokens;
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

    messages.appendUserMessage(createUserMessage(userInput));

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
        maxTokens: Math.max(8_096, thinkingBudget * 1.5),
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

          const tool = tools[toolCall.toolName as keyof typeof tools];

          const { object: repairedArgs } = await generateObject({
            model: languageModel("openai:gpt-4o-structured"),
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
            // writeHeader("Step");
            // writeln(`Assistant: ${event.text}`);
            // writeln(`Tool: ${event.toolCalls[0]?.toolName}`);
            // writeln(`Result: ${event.toolResults[0]?.result}`);
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
          totalPromptTokens += result.usage.promptTokens;
          totalCompletionsTokens += result.usage.completionTokens;
          totalTokens += result.usage.totalTokens;
          writeln(
            chalk.green(
              `Prompt tokens: ${totalPromptTokens}, Completion tokens: ${totalCompletionsTokens}, Total tokens: ${totalTokens}`,
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
