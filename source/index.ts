import { createAnthropic } from "@ai-sdk/anthropic";
import { editor, input } from "@inquirer/prompts";
import { CoreMessage, streamText } from "ai";
import { globby } from "globby";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import meow from "meow";
import fs from "node:fs/promises";
import path from "node:path";
import * as BuildTool from "./build-tool";
import { handleError } from "./errors";
import { directoryTree } from "./files";
import * as FormatTool from "./format-tool";
import * as GenerateEditsTool from "./generate-edits-tool";
import * as LintTool from "./lint-tool";
import { systemPrompt, userPromptTemplate } from "./prompts";
import { mergeTools } from "./tools";
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

async function chatCmd(args: Flags) {
  console.log("chat mode");

  const model = createAnthropic({
    apiKey: process.env.CLAUDE_API_KEY,
    headers: {
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
    },
  });

  const dirTree = await directoryTree(process.cwd());

  const messages: CoreMessage[] = [];
  const fileMap = new Map<string, string>();
  while (true) {
    const userInput = await input({ message: ">" });
    let prompt = "";
    if (userInput.trim() === "/bye") {
      break;
    } else if (userInput.trim() === "/exit") {
      break;
    } else if (userInput.trim() === "/reset") {
      messages.length = 0;
      continue;
    } else if (userInput.startsWith("/add")) {
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
    } else if (userInput.trim() === "/prompt") {
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

    const tools = [
      GenerateEditsTool.initTool(model("claude-3-5-sonnet-20240620"), files),
      LintTool.initTool(),
      BuildTool.initTool(),
      FormatTool.initTool(),
    ];

    const result = await streamText({
      model: model("claude-3-5-sonnet-20240620"),
      maxTokens: 8192,
      system: systemPrompt,
      messages: messages,
      maxToolRoundtrips: 5,
      tools: mergeTools(tools),
      onFinish: async (event) => {
        messages.push({
          role: "assistant",
          content: event.text,
        });
        const md = await marked.parse(event.text);
        process.stdout.write(`\n${md}\n`);
      },
    });

    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
    // for (const content of response.content) {
    //   if (content.type === "text") {
    //     const md = await marked.parse(content.text);
    //     process.stdout.write(`\n${md}\n`);
    //   } else if (content.type === "tool_use") {
    //     const tool = tools.find((tool) => tool.getName() === content.name);
    //     if (tool) {
    //       const toolCallResult = await asyncTry(
    //         tool.call(content.input as { [key: string]: string }),
    //       );
    //       if (isError(toolCallResult)) {
    //         console.error(
    //           `Error calling tool ${tool.getName()}:`,
    //           toolCallResult,
    //         );
    //         const errorMessage = toolCallResult.message;
    //         messages.push({
    //           role: "user",
    //           content: [
    //             {
    //               type: "tool_result",
    //               tool_use_id: content.id,
    //               content: `Tool execution failed. Error: ${errorMessage}`,
    //             },
    //           ],
    //         });
    //         continue;
    //       }
    //       if (tool.getName() === "generate_edits") {
    //         const editResults = JSON.parse(toolCallResult) as {
    //           path: string;
    //           result: string;
    //         }[];
    //         await Promise.all(
    //           editResults
    //             .filter((p) => p.result === "edits applied")
    //             .map(async (p) => {
    //               const filePath = p.path;
    //               const content = await fs.readFile(filePath, "utf8");
    //               console.log("Updated", filePath, content.length);
    //               fileMap.set(filePath, content);
    //             }),
    //         );
    //       }
    //       messages.push({
    //         role: "user",
    //         content: [
    //           {
    //             type: "tool_result",
    //             tool_use_id: content.id,
    //             content: `Tool execution completed. Results: ${toolCallResult}`,
    //           },
    //         ],
    //       });
    //       const response = await client.messages.create(
    //         {
    //           model: "claude-3-5-sonnet-20240620",
    //           max_tokens: 8192,
    //           system: systemPrompt,
    //           messages,
    //           tools: tools.map((tool) => tool.getDefinition()),
    //         },
    //         {
    //           headers: {
    //             "anthropic-version": "2023-06-01",
    //             "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
    //           },
    //         },
    //       );
    //       messages.push({
    //         role: "assistant",
    //         content: response.content,
    //       });
    //       for (const content of response.content) {
    //         if (content.type === "text") {
    //           const md = await marked.parse(content.text);
    //           process.stdout.write(`${md}\n`);
    //         }
    //       }
    //     }
    // }
    // }
  }
}

async function main() {
  console.log("acai");

  tryOrFail(await asyncTry(chatCmd(cli.flags)), handleError);
}

void main();
