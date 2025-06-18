import {
  access,
  lstat,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import type { SendData } from "./types.ts";

const MEMORY_DIR = config.app.ensurePath("memory");

// Helper to check if a file exists
// Moved to module level as it does not use sendData
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Helper function, does not use sendData directly
const _readSpecificMemoryFile = async (
  resolvedMemoryDir: string,
  filePath: string,
) => {
  const normalizedRelativePath = normalize(filePath);

  if (
    normalizedRelativePath.startsWith("..") ||
    normalizedRelativePath.includes("..") ||
    isAbsolute(normalizedRelativePath)
  ) {
    throw new Error(
      `Error: Invalid filePath "${filePath}". Must be a relative path and cannot use '..'.`,
    );
  }

  const fullPath = join(resolvedMemoryDir, normalizedRelativePath);

  if (
    !fullPath.startsWith(resolvedMemoryDir + sep) &&
    fullPath !== resolvedMemoryDir
  ) {
    throw new Error(
      `Error: Path "${filePath}" resolves outside the allowed memory directory.`,
    );
  }
  if (!(await fileExists(fullPath))) {
    throw new Error(`Error: Memory file '${filePath}' does not exist.`);
  }
  const stats = await lstat(fullPath);
  if (stats.isDirectory()) {
    throw new Error(
      `Error: '${filePath}' is a directory. Please provide a path to a file to read.`,
    );
  }
  const content = await readFile(fullPath, "utf-8");
  return { filePath, content };
};

// Helper function, does not use sendData directly
const _listMemoryFilesAndIndex = async (resolvedMemoryDir: string) => {
  const entries = await readdir(resolvedMemoryDir, {
    recursive: true,
    withFileTypes: true,
  });
  const filesOnly = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? resolvedMemoryDir, entry.name)); // entry.path is available with recursive

  const fileListString =
    filesOnly.length > 0
      ? filesOnly
          .map((p) => `- ${normalize(p.replace(resolvedMemoryDir + sep, ""))}`)
          .join("\n") // Show relative paths
      : "No files in memory.";

  const indexPath = join(resolvedMemoryDir, "index.md");
  let indexContent = "(empty)";
  if (await fileExists(indexPath)) {
    const stats = await lstat(indexPath);
    if (stats.isFile()) {
      indexContent = await readFile(indexPath, "utf-8");
    }
  }

  const output = `Root memory file (index.md):
'''
${indexContent}
'''

Files in the memory directory:
${fileListString}`;
  return { content: output };
};

export const createMemoryTools = (
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

  const memoryReadTool = tool({
    description:
      'Read from memory files. If no path is provided, lists all files and shows content of "index.md".',
    parameters: z.object({
      filePath: z
        .string()
        .optional()
        .describe(
          'Optional path to a specific memory file to read, relative to the memory directory. Cannot use ".." or absolute paths.',
        ),
    }),
    execute: async ({ filePath }: { filePath?: string }, { toolCallId }) => {
      sendData?.({
        event: "tool-init",
        id: toolCallId,
        data: "Initializing memory read...",
      });

      const resolvedMemoryDir = resolve(MEMORY_DIR);

      try {
        await mkdir(resolvedMemoryDir, { recursive: true });

        let result: { content: string };
        if (filePath) {
          sendData?.({
            event: "tool-update",
            id: toolCallId,
            data: { primary: "Reading file:", secondary: [filePath] },
          });
          result = await _readSpecificMemoryFile(resolvedMemoryDir, filePath);
        } else {
          sendData?.({
            event: "tool-update",
            id: toolCallId,
            data: { primary: "Listing memory files and index" },
          });
          result = await _listMemoryFilesAndIndex(resolvedMemoryDir);
        }

        sendData?.({
          event: "tool-completion",
          id: toolCallId,
          data: "Done",
        });

        return result;
      } catch (error: unknown) {
        let errorMsg = "Error reading memory: An unknown error occurred";
        if (error instanceof Error) {
          errorMsg = `Error reading memory: ${error.message}`;
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
    memoryRead: memoryReadTool,
  };
};
