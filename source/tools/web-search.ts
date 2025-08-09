import { tool } from "ai";
import chalk from "chalk";
import { SafeSearchType, type SearchResult, search } from "duck-duck-scrape";
import Exa from "exa-js";
import { z } from "zod";
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
      execute: async ({ query }, { toolCallId }) => {
        sendData?.({
          id: toolCallId,
          event: "tool-init",
          data: `Web search: ${chalk.cyan(query)}`,
        });

        const result = await performSearch(query);

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

async function performSearch(query: string) {
  // Check if EXA API key is available
  const hasExaApiKey =
    process.env["EXA_API_KEY"] && process.env["EXA_API_KEY"].trim() !== "";

  if (hasExaApiKey) {
    // Use Exa search
    try {
      const exa = new Exa(process.env["EXA_API_KEY"]);
      const result = await exa.searchAndContents(query, {
        numResults: 5,
        text: true,
      });
      return result;
    } catch (error) {
      // If Exa fails, fall back to duck duck scrape
      console.info("Exa search failed, falling back to DuckDuckGo:", error);
      return await searchWithDuckDuckGo(query);
    }
  } else {
    // Use DuckDuckGo search as fallback
    console.info("EXA_API_KEY not set, using DuckDuckGo search");
    return await searchWithDuckDuckGo(query);
  }
}

async function searchWithDuckDuckGo(query: string) {
  try {
    const searchResults = await search(query, {
      safeSearch: SafeSearchType.MODERATE,
    });

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
