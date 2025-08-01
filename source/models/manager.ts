import type { LanguageModelV2 } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import {
  auditMessage,
  createRateLimitMiddleware,
} from "../middleware/index.ts";
import {
  languageModel,
  type ModelMetadata,
  type ModelName,
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
  | "title-conversation"
  | "conversation-summarizer"
  | "conversation-analyzer"
  | "tool-repair"
  | "init-project"
  | "task-agent";

export class ModelManager {
  private modelMap: Map<App, LanguageModelV2>;
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
    const modelMetadata = modelRegistry[model];
    if (modelMetadata) {
      this.modelMetadataMap.set(app, modelMetadata);
    }
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
