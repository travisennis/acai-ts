import fs from "node:fs/promises";
import path from "node:path";
import { editor, input, select } from "@inquirer/prompts";
import { Readability } from "@mozilla/readability";
import { type CoreMessage, generateText } from "ai";
import chalk from "chalk";
import Table from "cli-table3";
import { convertHtmlToMarkdown } from "dom-to-semantic-markdown";
import figlet from "figlet";
import { globby } from "globby";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import meow from "meow";
import * as BuildTool from "./build-tool";
import * as CodeInterpreterTool from "./code-interpreter-tool";
import { asyncExec, writeHeader, writeln } from "./command";
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
import { model } from "./providers";
import { asyncTry, tryOrFail } from "./utils";

const cli = meow(
  `
	Usage
	  $ acai <input>

	Options
    --provider, -p  Sets the provider to use

	Examples
	  $ acai chat --provider anthropic
`,
  {
    importMeta: import.meta, // This is required
    flags: {
      provider: {
        type: "string",
        shortFlag: "p",
      },
    },
  },
);

type Flags = typeof cli.flags;

marked.setOptions({
  // Define custom renderer
  renderer: new TerminalRenderer() as any,
});

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

async function chatCmd(args: Flags, config: any) {
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

  const fileMap = new Map<string, string>();
  let filesUpdated = false;

  let mode: Modes = "exploring";

  while (true) {
    writeHeader("Input:");
    writeln(`Mode: ${mode}`);
    writeln(`Files in context: ${fileMap.size}`);
    writeln(`Files updated: ${filesUpdated}`);
    writeln("");

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
        postfix: ".md",
      });
    } else {
      prompt = userInput;
    }

    if (prompt.trim() === "") {
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
            model: editingModel,
            maxTokens: 8192,
            system: systemPrompt,
            messages: messages,
            maxSteps: 3,
            tools: {
              generateEdits: GenerateEditsTool.initTool(editingModel, files),
              lint: LintTool.initTool(),
              build: BuildTool.initTool(),
              format: FormatTool.initTool(),
              gitDiff: GitDiffTool.initTool(),
              gitCommit: GitCommitTool.initTool(),
              codeInterpreter: CodeInterpreterTool.initTool(),
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
                  fileMap.set(filePath, content);
                  filesUpdated = true;
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
      const md = await marked.parse(result.text);
      writeln(md);

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

async function main() {
  writeln(chalk.magenta(figlet.textSync("acai")));
  writeln(chalk.magenta("Greetings!"));
  writeln(chalk.yellow(`The current working directory is ${process.cwd()}`));

  const config = await readAppConfig("acai");
  tryOrFail(await asyncTry(chatCmd(cli.flags, config)), handleError);
}

main();
