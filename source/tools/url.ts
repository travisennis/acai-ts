import { tool } from "ai";
import { type CheerioAPI, load } from "cheerio";
import { z } from "zod";
import { countTokens } from "../token-utils.ts";
import type { SendData } from "./types.ts";

export const createUrlTools = (options: {
  sendData?: SendData | undefined;
}) => {
  const { sendData } = options;
  return {
    readUrl: tool({
      description:
        "Reads the contents of the file at the given url. IMPORTANT: only reads text files. No binary files.",
      parameters: z.object({
        url: z.string().describe("The URL"),
      }),
      execute: async ({ url }, { abortSignal }) => {
        const uuid = crypto.randomUUID();
        try {
          sendData?.({
            event: "tool-init",
            id: uuid,
            data: `Reading URL for ${url}`,
          });
          const urlContent = await readUrl(url, abortSignal);
          const tokenCount = countTokens(urlContent);
          sendData?.({
            event: "tool-completion",
            id: uuid,
            data: `Done (${tokenCount} tokens)`,
          });
          return urlContent;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: uuid,
            data: `Error reading URL for ${url}`,
          });
          return Promise.resolve((error as Error).message);
        }
      },
    }),
  };
};

async function readUrl(
  url: string,
  abortSignal?: AbortSignal | undefined,
): Promise<string> {
  try {
    const apiKey = process.env["JINA_READER_API_KEY"];
    const readUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(readUrl, {
      method: "GET",
      headers: {
        // biome-ignore lint/style/useNamingConvention: <explanation>
        Authorization: `Bearer ${apiKey}`,
      },
      signal: abortSignal,
    });

    if (response.ok) {
      const data = await response.text();
      return data;
    }
    console.error(`Failed to fetch Jina: ${response.statusText}`);
  } catch (error) {
    console.error(`Failed to fetch Jina: ${(error as Error).message}`);
  }

  console.info("Falling back to fetch.");
  try {
    const response = await fetch(url, { signal: abortSignal });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");

    if (contentType?.includes("text/html")) {
      const cleaner = HtmlCleaner.new(await response.text());
      const processedText = cleaner.clean();
      return processedText;
    }
    return await response.text();
  } catch (error) {
    throw new Error(`Error fetching data: ${error}`);
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
