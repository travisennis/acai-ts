import z, { ZodType } from "zod";

export function isZodSchema(obj: unknown): obj is ZodType<unknown> {
  return obj instanceof ZodType;
}

export function zodToJsonSchema(
  schema: ZodType<unknown>,
): Record<string, unknown> {
  return z.toJSONSchema(schema);
}
