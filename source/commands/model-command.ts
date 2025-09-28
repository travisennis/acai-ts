import {
  formatModelInfo,
  getModelsByCategory,
  isValidModel,
  type ModelName,
  type ModelProvider,
  modelRegistry,
  models,
  providers,
} from "../models/providers.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export function modelCommand(options: CommandOptions): ReplCommand {
  const { terminal, modelManager } = options;

  function switchModel(newModelName: ModelName) {
    try {
      // Get current and new model configs
      const currentModelConfig = modelManager.getModelMetadata("repl");
      const newModelConfig = modelRegistry[newModelName]; // Ensure modelRegistry is available

      if (!newModelConfig) {
        terminal.error(`Model configuration not found for: ${newModelName}`);
        return;
      }

      // Check for capability differences
      if (
        currentModelConfig.supportsToolCalling &&
        !newModelConfig.supportsToolCalling
      ) {
        terminal.warn(
          "The new model doesn't support tool calling, which may limit functionality.",
        );
      }
      if (
        currentModelConfig.supportsReasoning &&
        !newModelConfig.supportsReasoning
      ) {
        terminal.warn(
          "The new model doesn't support reasoning, which may change response quality.",
        );
      }

      // Update model in ModelManager
      modelManager.setModel("repl", newModelName);

      // Assuming ModelManager handles the actual model instance switching internally.
      terminal.info(`Model set to ${newModelName}.`); // Simplified message
    } catch (error) {
      terminal.error(`Failed to switch model: ${(error as Error).message}`);
    }
  }

  return {
    command: "/model",
    description:
      "List available models or switch to a different model. Usage: /model [provider:model-name|category|provider]",

    getSubCommands: () => Promise.resolve(models as unknown as string[]),
    async execute(args: string[]): Promise<"break" | "continue" | "use"> {
      const arg = args.join(" ").trim();
      const modelConfig = modelManager.getModelMetadata("repl");

      // No args - display current model and list available models by category
      if (!arg) {
        const currentModel = modelConfig.id;
        terminal.header(`Current model: ${currentModel}`);
        terminal.header("Available models by category:");

        // Display models by category
        for (const category of ["fast", "balanced", "powerful"] as const) {
          // Use 'as const' for stricter typing
          terminal.writeln(
            `\n${category.charAt(0).toUpperCase() + category.slice(1)} models:`,
          );
          for (const model of getModelsByCategory(category)) {
            terminal.writeln(formatModelInfo(model));
          }
        }
        return "continue";
      }

      // Switch to a specific model
      if (isValidModel(arg)) {
        // Call the standalone switchModel function
        switchModel(arg as ModelName);
        return "continue";
      }

      // Display models by category
      const categories = ["fast", "balanced", "powerful"];
      if (categories.includes(arg)) {
        terminal.header(
          `${arg.charAt(0).toUpperCase() + arg.slice(1)} models:`,
        );
        // Need to assert arg is a valid category if the check passes
        for (const model of getModelsByCategory(
          arg as "fast" | "balanced" | "powerful",
        )) {
          terminal.writeln(formatModelInfo(model));
        }
        return "continue";
      }

      // Display models by provider
      if (providers.includes(arg as ModelProvider)) {
        terminal.header(`Models from ${arg}:`);
        // Need to ensure modelRegistry is accessible and correctly typed
        for (const model of Object.values(modelRegistry).filter(
          (m) => m.provider === arg,
        )) {
          terminal.writeln(formatModelInfo(model));
        }
        return "continue";
      }

      // Invalid model name
      terminal.error(`Invalid model name or category: ${arg}`);
      terminal.info("Usage: /model [provider:model-name|category|provider]");
      return "continue";
    },
  };
}
