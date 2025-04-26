import { tool } from "ai";
import Exa from "exa-js";
import { z } from "zod";
import type { SendData } from "./types.ts";

export const createWebSearchTools = ({
  sendData,
}: {
  sendData?: SendData;
}) => {
  return {
    webSearch: tool({
      description:
        "Searches the web and returns match documents with their title, url, and text content. The query should be formulated as a natural language question.",
      parameters: z.object({
        query: z.string().describe("The search query."),
      }),
      execute: async ({ query }) => {
        const id = crypto.randomUUID();
        sendData?.({
          id,
          event: "tool-init",
          data: `Web search: ${query}`,
        });

        const result = await search(query);

        sendData?.({
          id,
          event: "tool-completion",
          data: "Done",
        });

        const sources = result.results.map(
          (source) =>
            `## ${source.title}\nURL: ${source.url}\n\n${source.text}`,
        );

        return `# Search Results:\n\n${sources.join("\n\n")}`;
      },
    }),
  };
};

async function search(query: string) {
  const exa = new Exa(process.env["EXA_API_KEY"]);

  const result = await exa.searchAndContents(query, {
    text: true,
  });

  return result;
}

// function parseMetadata(providerMetadata: ProviderMetadata | undefined) {
//   const metadata = providerMetadata?.["google"] as
//     | GoogleGenerativeAIProviderMetadata
//     | undefined;

//   // Extract sources from grounding metadata
//   const sourceMap = new Map<
//     string,
//     { title: string; url: string; snippet: string }
//   >();

//   // Get grounding metadata from response
//   const chunks = metadata?.groundingMetadata?.groundingChunks || [];
//   const supports = metadata?.groundingMetadata?.groundingSupports || [];

//   chunks.forEach((chunk, index: number) => {
//     if (chunk.web?.uri && chunk.web?.title) {
//       const url = chunk.web.uri;
//       if (!sourceMap.has(url)) {
//         // Find snippets that reference this chunk
//         const snippets = supports
//           .filter((support) => support.groundingChunkIndices?.includes(index))
//           .map((support) => support.segment.text)
//           .join(" ");

//         sourceMap.set(url, {
//           title: chunk.web.title,
//           url: url,
//           snippet: snippets || "",
//         });
//       }
//     }
//   });

//   const sources = Array.from(sourceMap.values());

//   return {
//     sources,
//   };
// }
