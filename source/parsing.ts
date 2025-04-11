import { ZodIssueCode, z } from "zod";

const parseJsonPreprocessor = (value: unknown, ctx: z.RefinementCtx) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (e) {
      ctx.addIssue({
        code: ZodIssueCode.custom,
        message: (e as Error).message,
      });
    }
  }

  return value;
};

export function jsonParser<T extends z.ZodTypeAny>(input: T) {
  return z.preprocess(parseJsonPreprocessor, input);
}
