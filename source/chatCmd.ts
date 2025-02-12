import path from "node:path";
import { text } from "node:stream/consumers";
import {
  type ModelName,
  isSupportedModel,
  languageModel,
  wrapLanguageModel,
} from "@travisennis/acai-core";
import { auditMessage } from "@travisennis/acai-core/middleware";
import {
  GIT_READ_ONLY,
  READ_ONLY,
  createCodeInterpreterTool,
  createCodeTools,
  createFileSystemTools,
  createGitTools,
} from "@travisennis/acai-core/tools";
import envPaths from "@travisennis/stdlib/env";
import { objectKeys } from "@travisennis/stdlib/object";
import { generateText, streamText } from "ai";
import chalk from "chalk";
import { write, writeError, writeHeader, writeln } from "./command.ts";
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";
import { metaPrompt, systemPrompt } from "./prompts.ts";

export async function chatCmd(
  args: Flags,
  config: Record<PropertyKey, unknown>,
) {
  logger.info(config, "Config:");

  const chosenModel: ModelName = isSupportedModel(args.model)
    ? args.model
    : "anthropic:sonnet";

  const stateDir = envPaths("acai").state;
  const messagesFilePath = path.join(stateDir, "cli-messages.jsonl");

  const langModel = wrapLanguageModel(
    languageModel(chosenModel),
    // usage,
    // log,
    auditMessage({ path: messagesFilePath }),
  );

  writeln(`Model: ${langModel.modelId}`);
  writeHeader("User Input:");
  let prompt = args.prompt;
  if (!args.prompt) {
    prompt = await text(process.stdin);
  }

  if (!prompt) {
    return;
  }

  writeln(prompt);

  try {
    const fsTools = await createFileSystemTools({
      workingDir: process.cwd(),
      sendData: async (msg) => writeln(await msg.data),
    });

    const gitTools = await createGitTools({
      workingDir: process.cwd(),
      sendData: async (msg) => writeln(await msg.data),
    });

    const codeTools = createCodeTools({
      baseDir: process.cwd(),
      sendData: async (msg) => writeln(await msg.data),
    });

    const codeInterpreterTool = createCodeInterpreterTool({
      sendData: async (msg) => writeln(await msg.data),
    });

    const allTools = {
      ...codeTools,
      ...fsTools,
      ...gitTools,
      ...codeInterpreterTool,
    } as const;

    let totalPromptTokens = 0;
    let totalCompletionsTokens = 0;
    let totalTokens = 0;

    const { text, usage } = await generateText({
      model: langModel,
      maxTokens: 8192,
      system: metaPrompt,
      prompt: prompt,
      maxSteps: 5,
      tools: allTools,
      experimental_activeTools: [
        ...objectKeys(fsTools).filter(
          (tool) => READ_ONLY.includes(tool as any),
          ...objectKeys(gitTools).filter((tool) =>
            GIT_READ_ONLY.includes(tool as any),
          ),
          "buildCode",
          "lintCode",
        ),
      ],
    });

    totalPromptTokens += usage.promptTokens;
    totalCompletionsTokens += usage.completionTokens;
    totalTokens += usage.totalTokens;

    writeHeader("Enhanced prompt:");
    writeln(text);

    const result = streamText({
      model: langModel,
      maxTokens: 8192,
      system: systemPrompt,
      prompt: text,
      maxSteps: 15,
      tools: allTools,
      onStepFinish: (event) => {
        if (
          event.stepType === "initial" &&
          event.toolCalls.length > 0 &&
          event.text.length > 0
        ) {
          writeHeader("Step");
          writeln(`Assistant: ${event.text}`);
          writeln(`Tool: ${event.toolCalls[0].toolName}`);
          writeln(`Result: ${event.toolResults[0].result}`);
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
            `Cache creation: ${result.providerMetadata?.anthropic.cacheCreationInputTokens}, Cache read: ${result.providerMetadata?.anthropic.cacheReadInputTokens}`,
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
        writeError(String(error));
      },
    });

    writeHeader("Assistant:");
    for await (const chunk of result.fullStream) {
      if (chunk.type === "reasoning" || chunk.type === "text-delta") {
        write(chunk.textDelta);
      }
    }

    result.consumeStream();
  } catch (e) {
    logger.error(e);
  }
}
