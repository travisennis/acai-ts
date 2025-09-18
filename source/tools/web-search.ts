import { tool } from "ai";
import { SafeSearchType, type SearchResult, search } from "duck-duck-scrape";
import { z } from "zod";
import Exa from "../api/exa/index.ts";
import chalk from "../terminal/chalk.ts";
import type { TokenCounter } from "../token-utils.ts";
import type { SendData } from "./types.ts";

export const WebSearchTool = {
  name: "webSearch" as const,
};

export const createWebSearchTool = ({
  sendData,
  tokenCounter,
}: {
  sendData?: SendData;
  tokenCounter: TokenCounter;
}) => {
  return {
    [WebSearchTool.name]: tool({
      description:
        "Searches the web and returns match documents with their title, url, and text content. The query should be formulated as a natural language question.",
      inputSchema: z.object({
        query: z.string().describe("The search query."),
      }),
      execute: async ({ query }, { toolCallId, abortSignal }) => {
        // Check if execution has been aborted
        if (abortSignal?.aborted) {
          throw new Error("Web search aborted");
        }
        sendData?.({
          id: toolCallId,
          event: "tool-init",
          data: `Web search: ${chalk.cyan(query)}`,
        });

        if (abortSignal?.aborted) {
          throw new Error("Web search aborted before search execution");
        }

        const result = await performSearch(query, abortSignal);

        const sources = result.results.map(
          (source) =>
            `## ${source.title}\nURL: ${source.url}\n\n${source.text}`,
        );
        const resultText = `# Search Results:\n\n${sources.join("\n\n")}`;
        const tokenCount = tokenCounter.count(resultText);

        sendData?.({
          id: toolCallId,
          event: "tool-completion",
          data: `Found ${result.results.length} results. (${tokenCount} tokens)`,
        });

        return resultText;
      },
    }),
  };
};

async function performSearch(query: string, abortSignal?: AbortSignal) {
  // Check if EXA API key is available
  const hasExaApiKey =
    process.env["EXA_API_KEY"] && process.env["EXA_API_KEY"].trim() !== "";

  if (hasExaApiKey) {
    // Use Exa search
    try {
      if (abortSignal?.aborted) {
        throw new Error("Web search aborted before Exa search");
      }

      const exa = new Exa(process.env["EXA_API_KEY"]);

      // Create a promise that races with the abort signal
      const searchPromise = exa.searchAndContents(query, {
        numResults: 5,
        text: true,
      });

      const result = await Promise.race([
        searchPromise,
        new Promise<never>((_, reject) => {
          if (abortSignal) {
            abortSignal.addEventListener("abort", () => {
              reject(new Error("Web search aborted during Exa search"));
            });
          }
        }),
      ]);

      return result;
    } catch (error) {
      // If Exa fails, fall back to duck duck scrape
      console.info("Exa search failed, falling back to DuckDuckGo:", error);
      return await searchWithDuckDuckGo(query, abortSignal);
    }
  } else {
    // Use DuckDuckGo search as fallback
    console.info("EXA_API_KEY not set, using DuckDuckGo search");
    return await searchWithDuckDuckGo(query, abortSignal);
  }
}

async function searchWithDuckDuckGo(query: string, abortSignal?: AbortSignal) {
  try {
    if (abortSignal?.aborted) {
      throw new Error("Web search aborted before DuckDuckGo search");
    }

    // Create a promise that races with the abort signal
    const searchPromise = search(query, {
      safeSearch: SafeSearchType.MODERATE,
    });

    const searchResults = await Promise.race([
      searchPromise,
      new Promise<never>((_, reject) => {
        if (abortSignal) {
          abortSignal.addEventListener("abort", () => {
            reject(new Error("Web search aborted during DuckDuckGo search"));
          });
        }
      }),
    ]);

    // Transform duck-duck-scrape results to match Exa format
    // Take only first 5 results to match Exa behavior
    const results = searchResults.results
      .slice(0, 5)
      .map((result: SearchResult) => ({
        title: result.title,
        url: result.url,
        text: result.description || "",
      }));

    return { results };
  } catch (error) {
    throw new Error(`Failed to perform web search: ${error}`);
  }
}
