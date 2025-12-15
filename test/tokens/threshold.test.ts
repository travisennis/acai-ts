import { strict as assert } from "node:assert";
import { mock, test } from "node:test";
import { config } from "../../source/config.ts";
import type { TokenCounter } from "../../source/tokens/counter.ts";
import {
  clearTokenCache,
  manageTokenLimit,
  TokenLimitExceededError,
} from "../../source/tokens/threshold.ts";

test("TokenLimitExceededError generates standardized token limit message", () => {
  const error = new TokenLimitExceededError("ReadFile", 10000, 8000);

  assert.ok(
    error.message.includes(
      "ReadFile: Content (10000 tokens) exceeds maximum allowed tokens (8000)",
    ),
  );
  assert.ok(
    error.message.includes("Please adjust parameters to reduce content size."),
  );
  assert.equal(error.name, "TokenLimitExceededError");
});

test("TokenLimitExceededError uses custom guidance when provided", () => {
  const error = new TokenLimitExceededError(
    "Bash",
    12000,
    8000,
    "Use more specific commands",
  );

  assert.ok(error.message.includes("Use more specific commands"));
});

test("manageTokenLimit returns original content when within token limit", async () => {
  // Clear cache before test
  clearTokenCache();

  // Mock the config read
  mock.method(config, "getConfig", async () => ({
    tools: { maxTokens: 8000 },
  }));

  // Mock token counting
  const tokenCounter = {
    count: () => 5000,
  } as unknown as TokenCounter;

  const result = await manageTokenLimit(
    "test content",
    tokenCounter,
    "ReadFile",
  );

  assert.equal(result.content, "test content");
  assert.equal(result.tokenCount, 5000);
});

test("manageTokenLimit throws TokenLimitExceededError when exceeding limit", async () => {
  // Clear cache before test
  clearTokenCache();

  mock.method(config, "getConfig", async () => ({
    tools: { maxTokens: 8000 },
  }));

  const tokenCounter = {
    count: () => 10000,
  } as unknown as TokenCounter;

  await assert.rejects(
    () => manageTokenLimit("large content", tokenCounter, "Grep"),
    TokenLimitExceededError,
    "Should throw TokenLimitExceededError",
  );
});

test("manageTokenLimit handles token counting errors gracefully", async () => {
  // Clear cache before test
  clearTokenCache();

  mock.method(config, "getConfig", async () => ({
    tools: { maxTokens: 8000 },
  }));

  const tokenCounter = {
    count: () => {
      throw new Error("Token counting failed");
    },
  } as unknown as TokenCounter;

  const result = await manageTokenLimit("content", tokenCounter, "Bash");

  assert.equal(result.content, "content");
  assert.equal(result.tokenCount, 0);
});

test("manageTokenLimit handles non-text files", async () => {
  const tokenCounter = {
    count: () => {
      throw new Error("Should not be called for non-text files");
    },
  } as unknown as TokenCounter;

  const result = await manageTokenLimit(
    "binary content",
    tokenCounter,
    "ReadFile",
    undefined,
    "base64",
  );

  assert.equal(result.content, "binary content");
  assert.equal(result.tokenCount, 0);
});

test("manageTokenLimit uses different maxTokens from config", async () => {
  // Clear cache before test
  clearTokenCache();

  mock.method(config, "getConfig", async () => ({
    tools: { maxTokens: 4000 },
  }));

  const tokenCounter = {
    count: () => 5000,
  } as unknown as TokenCounter;

  await assert.rejects(
    () => manageTokenLimit("test content", tokenCounter, "ReadFile"),
    TokenLimitExceededError,
    "Should throw TokenLimitExceededError when 5000 > 4000",
  );
});

test("manageTokenLimit provides tool-specific guidance", async () => {
  // Clear cache before test
  clearTokenCache();

  mock.method(config, "getConfig", async () => ({
    tools: { maxTokens: 8000 },
  }));

  const tokenCounter = {
    count: () => 10000,
  } as unknown as TokenCounter;

  try {
    await manageTokenLimit(
      "content",
      tokenCounter,
      "DirectoryTree",
      "Use excludeDirPatterns to reduce output",
    );
    assert.fail("Should have thrown TokenLimitExceededError");
  } catch (error) {
    assert.ok(error instanceof TokenLimitExceededError);
    assert.ok(
      error.message.includes("Use excludeDirPatterns to reduce output"),
    );
  }
});

test("manageTokenLimit handles empty content", async () => {
  // Clear cache before test
  clearTokenCache();

  mock.method(config, "getConfig", async () => ({
    tools: { maxTokens: 8000 },
  }));

  const tokenCounter = {
    count: () => 0,
  } as unknown as TokenCounter;

  const result = await manageTokenLimit("", tokenCounter, "ReadFile");

  assert.equal(result.content, "");
  assert.equal(result.tokenCount, 0);
});

test("manageTokenLimit preserves type of input content", async () => {
  // Clear cache before test
  clearTokenCache();

  mock.method(config, "getConfig", async () => ({
    tools: { maxTokens: 8000 },
  }));

  const tokenCounter = {
    count: () => 1000,
  } as unknown as TokenCounter;

  const result = await manageTokenLimit(
    "string content" as const,
    tokenCounter,
    "ReadFile",
  );

  assert.equal(result.content, "string content");
  assert.equal(result.tokenCount, 1000);
});

test("manageTokenLimit handles multiple tool types correctly", async () => {
  // Clear cache before test
  clearTokenCache();

  mock.method(config, "getConfig", async () => ({
    tools: { maxTokens: 8000 },
  }));

  const tools = ["Bash", "ReadFile", "Grep", "WebSearch", "DirectoryTree"];
  const tokenCounter = {
    count: () => 12000,
  } as unknown as TokenCounter;

  for (const toolName of tools) {
    await assert.rejects(
      () => manageTokenLimit("content", tokenCounter, toolName),
      TokenLimitExceededError,
      `Should throw TokenLimitExceededError for ${toolName}`,
    );
  }
});

test("manageTokenLimit handles different token limits", async () => {
  const testCases = [
    { maxTokens: 4000, contentTokens: 3000, shouldTruncate: false },
    { maxTokens: 4000, contentTokens: 5000, shouldTruncate: true },
    { maxTokens: 8000, contentTokens: 7000, shouldTruncate: false },
    { maxTokens: 8000, contentTokens: 9000, shouldTruncate: true },
  ];

  for (const testCase of testCases) {
    // Clear cache before each test case
    clearTokenCache();

    mock.method(config, "getConfig", async () => ({
      tools: { maxTokens: testCase.maxTokens },
    }));

    const tokenCounter = {
      count: () => testCase.contentTokens,
    } as unknown as TokenCounter;

    if (testCase.shouldTruncate) {
      await assert.rejects(
        () => manageTokenLimit("test", tokenCounter, "ReadFile"),
        TokenLimitExceededError,
        `Should throw when ${testCase.contentTokens} > ${testCase.maxTokens}`,
      );
    } else {
      const result = await manageTokenLimit("test", tokenCounter, "ReadFile");
      assert.equal(result.content, "test");
      assert.equal(result.tokenCount, testCase.contentTokens);
    }
  }
});
