import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type ModelName,
  dedent,
  formatFile,
  isSupportedModel,
  languageModel,
  wrapLanguageModel,
} from "@travisennis/acai-core";
import { auditMessage } from "@travisennis/acai-core/middleware";
import envPaths from "@travisennis/stdlib/env";
import { streamText } from "ai";
import chalk from "chalk";
import { write, writeError, writeHeader, writeln } from "./command.ts";
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";
import { retrieveFilesForTask } from "./fileRetriever.ts";

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

    const usefulFiles = await retrieveFilesForTask({
      model: chosenModel,
      prompt,
    });

    writeHeader("Reading files:");
    for (const file of usefulFiles) {
      writeln(file);
    }

    const finalPrompt = `${usefulFiles
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
