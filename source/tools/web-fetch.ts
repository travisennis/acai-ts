import { tool } from "ai";
import { type CheerioAPI, load } from "cheerio";
import { z } from "zod";
import { logger } from "../logger.ts";
import type { TokenCounter } from "../token-utils.ts";
import type { SendData } from "./types.ts";

export const createUrlTools = (options: {
  sendData?: SendData | undefined;
  tokenCounter: TokenCounter;
}) => {
  const { sendData } = options;
  return {
    webFetch: tool({
      description:
        "Fetches the content of a given URL. It intelligently handles HTML content by attempting to use a specialized service for cleaner extraction, falling back to local cleaning if needed. For non-HTML content (like plain text or markdown), it fetches the raw content directly. IMPORTANT: Does not retrieve binary files.",
      parameters: z.object({
        url: z.string().describe("The URL to fetch content from."),
      }),
      execute: async ({ url }, { toolCallId, abortSignal }) => {
        try {
          sendData?.({
            event: "tool-init",
            id: toolCallId,
            data: `Reading URL: ${url}`,
          });
          logger.info(`Initiating fetch for URL: ${url}`);
          const result = await readUrl(url, abortSignal);
          const urlContent = result.data;
          const tokenCount = options.tokenCounter.count(urlContent);
          sendData?.({
            event: "tool-completion",
            id: toolCallId,
            data: `Read URL successfully (${tokenCount} tokens)`,
          });
          logger.info(`Successfully read URL: ${url} (${tokenCount} tokens)`);
          return urlContent;
        } catch (error) {
          const errorMessage = (error as Error).message;
          sendData?.({
            event: "tool-error",
            id: toolCallId,
            data: `Error reading URL ${url}: ${errorMessage}`,
          });
          logger.error(`Error reading URL ${url}: ${errorMessage}`);
          // Return the error message so the LLM knows the tool failed.
          return `Failed to read URL: ${errorMessage}`;
        }
      },
    }),
  };
};

export type ContentType =
  | "text/plain"
  | "text/html"
  | "text/markdown"
  | "application/json"
  | "application/xml"
  | "application/pdf"
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/svg+xml"
  | "audio/mpeg"
  | "audio/wav"
  | "video/mp4"
  | "video/webm"
  | "application/zip"
  | "application/octet-stream";

export type ReadUrlResult = { contentType: ContentType; data: string };

export async function readUrl(
  url: string,
  abortSignal?: AbortSignal | undefined,
): Promise<ReadUrlResult> {
  let initialResponse: Response;
  try {
    // Initial fetch to check content type and potentially use directly
    logger.debug(`Performing initial fetch for: ${url}`);
    initialResponse = await fetch(url, { signal: abortSignal });
    if (!initialResponse.ok) {
      throw new Error(
        `HTTP error! status: ${initialResponse.status} ${initialResponse.statusText}`,
      );
    }
    logger.debug(
      `Initial fetch successful for: ${url}, Status: ${initialResponse.status}`,
    );
  } catch (error) {
    // If the initial fetch fails entirely, rethrow
    logger.error(`Initial fetch failed for ${url}: ${error}`);
    throw new Error(`Error fetching initial data for ${url}: ${error}`);
  }

  const contentType: ContentType =
    (initialResponse.headers.get("content-type") as ContentType) ??
    "text/plain";
  logger.debug(`Content-Type for ${url}: ${contentType}`);

  // If content type is HTML, try Jina first
  if (contentType.includes("text/html")) {
    logger.info(`Detected HTML content for ${url}. Attempting Jina AI fetch.`);
    try {
      const apiKey = process.env["JINA_READER_API_KEY"];
      if (!apiKey) {
        logger.warn("JINA_READER_API_KEY not set. Skipping Jina fetch.");
        throw new Error("Jina API key not available"); // Skip to fallback
      }
      const jinaReadUrl = `https://r.jina.ai/${url}`;
      logger.debug(`Fetching with Jina: ${jinaReadUrl}`);
      const jinaResponse = await fetch(jinaReadUrl, {
        method: "GET",
        headers: {
          // biome-ignore lint/style/useNamingConvention: API requirement
          Authorization: `Bearer ${apiKey}`,
          "X-With-Generated-Alt": "true", // Optional: Ask Jina to include image descriptions
          "X-With-Links-Summary": "true", // Optional: Ask Jina for a summary of links
        },
        signal: abortSignal,
      });

      if (jinaResponse.ok) {
        const data = await jinaResponse.text();
        logger.info(
          `Successfully fetched and processed HTML URL with Jina: ${url}`,
        );
        return {
          contentType,
          data,
        };
      }
      logger.warn(
        `Jina fetch failed for ${url} with status ${jinaResponse.status}: ${jinaResponse.statusText}. Falling back to direct fetch and clean.`,
      );
      // Fall through to use the initialResponse if Jina fails
    } catch (error) {
      logger.warn(
        `Error fetching from Jina for ${url}: ${(error as Error).message}. Falling back to direct fetch and clean.`,
      );
      // Fall through to use the initialResponse if Jina fails
    }

    // Fallback for HTML: Use the initial response and clean it
    try {
      logger.warn(
        `Falling back to direct fetch and cleaning for HTML URL: ${url}`,
      );
      const htmlText = await initialResponse.text();
      logger.debug(
        `Cleaning HTML content for ${url} (length: ${htmlText.length})`,
      );
      const cleaner = HtmlCleaner.new(htmlText);
      const processedText = cleaner.clean();
      logger.info(
        `Successfully cleaned HTML content for ${url} (length: ${processedText.length})`,
      );
      return {
        contentType,
        data: processedText,
      };
    } catch (cleanError) {
      logger.error(
        `Error cleaning HTML from fallback fetch for ${url}: ${cleanError}`,
      );
      throw new Error(
        `Error cleaning HTML from fallback fetch for ${url}: ${cleanError}`,
      );
    }
  } else {
    // If not HTML, return the text directly from the initial response
    logger.info(
      `Fetched non-HTML content directly: ${url} (Content-Type: ${contentType})`,
    );
    try {
      if (contentType.startsWith("image/")) {
        const arrayBuffer = await initialResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const base64Url = `data:${contentType};base64,${base64}`;
        logger.debug(
          `Returning base64 image data for ${url} (length: ${base64.length})`,
        );
        return {
          contentType,
          data: base64Url,
        };
      }
      const textContent = await initialResponse.text();
      logger.debug(
        `Returning raw text content for ${url} (length: ${textContent.length})`,
      );
      return {
        contentType,
        data: textContent,
      };
    } catch (textError) {
      logger.error(`Error reading response for ${url}: ${textError}`);
      throw new Error(`Error reading response for ${url}: ${textError}`);
    }
  }
}

export class HtmlCleaner {
  static new(html: string): HtmlCleaner {
    return new HtmlCleaner(html);
  }

  private html: string;

  private constructor(html: string) {
    this.html = html;
  }

  /**
   * Cleans HTML content by removing unnecessary elements and simplifying structure
   * @param {Object} [options] - Configuration options for cleaning
   * @param {boolean} [options.simplify=true] - Whether to simplify HTML structure by removing redundant elements
   * @param {boolean} [options.empty=true] - Whether to remove empty elements from the HTML
   * @returns {string} Cleaned HTML content with removed whitespace and line breaks
   */
  clean(options?: { simplify?: boolean; empty?: boolean }): string {
    const { simplify = true, empty = true } = options ?? {};

    const $ = load(this.html);

    // Remove scripts, styles, and comments
    this.removeUnnecessaryElements($);

    // Simplify HTML structure
    if (simplify) {
      this.simplifyStructure($);
    }

    // Remove empty elements
    if (empty) {
      this.removeEmptyElements($);
    }

    // Get cleaned HTML
    return $.html()
      .trim()
      .replace(/^\s*[\r\n]/gm, "");
  }
  /**
   * Removes scripts, styles, and comments from HTML
   */
  private removeUnnecessaryElements($: CheerioAPI): void {
    // Remove all script tags
    $("script").remove();

    // Remove all noscript tags
    $("noscript").remove();

    // Remove all style tags
    $("style").remove();

    // Remove all link tags (external stylesheets)
    $('link[rel="stylesheet"]').remove();

    // Remove all preload link tags
    $('link[rel="preload"]').remove();

    // Remove all link tags
    $("link").remove();

    // Remove all forms
    $("form").remove();

    // Remove comments
    $("*")
      .contents()
      .each((_, element) => {
        if (element.type === "comment") {
          $(element).remove();
        }
      });

    // Remove all inline styles
    $("[style]").removeAttr("style");

    // Remove all class attributes
    $("[class]").removeAttr("class");

    // Remove all id attributes
    $("[id]").removeAttr("id");
  }

  /**
   * Simplifies HTML structure by merging redundant tags
   */
  private simplifyStructure($: CheerioAPI): void {
    // Merge nested divs
    $("div div").each((_, element) => {
      const $element = $(element);
      const parent = $element.parent();

      if (parent.children().length === 1 && parent.get(0)?.tagName === "div") {
        $element.unwrap();
      }
    });

    // Remove redundant spans
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

  /**
   * Removes empty elements from HTML
   */
  private removeEmptyElements($: CheerioAPI): void {
    $(":empty").remove();
  }
}
