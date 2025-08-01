import { tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
import { config } from "../config.ts";
import type { TokenCounter } from "../token-utils.ts";
import { readFileAndCountTokens } from "./filesystem-utils.ts";
import type { SendData } from "./types.ts";

export const ReadMultipleFilesTool = {
  name: "readMultipleFiles" as const,
};

export const createReadMultipleFilesTool = async ({
  workingDir,
  sendData,
  tokenCounter,
}: {
  workingDir: string;
  sendData?: SendData;
  tokenCounter: TokenCounter;
}) => {
  const allowedDirectory = workingDir;
  return {
    [ReadMultipleFilesTool.name]: tool({
      description:
        "Read the contents of multiple files simultaneously. This is more " +
        "efficient than reading files one by one when you need to analyze " +
        "or compare multiple files. Each file's content is returned with its " +
        "path as a reference. Failed reads for individual files won't stop " +
        "the entire operation. Only works within allowed directories.",
      inputSchema: z.object({
        paths: z.array(z.string()),
      }),
      execute: async ({ paths }, { toolCallId }) => {
        sendData?.({
          id: toolCallId,
          event: "tool-init",
          data: `Reading files: ${paths.map((p) => chalk.cyan(p)).join(", ")}`,
        });
        const maxTokens = (await config.readProjectConfig()).tools.maxTokens;
        const results = await Promise.all(
          paths.map((filePath) =>
            readFileAndCountTokens(
              filePath,
              workingDir,
              allowedDirectory,
              tokenCounter,
              maxTokens,
            ),
          ),
        );
        let totalTokens = 0;
        let filesReadCount = 0;
        const formattedResults = results.map((result) => {
          if (result.error) {
            return `${result.path}: Error - ${result.error}`;
          }
          // Check if tokenCount is > 0, meaning it wasn't skipped
          if (result.tokenCount > 0) {
            filesReadCount++;
          }
          totalTokens += result.tokenCount; // Add the token count (will be 0 for skipped files)
          // Return content (or max token message)
          return `${result.path}:\n${result.content}\n`;
        });
        const completionMessage =
          filesReadCount === paths.length
            ? `Read ${paths.length} files successfully (${totalTokens} total tokens).`
            : `Read ${filesReadCount} of ${paths.length} files successfully (${totalTokens} total tokens). Files exceeding token limit were skipped.`;

        sendData?.({
          id: toolCallId,
          event: "tool-completion",
          data: completionMessage,
        });
        return formattedResults.join("\n---\n");
      },
    }),
  };
};
