const PROMPT_INSTRUCTION = "//%";

interface EmbeddedInstructions {
  prompt: string | null;
  context: string;
  mode: "edit" | "ask";
}

/**
 * Parses the input string to extract embedded instructions and context.
 *
 * This function processes the input string line by line, looking for specific
 * instruction prefixes to populate the `EmbeddedInstructions` interface fields.
 * Lines that don't match any instruction prefix are considered part of the context.
 *
 * @param input - A string containing the input text to parse.
 * @returns An `EmbeddedInstructions` object with parsed values and remaining context.
 *
 */
export function parseInstructions(input: string): EmbeddedInstructions {
  // Early return for empty input
  if (!input || input.trim() === "") {
    return { prompt: null, context: "", mode: "edit" };
  }

  const lines = input.split("\n");
  let prompt: string | null = null;
  const contextLines: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith(PROMPT_INSTRUCTION)) {
      // Extract prompt only once - take the first occurrence
      if (prompt === null) {
        prompt = line.trim().substring(PROMPT_INSTRUCTION.length).trim();
      }
    } else {
      contextLines.push(line);
    }
  }

  const context = contextLines.join("\n");
  // More explicit mode determination with fallback
  const mode = prompt ? (prompt.includes("?") ? "ask" : "edit") : "edit";

  return { prompt, context, mode };
}
