export function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  return (
    typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function"
  );
}
