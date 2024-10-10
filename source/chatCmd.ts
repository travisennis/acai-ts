import fs from "node:fs/promises";
import path from "node:path";
import { editor, input, select } from "@inquirer/prompts";
// import { Readability } from "@mozilla/readability";
import { type CoreMessage, generateText } from "ai";
import chalk from "chalk";
import Table from "cli-table3";
import { globby } from "globby";
import { match } from "ts-pattern";
import { initTool as buildTool } from "./build-tool.js";
import { initTool as codeInterpreterTool } from "./code-interpreter-tool.js";
import { writeError, writeHeader, writeMd, writeln } from "./command.js";
import { saveMessageHistory } from "./config.js";
import { directoryTree } from "./files.js";
import { initTool as formatTool } from "./format-tool.js";
import { initTool as generateEditsTool } from "./generate-edits-tool.js";
import { getUrlContent } from "./getUrlContent.js";
import { initTool as gitCommitTool } from "./git-commit-tool.js";
import { initTool as gitDiffTool } from "./git-diff-tool.js";
import type { Flags } from "./index.js";
import { initTool as lintTool } from "./lint-tool.js";
import { logger } from "./logger.js";
import { PromptManager, systemPrompt } from "./prompts.js";
import { model } from "./providers.js";
import { isError } from "./utils.js";

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

const addCommand = {
  command: "/add",
  description: "Add files to the chat.",
};

const treeCommand = {
  command: "/tree",
  description: "Display the directory of the curent project.",
};

const promptCommand = {
  command: "/prompt",
  description: "Opens default editor to accept prompt.",
};

const urlCommand = {
  command: "/url",
  description: "Retrieves the content of the url.",
};

const helpCommand = {
  command: "/help",
  description: "Shows usage table.",
};

const chatCommands: ChatCommand[] = [
  addCommand,
  resetCommand,
  saveCommand,
  byeCommand,
  exitCommand,
  helpCommand,
  treeCommand,
  promptCommand,
  urlCommand,
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

type Modes = "exploring" | "editing";

export async function chatCmd(args: Flags, config: any) {
  logger.info(config, "Config:");

  const exploringModel =
    args.provider === "openai"
      ? model("openai:gpt-4o")
      : model("anthropic:sonnet");
  const editingModel =
    args.provider === "openai"
      ? model("openai:gpt-4o")
      : model("anthropic:sonnet");

  let totalTokens = 0;

  const messages: CoreMessage[] = [];

  const promptManager = new PromptManager();

  let mode: Modes = "exploring";

  while (true) {
    writeHeader("Input:");
    writeln(`Mode: ${mode}`);
    writeln(`Model: ${exploringModel.modelId}`);
    writeln(`Files in context: ${promptManager.getFiles().length}`);
    writeln("");

    const userInput = await input({ message: ">" });
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

    if (userInput.startsWith("/mode")) {
      mode = await select({
        message: "Select a mode:",
        choices: [
          {
            name: "exploring",
            value: "exploring",
            description: "Mode for exploring ideas.",
          },
          {
            name: "editing",
            value: "editing",
            description: "Mode for generating edits.",
          },
        ],
      });

      continue;
    }

    if (userInput.trim() === resetCommand.command) {
      if (messages.length > 0) {
        await saveMessageHistory(messages);
        messages.length = 0;
      }
      continue;
    }

    if (userInput.trim() === treeCommand.command) {
      const tree = await directoryTree(process.cwd());
      writeHeader("File tree:");
      writeln(tree);
      continue;
    }

    if (userInput.startsWith(addCommand.command)) {
      const patterns = userInput
        .slice(addCommand.command.length)
        .trimStart()
        .split(" ")
        .map((p) => p.trim());
      const paths = await globby(patterns, {
        gitignore: true,
      });
      await Promise.all(
        paths.map(async (p) => {
          const filePath = path.join(process.cwd(), p);
          const content = await fs.readFile(filePath, "utf8");
          writeln(`Added ${filePath}, content length: ${content.length}`);
          promptManager.addFile(filePath, content);
        }),
      );

      continue;
    }
    if (userInput.startsWith(urlCommand.command)) {
      const url = userInput.slice(urlCommand.command.length).trimStart();
      if (!(url.startsWith("http://") || url.startsWith("https://"))) {
        writeError("Invalid URL. Please provide a valid http or https URL.");
        continue;
      }
      writeln(`Loading ${url}`);
      try {
        const content = await getUrlContent(url);
        promptManager.addUrl(url, content);
      } catch (error) {
        if (isError(error)) {
          writeError(`Error fetching URL: ${error.message}`);
        }
      }
      continue;
    }

    const { prompt, useCache } = await match(userInput.trim())
      .with("/editPrompt", async () => {
        const result = await promptManager.getPrompt("<placeholder>");
        const prompt = await editor({
          message: "Enter a prompt",
          postfix: ".md",
          default: result.prompt,
        });
        return {
          prompt: prompt,
          useCache: result.useCache,
        };
      })
      .with(promptCommand.command, async () => {
        const userMessage = await editor({
          message: "Enter a prompt",
          postfix: ".md",
        });
        return promptManager.getPrompt(userMessage);
      })
      .otherwise((input) => {
        if (input.trim() === "") {
          return Promise.resolve({
            prompt: "",
            useCache: false,
          });
        }
        return promptManager.getPrompt(input.trim());
      });

    if (useCache) {
      messages.push({
        role: "user",
        content: prompt,
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      });
    } else {
      messages.push({
        role: "user",
        content: prompt,
      });
    }

    try {
      const result = await (mode === "editing"
        ? generateText({
            model: editingModel,
            maxTokens: 8192,
            system: systemPrompt,
            messages: messages,
            maxSteps: 3,
            tools: {
              generateEdits: generateEditsTool(
                editingModel,
                promptManager.getFiles(),
              ),
              lint: lintTool(),
              build: buildTool(),
              format: formatTool(),
              gitDiff: gitDiffTool(),
              gitCommit: gitCommitTool(),
              codeInterpreter: codeInterpreterTool(),
            },
          })
        : generateText({
            model: exploringModel,
            maxTokens: 8192,
            system: systemPrompt,
            messages: messages,
            maxSteps: 3,
          }));

      logger.info(`Steps: ${result.steps.length}`);
      for (const step of result.steps) {
        logger.info(`Tools calls: ${step.toolCalls.length}`);
        logger.info(
          `Tools called: ${step.toolCalls.map((toolCall) => toolCall.toolName).join(", ")}`,
        );
        logger.info(`Tools results: ${step.toolResults.length}`);
        logger.info(
          `Tool results: ${step.toolResults.map((toolResult) => toolResult.toolName).join(", ")}`,
        );
        for (const toolResult of step.toolResults) {
          logger.info("Tool Result:", toolResult);
          if (toolResult.toolName === "generateEdits") {
            const editResults = toolResult.result;
            await Promise.all(
              editResults
                .filter((p) => p.result === "edits applied")
                .map(async (p) => {
                  const filePath = p.path;
                  const content = await fs.readFile(filePath, "utf8");
                  writeln(
                    `Updated ${filePath}, content length: ${content.length}\n`,
                  );
                  promptManager.addFile(filePath, content);
                }),
            );
          }
        }
        logger.info(step.usage, "Usage:");
      }

      messages.push({
        role: "assistant",
        content: result.text,
      });

      writeHeader("Assistant:");
      await writeMd(result.text);

      totalTokens += result.usage.totalTokens;

      writeHeader("Usage:");
      writeln(
        chalk.green(
          `Prompt tokens: ${result.usage.promptTokens}, Completion tokens: ${result.usage.completionTokens}, Total tokens: ${result.usage.totalTokens}`,
        ),
      );
      writeln(
        chalk.yellow(
          `Cache creation: ${result.experimental_providerMetadata?.anthropic.cacheCreationInputTokens}, Cache read: ${result.experimental_providerMetadata?.anthropic.cacheReadInputTokens}`,
        ),
      );
      writeln(chalk.green(`Tokens this session: ${totalTokens}`));
    } catch (e) {
      logger.error(e);
    }
  }
}
