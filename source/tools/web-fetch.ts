import { load } from "cheerio";
import { z } from "zod";
import style from "../terminal/style.ts";
import type { ToolExecutionOptions } from "./types.ts";

export const WebFetchTool = {
  name: "WebFetch" as const,
};

// Constants
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_REDIRECTS = 5;
const MAX_URL_LENGTH = 2048;
const JINA_API_BASE = "https://r.jina.ai";

/**
 * Input schema for the web fetch tool
 */
const inputSchema = z.object({
  url: z.string().describe("URL to fetch"),
  output: z
    .enum(["text", "html", "markdown", "json"])
    .default("text")
    .describe("Output format (default: text)"),
  jina: z.boolean().default(false).describe("Use Jina AI for HTML cleaning"),
  timeout: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .optional()
    .describe(`Timeout in milliseconds (default: ${DEFAULT_TIMEOUT}ms)`),
  headers: z
    .boolean()
    .default(false)
    .describe("Include HTTP headers in output"),
});

type WebFetchInputSchema = z.infer<typeof inputSchema>;

/**
 * Fetch result interface
 */
export interface FetchResult {
  content: string;
  contentType: string;
  sourceUrl: string;
  tokenCount: number;
  success: boolean;
  provider: "jina" | "local" | "direct";
  headers?: Record<string, string>;
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
 * Count tokens (simple estimation: 4 characters per token)
 */
function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Validate URL
 */
function isValidUrl(url: string): boolean {
  try {
    if (typeof url !== "string" || url.length === 0) return false;
    if (url.length > MAX_URL_LENGTH) return false;

    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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
 * Get content type from response headers
 */
function getContentType(response: Response): string {
  const header = response.headers.get("content-type") || "text/plain";
  return header.split(";")[0].trim();
}

/**
 * HTML Cleaner class using Cheerio
 */
class HtmlCleaner {
  private html: string;

  constructor(html: string) {
    this.html = html;
  }

  static new(html: string): HtmlCleaner {
    return new HtmlCleaner(html);
  }

  clean(options = { simplify: true, empty: true }): string {
    const { simplify, empty } = options;

    const $ = load(this.html);

    this.removeUnnecessaryElements($);
    if (simplify) {
      this.simplifyStructure($);
    }
    if (empty) {
      this.removeEmptyElements($);
    }

    return $.html()
      .trim()
      .replace(/^\s*[\r\n]/gm, "");
  }

  private removeUnnecessaryElements($: ReturnType<typeof load>): void {
    $("script").remove();
    $("noscript").remove();
    $("style").remove();
    $('link[rel="stylesheet"]').remove();
    $('link[rel="preload"]').remove();
    $("link").remove();
    $("form").remove();

    $("*")
      .contents()
      .each((_, element) => {
        if (element.type === "comment") {
          $(element).remove();
        }
      });

    $("[style]").removeAttr("style");
    $("[class]").removeAttr("class");
    $("[id]").removeAttr("id");
  }

  private simplifyStructure($: ReturnType<typeof load>): void {
    $("div div").each((_, element) => {
      const $element = $(element);
      const parent = $element.parent();

      if (parent.children().length === 1 && parent.get(0)?.tagName === "div") {
        $element.unwrap();
      }
    });

    $("span").each((_, element) => {
      const $element = $(element);
      if (!$element.attr() || Object.keys($element.attr() ?? {}).length === 0) {
        const h = $element.html();
        if (h) {
          $element.replaceWith(h);
        }
      }
    });
  }

  private removeEmptyElements($: ReturnType<typeof load>): void {
    $(":empty").remove();
  }
}

/**
 * Convert HTML to Markdown
 */
function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h1>(.*?)<\/h1>/g, "# $1\n\n")
    .replace(/<h2>(.*?)<\/h2>/g, "## $1\n\n")
    .replace(/<h3>(.*?)<\/h3>/g, "### $1\n\n")
    .replace(/<h4>(.*?)<\/h4>/g, "#### $1\n\n")
    .replace(/<h5>(.*?)<\/h5>/g, "##### $1\n\n")
    .replace(/<h6>(.*?)<\/h6>/g, "###### $1\n\n")
    .replace(/<p>(.*?)<\/p>/g, "$1\n\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<strong>(.*?)<\/strong>/g, "**$1**")
    .replace(/<b>(.*?)<\/b>/g, "**$1**")
    .replace(/<em>(.*?)<\/em>/g, "*$1*")
    .replace(/<i>(.*?)<\/i>/g, "*$1*")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, "[$2]($1)")
    .replace(/<li>(.*?)<\/li>/g, "- $1\n")
    .replace(/<ul[^>]*>/g, "\n")
    .replace(/<\/ul>/g, "\n")
    .replace(/<ol[^>]*>/g, "\n")
    .replace(/<\/ol>/g, "\n")
    .replace(/<code>(.*?)<\/code>/g, "`$1`")
    .replace(/<pre>(.*?)<\/pre>/gs, "```\n$1\n```\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n\n\n+/g, "\n\n")
    .trim();
}

/**
 * Fetch using Jina AI reader
 */
async function fetchWithJina(
  url: string,
  signal: AbortSignal,
): Promise<FetchResult> {
  const apiKey = process.env["JINA_READER_API_KEY"];

  if (!apiKey) {
    throw new Error("JINA_READER_API_KEY environment variable is not set");
  }

  const jinaUrl = `${JINA_API_BASE}/${encodeURIComponent(url)}`;

  const response = await fetch(jinaUrl, {
    method: "GET",
    headers: {
      // biome-ignore lint/style/useNamingConvention: HTTP header names are case-sensitive
      Authorization: `Bearer ${apiKey}`,
      "X-With-Generated-Alt": "true",
      "X-With-Links-Summary": "true",
    },
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jina API error: ${response.status} - ${errorText}`);
  }

  const content = await response.text();
  const tokenCount = countTokens(content);

  return {
    content,
    contentType: "text/html",
    sourceUrl: url,
    tokenCount,
    success: true,
    provider: "jina",
  };
}

/**
 * Handle HTML response
 */
async function handleHtmlResponse(
  response: Response,
  useJina: boolean,
  signal: AbortSignal,
  verbose = false,
): Promise<FetchResult> {
  const html = await response.text();

  if (useJina) {
    try {
      const jinaResult = await fetchWithJina(response.url, signal);
      return jinaResult;
    } catch (error) {
      if (verbose) {
        console.error(
          `Jina AI failed: ${error instanceof Error ? error.message : String(error)}, falling back to local cleaning`,
        );
      }
    }
  }

  const cleaner = HtmlCleaner.new(html);
  const cleaned = cleaner.clean();
  const tokenCount = countTokens(cleaned);

  return {
    content: cleaned,
    contentType: "text/html",
    sourceUrl: response.url,
    tokenCount,
    success: true,
    provider: "local",
  };
}

/**
 * Handle image response (convert to base64 data URL)
 */
async function handleImageResponse(
  response: Response,
  contentType: string,
): Promise<FetchResult> {
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const base64Url = `data:${contentType};base64,${base64}`;

  return {
    content: base64Url,
    contentType,
    sourceUrl: response.url,
    tokenCount: 0,
    success: true,
    provider: "direct",
  };
}

/**
 * Handle text response
 */
async function handleTextResponse(
  response: Response,
  contentType: string,
): Promise<FetchResult> {
  const text = await response.text();
  const tokenCount = countTokens(text);

  return {
    content: text,
    contentType,
    sourceUrl: response.url,
    tokenCount,
    success: true,
    provider: "direct",
  };
}

/**
 * Main fetch function with redirect handling
 */
async function fetchUrl(
  url: string,
  options: {
    useJina?: boolean;
    timeout?: number;
    verbose?: boolean;
    headers?: boolean;
    abortSignal?: AbortSignal;
  },
): Promise<FetchResult> {
  const {
    useJina = false,
    timeout = DEFAULT_TIMEOUT,
    verbose = false,
    headers: includeHeaders = false,
    abortSignal,
  } = options;

  let redirectCount = 0;
  let currentUrl = url;

  while (redirectCount <= MAX_REDIRECTS) {
    const { signal, cleanup } = createTimeoutSignal(timeout, abortSignal);

    try {
      const response = await fetch(currentUrl, {
        signal,
        redirect: "manual",
      });

      // Handle redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          const redirectUrl = new URL(location, currentUrl).toString();
          if (verbose) {
            console.error(`Redirecting to: ${redirectUrl}`);
          }
          currentUrl = redirectUrl;
          redirectCount++;
          continue;
        }
      }

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} ${response.statusText}`,
        );
      }

      const contentType = getContentType(response);
      const responseHeaders: Record<string, string> = {};
      if (includeHeaders) {
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
      }

      let result: FetchResult;

      if (contentType.includes("text/html")) {
        result = await handleHtmlResponse(response, useJina, signal, verbose);
      } else if (contentType.startsWith("image/")) {
        result = await handleImageResponse(response, contentType);
      } else {
        result = await handleTextResponse(response, contentType);
      }

      if (includeHeaders) {
        result.headers = responseHeaders;
      }

      return result;
    } finally {
      cleanup();
    }
  }

  throw new Error(`Too many redirects (max: ${MAX_REDIRECTS})`);
}

/**
 * Execute web fetch
 */
export async function executeWebFetch(
  options: WebFetchInputSchema,
  executionOptions: ToolExecutionOptions,
): Promise<string> {
  const {
    url,
    output = "text",
    jina = false,
    timeout,
    headers = false,
  } = options;

  if (executionOptions.abortSignal?.aborted) {
    throw new Error("Web fetch aborted");
  }

  if (!isValidUrl(url)) {
    throw new Error(
      "Invalid URL format. URL must start with http:// or https:// and be less than 2048 characters",
    );
  }

  const effectiveTimeout = timeout ?? DEFAULT_TIMEOUT;

  let result: FetchResult;

  try {
    result = await fetchUrl(url, {
      useJina: jina,
      timeout: effectiveTimeout,
      verbose: false,
      headers,
      abortSignal: executionOptions.abortSignal,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Web fetch failed: ${errorMessage}`);
  }

  switch (output) {
    case "json": {
      const jsonOutput: Record<string, unknown> = {
        content: result.content,
        contentType: result.contentType,
        sourceUrl: result.sourceUrl,
        tokenCount: result.tokenCount,
        success: result.success,
        provider: result.provider,
      };
      if (headers && result.headers) {
        jsonOutput["headers"] = result["headers"];
      }
      return JSON.stringify(jsonOutput, null, 2);
    }

    case "html":
      return result.content;

    case "markdown":
      if (result.contentType.includes("text/html")) {
        return htmlToMarkdown(result.content);
      }
      return result.content;
    default:
      return result.content;
  }
}

/**
 * Create the web fetch tool
 */
export const createWebFetchTool = async () => {
  const toolDescription = `Fetch and clean web content from URLs. Use when the user asks to get, extract, or retrieve content from a webpage or URL.

Features:
- Fetches content from any URL with intelligent HTML cleaning
- Jina AI support for advanced HTML extraction (set JINA_READER_API_KEY env var)
- Local fallback HTML cleaning using Cheerio
- Support for multiple output formats (text, html, markdown, json)
- Image to base64 data URL conversion
- Token counting for the fetched content
- Redirect handling (max 5 redirects)
- Configurable timeout support
- AbortSignal support for cancellation

Content Types:
- HTML: Cleaned text content (default) or raw HTML
- Images: Base64 encoded data URLs
- Text/JSON/XML: Raw text content

Output Formats:
- text: Cleaned text content (default)
- html: Raw or cleaned HTML
- markdown: Simple HTML to Markdown conversion
- json: Structured response with metadata

Example use cases:
- "Fetch the content from https://example.com"
- "Get the main article text from a news website"
- "Extract the text content from a blog post"
- "Download an image and convert to base64"`;

  return {
    toolDef: {
      description: toolDescription,
      inputSchema,
    },
    display({ url }: WebFetchInputSchema) {
      return `🌐 ${style.cyan(url)}`;
    },
    async execute(
      options: WebFetchInputSchema,
      executionOptions: ToolExecutionOptions,
    ): Promise<string> {
      return executeWebFetch(options, executionOptions);
    },
  };
};

export type WebFetchTool = Awaited<ReturnType<typeof createWebFetchTool>>;
