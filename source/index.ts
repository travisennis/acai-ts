import fs from "node:fs/promises";
import path from "node:path";
import { createAnthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { editor, input } from "@inquirer/prompts";
import { type CoreMessage, streamText } from "ai";
import chalk from "chalk";
import { globby } from "globby";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import meow from "meow";
import * as BuildTool from "./build-tool";
import { readAppConfig } from "./config";
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
        default: "anthropic",
      },
      model: {
        type: "string",
        shortFlag: "m",
        default: "sonnet",
      },
    },
  },
);

type Flags = typeof cli.flags;

marked.setOptions({
  // Define custom renderer
  renderer: new TerminalRenderer() as any,
});

function getModel(args: Flags, config: any) {
  if (args.provider === "openai") {
    return openai(config.openai?.model || "gpt-4o-2024-08-06");
  }

  const anthropic = createAnthropic({
    apiKey: config.anthropic?.apiKey || process.env.CLAUDE_API_KEY,
    headers: {
      "anthropic-version": config.anthropic?.version || "2023-06-01",
      "anthropic-beta":
        config.anthropic?.beta || "max-tokens-3-5-sonnet-2024-07-15",
    },
  });
  return anthropic(config.anthropic?.model || "claude-3-5-sonnet-20240620");
}

async function chatCmd(args: Flags, config: any) {
  const model = getModel(args, config);

  const dirTree = await directoryTree(process.cwd());

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
          logger.info(`Added ${filePath}, content length: ${content.length}`);
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

    const context: UserPromptContext = { fileTree: dirTree, prompt };
    if (filesUpdated) {
      context.files = files;
      filesUpdated = false;
    }

    messages.push({
      role: "user",
      content: userPromptTemplate(context),
    });

    try {
      const result = await streamText({
        model: model,
        maxTokens: 8192,
        system: systemPrompt,
        messages: messages,
        maxToolRoundtrips: 5,
        tools: {
          generateEdits: GenerateEditsTool.initTool(model, files),
          lint: LintTool.initTool(),
          build: BuildTool.initTool(),
          format: FormatTool.initTool(),
          gitDiff: GitDiffTool.initTool(),
          gitCommit: GitCommitTool.initTool(),
        },
        onFinish: async (event) => {
          logger.info("onFinish");
          const toolCalls = event.toolCalls ?? [];
          for (const toolCall of toolCalls) {
            logger.info("Tool Call:", toolCall);
          }
          const toolResults = event.toolResults ?? [];
          for (const toolResult of toolResults) {
            logger.info("Tool Result:", toolResult);
            if (toolResult.toolName === "generateEdits") {
              const editResults = JSON.parse(toolResult.result) as {
                path: string;
                result: string;
              }[];
              await Promise.all(
                editResults
                  .filter((p) => p.result === "edits applied")
                  .map(async (p) => {
                    const filePath = p.path;
                    const content = await fs.readFile(filePath, "utf8");
                    logger.info(
                      `Updated ${filePath}, content length: ${content.length}`,
                    );
                    fileMap.set(filePath, content);
                    filesUpdated = true;
                  }),
              );
            }
          }
          messages.push({
            role: "assistant",
            content: event.text,
          });
          process.stdout.write(chalk.yellow(`\n${"-".repeat(80)}\n`));
          const md = await marked.parse(event.text);
          process.stdout.write(`\n${md}\n`);
        },
      });

      for await (const chunk of result.textStream) {
        process.stdout.write(chunk);
      }
    } catch (e) {
      logger.error(e);
    }
  }
}

async function main() {
  process.stdout.write("acai\n");

  const config = await readAppConfig("acai");
  tryOrFail(await asyncTry(chatCmd(cli.flags, config)), handleError);
}

main();
