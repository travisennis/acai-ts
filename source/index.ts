import fs from "node:fs/promises";
import path from "node:path";
import { createAnthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { editor, input } from "@inquirer/prompts";
import { type CoreMessage, streamText } from "ai";
import { globby } from "globby";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import meow from "meow";
import * as BuildTool from "./build-tool";
import { handleError } from "./errors";
import { directoryTree } from "./files";
import * as FormatTool from "./format-tool";
import * as GenerateEditsTool from "./generate-edits-tool";
import * as GitDiffTool from "./git-diff-tool";
import * as LintTool from "./lint-tool";
import { systemPrompt, userPromptTemplate } from "./prompts";
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

function getModel(args: Flags) {
  if (args.provider === "openai") {
    return openai("gpt-4o-2024-08-06");
  }

  const anthropic = createAnthropic({
    apiKey: process.env.CLAUDE_API_KEY,
    headers: {
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
    },
  });
  return anthropic("claude-3-5-sonnet-20240620");
}

async function chatCmd(args: Flags) {
  const model = getModel(args);

  const dirTree = await directoryTree(process.cwd());

  const messages: CoreMessage[] = [];
  const fileMap = new Map<string, string>();
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
          console.log("Added", filePath, content.length);
          fileMap.set(filePath, content);
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

    const files = Array.from(fileMap, ([path, content]) => ({ path, content }));

    messages.push({
      role: "user",
      content: userPromptTemplate({ fileTree: dirTree, files, prompt }),
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
        },
        onFinish: async (event) => {
          const toolCalls = event.toolCalls ?? [];
          for (const toolCall of toolCalls) {
            console.dir(toolCall);
          }
          const toolResults = event.toolResults ?? [];
          for (const toolResult of toolResults) {
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
                    console.log("Updated", filePath, content.length);
                    fileMap.set(filePath, content);
                  }),
              );
            }
          }
          messages.push({
            role: "assistant",
            content: event.text,
          });
          process.stdout.write(`${"-".repeat(80)}\n`);
          const md = await marked.parse(event.text);
          process.stdout.write(`\n${md}\n`);
        },
      });

      for await (const chunk of result.textStream) {
        process.stdout.write(chunk);
      }
    } catch (e) {
      console.error(e);
    }
  }
}

async function main() {
  process.stdout.write("acai\n");

  tryOrFail(await asyncTry(chatCmd(cli.flags)), handleError);
}

main();
