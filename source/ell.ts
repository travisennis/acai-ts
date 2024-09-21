import { createAnthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

interface Options {
  model: "claude" | "gpt4o";
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

function getModel(input: "claude" | "gpt4o") {
  if (input === "gpt4o") {
    return openai("gpt-4o-2024-08-06");
  }

  const anthropic = createAnthropic({
    apiKey: process.env.CLAUDE_API_KEY,
    headers: {
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
    },
  });
  return anthropic("claude-3-5-sonnet-20240620", {
    cacheControl: true,
  });
}

export function ell(options: Options) {
  return (originalMethod: any, _context: any) => {
    async function replacementMethod(this: any, ...args: any[]) {
      const result = await originalMethod.apply(this, args);
      try {
        const { text } = await generateText({
          model: getModel(options.model),
          maxTokens: options.maxTokens ?? 8192,
          system: options.system,
          prompt: result,
        });

        return text.trim();
      } catch (error) {
        console.error("Error calling LLM API:", error);
        throw new Error("Failed to get response from LLM");
      }
    }

    return replacementMethod;
  };
}

export class TestService {
  @ell({
    model: "claude",
    temperature: 0.7,
    maxTokens: 200,
  })
  test(n: number): Promise<string> {
    return Promise.resolve(`Return ${n} kinds of fruit.`);
  }
}
