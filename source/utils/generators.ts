function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<T>).then === "function"
  );
}

// biome-ignore lint/style/useNamingConvention: temp
export function exhaustGenerator<T, TReturn, TNext>(
  generator: Generator<T, TReturn, TNext>,
): TReturn;

// biome-ignore lint/style/useNamingConvention: temp
export function exhaustGenerator<T, TReturn, TNext>(
  generator: AsyncGenerator<T, TReturn, TNext>,
): Promise<TReturn>;

// biome-ignore lint/style/useNamingConvention: temp
export function exhaustGenerator<T, TReturn, TNext>(
  generator: Generator<T, TReturn, TNext> | AsyncGenerator<T, TReturn, TNext>,
): TReturn | Promise<TReturn> {
  const firstResult = generator.next();

  if (isPromiseLike(firstResult)) {
    const asyncGenerator = generator as AsyncGenerator<T, TReturn, TNext>;

    return (async () => {
      let result = await firstResult;

      while (!result.done) {
        result = await asyncGenerator.next();
      }

      return result.value;
    })();
  }

  const syncGenerator = generator as Generator<T, TReturn, TNext>;
  let result = firstResult as IteratorResult<T, TReturn>;

  while (!result.done) {
    result = syncGenerator.next();
  }

  return result.value;
}
