import { tool } from "ai";
import { z } from "zod";
import type { SendData } from "./types.ts";

interface Bookmark {
  title: string;
  link: string;
  domain: string;
  excerpt: string;
}

interface ApiResponse {
  items: Bookmark[];
}

function isApiResponse(data: unknown): data is ApiResponse {
  if (!data || typeof data !== "object") {
    return false;
  }

  if (!("items" in data)) {
    return false;
  }

  const { items } = data as { items: unknown };
  if (!Array.isArray(items)) {
    return false;
  }

  return items.every(
    (item) =>
      item &&
      typeof item === "object" &&
      "title" in item &&
      "link" in item &&
      typeof (item as Bookmark).title === "string" &&
      typeof (item as Bookmark).link === "string",
  );
}

export const createRaindropTools = ({
  apiKey,
  sendData,
}: Readonly<{ apiKey: string; sendData?: SendData }>) => {
  return {
    searchBookmarks: tool({
      description: "Searches for bookmarks.",
      parameters: z.object({
        search: z
          .string()
          .describe(
            "The search terms with which to query. Terms can wrapped in quotations to match phrases. Terms can also be prepended with # to match tags.",
          ),
        created: z
          .string()
          .optional()
          .describe(
            "An optional created date to search for items created in specific date. The format is YYYY-MM-DD. Put < or > in front of a date to find before or after specific date respectively.",
          ),
      }),
      execute: async ({ search, created }) => {
        sendData?.({
          event: "tool-init",
          data: `Searching bookmarks with query: ${search}${created ? ` and created date: ${created}` : ""}`,
        });
        try {
          const result = await searchRaindrop({ search, created, apiKey });

          sendData?.({
            event: "tool-completion",
            data: `Found ${result.length} bookmarks`,
          });

          return JSON.stringify(result);
        } catch (error) {
          const errorMessage = `Error fetching data: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),
  };
};

export async function searchRaindrop({
  search,
  created,
  apiKey,
}: { search: string; created?: string; apiKey: string }) {
  const collectionId = "0";
  let searchFilter = search;
  if (created) {
    searchFilter += ` created:${created}`;
  }
  const encodedSearch = encodeURIComponent(searchFilter);
  const searchUrl = `https://api.raindrop.io/rest/v1/raindrops/${collectionId}?search=${encodedSearch}`;

  try {
    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        // biome-ignore lint/style/useNamingConvention: <explanation>
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorMessage = `HTTP error! status: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!isApiResponse(data)) {
      const errorMessage = "Invalid API response format.";
      throw new Error(errorMessage);
    }

    const parsedData = data.items.map((item) => ({
      title: item.title,
      link: item.link,
      domain: item.domain,
      excerpt: item.excerpt,
    }));

    return parsedData;
  } catch (error) {
    const errorMessage = `Error fetching data: ${(error as Error).message}`;
    throw new Error(errorMessage);
  }
}
