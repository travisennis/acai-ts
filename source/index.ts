import fs from "node:fs/promises";
import path from "node:path";
import { createAnthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { editor, input } from "@inquirer/prompts";
import { type CoreMessage, generateText } from "ai";
import chalk from "chalk";
import { globby } from "globby";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import meow from "meow";
import * as BuildTool from "./build-tool";
import { readAppConfig } from "./config";
import { handleError } from "./errors";
import { directoryTree } from "./files";
import * as CodeInterpreterTool from "./code-interpreter-tool";
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
  return anthropic(args.model ?? "claude-3-5-sonnet-20240620");
}

async function chatCmd(args: Flags, config: any) {
  logger.info(config, "Config:");
  const model = getModel(args);

  let totalTokens = 0;
  const messages: CoreMessage[] = [];
  const fileMap = new Map<string, string>();
  let filesUpdated = false;
  while (true) {
    const userInput = await input({ message: ">" });
    let prompt = "";
    if (userInput.trim() === "/bye") {
      break;
    }

    if (userInput.trim() === "/exit") {
      break;
    }

    if (userInput.trim() === "/reset") {
      messages.length = 0;
      continue;
    }

    if (userInput.startsWith("/add")) {
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

    if (userInput.trim() === "/prompt") {
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
      filesUpdated = false;
    }

    messages.push({
      role: "user",
      content: userPromptTemplate(context),
    });

    try {
      const result = await generateText({
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
      });

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

      process.stdout.write(chalk.yellow(`\n${"-".repeat(80)}\n`));
      const md = await marked.parse(result.text);
      process.stdout.write(`\n${md}\n`);

      totalTokens += result.usage.totalTokens;

      process.stdout.write(
        chalk.green(
          `\nPrompt tokens: ${result.usage.promptTokens}, Completion tokens: ${result.usage.completionTokens}, Total tokens: ${result.usage.totalTokens}\n`,
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
  process.stdout.write(chalk.magenta("acai\n"));

  const config = await readAppConfig("acai");
  tryOrFail(await asyncTry(chatCmd(cli.flags, config)), handleError);
}

main();
