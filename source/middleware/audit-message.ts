import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  LanguageModelV2Middleware,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2TextPart,
} from "@ai-sdk/provider";
import type { LanguageModelUsage } from "ai";

interface AuditRecord {
  model: string;
  app: string;
  messages: LanguageModelV2Prompt;
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
const writeAuditRecord = async (
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
}: {
  filePath: string;
  app: string;
}) => {
  const middleware: LanguageModelV2Middleware = {
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
              // biome-ignore lint/suspicious/noExplicitAny: work-around on type issue
              text: (result as any).text,
            } as LanguageModelV2TextPart,
          ],
        }),
        usage: result.usage,
        timestamp: Date.now(),
      };

      await writeAuditRecord(app, filePath, msg);

      return result;
    },

    wrapStream: async ({ doStream, params, model }) => {
      const { stream, ...rest } = await doStream();

      let generatedText = "";
      let usage: LanguageModelUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };

      const transformStream = new TransformStream<
        LanguageModelV2StreamPart,
        LanguageModelV2StreamPart
      >({
        transform(chunk, controller) {
          if (chunk.type === "text-delta") {
            generatedText += chunk.delta;
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
            usage,
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
