import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import type { SendData } from "./types.ts";

const MEMORY_DIR = config.app.ensurePath("memory");

export const createMemoryWriteTool = (
  options: { sendData?: SendData | undefined } = {},
) => {
  const { sendData } = options;

  const memoryWriteTool = tool({
    description: "Write content to a memory file.",
    parameters: z.object({
      filePath: z
        .string()
        .describe(
          'Path to the memory file, relative to the memory directory. Cannot use ".." or absolute paths.',
        ),
      content: z.string().describe("Content to write to the file."),
    }),
    execute: async (
      { filePath, content }: { filePath: string; content: string },
      { toolCallId },
    ) => {
      sendData?.({
        event: "tool-init",
        id: toolCallId,
        data: "Initializing memory write...",
      });

      const resolvedMemoryDir = resolve(MEMORY_DIR);
      const normalizedRelativePath = normalize(filePath);

      if (
        normalizedRelativePath.startsWith("..") ||
        normalizedRelativePath.includes("..") ||
        isAbsolute(normalizedRelativePath)
      ) {
        const errorMsg = `Error: Invalid filePath "${filePath}". Must be a relative path within the memory directory and cannot use '..'.`;
        sendData?.({
          event: "tool-error",
          id: toolCallId,
          data: errorMsg,
        });
        return errorMsg;
      }

      const fullPath = join(resolvedMemoryDir, normalizedRelativePath);

      if (
        !fullPath.startsWith(resolvedMemoryDir + sep) &&
        fullPath !== resolvedMemoryDir
      ) {
        const errorMsg = `Error: Path "${filePath}" resolves outside the allowed memory directory.`;
        sendData?.({
          event: "tool-error",
          id: toolCallId,
          data: errorMsg,
        });
        return errorMsg;
      }

      sendData?.({
        event: "tool-update",
        id: toolCallId,
        data: { primary: "Writing to file:", secondary: [filePath] },
      });

      try {
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content, "utf-8");
        const successMsg = `Memory file '${filePath}' written successfully.`;
        sendData?.({
          event: "tool-completion",
          id: toolCallId,
          data: successMsg,
        });
        return successMsg;
      } catch (error: unknown) {
        let errorMsg = `Error writing memory file '${filePath}': An unknown error occurred`;
        if (error instanceof Error) {
          errorMsg = `Error writing memory file '${filePath}': ${error.message}`;
        }
        sendData?.({
          event: "tool-error",
          id: toolCallId,
          data: errorMsg,
        });
        return errorMsg;
      }
    },
  });

  return {
    memoryWrite: memoryWriteTool,
  };
};
