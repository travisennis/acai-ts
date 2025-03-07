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

  const firstMiddleware = middleware.at(0);
  if (!firstMiddleware) {
    throw new Error("invalid middleware");
  }

  const init = orginalWrapLanguageModel({
    model,
    middleware: firstMiddleware,
  });

  return middleware
    .slice(1)
    .reverse()
    .reduce((wrappedModel, currentMiddleware) => {
      return orginalWrapLanguageModel({
        model: wrappedModel,
        middleware: currentMiddleware,
      });
    }, init);
}
