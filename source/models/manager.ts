import type { LanguageModelV2 } from "@ai-sdk/provider";
import { generateText, wrapLanguageModel } from "ai";
import {
  auditMessage,
  cacheMiddleware,
  createRateLimitMiddleware,
} from "../middleware/index.ts";
import { AiConfig } from "./ai-config.ts";
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

  async getText(app: App, system: string, prompt: string, signal: AbortSignal) {
    const model = this.getModel(app);
    const modelConfig = this.getModelMetadata(app);

    if (!model || !modelConfig) {
      throw new Error(`${app} model not available`);
    }

    const aiConfig = new AiConfig({
      modelMetadata: modelConfig,
      prompt: prompt,
    });

    const result = await generateText({
      model,
      maxOutputTokens: aiConfig.maxOutputTokens(),
      system: system,
      prompt: prompt,
      temperature: aiConfig.temperature(),
      topP: aiConfig.topP(),
      providerOptions: aiConfig.providerOptions(),
      abortSignal: signal,
    });

    return result;
  }
}
