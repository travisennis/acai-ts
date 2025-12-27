import EventEmitter from "node:events";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import {
  auditMessage,
  cacheMiddleware,
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
      cacheMiddleware,
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
  | "task-agent"
  | "handoff-agent"
  | "edit-fix";

interface ModelManagerEvents {
  "set-model": [app: App, model: ModelName];
}

export class ModelManager extends EventEmitter<ModelManagerEvents> {
  private modelMap: Map<App, LanguageModelV3>;
  private modelMetadataMap: Map<App, ModelMetadata>;
  private stateDir: string;
  constructor({ stateDir }: { stateDir: string }) {
    super();
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
    this.emit("set-model", app, model);
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
