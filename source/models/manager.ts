import type { LanguageModel } from "ai";
import { auditMessage } from "../middleware/index.ts";
import {
  type ModelMetadata,
  type ModelName,
  languageModel,
  modelRegistry,
} from "./providers.ts";
import { wrapLanguageModel } from "./wrap-language-model.ts";

function getLanguageModel({
  model,
  app,
  stateDir,
}: {
  model: ModelName;
  app: string;
  stateDir: string;
}) {
  const langModel = wrapLanguageModel(
    languageModel(model),
    auditMessage({ filePath: stateDir, app }),
  );

  return langModel;
}

type App =
  | "repl"
  | "architect"
  | "file-retiever"
  | "title-conversation"
  | "conversation-summarizer"
  | "meta-prompt"
  | "tool-repair"
  | "lsp-code-action"
  | "init-project"
  | "task-agent"
  | "explain-code";

export class ModelManager {
  private modelMap: Map<App, LanguageModel>;
  private modelMetadataMap: Map<App, ModelMetadata>;
  private stateDir: string;
  constructor({ stateDir }: { stateDir: string }) {
    this.modelMap = new Map();
    this.modelMetadataMap = new Map();
    this.stateDir = stateDir;
  }

  setModel(app: App, model: ModelName) {
    this.modelMap.set(
      app,
      getLanguageModel({
        model,
        app,
        stateDir: this.stateDir,
      }),
    );
    this.modelMetadataMap.set(app, modelRegistry[model]);
  }

  getModel(app: App) {
    const model = this.modelMap.get(app);
    if (!model) {
      throw new Error("Model not initialized.");
    }
    return model;
  }

  getModelMetadata(app: App) {
    const metadata = this.modelMetadataMap.get(app);
    if (!metadata) {
      throw new Error("Model not initialized.");
    }
    return metadata;
  }
}
