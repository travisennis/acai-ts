import type { ZodType } from "zod";
import { isZodSchema, zodToJsonSchema } from "../../utils/zod-utils.ts";

// Prefer global fetch/Headers from Node >= 18
const fetchImpl = globalThis.fetch;
const HeadersImpl = globalThis.Headers;

/**
 * HTTP status codes
 */
export enum HttpStatusCode {
  BadRequest = 400,
  NotFound = 404,
  Unauthorized = 401,
  Forbidden = 403,
  TooManyRequests = 429,
  RequestTimeout = 408,
  InternalServerError = 500,
  ServiceUnavailable = 503,
}

/**
 * Base error class for all Exa API errors
 */
export class ExaError extends Error {
  statusCode: number;
  timestamp?: string;
  path?: string;

  constructor(
    message: string,
    statusCode: number,
    timestamp?: string,
    path?: string,
  ) {
    super(message);
    this.name = "ExaError";
    this.statusCode = statusCode;
    this.timestamp = timestamp ?? new Date().toISOString();
    this.path = path;
  }
}

export type BaseSearchOptions = {
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startCrawlDate?: string;
  endCrawlDate?: string;
  startPublishedDate?: string;
  endPublishedDate?: string;
  category?:
    | "company"
    | "research paper"
    | "news"
    | "pdf"
    | "github"
    | "tweet"
    | "personal site"
    | "linkedin profile"
    | "financial report";
  includeText?: string[];
  excludeText?: string[];
  flags?: string[];
  userLocation?: string;
};

export type RegularSearchOptions = BaseSearchOptions & {
  moderation?: boolean;
  useAutoprompt?: boolean;
  type?: "keyword" | "neural" | "auto" | "hybrid" | "fast";
};

export type FindSimilarOptions = BaseSearchOptions & {
  excludeSourceDomain?: boolean;
};

export type ExtrasOptions = { links?: number; imageLinks?: number };

export type ContentsOptions = {
  text?: TextContentsOptions | true;
  highlights?: HighlightsContentsOptions | true;
  summary?: SummaryContentsOptions | true;
  livecrawl?: LivecrawlOptions;
  context?: ContextOptions | true;
  livecrawlTimeout?: number;
  filterEmptyResults?: boolean;
  subpages?: number;
  subpageTarget?: string | string[];
  extras?: ExtrasOptions;
};

export type LivecrawlOptions =
  | "never"
  | "fallback"
  | "always"
  | "auto"
  | "preferred";

export type TextContentsOptions = {
  maxCharacters?: number;
  includeHtmlTags?: boolean;
};

export type HighlightsContentsOptions = {
  query?: string;
  numSentences?: number;
  highlightsPerUrl?: number;
};

export type SummaryContentsOptions = {
  query?: string;
  schema?: Record<string, unknown> | ZodType;
};

export type JsonSchema = Record<string, unknown>;

export type ContextOptions = {
  maxCharacters?: number;
};

export type TextResponse = { text: string };

export type HighlightsResponse = {
  highlights: string[];
  highlightScores: number[];
};

export type SummaryResponse = { summary: string };

export type ExtrasResponse = {
  extras: { links?: string[]; imageLinks?: string[] };
};

export type SubpagesResponse = {
  subpages: Array<Record<string, never>>;
};

export type Default<T extends object, U> = [keyof T] extends [never] ? U : T;

export type ContentsResultComponent<T extends ContentsOptions> = Default<
  (T["text"] extends object | true ? TextResponse : Record<string, never>) &
    (T["highlights"] extends object | true
      ? HighlightsResponse
      : Record<string, never>) &
    (T["summary"] extends object | true
      ? SummaryResponse
      : Record<string, never>) &
    (T["subpages"] extends number ? SubpagesResponse : Record<string, never>) &
    (T["extras"] extends object ? ExtrasResponse : Record<string, never>),
  TextResponse
>;

export type CostDollarsContents = {
  text?: number;
  highlights?: number;
  summary?: number;
};

export type CostDollarsSeearch = {
  neural?: number;
  keyword?: number;
};

export type CostDollars = {
  total: number;
  search?: CostDollarsSeearch;
  contents?: CostDollarsContents;
};

export type SearchResult<T extends ContentsOptions> = {
  title: string | null;
  url: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  id: string;
  image?: string;
  favicon?: string;
} & ContentsResultComponent<T>;

export type SearchResponse<T extends ContentsOptions> = {
  results: SearchResult<T>[];
  context?: string;
  autopromptString?: string;
  autoDate?: string;
  requestId: string;
  statuses?: Array<Status>;
  costDollars?: CostDollars;
};

export type Status = {
  id: string;
  status: string;
  source: string;
};

export type AnswerOptions = {
  stream?: boolean;
  text?: boolean;
  model?: "exa";
  systemPrompt?: string;
  outputSchema?: Record<string, unknown>;
  userLocation?: string;
};

export type AnswerResponse = {
  answer: string | Record<string, unknown>;
  citations: SearchResult<Record<string, never>>[];
  requestId?: string;
  costDollars?: CostDollars;
};

export type AnswerStreamChunk = {
  content?: string;
  citations?: Array<{
    id: string;
    url: string;
    title?: string;
    publishedDate?: string;
    author?: string;
    text?: string;
  }>;
};

export type AnswerStreamResponse = {
  answer?: string;
  citations?: SearchResult<Record<string, never>>[];
};

export type AnswerOptionsTyped<T> = Omit<AnswerOptions, "outputSchema"> & {
  outputSchema: T;
};

export type AnswerResponseTyped<T> = Omit<AnswerResponse, "answer"> & {
  answer: T;
};

export type SummaryContentsOptionsTyped<T> = Omit<
  SummaryContentsOptions,
  "schema"
> & {
  schema: T;
};

export default class Exa {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(apiKey?: string, baseUrl = "https://api.exa.ai") {
    this.baseUrl = baseUrl;
    let resolvedKey = apiKey;
    if (!resolvedKey) {
      // Support both official and common env var names
      resolvedKey =
        process.env["EXASEARCH_API_KEY"] ?? process.env["EXA_API_KEY"];
      if (!resolvedKey) {
        throw new ExaError(
          "API key must be provided as an argument or as an environment variable (EXASEARCH_API_KEY or EXA_API_KEY)",
          HttpStatusCode.Unauthorized,
        );
      }
    }

    // Build base headers
    const headers = new HeadersImpl();
    headers.set("x-api-key", resolvedKey);
    headers.set("Content-Type", "application/json");
    headers.set("User-Agent", "acai-exa");

    // Store as a simple record for easier merging and type safety in this codebase
    const headerRecord: Record<string, string> = {};
    headers.forEach((value, key) => {
      headerRecord[key] = value;
    });
    this.headers = headerRecord;
  }

  private extractContentsOptions<T extends ContentsOptions>(
    options: T,
  ): {
    contentsOptions: ContentsOptions;
    restOptions: Omit<T, keyof ContentsOptions>;
  } {
    const {
      text,
      highlights,
      summary,
      subpages,
      subpageTarget,
      extras,
      livecrawl,
      livecrawlTimeout,
      context,
      ...rest
    } = options;

    const contentsOptions: ContentsOptions = {};

    if (
      text === undefined &&
      summary === undefined &&
      highlights === undefined &&
      extras === undefined
    ) {
      contentsOptions.text = true;
    }

    if (text !== undefined) contentsOptions.text = text;
    if (summary !== undefined) {
      if (
        typeof summary === "object" &&
        summary !== null &&
        "schema" in summary &&
        (summary as { schema?: unknown }).schema &&
        isZodSchema((summary as { schema: unknown }).schema)
      ) {
        const { schema, ...restSummary } = summary as {
          schema: ZodType;
          [k: string]: unknown;
        };
        contentsOptions.summary = {
          ...restSummary,
          schema: zodToJsonSchema(schema),
        } as SummaryContentsOptions;
      } else {
        contentsOptions.summary = summary;
      }
    }
    if (highlights !== undefined) contentsOptions.highlights = highlights;
    if (subpages !== undefined) contentsOptions.subpages = subpages;
    if (subpageTarget !== undefined)
      contentsOptions.subpageTarget = subpageTarget;
    if (extras !== undefined) contentsOptions.extras = extras;
    if (livecrawl !== undefined) contentsOptions.livecrawl = livecrawl;
    if (livecrawlTimeout !== undefined)
      contentsOptions.livecrawlTimeout = livecrawlTimeout;
    if (context !== undefined) contentsOptions.context = context;

    return {
      contentsOptions,
      restOptions: rest as Omit<T, keyof ContentsOptions>,
    };
  }

  async request<T = unknown>(
    endpoint: string,
    method: string,
    body?: unknown,
    params?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<T> {
    if (!fetchImpl) {
      throw new ExaError(
        "Global fetch is not available in this environment.",
        HttpStatusCode.InternalServerError,
      );
    }

    let url = this.baseUrl + endpoint;
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            searchParams.append(key, String(item));
          }
        } else if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      url += `?${searchParams.toString()}`;
    }

    const combinedHeaders: Record<string, string> = {
      ...this.headers,
      ...(headers ?? {}),
    };

    const response = await fetchImpl(url, {
      method,
      headers: combinedHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      let errorTimestamp: string | undefined;
      let errorPath: string | undefined = endpoint;
      try {
        const errorData = await response.json();
        const message = (errorData &&
          (errorData.error || errorData.message)) as unknown;
        if (typeof message === "string" && message.length > 0) {
          errorMessage = message;
        }
        errorTimestamp =
          (errorData && (errorData.timestamp as string | undefined)) ??
          new Date().toISOString();
        errorPath =
          (errorData && (errorData.path as string | undefined)) ?? endpoint;
      } catch {
        // ignore body parse errors
      }
      throw new ExaError(
        errorMessage,
        response.status,
        errorTimestamp,
        errorPath,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      return (await this.parseSseStream<T>(response)) as T;
    }

    return (await response.json()) as T;
  }

  async rawRequest(
    endpoint: string,
    method = "POST",
    body?: Record<string, unknown>,
    queryParams?: Record<
      string,
      string | number | boolean | string[] | undefined
    >,
  ): Promise<Response> {
    if (!fetchImpl) {
      throw new ExaError(
        "Global fetch is not available in this environment.",
        HttpStatusCode.InternalServerError,
      );
    }

    let url = this.baseUrl + endpoint;

    if (queryParams) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(queryParams)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            searchParams.append(key, String(item));
          }
        } else if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      url += `?${searchParams.toString()}`;
    }

    const response = await fetchImpl(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    return response;
  }

  async search(
    query: string,
    options?: RegularSearchOptions,
  ): Promise<SearchResponse<Record<string, never>>> {
    return await this.request("/search", "POST", { query, ...options });
  }

  async searchAndContents<T extends ContentsOptions>(
    query: string,
    options?: RegularSearchOptions & T,
  ): Promise<SearchResponse<T>> {
    const { contentsOptions, restOptions } =
      options === undefined
        ? {
            contentsOptions: { text: true },
            restOptions: {} as Omit<T, keyof ContentsOptions>,
          }
        : this.extractContentsOptions(options);

    return await this.request("/search", "POST", {
      query,
      contents: contentsOptions,
      ...restOptions,
    });
  }

  async findSimilar(
    url: string,
    options?: FindSimilarOptions,
  ): Promise<SearchResponse<Record<string, never>>> {
    return await this.request("/findSimilar", "POST", { url, ...options });
  }

  async findSimilarAndContents<T extends ContentsOptions>(
    url: string,
    options?: FindSimilarOptions & T,
  ): Promise<SearchResponse<T>> {
    const { contentsOptions, restOptions } =
      options === undefined
        ? {
            contentsOptions: { text: true },
            restOptions: {} as Omit<T, keyof ContentsOptions>,
          }
        : this.extractContentsOptions(options);

    return await this.request("/findSimilar", "POST", {
      url,
      contents: contentsOptions,
      ...restOptions,
    });
  }

  async getContents<T extends ContentsOptions>(
    urls: string | string[] | SearchResult<T>[],
    options?: T,
  ): Promise<SearchResponse<T>> {
    if (!urls || (Array.isArray(urls) && urls.length === 0)) {
      throw new ExaError(
        "Must provide at least one URL",
        HttpStatusCode.BadRequest,
      );
    }

    let requestUrls: string[];

    if (typeof urls === "string") {
      requestUrls = [urls];
    } else if (Array.isArray(urls) && typeof urls[0] === "string") {
      requestUrls = urls as string[];
    } else {
      requestUrls = (urls as Array<SearchResult<T>>).map(
        (result) => result.url,
      );
    }

    const payload: Record<string, unknown> = {
      urls: requestUrls,
      ...(options ?? {}),
    };

    return await this.request("/contents", "POST", payload);
  }

  async answer<T>(
    query: string,
    options: AnswerOptionsTyped<ZodType<T>>,
  ): Promise<AnswerResponseTyped<T>>;
  async answer(query: string, options?: AnswerOptions): Promise<AnswerResponse>;
  async answer<T>(
    query: string,
    options?: AnswerOptions | AnswerOptionsTyped<ZodType<T>>,
  ): Promise<AnswerResponse | AnswerResponseTyped<T>> {
    if (options?.stream) {
      throw new ExaError(
        "For streaming responses, please use streamAnswer() instead:\n\n" +
          "for await (const chunk of exa.streamAnswer(query)) {\n" +
          "  // Handle chunks\n" +
          "}",
        HttpStatusCode.BadRequest,
      );
    }

    let outputSchema = (options as { outputSchema?: unknown } | undefined)
      ?.outputSchema;

    if (outputSchema && isZodSchema(outputSchema)) {
      outputSchema = zodToJsonSchema(outputSchema);
    }

    const requestBody: Record<string, unknown> = {
      query,
      stream: false,
      text: options?.text ?? false,
      model: (options as { model?: string } | undefined)?.model ?? "exa",
      systemPrompt: (options as { systemPrompt?: string } | undefined)
        ?.systemPrompt,
      outputSchema,
      userLocation: (options as { userLocation?: string } | undefined)
        ?.userLocation,
    };

    return await this.request("/answer", "POST", requestBody);
  }

  streamAnswer<T>(
    query: string,
    options: {
      text?: boolean;
      model?: "exa" | "exa-pro";
      systemPrompt?: string;
      outputSchema: ZodType<T>;
    },
  ): AsyncGenerator<AnswerStreamChunk>;
  streamAnswer(
    query: string,
    options?: {
      text?: boolean;
      model?: "exa" | "exa-pro";
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    },
  ): AsyncGenerator<AnswerStreamChunk>;
  async *streamAnswer<T>(
    query: string,
    options?: {
      text?: boolean;
      model?: "exa" | "exa-pro";
      systemPrompt?: string;
      outputSchema?: Record<string, unknown> | ZodType<T>;
    },
  ): AsyncGenerator<AnswerStreamChunk> {
    if (!fetchImpl) {
      throw new ExaError(
        "Global fetch is not available in this environment.",
        HttpStatusCode.InternalServerError,
      );
    }

    let outputSchema = options?.outputSchema as unknown;
    if (outputSchema && isZodSchema(outputSchema)) {
      outputSchema = zodToJsonSchema(outputSchema as ZodType);
    }

    const body = {
      query,
      text: options?.text ?? false,
      stream: true,
      model: options?.model ?? "exa",
      systemPrompt: options?.systemPrompt,
      outputSchema,
    } as const;

    const response = await fetchImpl(`${this.baseUrl}/answer`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new ExaError(message, response.status, new Date().toISOString());
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ExaError(
        "No response body available for streaming.",
        500,
        new Date().toISOString(),
      );
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.replace(/^data:\s*/, "").trim();
          if (!jsonStr || jsonStr === "[DONE]") {
            continue;
          }

          let chunkData: unknown;
          try {
            chunkData = JSON.parse(jsonStr) as unknown;
          } catch {
            continue;
          }

          const chunk = this.processChunk(chunkData);
          if (chunk.content || chunk.citations) {
            yield chunk;
          }
        }
      }

      if (buffer.startsWith("data: ")) {
        const leftover = buffer.replace(/^data:\s*/, "").trim();
        if (leftover && leftover !== "[DONE]") {
          try {
            const chunkData = JSON.parse(leftover) as unknown;
            const chunk = this.processChunk(chunkData);
            if (chunk.content || chunk.citations) {
              yield chunk;
            }
          } catch {
            // ignore
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private processChunk(chunkData: unknown): AnswerStreamChunk {
    let content: string | undefined;
    let citations:
      | Array<{
          id: string;
          url: string;
          title?: string;
          publishedDate?: string;
          author?: string;
          text?: string;
        }>
      | undefined;

    const data = chunkData as Record<string, unknown>;
    const choices =
      (data?.["choices"] as
        | Array<{ delta?: { content?: string } }>
        | undefined) ?? undefined;
    if (choices?.[0]?.delta) {
      const c = choices[0].delta.content;
      if (typeof c === "string") {
        content = c;
      }
    }

    const rawCitations = data?.["citations"] as
      | Array<Record<string, unknown>>
      | "null"
      | undefined;
    if (
      rawCitations &&
      rawCitations !== "null" &&
      Array.isArray(rawCitations)
    ) {
      citations = rawCitations.map((c) => ({
        id: String((c as Record<string, unknown>)["id"] ?? ""),
        url: String((c as Record<string, unknown>)["url"] ?? ""),
        title:
          typeof (c as Record<string, unknown>)["title"] === "string"
            ? ((c as Record<string, unknown>)["title"] as string)
            : undefined,
        publishedDate:
          typeof (c as Record<string, unknown>)["publishedDate"] === "string"
            ? ((c as Record<string, unknown>)["publishedDate"] as string)
            : undefined,
        author:
          typeof (c as Record<string, unknown>)["author"] === "string"
            ? ((c as Record<string, unknown>)["author"] as string)
            : undefined,
        text:
          typeof (c as Record<string, unknown>)["text"] === "string"
            ? ((c as Record<string, unknown>)["text"] as string)
            : undefined,
      }));
    }

    return { content, citations };
  }

  private async parseSseStream<T>(response: Response): Promise<T> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new ExaError(
        "No response body available for streaming.",
        500,
        new Date().toISOString(),
      );
    }

    const decoder = new TextDecoder();
    let buffer = "";

    return await new Promise<T>((resolve, reject) => {
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;

              const jsonStr = line.replace(/^data:\s*/, "").trim();
              if (!jsonStr || jsonStr === "[DONE]") {
                continue;
              }

              let chunk: unknown;
              try {
                chunk = JSON.parse(jsonStr) as unknown;
              } catch {
                continue;
              }

              const tagged = chunk as {
                tag?: string;
                data?: unknown;
                error?: { message?: string };
              };
              switch (tagged.tag) {
                case "complete":
                  reader.releaseLock();
                  resolve(tagged.data as T);
                  return;
                case "error": {
                  const message = tagged.error?.message || "Unknown error";
                  reader.releaseLock();
                  reject(
                    new ExaError(
                      message,
                      HttpStatusCode.InternalServerError,
                      new Date().toISOString(),
                    ),
                  );
                  return;
                }
                default:
                  break;
              }
            }
          }

          reject(
            new ExaError(
              "Stream ended without a completion event.",
              HttpStatusCode.InternalServerError,
              new Date().toISOString(),
            ),
          );
        } catch (err) {
          reject(err as Error);
        } finally {
          try {
            reader.releaseLock();
          } catch {
            // ignore
          }
        }
      })();
    });
  }
}
