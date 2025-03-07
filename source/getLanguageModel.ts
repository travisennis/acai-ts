import { languageModel, type ModelName } from "./models/providers.ts";
import { auditMessage } from "./middleware/index.ts";
import { wrapLanguageModel } from "./models/wrapLanguageModel.ts";

export function getLanguageModel({
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
