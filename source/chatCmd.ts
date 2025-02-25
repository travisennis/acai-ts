import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { input } from "@inquirer/prompts";
import {
  type ModelName,
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
} from "@travisennis/acai-core/tools";
import envPaths from "@travisennis/stdlib/env";
import {
  type CoreMessage,
  NoSuchToolError,
  generateObject,
  streamText,
} from "ai";
import chalk from "chalk";
import Table from "cli-table3";
import { write, writeError, writeHeader, writeln } from "./command.ts";
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";

async function saveMessageHistory(messages: CoreMessage[]): Promise<void> {
  const stateDir = envPaths("acai").state;
  await mkdir(stateDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const fileName = `message-history-${timestamp}.md`;
  const filePath = path.join(stateDir, fileName);

  const formattedContent = messages
    .map((message) => {
      const prefix = message.role === "user" ? "User:" : "Assistant:";
      return Array.isArray(message.content)
        ? `${prefix}\n${JSON.stringify(message.content, null, 2)}`
        : `${prefix}\n${message.content}`;
    })
    .join("\n\n");

  await writeFile(filePath, formattedContent);
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

  const messages: CoreMessage[] = [];

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
      if (messages.length > 0) {
        await saveMessageHistory(messages);
      }
      break;
    }

    if (userInput.trim() === helpCommand.command) {
      displayUsage();
      continue;
    }

    if (userInput.trim() === resetCommand.command) {
      if (messages.length > 0) {
        await saveMessageHistory(messages);
        messages.length = 0;
      }
      totalPromptTokens = 0;
      totalCompletionsTokens = 0;
      totalTokens = 0;
      continue;
    }

    messages.push({
      role: "user",
      content: userInput,
    });

    try {
      const fsTools = await createFileSystemTools({
        workingDir: process.cwd(),
        sendData: async (msg) => writeln(await msg.data),
      });

      const gitTools = await createGitTools({
        workingDir: process.cwd(),
        sendData: async (msg) => writeln(await msg.data),
      });

      const codeTools = createCodeTools({
        baseDir: process.cwd(),
        sendData: async (msg) => writeln(await msg.data),
      });

      const codeInterpreterTool = createCodeInterpreterTool({
        sendData: async (msg) => writeln(await msg.data),
      });

      const allTools = {
        ...codeTools,
        ...fsTools,
        ...gitTools,
        ...codeInterpreterTool,
      } as const;

      const result = streamText({
        model: langModel,
        maxTokens: 20_000,
        messages: messages,
        maxSteps: 30,
        providerOptions: {
          anthropic: {
            thinking: { type: "enabled", budgetTokens: 12_000 },
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
            writeHeader("Step");
            writeln(`Assistant: ${event.text}`);
            writeln(`Tool: ${event.toolCalls[0]?.toolName}`);
            writeln(`Result: ${event.toolResults[0]?.result}`);
          }
        },
        onFinish: (result) => {
          messages.push(...result.response.messages);

          writeln("\n\n"); // this puts an empty line after the streamed response.
          writeHeader("Steps:");
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
      if (e instanceof Error) {
        logger.error(e);
      } else {
        logger.error(JSON.stringify(e, null, 2));
      }
    }
  }
}
