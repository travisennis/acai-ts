import type { LanguageModel } from "ai";
import {
  languageModel,
  ModelMetadata,
  modelRegistry,
  type ModelName,
} from "./models/providers.ts";
import { auditMessage } from "./middleware/index.ts";
import { wrapLanguageModel } from "./models/wrapLanguageModel.ts";

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
  | "file-retiever"
  | "title-conversation"
  | "conversation-summarizer"
  | "meta-prompt"
  | "tool-repair";

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
