import {
  isValidModel,
  type ModelMetadata,
  type ModelName,
  modelRegistry,
  models,
} from "../../models/providers.ts";
import style from "../../terminal/style.ts";
import {
  type Container,
  type Editor,
  Text,
  type TUI,
} from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import { showModelSelector } from "./model-panel.ts";

function getCapabilityWarnings(
  current: ModelMetadata,
  next: ModelMetadata,
): string[] {
  const warnings: string[] = [];
  if (current.supportsToolCalling && !next.supportsToolCalling) {
    warnings.push(
      "The new model doesn't support tool calling, which may limit functionality.",
    );
  }
  if (current.supportsReasoning && !next.supportsReasoning) {
    warnings.push(
      "The new model doesn't support reasoning, which may change response quality.",
    );
  }
  return warnings;
}

export function modelCommand(options: CommandOptions): ReplCommand {
  const { modelManager } = options;

  return {
    command: "/model",
    description:
      "List available models or switch to a different model. Usage: /model [provider:model-name|provider]",

    getSubCommands: () => Promise.resolve(models as unknown as string[]),
    async handle(
      args: string[],
      {
        tui,
        container,
        inputContainer,
        editor,
      }: {
        tui: TUI;
        container: Container;
        inputContainer: Container;
        editor: Editor;
      },
    ): Promise<"continue" | "use"> {
      const arg = args.join(" ").trim();

      if (!arg) {
        showModelSelector(tui, inputContainer, editor, modelManager);
        return "continue";
      }

      if (isValidModel(arg)) {
        try {
          const newModelConfig = modelRegistry[arg as ModelName];
          if (newModelConfig === undefined) {
            container.addChild(
              new Text(
                style.red(`Model configuration not found for: ${arg}`),
                1,
                0,
              ),
            );
          } else {
            const currentModelConfig = modelManager.getModelMetadata("repl");
            const warnings = getCapabilityWarnings(
              currentModelConfig,
              newModelConfig,
            );
            for (const warning of warnings) {
              container.addChild(new Text(style.yellow(warning), 1, 0));
            }
            modelManager.setModel("repl", arg as ModelName);
          }
        } catch (error) {
          container.addChild(
            new Text(
              style.red(`Failed to switch model: ${(error as Error).message}`),
              0,
              0,
            ),
          );
        }
      }

      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
}
