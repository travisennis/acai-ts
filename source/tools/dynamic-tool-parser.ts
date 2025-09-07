import { z } from "zod";

export const toolMetadataSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
  description: z.string().min(1),
  parameters: z.array(
    z.object({
      name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
      type: z.enum(["string", "number", "boolean"]),
      description: z.string().min(1),
      required: z.boolean().default(true),
      default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    }),
  ),
});

export type ToolMetadata = z.infer<typeof toolMetadataSchema>;

export function parseToolMetadata(output: string): ToolMetadata {
  try {
    const parsed = JSON.parse(output.trim());
    return toolMetadataSchema.parse(parsed);
  } catch (error) {
    throw new Error(
      `Failed to parse tool metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
