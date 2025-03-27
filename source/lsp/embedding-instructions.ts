const PROMPT_INSTRUCTION = "//%";

interface EmbeddedInstructions {
  prompt: string | null;
  context: string;
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
export function parseContext(input: string): EmbeddedInstructions {
  let prompt: string | null = null;
  const context: string[] = [];

  const lines = input.split("\n");
  for (const line of lines) {
    const tl = line.trim();
    if (tl.startsWith(PROMPT_INSTRUCTION)) {
      prompt = tl.replace(PROMPT_INSTRUCTION, "").trim();
    } else {
      context.push(line);
    }
  }

  return {
    prompt,
    context: context.join("\n"),
  };
}
