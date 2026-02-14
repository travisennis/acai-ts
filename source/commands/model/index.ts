import {
  isValidModel,
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
    ): Promise<"break" | "continue" | "use"> {
      const arg = args.join(" ").trim();

      if (!arg) {
        showModelSelector(tui, inputContainer, editor, modelManager);
        return "continue";
      }

      if (isValidModel(arg)) {
        try {
          const currentModelConfig = modelManager.getModelMetadata("repl");
          const newModelConfig = modelRegistry[arg as ModelName];

          if (newModelConfig === undefined) {
            container.addChild(
              new Text(
                style.red(`Model configuration not found for: ${arg}`),
                1,
                0,
              ),
            );
            tui.requestRender();
            editor.setText("");
            return "continue";
          }

          if (
            currentModelConfig.supportsToolCalling &&
            !newModelConfig.supportsToolCalling
          ) {
            container.addChild(
              new Text(
                style.yellow(
                  "The new model doesn't support tool calling, which may limit functionality.",
                ),
                1,
                0,
              ),
            );
          }
          if (
            currentModelConfig.supportsReasoning &&
            !newModelConfig.supportsReasoning
          ) {
            container.addChild(
              new Text(
                style.yellow(
                  "The new model doesn't support reasoning, which may change response quality.",
                ),
                2,
                0,
              ),
            );
          }

          modelManager.setModel("repl", arg as ModelName);
          tui.requestRender();
          editor.setText("");
          return "continue";
        } catch (error) {
          container.addChild(
            new Text(
              style.red(`Failed to switch model: ${(error as Error).message}`),
              0,
              0,
            ),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }
      }

      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
}
