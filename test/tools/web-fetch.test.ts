import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { createWebFetchTool } from "../../source/tools/web-fetch.ts";

/**
 * Build a minimal mock Response object with the methods/properties
 * that fetchUrl and its helpers actually use.
 */
function mockResponse(
  body: string | null,
  init: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    url?: string;
  } = {},
): Response {
  const {
    status = 200,
    statusText = "",
    headers = {},
    url = "http://example.com/",
  } = init;

  const response = new Response(body, {
    status,
    statusText,
    headers: { "Content-Type": "text/plain", ...headers },
  });

  // Response.url is read-only but we need it for sourceUrl tracking.
  // Use Object.defineProperty to set it on the mock.
  Object.defineProperty(response, "url", {
    value: url,
    configurable: true,
  });

  return response;
}

describe("web fetch tool", async () => {
  const tool = await createWebFetchTool();
  const { execute } = tool;

  async function run(
    url: string,
    options?: {
      output?: "text" | "html" | "markdown" | "json";
      jina?: boolean;
      timeout?: number;
      headers?: boolean;
    },
  ) {
    return execute(
      {
        url,
        output: options?.output ?? "text",
        jina: options?.jina ?? false,
        timeout: options?.timeout ?? 30000,
        headers: options?.headers ?? false,
      },
      { toolCallId: "t1", messages: [] },
    );
  }

  describe("tool definition", async () => {
    it("has correct description", async () => {
      assert.strictEqual(
        tool.toolDef.description.includes("Fetch and extract"),
        true,
      );
    });

    it("has required input fields", async () => {
      assert.ok(tool.toolDef.inputSchema.shape.url);
    });
  });

  describe("display function", async () => {
    it("formats display output correctly", async () => {
      const display = tool.display({
        url: "http://example.com",
        output: "text",
        jina: false,
        timeout: 30000,
        headers: false,
      });
      assert.ok(display.includes("http://example.com"));
    });
  });

  describe("fetchUrl — basic fetch", async () => {
    it("fetches and returns text content", async () => {
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch?: unknown }).fetch = mock.fn(() =>
        Promise.resolve(
          mockResponse("Hello, world!", {
            headers: { "Content-Type": "text/plain" },
          }),
        ),
      );

      try {
        const result = await run("http://example.com/test.txt");
        assert.strictEqual(result, "Hello, world!");
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    });

    it("fetches and returns HTML content cleaned", async () => {
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch?: unknown }).fetch = mock.fn(() =>
        Promise.resolve(
          mockResponse("<html><body><p>HTML content</p></body></html>", {
            headers: { "Content-Type": "text/html" },
          }),
        ),
      );

      try {
        // HTML output returns the cleaned HTML
        const result = await run("http://example.com/page.html");
        // The HTML cleaner has already cleaned the content
        assert.ok(typeof result === "string");
        assert.ok(result.length > 0);
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    });

    it("returns metadata with headers option", async () => {
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch?: unknown }).fetch = mock.fn(() =>
        Promise.resolve(
          mockResponse('{"key":"value"}', {
            headers: {
              "Content-Type": "application/json",
              "X-Custom": "test-header",
            },
          }),
        ),
      );

      try {
        const result = await run("http://example.com/data.json", {
          output: "json",
          headers: true,
        });
        const parsed = JSON.parse(result);
        assert.ok(parsed.headers);
        assert.strictEqual(parsed.headers["x-custom"], "test-header");
        assert.strictEqual(parsed.contentType, "application/json");
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    });
  });

  describe("fetchUrl — redirect handling", async () => {
    it("follows a single redirect", async () => {
      let callCount = 0;
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch?: unknown }).fetch = mock.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            mockResponse(null, {
              status: 302,
              // biome-ignore lint/style/useNamingConvention: HTTP header name
              headers: { Location: "/target" },
            }),
          );
        }
        return Promise.resolve(
          mockResponse("Redirected content", {
            headers: { "Content-Type": "text/plain" },
          }),
        );
      });

      try {
        const result = await run("http://example.com/redirect");
        assert.strictEqual(result, "Redirected content");
        assert.strictEqual(callCount, 2);
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    });

    it("follows multiple redirects", async () => {
      let callCount = 0;
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch?: unknown }).fetch = mock.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            mockResponse(null, {
              status: 301,
              // biome-ignore lint/style/useNamingConvention: HTTP header name
              headers: { Location: "/hop1" },
            }),
          );
        }
        if (callCount === 2) {
          return Promise.resolve(
            mockResponse(null, {
              status: 301,
              // biome-ignore lint/style/useNamingConvention: HTTP header name
              headers: { Location: "/hop2" },
            }),
          );
        }
        return Promise.resolve(
          mockResponse("After two redirects", {
            headers: { "Content-Type": "text/plain" },
          }),
        );
      });

      try {
        const result = await run("http://example.com/multi-redirect");
        assert.strictEqual(result, "After two redirects");
        assert.strictEqual(callCount, 3);
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    });

    it("throws on too many redirects", async () => {
      let _callCount = 0;
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch?: unknown }).fetch = mock.fn(() => {
        _callCount++;
        return Promise.resolve(
          mockResponse(null, {
            status: 302,
            // biome-ignore lint/style/useNamingConvention: HTTP header name
            headers: { Location: "/loop" },
          }),
        );
      });

      try {
        await assert.rejects(
          () => run("http://example.com/redirect-loop"),
          /Too many redirects/,
        );
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    });
  });

  describe("fetchUrl — error handling", async () => {
    it("rejects on HTTP error status", async () => {
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch?: unknown }).fetch = mock.fn(() =>
        Promise.resolve(
          mockResponse("Not found", {
            status: 404,
            statusText: "Not Found",
            headers: { "Content-Type": "text/plain" },
          }),
        ),
      );

      try {
        await assert.rejects(
          () => run("http://example.com/not-found"),
          /Web fetch failed/,
        );
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    });

    it("rejects on server error", async () => {
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch?: unknown }).fetch = mock.fn(() =>
        Promise.resolve(
          mockResponse("Internal error", {
            status: 500,
            statusText: "Internal Server Error",
          }),
        ),
      );

      try {
        await assert.rejects(
          () => run("http://example.com/server-error"),
          /Web fetch failed/,
        );
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    });
  });

  describe("input validation", async () => {
    it("rejects invalid URLs", async () => {
      await assert.rejects(() => run("not-a-url"), /Invalid URL format/);
    });

    it("rejects empty URLs", async () => {
      await assert.rejects(() => run(""), /Invalid URL format/);
    });

    it("rejects URLs without protocol", async () => {
      await assert.rejects(() => run("example.com/path"), /Invalid URL format/);
    });
  });
});
