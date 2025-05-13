import type { LanguageModel } from "ai";
import { wrapLanguageModel } from "ai";
import {
  auditMessage,
  createRateLimitMiddleware,
} from "../middleware/index.ts";
import {
  type ModelMetadata,
  type ModelName,
  languageModel,
  modelRegistry,
} from "./providers.ts";

function getLanguageModel({
  model,
  app,
  stateDir,
}: {
  model: ModelName;
  app: string;
  stateDir: string;
}) {
  const langModel = wrapLanguageModel({
    model: languageModel(model),
    middleware: [
      createRateLimitMiddleware({ requestsPerMinute: 30 }),
      auditMessage({ filePath: stateDir, app }),
    ],
  });

  return langModel;
}

type App =
  | "repl"
  | "cli"
  | "architect"
  | "file-retiever"
  | "title-conversation"
  | "conversation-summarizer"
  | "conversation-analyzer"
  | "tool-repair"
  | "lsp-code-action"
  | "init-project"
  | "task-agent"
  | "explain-code"
  | "code-editor";

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
