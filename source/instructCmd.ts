import path from "node:path";
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
  createGrepTools,
} from "@travisennis/acai-core/tools";
import envPaths from "@travisennis/stdlib/env";
import { objectKeys } from "@travisennis/stdlib/object";
import { NoSuchToolError, generateObject, generateText, streamText } from "ai";
import chalk from "chalk";
import { write, writeError, writeHeader, writeln } from "./command.ts";
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";
import { metaPrompt, systemPrompt } from "./prompts.ts";

export async function instructCmd(
  prompt: string,
  args: Flags,
  config: Record<PropertyKey, unknown>,
) {
  logger.info(config, "Config:");

  const now = new Date();

  const chosenModel: ModelName = isSupportedModel(args.model)
    ? args.model
    : "anthropic:sonnet";

  const stateDir = envPaths("acai").state;
  const messagesFilePath = path.join(
    stateDir,
    `${now.toISOString()}-instruct-message-.json`,
  );

  const metaPromptFilePath = path.join(
    stateDir,
    `${now.toISOString()}-instruct-meta-prompt-message.json`,
  );

  const langModel = wrapLanguageModel(
    languageModel(chosenModel),
    auditMessage({ path: messagesFilePath, app: "instruct" }),
  );

  writeln(`Model: ${langModel.modelId}`);
  writeHeader("User Input:");
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

    const grepTool = createGrepTools({
      sendData: async (msg) => writeln(await msg.data),
    });

    const allTools = {
      ...codeTools,
      ...fsTools,
      ...gitTools,
      ...codeInterpreterTool,
      ...grepTool,
    } as const;

    let totalPromptTokens = 0;
    let totalCompletionsTokens = 0;
    let totalTokens = 0;

    const { text, usage } = await generateText({
      model: wrapLanguageModel(
        languageModel(chosenModel),
        auditMessage({ path: metaPromptFilePath, app: "instruct-meta-prompt" }),
      ),
      maxTokens: 8192,
      system: metaPrompt,
      prompt: prompt,
      maxSteps: 15,
      tools: allTools,
      // biome-ignore lint/style/useNamingConvention: <explanation>
      experimental_activeTools: [
        ...objectKeys(fsTools).filter((tool) =>
          READ_ONLY.includes(tool as any),
        ),
        ...objectKeys(gitTools).filter((tool) =>
          GIT_READ_ONLY.includes(tool as any),
        ),
        "buildCode",
        "lintCode",
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
      maxSteps: 30,
      tools: allTools,
      // biome-ignore lint/style/useNamingConvention: <explanation>
      experimental_repairToolCall: async ({
        toolCall,
        tools,
        parameterSchema,
        error,
      }) => {
        if (NoSuchToolError.isInstance(error)) {
          return null; // do not attempt to fix invalid tool names
        }

        const tool = tools[toolCall.toolName as keyof typeof tools];

        const { object: repairedArgs } = await generateObject({
          model: languageModel("openai:gpt-4o-structured"),
          schema: tool.parameters,
          prompt: [
            `The model tried to call the tool "${toolCall.toolName}" with the following arguments:`,
            JSON.stringify(toolCall.args),
            "The tool accepts the following schema:",
            JSON.stringify(parameterSchema(toolCall)),
            "Please fix the arguments.",
          ].join("\n"),
        });

        return { ...toolCall, args: JSON.stringify(repairedArgs) };
      },
      onStepFinish: (event) => {
        if (
          event.stepType === "initial" &&
          event.toolCalls.length > 0 &&
          event.text.length > 0
        ) {
          writeHeader("Step");
          writeln(`Assistant: ${event.text}`);
          writeln(`Tool: ${event.toolCalls[0]?.toolName}`);
          writeln(`Result: ${event.toolResults[0]?.result}`);
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
    if (e instanceof Error) {
      logger.error(e);
    } else {
      logger.error(JSON.stringify(e, null, 2));
    }
  }
}
