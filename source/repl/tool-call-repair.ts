import {
  generateObject,
  NoSuchToolError,
  type ToolCallRepairFunction,
  type ToolSet,
} from "ai";
import type z from "zod";
import { logger } from "../logger.ts";
import type { ModelManager } from "../models/manager.js";
import type { Terminal } from "../terminal/index.ts";

type CompleteToolSet = ToolSet;

export const toolCallRepair = (
  modelManager: ModelManager,
  terminal: Terminal,
) => {
  const fn: ToolCallRepairFunction<CompleteToolSet> = async ({
    toolCall,
    tools,
    inputSchema,
    error,
  }) => {
    if (NoSuchToolError.isInstance(error)) {
      return null;
    }

    terminal.warn(`Attempting to repair tool call: ${toolCall.toolName}.`);
    terminal.lineBreak();

    const tool = tools[toolCall.toolName as keyof typeof tools];
    if (typeof tool === "undefined") {
      logger.error(
        new Error("Tool not found"),
        `Failed to repair tool call: ${toolCall.toolName}.`,
      );
      return null;
    }

    try {
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

      return { ...toolCall, args: JSON.stringify(repairedArgs) };
    } catch (err) {
      logger.error(err, `Failed to repair tool call: ${toolCall.toolName}.`);
      return null;
    }
  };
  return fn;
};
