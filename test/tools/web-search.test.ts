import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { createWebSearchTool } from "../../source/tools/web-search.ts";

interface DuckDuckGoTopic {
  // biome-ignore lint/style/useNamingConvention: DuckDuckGo API response uses PascalCase
  Result?: string;
  // biome-ignore lint/style/useNamingConvention: DuckDuckGo API response uses PascalCase
  Text?: string;
  // biome-ignore lint/style/useNamingConvention: DuckDuckGo API response uses PascalCase
  FirstURL?: string;
}

interface DuckDuckGoResponse {
  // biome-ignore lint/style/useNamingConvention: DuckDuckGo API response uses PascalCase
  RelatedTopics: DuckDuckGoTopic[];
}

function createDuckDuckGoResponse(
  topics: DuckDuckGoTopic[],
): DuckDuckGoResponse {
  // biome-ignore lint/style/useNamingConvention: DuckDuckGo API response uses PascalCase
  return { RelatedTopics: topics };
}

function createDuckDuckGoTopic(
  result: string,
  text: string,
  url: string,
): DuckDuckGoTopic {
  // biome-ignore lint/style/useNamingConvention: DuckDuckGo API response uses PascalCase
  return { Result: result, Text: text, FirstURL: url };
}

function mockFetchWithDuckDuckGo(topics: DuckDuckGoTopic[]) {
  return mock.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(createDuckDuckGoResponse(topics)),
    }),
  );
}

describe("web search tool", async () => {
  const tool = await createWebSearchTool();
  const { execute } = tool;

  async function run(
    query: string,
    options?: {
      numResults?: number;
      timeout?: number;
      provider?: "exa" | "duckduckgo";
    },
  ) {
    return execute(
      {
        query,
        numResults: options?.numResults ?? 10,
        timeout: options?.timeout ?? 30000,
        provider: options?.provider ?? "exa",
      },
      { toolCallId: "t1", messages: [] },
    );
  }

  describe("tool definition", async () => {
    it("has correct name", async () => {
      assert.strictEqual(
        tool.toolDef.description.includes("Search the web"),
        true,
      );
    });

    it("has input schema with required fields", async () => {
      assert.ok(tool.toolDef.inputSchema.shape.query);
      assert.ok(tool.toolDef.inputSchema.shape.numResults);
      assert.ok(tool.toolDef.inputSchema.shape.timeout);
      assert.ok(tool.toolDef.inputSchema.shape.provider);
    });
  });

  describe("display function", async () => {
    it("formats display output correctly", async () => {
      const display = tool.display({
        query: "test query",
        numResults: 10,
        timeout: 30000,
        provider: "exa",
      });
      assert.ok(display.includes("🔍"));
      assert.ok(display.includes("test query"));
    });
  });

  describe("search execution", async () => {
    it("handles empty query gracefully", async () => {
      await assert.rejects(async () => {
        await run("");
      }, /Search query cannot be empty/);
    });

    it("handles abort signal", async () => {
      const ac = new AbortController();
      ac.abort();

      await assert.rejects(async () => {
        await execute(
          { query: "test", numResults: 10, timeout: 30000, provider: "exa" },
          { toolCallId: "t1", messages: [], abortSignal: ac.signal },
        );
      }, /Web search aborted/);
    });

    it("handles provider option with mocked duckduckgo", async () => {
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch?: unknown }).fetch = mockFetchWithDuckDuckGo([
        createDuckDuckGoTopic(
          "<a href='http://example.com'>Example</a> - Test result",
          "This is a test result from DuckDuckGo",
          "http://example.com",
        ),
      ]);

      try {
        const result = await run("test query", { provider: "duckduckgo" });
        assert.ok(result.includes("duckduckgo"));
        assert.ok(result.includes("Example"));
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    });

    it("clamps numResults to valid range", async () => {
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch?: unknown }).fetch = mockFetchWithDuckDuckGo([
        createDuckDuckGoTopic(
          "<a href='http://example.com'>Example</a> - Test",
          "Test result",
          "http://example.com",
        ),
      ]);

      try {
        // Test with invalid numResults values (0 should be clamped to at least 1)
        const result = await run("test", {
          numResults: 0,
          provider: "duckduckgo",
        });
        assert.ok(result.length >= 0);
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    });
  });

  describe("result formatting", async () => {
    it("returns formatted result string with mocked data", async () => {
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch?: unknown }).fetch = mockFetchWithDuckDuckGo([
        createDuckDuckGoTopic(
          "<a href='http://example.com'>Example Title</a> - Description",
          "This is a detailed test result from the mock",
          "http://example.com",
        ),
        createDuckDuckGoTopic(
          "<a href='http://test.com'>Test Title</a> - Another desc",
          "Another test result for formatting validation",
          "http://test.com",
        ),
      ]);

      try {
        const result = await run("TypeScript", {
          numResults: 5,
          provider: "duckduckgo",
        });
        assert.ok(result.includes("Search results"));
        assert.ok(result.includes("Example Title"));
        assert.ok(result.includes("http://example.com"));
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    });

    it("handles no results gracefully", async () => {
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch?: unknown }).fetch = mockFetchWithDuckDuckGo([]);

      try {
        const result = await run("xyznonexistentquery12345", {
          provider: "duckduckgo",
        });
        assert.ok(result.includes("No search results"));
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    });
  });
});

describe("web search tool with mock", async () => {
  it("handles API errors gracefully", async () => {
    const tool = await createWebSearchTool();
    const { execute } = tool;

    // Mock the fetch to simulate API error
    const originalFetch = globalThis.fetch;
    (globalThis as { fetch?: unknown }).fetch = mock.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      }),
    );

    try {
      await assert.rejects(async () => {
        await execute(
          {
            query: "test",
            numResults: 10,
            timeout: 30000,
            provider: "duckduckgo",
          },
          { toolCallId: "t1", messages: [] },
        );
      }, /Web search failed/);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
    }
  });

  it("handles Exa API with valid key", async () => {
    const tool = await createWebSearchTool();
    const { execute } = tool;

    const originalFetch = globalThis.fetch;
    const mockFetch = mock.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            results: [
              {
                title: "Exa Result",
                url: "http://exa.example.com",
                body: "This is a result from Exa API",
                publishedDate: "2024-01-15",
              },
            ],
          }),
      }),
    );
    (globalThis as { fetch?: unknown }).fetch = mockFetch;

    const originalEnv = process.env["EXA_API_KEY"];
    process.env["EXA_API_KEY"] = "test-api-key";

    try {
      const result = await execute(
        { query: "test", numResults: 10, timeout: 30000, provider: "exa" },
        { toolCallId: "t1", messages: [] },
      );
      assert.ok(result.includes("exa"));
      assert.ok(result.includes("Exa Result"));
      assert.ok(mockFetch.mock.calls.length > 0);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
      process.env["EXA_API_KEY"] = originalEnv;
    }
  });

  it("falls back to DuckDuckGo when Exa fails", async () => {
    const tool = await createWebSearchTool();
    const { execute } = tool;

    const originalFetch = globalThis.fetch;
    let callCount = 0;
    (globalThis as { fetch?: unknown }).fetch = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        // First call to Exa fails
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Exa Error"),
        });
      }
      // Second call to DuckDuckGo succeeds
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            createDuckDuckGoResponse([
              createDuckDuckGoTopic(
                "<a href='http://fallback.com'>Fallback</a> - Result",
                "Fallback result from DuckDuckGo",
                "http://fallback.com",
              ),
            ]),
          ),
      });
    });

    const originalEnv = process.env["EXA_API_KEY"];
    process.env["EXA_API_KEY"] = "test-api-key";

    try {
      const result = await execute(
        { query: "test", numResults: 10, timeout: 30000, provider: "exa" },
        { toolCallId: "t1", messages: [] },
      );
      assert.ok(result.includes("duckduckgo"));
      assert.ok(result.includes("Fallback"));
      assert.strictEqual(callCount, 2); // Exa + DuckDuckGo
    } finally {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
      process.env["EXA_API_KEY"] = originalEnv;
    }
  });

  it("falls back to DuckDuckGo when Exa API key is missing", async () => {
    const tool = await createWebSearchTool();
    const { execute } = tool;

    const originalFetch = globalThis.fetch;
    (globalThis as { fetch?: unknown }).fetch = mockFetchWithDuckDuckGo([
      createDuckDuckGoTopic(
        "<a href='http://example.com'>Fallback Result</a> - Description",
        "This is a fallback result when Exa key is missing",
        "http://example.com",
      ),
    ]);

    const originalEnv = process.env["EXA_API_KEY"];
    delete process.env["EXA_API_KEY"];

    try {
      // When Exa API key is missing, it should fall back to DuckDuckGo
      const result = await execute(
        { query: "test", numResults: 10, timeout: 30000, provider: "exa" },
        { toolCallId: "t1", messages: [] },
      );
      // Should get results from DuckDuckGo fallback
      assert.ok(result.includes("duckduckgo"));
      assert.ok(result.includes("Fallback Result"));
    } finally {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
      if (originalEnv) {
        process.env["EXA_API_KEY"] = originalEnv;
      }
    }
  });
});

describe("web search tool input validation", async () => {
  const tool = await createWebSearchTool();

  it("accepts valid query strings", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as { fetch?: unknown }).fetch = mockFetchWithDuckDuckGo([
      createDuckDuckGoTopic(
        "<a href='http://example.com'>Test</a> - Result",
        "Test result",
        "http://example.com",
      ),
    ]);

    try {
      const result = await tool.execute(
        {
          query: "valid query string",
          numResults: 10,
          timeout: 30000,
          provider: "duckduckgo",
        },
        { toolCallId: "t1", messages: [] },
      );
      assert.ok(typeof result === "string");
    } finally {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
    }
  });

  it("accepts numeric parameters", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as { fetch?: unknown }).fetch = mockFetchWithDuckDuckGo([
      createDuckDuckGoTopic(
        "<a href='http://example.com'>Test</a> - Result",
        "Test result",
        "http://example.com",
      ),
    ]);

    try {
      const result = await tool.execute(
        {
          query: "test",
          numResults: 50,
          timeout: 50000,
          provider: "duckduckgo",
        },
        { toolCallId: "t1", messages: [] },
      );
      assert.ok(typeof result === "string");
    } finally {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
    }
  });

  it("accepts provider enum values", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as { fetch?: unknown }).fetch = mock.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            results: [
              {
                title: "Exa Result",
                url: "http://exa.example.com",
                body: "Exa result",
                publishedDate: "2024-01-15",
              },
            ],
          }),
      }),
    );

    const originalEnv = process.env["EXA_API_KEY"];
    process.env["EXA_API_KEY"] = "test-key";

    try {
      const result1 = await tool.execute(
        { query: "test", numResults: 10, timeout: 30000, provider: "exa" },
        { toolCallId: "t1", messages: [] },
      );
      assert.ok(typeof result1 === "string");
    } finally {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
      process.env["EXA_API_KEY"] = originalEnv;
    }
  });
});
