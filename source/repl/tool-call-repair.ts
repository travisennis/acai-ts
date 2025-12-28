import type { JSONSchema7, LanguageModelV3ToolCall } from "@ai-sdk/provider";
import {
  generateText,
  NoSuchToolError,
  Output,
  type Tool,
  type ToolCallRepairFunction,
  type ToolSet,
} from "ai";
import { jsonrepair } from "jsonrepair";
import type z from "zod";
import { logger } from "../logger.ts";
import type { ModelManager } from "../models/manager.js";

type CompleteToolSet = ToolSet;
type InputSchemaFn = (options: { toolName: string }) => JSONSchema7;

async function remoteToolCallRepair(
  modelManager: ModelManager,
  toolCall: LanguageModelV3ToolCall,
  tool: Tool,
  inputSchema: InputSchemaFn,
) {
  const { output: repairedArgs } = await generateText({
    model: modelManager.getModel("tool-repair"),
    output: Output.object({
      schema: tool.inputSchema as z.ZodType<unknown>,
    }),
    prompt: [
      `The model tried to call the tool "${toolCall.toolName}" with the following arguments:`,
      JSON.stringify(toolCall.input),
      "The tool accepts the following schema:",
      JSON.stringify(inputSchema(toolCall)),
      "Please fix the arguments.",
    ].join("\n"),
  });

  return { ...toolCall, input: JSON.stringify(repairedArgs) };
}

const localToolCallRepair = async (
  toolCall: LanguageModelV3ToolCall,
  tool: Tool,
) => {
  const schema = tool.inputSchema as z.ZodType<unknown>;
  const repairedArgs = jsonrepair(toolCall.input);
  const validatedArgs = schema.parse(JSON.parse(repairedArgs));
  return { ...toolCall, input: JSON.stringify(validatedArgs) };
};

export const toolCallRepair = (modelManager: ModelManager) => {
  const fn: ToolCallRepairFunction<CompleteToolSet> = async ({
    toolCall,
    tools,
    inputSchema,
    error,
  }) => {
    if (NoSuchToolError.isInstance(error)) {
      return null;
    }

    logger.warn(`Attempting to repair tool call: ${toolCall.toolName}.`);

    const tool = tools[toolCall.toolName as keyof typeof tools];

    if (typeof tool === "undefined") {
      logger.error(
        new Error("Tool not found"),
        `Failed to repair tool call: ${toolCall.toolName}.`,
      );
      return null;
    }

    try {
      const repaired = await localToolCallRepair(toolCall, tool);
      logger.debug(`Tool call repaired with jsonrepair ${repaired.input}`);
      return repaired;
    } catch (err) {
      logger.error(
        err,
        `Failed to repair tool call locally: ${toolCall.toolName}.`,
      );
      try {
        const repaired = await remoteToolCallRepair(
          modelManager,
          toolCall,
          tool,
          inputSchema,
        );
        logger.debug(`Tool call repaired with remote repair ${repaired.input}`);
        return repaired;
      } catch (err2) {
        logger.error(
          err2,
          `Failed to repair tool call remotely: ${toolCall.toolName}.`,
        );
        return null;
      }
    }
  };
  return fn;
};
