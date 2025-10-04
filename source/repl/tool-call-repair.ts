import type { JSONSchema7, LanguageModelV2ToolCall } from "@ai-sdk/provider";
import {
  generateObject,
  NoSuchToolError,
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
  toolCall: LanguageModelV2ToolCall,
  tool: Tool,
  inputSchema: InputSchemaFn,
) {
  const { object: repairedArgs } = await generateObject({
    model: modelManager.getModel("tool-repair"),
    schema: tool.inputSchema as z.ZodSchema<unknown>,
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
  toolCall: LanguageModelV2ToolCall,
  tool: Tool,
) => {
  const schema = tool.inputSchema as z.ZodSchema<unknown>;
  const repairedArgs = jsonrepair(toolCall.input);
  schema.parse(repairedArgs);
  return { ...toolCall, input: JSON.stringify(repairedArgs) };
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
      return localToolCallRepair(toolCall, tool);
    } catch (err) {
      logger.error(
        err,
        `Failed to repair tool call locally: ${toolCall.toolName}.`,
      );
      try {
        return remoteToolCallRepair(modelManager, toolCall, tool, inputSchema);
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
