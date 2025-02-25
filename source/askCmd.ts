import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type ModelName,
  formatFile,
  isSupportedModel,
  languageModel,
  wrapLanguageModel,
} from "@travisennis/acai-core";
import { auditMessage } from "@travisennis/acai-core/middleware";
import { directoryTree } from "@travisennis/acai-core/tools";
import envPaths from "@travisennis/stdlib/env";
import { generateText, streamText } from "ai";
import chalk from "chalk";
import { write, writeError, writeHeader, writeln } from "./command.ts";
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";

const retrieverSystemPrompt = (fileStructure: string) => {
  return `The following files are found in the repository:
${fileStructure}
Please provide a list of files that you would like to search for answering the user query.
Enclose the file paths in a list in a markdown code block as shown below:
\`\`\`
1. [[ filepath_1 ]]\n
2. [[ filepath_2 ]]\n
3. [[ filepath_3 ]]\n
...
\`\`\`
Think step-by-step and strategically reason about the files you choose to maximize the chances of finding the answer to the query. Only pick the files that are most likely to contain the information you are looking for in decreasing order of relevance. Once you have selected the files, please submit your response in the appropriate format mentioned above (markdown numbered list in a markdown code block). The filepath within [[ and ]] should contain the complete path of the file in the repository.`;
};

function extractFilePaths(text: string): string[] {
  const paths: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const match = line.match(/\[\[\s*(.*?)\s*\]\]/);
    if (match?.[1]) {
      paths.push(match[1]);
    }
  }

  return paths;
}

export async function askCmd(
  prompt: string,
  args: Flags,
  config: Record<PropertyKey, unknown>,
) {
  logger.info(config, "Config:");

  const now = new Date();

  const chosenModel: ModelName = isSupportedModel(args.model)
    ? args.model
    : "deepseek:deepseek-reasoner";

  const stateDir = envPaths("acai").state;
  const messagesFilePath = path.join(
    stateDir,
    `${now.toISOString()}-ask-message.json`,
  );
  const fileRetrieverFilePath = path.join(
    stateDir,
    `${now.toISOString()}-file-retriever-message.json`,
  );

  const langModel = wrapLanguageModel(
    languageModel(chosenModel),
    auditMessage({ path: messagesFilePath, app: "ask" }),
  );

  writeln(`Model: ${langModel.modelId}`);
  writeHeader("User Input:");
  writeln(prompt);

  try {
    let totalPromptTokens = 0;
    let totalCompletionsTokens = 0;
    let totalTokens = 0;

    const { text } = await generateText({
      model: wrapLanguageModel(
        languageModel("google:flash2"),
        auditMessage({ path: fileRetrieverFilePath, app: "file-retriever" }),
      ),
      system: retrieverSystemPrompt(await directoryTree(process.cwd())),
      prompt,
    });

    const usefulFiles = extractFilePaths(text);

    writeHeader("Reading files:");
    for (const file of usefulFiles) {
      writeln(file);
    }

    const finalPrompt = `${usefulFiles
      .map((filePath) => {
        return formatFile(
          filePath,
          readFileSync(path.join(process.cwd(), "..", filePath), "utf-8"),
          "bracket",
        );
      })
      .join("\n\n")}${prompt}`;

    const result = streamText({
      model: langModel,
      maxTokens: 8000,
      prompt: finalPrompt,
      temperature: 0.6,
      maxSteps: 30,
      onStepFinish: (event) => {
        if (
          event.stepType === "initial" &&
          event.toolCalls.length > 0 &&
          event.text.length > 0
        ) {
          writeHeader("Step");
          writeln(`Assistant: ${event.text}`);
        }
      },
      onFinish: (result) => {
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
            `Cache creation: ${result.providerMetadata?.anthropic?.cacheCreationInputTokens}, Cache read: ${result.providerMetadata?.anthropic?.cacheReadInputTokens}`,
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
          write("\n</think>\n");
        }
        write(chunk.textDelta);
        lastType = chunk.type;
      }
    }
    if (lastType === "reasoning") {
      write("\n</think>\n");
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
