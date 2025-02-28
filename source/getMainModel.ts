import path from "node:path";
import {
  type ModelName,
  languageModel,
  wrapLanguageModel,
} from "@travisennis/acai-core";
import { auditMessage } from "@travisennis/acai-core/middleware";
import { envPaths } from "@travisennis/stdlib/env";

export function getMainModel({
  model,
  app,
}: { model: ModelName; app: string }) {
  const now = new Date();
  const stateDir = envPaths("acai").state;
  const messagesFilePath = path.join(
    stateDir,
    `${now.toISOString()}-${app}-message.json`,
  );

  const langModel = wrapLanguageModel(
    languageModel(model),
    auditMessage({ path: messagesFilePath, app }),
  );

  return langModel;
}
