import fs from "node:fs/promises";
import path from "node:path";
import { createAnthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { editor, input, select } from "@inquirer/prompts";
import { type CoreMessage, generateText } from "ai";
import chalk from "chalk";
import Table from "cli-table3";
import { globby } from "globby";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import meow from "meow";
import * as BuildTool from "./build-tool";
import * as CodeInterpreterTool from "./code-interpreter-tool";
import { readAppConfig, saveMessageHistory } from "./config";
import { handleError } from "./errors";
import { directoryTree } from "./files";
import * as FormatTool from "./format-tool";
import * as GenerateEditsTool from "./generate-edits-tool";
import * as GitCommitTool from "./git-commit-tool";
import * as GitDiffTool from "./git-diff-tool";
import * as LintTool from "./lint-tool";
import { logger } from "./logger";
import {
  type UserPromptContext,
  systemPrompt,
  userPromptTemplate,
} from "./prompts";
import { asyncTry, tryOrFail } from "./utils";
import { convertHtmlToMarkdown } from "dom-to-semantic-markdown";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const cli = meow(
  `
	Usage
	  $ acai <input>

	Options
    --model, -m  Sets the model to use
    --provider, -p  Sets the provider to use

	Examples
	  $ acai chat --model gpt4
`,
  {
    importMeta: import.meta, // This is required
    flags: {
      provider: {
        type: "string",
        shortFlag: "p",
      },
      model: {
        type: "string",
        shortFlag: "m",
      },
    },
  },
);

type Flags = typeof cli.flags;

marked.setOptions({
  // Define custom renderer
  renderer: new TerminalRenderer() as any,
});

function getModel(args: Flags) {
  if (args.provider === "openai") {
    return openai(args.model ?? "gpt-4o-2024-08-06");
  }

  const anthropic = createAnthropic({
    apiKey: process.env.CLAUDE_API_KEY,
    headers: {
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
    },
  });
  return anthropic(args.model ?? "claude-3-5-sonnet-20240620", {
    cacheControl: true,
  });
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

  process.stdout.write(`\n${table.toString()}\n`);
}

type Modes = "exploring" | "editing";

async function chatCmd(args: Flags, config: any) {
  logger.info(config, "Config:");

  const model = getModel(args);

  let totalTokens = 0;

  const messages: CoreMessage[] = [];

  const fileMap = new Map<string, string>();
  let filesUpdated = false;

  let mode: Modes = "exploring";

  while (true) {
    const userInput = await input({ message: ">" });
    let prompt = "";
    if (
      userInput.trim() === exitCommand.command ||
      userInput.trim() === byeCommand.command
    ) {
      await saveMessageHistory(messages);
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
      await saveMessageHistory(messages);
      messages.length = 0;
      continue;
    }

    if (userInput.trim() === treeCommand.command) {
      const tree = await directoryTree(process.cwd());
      process.stdout.write(`${tree}\n`);
      continue;
    }

    if (userInput.startsWith(addCommand.command)) {
      const patterns = userInput
        .slice("/add".length)
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
          process.stdout.write(
            `Added ${filePath}, content length: ${content.length}\n`,
          );
          fileMap.set(filePath, content);
          filesUpdated = true;
        }),
      );

      continue;
    }

    if (userInput.startsWith(urlCommand.command)) {
      const url = userInput.slice(urlCommand.command.length).trimStart();
      console.log(`Loading ${url}`);
      const result = await asyncExec(
        `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --headless --dump-dom ${url}`,
      );
      const dom = new JSDOM(result);
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      const markdown = convertHtmlToMarkdown(result, {
        overrideDOMParser: new dom.window.DOMParser(),
      });
      console.log(markdown);
      console.log(article?.textContent);
      continue;
    }

    if (userInput.trim() === promptCommand.command) {
      prompt = await editor({
        message: "Enter a prompt",
      });
    } else {
      prompt = userInput;
    }

    if (prompt === "") {
      continue;
    }

    const files = Array.from(fileMap, ([path, content]) => ({
      path,
      content,
    }));

    const context: UserPromptContext = { prompt };
    if (filesUpdated) {
      context.fileTree = await directoryTree(process.cwd());
      context.files = files;
      messages.push({
        role: "user",
        content: userPromptTemplate(context),
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      });
      filesUpdated = false;
    } else {
      messages.push({
        role: "user",
        content: userPromptTemplate(context),
      });
    }

    try {
      const result = await (mode === "editing"
        ? generateText({
            model: model,
            maxTokens: 8192,
            system: systemPrompt,
            messages: messages,
            maxSteps: 3,
            tools: {
              generateEdits: GenerateEditsTool.initTool(model, files),
              lint: LintTool.initTool(),
              build: BuildTool.initTool(),
              format: FormatTool.initTool(),
              gitDiff: GitDiffTool.initTool(),
              gitCommit: GitCommitTool.initTool(),
              codeInterpreter: CodeInterpreterTool.initTool(),
            },
          })
        : generateText({
            model: model,
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
        logger.info(step.usage, "Usage:");
      }

      const toolResults = result.toolResults ?? [];
      logger.info(`All tools results: ${result.toolResults.length}`);
      for (const toolResult of toolResults) {
        logger.info("Tool Result:", toolResult);
        if (toolResult.toolName === "generateEdits") {
          const editResults = toolResult.result;
          await Promise.all(
            editResults
              .filter((p) => p.result === "edits applied")
              .map(async (p) => {
                const filePath = p.path;
                const content = await fs.readFile(filePath, "utf8");
                process.stdout.write(
                  `Updated ${filePath}, content length: ${content.length}\n`,
                );
                fileMap.set(filePath, content);
                filesUpdated = true;
              }),
          );
        }
      }

      messages.push({
        role: "assistant",
        content: result.text,
      });

      process.stdout.write(
        chalk.yellow(`\n${"-".repeat(process.stdout.columns)}\n`),
      );
      const md = await marked.parse(result.text);
      process.stdout.write(`\n${md}\n`);

      totalTokens += result.usage.totalTokens;

      process.stdout.write(
        chalk.green(
          `\nPrompt tokens: ${result.usage.promptTokens}, Completion tokens: ${result.usage.completionTokens}, Total tokens: ${result.usage.totalTokens}\n`,
        ),
      );
      process.stdout.write(
        chalk.yellow(
          `${JSON.stringify(result.experimental_providerMetadata?.anthropic ?? "", undefined, 2)}\n`,
        ),
      );
      process.stdout.write(
        chalk.green(`Tokens this session: ${totalTokens}\n`),
      );
    } catch (e) {
      logger.error(e);
    }
  }
}

async function main() {
  process.stdout.write(chalk.magenta("Greetings! I am acai.\n"));
  process.stdout.write(
    chalk.yellow(`The current working directory is ${process.cwd()}\n`),
  );

  const config = await readAppConfig("acai");
  tryOrFail(await asyncTry(chatCmd(cli.flags, config)), handleError);
}

main();
