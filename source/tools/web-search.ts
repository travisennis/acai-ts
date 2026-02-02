import { z } from "zod";
import type { ToolExecutionOptions } from "./types.ts";

export const WebSearchTool = {
  name: "WebSearch" as const,
};

// Default search options
const DEFAULT_NUM_RESULTS = 10;
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const EXA_API_BASE = "https://api.exa.com";
const EXA_API_VERSION = "2024-05-22";

/**
 * Input schema for the web search tool
 */
const inputSchema = z.object({
  query: z.string().describe("The search query to execute"),
  numResults: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .optional()
    .describe(
      `Number of search results to return (default: ${DEFAULT_NUM_RESULTS}, max: 100)`,
    ),
  timeout: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .optional()
    .describe(
      `Timeout in milliseconds for the search request (default: ${DEFAULT_TIMEOUT}ms)`,
    ),
  provider: z
    .enum(["exa", "duckduckgo"])
    .optional()
    .describe("Search provider to use (default: exa with duckduckgo fallback)"),
});

type WebSearchInputSchema = z.infer<typeof inputSchema>;

/**
 * Search result interface
 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

/**
 * Search response interface
 */
export interface SearchResponse {
  results: SearchResult[];
  provider: string;
  query: string;
  totalResults?: number;
}

/**
 * Convert null/undefined to string for preprocessing
 */
function convertNullString(val: unknown): string | null {
  if (
    val === null ||
    val === undefined ||
    val === "null" ||
    val === "undefined"
  ) {
    return null;
  }
  return String(val);
}

/**
 * Factory function for creating abort handlers.
 * Defined at module level to avoid capturing closure scope.
 */
function createAbortHandler(ctrl: AbortController, signal?: AbortSignal) {
  return () => {
    ctrl.abort(signal?.reason ?? new Error("Aborted"));
  };
}

/**
 * Create an AbortSignal that combines a timeout with an optional parent signal
 */
function createTimeoutSignal(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();

  // Use bind() to avoid capturing scope in timeout callback
  const abort = controller.abort.bind(controller);
  const timeoutId = setTimeout(
    () => abort(new Error(`Request timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );

  // Create abort handler using factory to avoid capturing scope
  const abortHandler = createAbortHandler(controller, parentSignal);

  if (parentSignal) {
    if (parentSignal.aborted) {
      abortHandler();
    } else {
      parentSignal.addEventListener("abort", abortHandler, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      if (parentSignal) {
        parentSignal.removeEventListener("abort", abortHandler);
      }
    },
  };
}

/**
 * Fetch from Exa API
 */
async function fetchExa(
  query: string,
  numResults: number,
  signal: AbortSignal,
): Promise<SearchResponse> {
  const apiKey = process.env["EXA_API_KEY"];

  if (!apiKey) {
    throw new Error(
      "EXA_API_KEY environment variable is not set. Please set it to use Exa API.",
    );
  }

  const response = await fetch(`${EXA_API_BASE}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "exa-version": EXA_API_VERSION,
    },
    body: JSON.stringify({
      query,
      numResults,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Exa API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  return {
    results: data.results.map(
      (result: {
        title: string;
        url: string;
        body: string;
        publishedDate?: string;
      }) => ({
        title: result.title,
        url: result.url,
        snippet: result.body,
        publishedDate: result.publishedDate,
      }),
    ),
    provider: "exa",
    query,
    totalResults: data.results.length,
  };
}

/**
 * Fetch from DuckDuckGo API (using their instant answer API)
 */
async function fetchDuckDuckGo(
  query: string,
  numResults: number,
  signal: AbortSignal,
): Promise<SearchResponse> {
  const encodedQuery = encodeURIComponent(query);
  const response = await fetch(
    `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(
      `DuckDuckGo API error: ${response.status} - ${response.statusText}`,
    );
  }

  const data = await response.json();

  if (!data.RelatedTopics || data.RelatedTopics.length === 0) {
    return {
      results: [],
      provider: "duckduckgo",
      query,
    };
  }

  const results: SearchResult[] = data.RelatedTopics.slice(0, numResults)
    // biome-ignore lint/style/useNamingConvention: DuckDuckGo API response uses PascalCase
    .filter((topic: { Result?: string }) => topic.Result)
    .map(
      (topic: {
        // biome-ignore lint/style/useNamingConvention: DuckDuckGo API response uses PascalCase
        Result?: string;
        // biome-ignore lint/style/useNamingConvention: DuckDuckGo API response uses PascalCase
        Text?: string;
        // biome-ignore lint/style/useNamingConvention: DuckDuckGo API response uses PascalCase
        FirstURL?: string;
        // biome-ignore lint/style/useNamingConvention: DuckDuckGo API response uses PascalCase
        Icon?: { URL: string };
      }) => {
        // Parse the result format: "<a>Title</a> - Description"
        const resultHtml = topic.Result || "";
        const titleMatch = resultHtml.match(/>([^<]+)</);
        const title = titleMatch ? titleMatch[1] : "No title";

        return {
          title,
          url: topic.FirstURL || "",
          snippet: topic.Text || "",
        };
      },
    );

  return {
    results,
    provider: "duckduckgo",
    query,
    totalResults: data.RelatedTopics.length,
  };
}

/**
 * Execute web search
 */
export async function executeWebSearch(
  options: WebSearchInputSchema,
  executionOptions: ToolExecutionOptions,
): Promise<string> {
  const {
    query,
    numResults = DEFAULT_NUM_RESULTS,
    timeout = DEFAULT_TIMEOUT,
    provider = "exa",
  } = options;

  if (executionOptions.abortSignal?.aborted) {
    throw new Error("Web search aborted");
  }

  if (!query || query.trim().length === 0) {
    throw new Error("Search query cannot be empty");
  }

  const effectiveNumResults = Math.min(Math.max(numResults ?? 1, 1), 100);
  const effectiveTimeout = Math.min(Math.max(timeout ?? 1000, 1000), 60000);

  const { signal, cleanup } = createTimeoutSignal(
    effectiveTimeout,
    executionOptions.abortSignal,
  );

  try {
    let response: SearchResponse;

    if (provider === "duckduckgo") {
      response = await fetchDuckDuckGo(query, effectiveNumResults, signal);
    } else {
      // Try Exa first, fall back to DuckDuckGo
      try {
        response = await fetchExa(query, effectiveNumResults, signal);
      } catch (exaError) {
        // Fall back to DuckDuckGo if Exa fails (but not if aborted)
        if (signal.aborted) {
          throw exaError;
        }
        response = await fetchDuckDuckGo(query, effectiveNumResults, signal);
      }
    }

    if (response.results.length === 0) {
      return `No search results found for "${query}".`;
    }

    const resultsText = response.results
      .map(
        (result, index) =>
          `${index + 1}. [${result.title}](${result.url})\n   ${result.snippet.substring(0, 200)}${result.snippet.length > 200 ? "..." : ""}`,
      )
      .join("\n\n");

    return `Search results for "${query}" (${response.provider}):\n\n${resultsText}\n\nTotal results: ${response.totalResults || response.results.length}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Web search failed: ${errorMessage}`);
  } finally {
    cleanup();
  }
}

/**
 * Create the web search tool
 */
export const createWebSearchTool = async () => {
  const toolDescription = `Search the web for information using Exa API (with DuckDuckGo fallback). 
Supports various search queries and returns relevant results with titles, URLs, and snippets.

Features:
- Uses Exa API for high-quality, relevant search results
- Automatically falls back to DuckDuckGo if Exa is unavailable
- Configurable number of results (1-100)
- Configurable timeout (1-60 seconds)

Example queries:
- "TypeScript best practices 2024"
- "React hooks tutorial"
- "Node.js performance optimization"

Note: Exa API requires an API key (EXA_API_KEY environment variable). If not set, DuckDuckGo will be used automatically.`;

  return {
    toolDef: {
      description: toolDescription,
      inputSchema,
    },
    display({ query }: WebSearchInputSchema) {
      return `🔍 Web search: ${query}`;
    },
    async execute(
      options: WebSearchInputSchema,
      executionOptions: ToolExecutionOptions,
    ): Promise<string> {
      return executeWebSearch(options, executionOptions);
    },
  };
};

export type WebSearchTool = Awaited<ReturnType<typeof createWebSearchTool>>;
