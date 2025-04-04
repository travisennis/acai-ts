import {
  type LanguageModel,
  type LanguageModelV1Middleware,
  wrapLanguageModel as orginalWrapLanguageModel,
} from "ai";

export function wrapLanguageModel(
  model: LanguageModel,
  ...middleware: LanguageModelV1Middleware[]
) {
  if (middleware.length === 0) {
    throw new Error("required at least one middleware");
  }

  return orginalWrapLanguageModel({
    model,
    middleware,
  });
}
