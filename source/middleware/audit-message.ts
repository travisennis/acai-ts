import { existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import type {
  LanguageModelUsage,
  LanguageModelV1Middleware,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
} from "ai";

const checkAndRolloverFile = async (filePath: string): Promise<void> => {
  try {
    // Check if file exists
    if (!existsSync(filePath)) {
      return;
    }

    // Read the file content
    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");

    // If less than 50 lines, no need to rollover
    if (lines.length < 50) {
      return;
    }

    // Get the directory and base filename
    const dir = dirname(filePath);
    const ext = extname(filePath);
    const baseName = basename(filePath, ext);
    const basePattern = baseName.replace(/-\d+$/, ""); // Remove any existing number

    // Find existing rollover files to determine next number
    const files = await readdir(dir);
    const rolloverFiles = files
      .filter((f) => f.startsWith(`${basePattern}-`) && f.endsWith(ext))
      .map((f) => {
        const match = f.match(new RegExp(`${basePattern}-(\\d+)${ext}`));
        return match ? Number.parseInt(match[1] ?? "") : 0;
      });

    const nextNumber =
      rolloverFiles.length > 0 ? Math.max(...rolloverFiles) + 1 : 1;
    const newPath = join(dir, `${basePattern}-${nextNumber}${ext}`);

    // Rename the current file
    await rename(filePath, newPath);
  } catch (error) {
    console.error("Error during file rollover:", error);
    throw error; // Re-throw to be handled by the caller
  }
};

interface AuditRecord {
  model: string;
  app: string;
  messages: LanguageModelV1Prompt;
  usage: LanguageModelUsage;
  timestamp: number;
}

const appendToFile = async (
  filePath: string,
  content: AuditRecord,
): Promise<void> => {
  try {
    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });
    await checkAndRolloverFile(filePath);
    await appendFile(filePath, `${JSON.stringify(content)}\n`);
  } catch (error) {
    console.error("Error writing to audit file:", error);
    throw error;
  }
};

/**
 * Writes an audit record to the specified file, overwriting any existing content.
 * Ensures the directory exists before writing.
 *
 * @param filePath - The path to the file where the audit record will be saved.
 * @param content - The audit record object to write.
 */
const writeAuditRecord = async (
  filePath: string,
  content: AuditRecord,
): Promise<void> => {
  try {
    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(content, null, 2)}`);
  } catch (error) {
    console.error("Error writing audit file:", error);
    throw error;
  }
};

export const auditMessage = ({
  filePath = "messages.jsonl",
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

      if (filePath.endsWith("jsonl")) {
        await appendToFile(filePath, msg);
      } else {
        const now = new Date();
        const path = join(filePath, `${now.toISOString()}-${app}-message.json`);

        await writeAuditRecord(path, msg);
      }

      return result;
    },

    wrapStream: async ({ doStream, params, model }) => {
      const { stream, ...rest } = await doStream();

      let generatedText = "";
      let usage: Omit<LanguageModelUsage, "totalTokens">;

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

          if (filePath.endsWith("jsonl")) {
            await appendToFile(filePath, msg);
          } else {
            const now = new Date();
            const path = join(
              filePath,
              `${now.toISOString()}-${app}-message.json`,
            );

            await writeAuditRecord(path, msg);
          }
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
