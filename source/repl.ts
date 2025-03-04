import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  type ToolCallRepairFunction,
  generateObject,
  generateText,
  streamText,
  tool,
} from "ai";
import chalk from "chalk";
import Table from "cli-table3";
import { globby } from "globby";
import { z } from "zod";
import {
  write,
  writeBox,
  writeError,
  writeHeader,
  writeln,
} from "./command.ts";
import { readProjectConfig, readRulesFile } from "./config.ts";
import { retrieveFilesForTask } from "./fileRetriever.ts";
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";
import { optimizePrompt } from "./promptOptimizer.ts";
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

const filesCommand = {
  command: "/files",
  description:
    "Finds files matching the given patterns and adds their content to the next prompt. Usage: /files src/**/*.ts",
};

const replCommands: ReplCommand[] = [
  resetCommand,
  saveCommand,
  compactCommand,
  byeCommand,
  exitCommand,
  filesCommand,
  helpCommand,
];

const fsTools = await createFileSystemTools({
  workingDir: process.cwd(),
  sendData: async (msg) => writeBox(msg.event ?? "tool-event", await msg.data),
});

const gitTools = await createGitTools({
  workingDir: process.cwd(),
  sendData: async (msg) => writeBox(msg.event ?? "tool-event", await msg.data),
});

const codeTools = createCodeTools({
  baseDir: process.cwd(),
  config: await readProjectConfig(),
  sendData: async (msg) => writeBox(msg.event ?? "tool-event", await msg.data),
});

const codeInterpreterTool = createCodeInterpreterTool({
  sendData: async (msg) => writeBox(msg.event ?? "tool-event", await msg.data),
});

const grepTool = createGrepTools({
  sendData: async (msg) => writeBox(msg.event ?? "tool-event", await msg.data),
});

const thinkTool = createThinkTools({
  sendData: async (msg) => writeBox(msg.event ?? "tool-event", await msg.data),
});

const askUserTool = {
  askUser: tool({
    description: "A tool to ask the user for input.",
    parameters: z.object({
      question: z.string().describe("The question to ask the user."),
    }),
    execute: async ({ question }) => {
      const result = await input({ message: `${question} >` });

      return result;
    },
  }),
};

const allTools = {
  ...codeTools,
  ...fsTools,
  ...gitTools,
  ...codeInterpreterTool,
  ...grepTool,
  ...thinkTool,
  ...askUserTool,
} as const;

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
    : "anthropic:sonnet-token-efficient-tools";

  const modelConfig = ModelConfig[chosenModel];

  const langModel = getLanguageModel({
    model: chosenModel,
    stateDir: envPaths("acai").state,
    app: "repl",
  });

  const tokenTracker = new TokenTracker();
  const messages = new MessageHistory();
  const loadedFiles = new Set<string>();
  let pendingFileContents = "";

  let firstPrompt =
    args.prompt && args.prompt.length > 0
      ? args.prompt
      : initialPrompt && initialPrompt.length > 0
        ? initialPrompt
        : stdin && stdin.length > 0
          ? stdin
          : "";

  while (true) {
    writeHeader("Input:");
    writeln(`Model: ${langModel.modelId}`);
    writeln("");

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

    if (userInput.trim().startsWith(filesCommand.command)) {
      const patterns = userInput
        .trim()
        .substring(filesCommand.command.length)
        .trim();
      if (!patterns) {
        writeln("Please provide a file pattern. Usage: /files src/**/*.ts");
        continue;
      }

      try {
        writeHeader("Finding files:");
        const patternList = patterns.split(" ").filter(Boolean);
        const foundFiles = await globby(patternList, { gitignore: true });

        if (foundFiles.length === 0) {
          writeln("No files found matching the pattern(s)");
          continue;
        }

        writeHeader("Found files:");
        for (const file of foundFiles) {
          writeln(file);
          loadedFiles.add(file);
        }

        // Read the content of the files and format them for the next prompt
        pendingFileContents = "";
        for (const filePath of foundFiles) {
          try {
            const content = await readFile(filePath, "utf-8");
            pendingFileContents += `${formatFile(filePath, content, "bracket")}\n\n`;
          } catch (error) {
            writeError(
              `Error reading file ${filePath}: ${(error as Error).message}`,
            );
          }
        }

        writeln(
          `File contents will be added to your next prompt (${foundFiles.length} files)`,
        );
        continue;
      } catch (error) {
        writeError(
          `Error processing file patterns: ${(error as Error).message}`,
        );
        continue;
      }
    }

    if (userInput.trim() === resetCommand.command) {
      if (!messages.isEmpty()) {
        await saveMessageHistory(messages.get());
        messages.clear();
      }
      tokenTracker.reset();
      pendingFileContents = ""; // Clear any pending file contents
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
      pendingFileContents = ""; // Clear any pending file contents
      continue;
    }

    // determine our thinking token budget for this request
    const thinkingBudget = calculateThinkingBudget(userInput);

    // Add any pending file contents to the user input
    let finalPrompt = userInput;
    if (pendingFileContents) {
      finalPrompt = pendingFileContents + userInput;
      pendingFileContents = ""; // Clear after using
      writeln("Added file contents to prompt");
    }

    // models that can't support toolcalling will be limited, but this step can at least give them some context to answer questions. very early in the development of this.
    if (!modelConfig.supportsToolCalling) {
      writeln("Adding files for task:");
      const usefulFiles = await retrieveFilesForTask({
        model: "anthropic:haiku",
        prompt: userInput,
        tokenTracker,
      });

      const newFiles = usefulFiles.filter((f) => !loadedFiles.has(f));

      writeHeader("Reading files:");
      for (const file of newFiles) {
        writeln(file);
        loadedFiles.add(file);
      }

      finalPrompt = `${newFiles
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
        model: "anthropic:sonnet35",
        prompt: finalPrompt,
        tokenTracker,
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
    messages.appendUserMessage(userMsg);

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
          ...messages.get(),
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
          : {},
        tools: modelConfig.supportsToolCalling ? allTools : undefined,
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
              `Cache creation: ${result.providerMetadata?.anthropic?.cacheCreationInputTokens}, Cache read: ${result.providerMetadata?.anthropic?.cacheReadInputTokens}`,
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

      // Only exit if explicitly requested by oneshot flag
      // Don't exit if stdin was used to provide first input without oneshot flag
      if (args.oneshot === true && !shouldContinue) {
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

const toolCallRepair: ToolCallRepairFunction<typeof allTools> = async ({
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
