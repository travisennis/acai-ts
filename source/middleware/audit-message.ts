import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  LanguageModelUsage,
  LanguageModelV1Middleware,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
} from "ai";

interface AuditRecord {
  model: string;
  app: string;
  messages: LanguageModelV1Prompt;
  usage: LanguageModelUsage;
  timestamp: number;
}

/**
 * Writes an audit record to the specified file, overwriting any existing content.
 * Ensures the directory exists before writing.
 *
 * @param filePath - The path to the file where the audit record will be saved.
 * @param content - The audit record object to write.
 */
export const writeAuditRecord = async (
  app: string,
  filePath: string,
  content: AuditRecord,
): Promise<void> => {
  try {
    const now = new Date();
    const path = join(filePath, `${now.toISOString()}-${app}-message.json`);
    // Ensure directory exists
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(content, null, 2)}`);
  } catch (error) {
    console.error("Error writing audit file:", error);
    throw error;
  }
};

export const auditMessage = ({
  filePath = "messages",
  app = "default",
}: { filePath: string; app: string }) => {
  const middleware: LanguageModelV1Middleware = {
    wrapGenerate: async ({ doGenerate, params, model }) => {
      const result = await doGenerate();

      const msg: AuditRecord = {
        model: model.modelId,
        app,
        messages: [...params.prompt].concat({
          role: "assistant",
          content: [
            {
              type: "text",
              text: result.text ?? "no response",
            },
          ],
        }),
        usage: {
          ...result.usage,
          totalTokens:
            result.usage.promptTokens + result.usage.completionTokens,
        },
        timestamp: Date.now(),
      };

      await writeAuditRecord(app, filePath, msg);

      return result;
    },

    wrapStream: async ({ doStream, params, model }) => {
      const { stream, ...rest } = await doStream();

      let generatedText = "";
      let usage: Omit<LanguageModelUsage, "totalTokens"> = {
        promptTokens: 0,
        completionTokens: 0,
      };

      const transformStream = new TransformStream<
        LanguageModelV1StreamPart,
        LanguageModelV1StreamPart
      >({
        transform(chunk, controller) {
          if (chunk.type === "text-delta") {
            generatedText += chunk.textDelta;
          }
          if (chunk.type === "finish") {
            usage = chunk.usage;
          }
          controller.enqueue(chunk);
        },

        async flush() {
          const msg: AuditRecord = {
            model: model.modelId,
            app,
            messages: generatedText
              ? [
                  ...params.prompt,
                  {
                    role: "assistant",
                    content: [
                      {
                        type: "text",
                        text: generatedText,
                      },
                    ],
                  },
                ]
              : [...params.prompt],
            usage: {
              ...usage,
              totalTokens: usage.completionTokens + usage.promptTokens,
            },
            timestamp: Date.now(),
          };

          await writeAuditRecord(app, filePath, msg);
        },
      });

      return {
        stream: stream.pipeThrough(transformStream),
        ...rest,
      };
    },
  };
  return middleware;
};
