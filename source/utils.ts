export type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];
export type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

export function isError(input: unknown): input is Error {
  return input instanceof Error;
}

export type Try<T> = T | Error;

export async function asyncTry<T>(input: PromiseLike<T>): Promise<Try<T>> {
  try {
    return await input;
  } catch (e) {
    if (e instanceof Error) {
      return e;
    } else {
      return new Error(`Unexpected error ${String(e)}`);
    }
  }
}

export function tryOrDefault<T>(input: Try<T>, defaultValue: T): T {
  if (isError(input)) {
    return defaultValue;
  }
  return input;
}

export function tryOrFail<T>(input: Try<T>, callback: (e: Error) => void) {
  if (isError(input)) {
    return callback(input);
  }
  return input;
}

// Define the Result type
export type Result<T, E> =
  | { kind: "success"; value: T }
  | { kind: "error"; error: E };

// Helper function to create a success Result
export function Ok<T, E>(value: T): Result<T, E> {
  return { kind: "success", value };
}

// Helper function to create an error Result
export function Err<T, E>(error: E): Result<T, E> {
  return { kind: "error", error };
}

// Type guard for Ok
export function isOk<T, E>(
  result: Result<T, E>,
): result is { kind: "success"; value: T } {
  return result.kind === "success";
}

// Type guard for Err
export function isErr<T, E>(
  result: Result<T, E>,
): result is { kind: "error"; error: E } {
  return result.kind === "error";
}

export abstract class Option<T> {
  abstract readonly isSome: boolean;
  abstract readonly isNone: boolean;

  static some<T>(value: T): Option<T> {
    return new Some(value);
  }

  static none<T>(): Option<T> {
    return None.instance;
  }

  abstract map<U>(fn: (value: T) => U): Option<U>;
  abstract flatMap<U>(fn: (value: T) => Option<U>): Option<U>;
  abstract filter(predicate: (value: T) => boolean): Option<T>;
  abstract or(alternative: Option<T>): Option<T>;
  abstract unwrapOr(defaultValue: T): T;
  abstract unwrap(): T;
  abstract match<U>(pattern: { some: (value: T) => U; none: () => U }): U;
}

export class Some<T> extends Option<T> {
  readonly isSome: boolean = true;
  readonly isNone: boolean = false;

  constructor(public readonly value: T) {
    super();
  }

  map<U>(fn: (value: T) => U): Option<U> {
    return Option.some(fn(this.value));
  }

  flatMap<U>(fn: (value: T) => Option<U>): Option<U> {
    return fn(this.value);
  }

  filter(predicate: (value: T) => boolean): Option<T> {
    return predicate(this.value) ? this : Option.none();
  }

  or(_alternative: Option<T>): Option<T> {
    return this;
  }

  unwrapOr(_defaultValue: T): T {
    return this.value;
  }

  unwrap(): T {
    return this.value;
  }

  match<U>(pattern: { some: (value: T) => U; none: () => U }): U {
    return pattern.some(this.value);
  }
}

export class None<T> extends Option<T> {
  readonly isSome: boolean = false;
  readonly isNone: boolean = true;

  private constructor() {
    super();
  }

  static instance = new None<never>();

  map<U>(_fn: (value: T) => U): Option<U> {
    return Option.none();
  }

  flatMap<U>(_fn: (value: T) => Option<U>): Option<U> {
    return Option.none();
  }

  filter(_predicate: (value: T) => boolean): Option<T> {
    return Option.none();
  }

  or(alternative: Option<T>): Option<T> {
    return alternative;
  }

  unwrapOr(defaultValue: T): T {
    return defaultValue;
  }

  unwrap(): never {
    throw new Error("Called unwrap on a None value");
  }

  match<U>(pattern: { some: (value: T) => U; none: () => U }): U {
    return pattern.none();
  }
}

// Type guards for checking the type
export function isSome<T>(option: Option<T>): option is Some<T> {
  return option.isSome;
}

export function isNone<T>(option: Option<T>): option is None<T> {
  return option.isNone;
}
