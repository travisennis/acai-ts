import type { Terminal } from "../terminal/index.ts";
import { isToolMessage } from "./types.ts";

export async function consumeToolAsyncIterable(
  iterable: AsyncIterable<unknown>,
  terminal?: Terminal,
): Promise<{ finalValue: unknown }> {
  const iterator = iterable[Symbol.asyncIterator]();
  const toolResultValues: unknown[] = [];

  let next = await iterator.next();

  while (!next.done) {
    const value = next.value;
    if (isToolMessage(value)) {
      if (terminal) {
        // Import displayToolMessages dynamically to avoid circular dependency
        const { displayToolMessages } = await import(
          "../repl/display-tool-messages.ts"
        );
        displayToolMessages(value, terminal);
      }
    } else {
      toolResultValues.push(value);
    }
    next = await iterator.next();
  }

  const finalValue =
    next.value ??
    (toolResultValues.length > 0 ? toolResultValues.at(-1) : undefined);

  return { finalValue };
}
