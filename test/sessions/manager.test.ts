import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SessionManager } from "../../source/sessions/manager.ts";
import { TokenTracker } from "../../source/tokens/tracker.ts";
import { createModelManagerForTest } from "../utils/model-manager.ts";

// Helper to create and cleanup a temp directory
async function withTempDir<T>(fn: (dir: string) => Promise<T>) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "acai-test-"));
  try {
    return await fn(tmp);
  } finally {
    // best-effort cleanup
    try {
      await fs.rm(tmp, { recursive: true, force: true });
    } catch {}
  }
}

test("recordTurnUsage correctly updates total and lastTurn", async () => {
  await withTempDir(async (tmp) => {
    const modelManager = await createModelManagerForTest();
    const tokenTracker = new TokenTracker();
    const sessionManager = new SessionManager({
      stateDir: tmp,
      modelManager,
      tokenTracker,
    });

    const usage = {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      cachedInputTokens: 200,
      reasoningTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 800,
        cacheReadTokens: 200,
        cacheWriteTokens: 50,
      },
      outputTokenDetails: {
        textTokens: 400,
        reasoningTokens: 100,
      },
    };

    sessionManager.recordTurnUsage(usage);

    // getTokenUsage is deprecated and returns empty array
    const tokenUsage = sessionManager.getTokenUsage();
    assert.equal(tokenUsage.length, 0);

    // Check total usage
    const totalUsage = sessionManager.getTotalTokenUsage();
    assert.equal(totalUsage.inputTokens, 1000);
    assert.equal(totalUsage.outputTokens, 500);
    assert.equal(totalUsage.totalTokens, 1500);
    assert.equal(totalUsage.cachedInputTokens, 200);
    assert.equal(totalUsage.reasoningTokens, 100);
    assert.ok(totalUsage.estimatedCost > 0);

    // Check last turn context window
    const lastTurnContextWindow = sessionManager.getLastTurnContextWindow();
    assert.equal(lastTurnContextWindow, 1500);
  });
});

test("multiple turns accumulate correctly in total and lastTurn", async () => {
  await withTempDir(async (tmp) => {
    const modelManager = await createModelManagerForTest();
    const tokenTracker = new TokenTracker();
    const sessionManager = new SessionManager({
      stateDir: tmp,
      modelManager,
      tokenTracker,
    });

    const usage1 = {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      cachedInputTokens: 200,
      reasoningTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 800,
        cacheReadTokens: 200,
        cacheWriteTokens: 50,
      },
      outputTokenDetails: {
        textTokens: 400,
        reasoningTokens: 100,
      },
    };

    const usage2 = {
      inputTokens: 2000,
      outputTokens: 1000,
      totalTokens: 3000,
      cachedInputTokens: 500,
      reasoningTokens: 200,
      inputTokenDetails: {
        noCacheTokens: 1500,
        cacheReadTokens: 500,
        cacheWriteTokens: 100,
      },
      outputTokenDetails: {
        textTokens: 800,
        reasoningTokens: 200,
      },
    };

    sessionManager.recordTurnUsage(usage1);
    sessionManager.recordTurnUsage(usage2);

    // getTokenUsage is deprecated and returns empty array
    const tokenUsage = sessionManager.getTokenUsage();
    assert.equal(tokenUsage.length, 0);

    // Check total usage (accumulated)
    const totalUsage = sessionManager.getTotalTokenUsage();
    assert.equal(totalUsage.inputTokens, 3000); // 1000 + 2000
    assert.equal(totalUsage.outputTokens, 1500); // 500 + 1000
    assert.equal(totalUsage.totalTokens, 4500); // 1500 + 3000

    // Check last turn context window (should be the second turn's total)
    const lastTurnContextWindow = sessionManager.getLastTurnContextWindow();
    assert.equal(lastTurnContextWindow, 3000);
  });
});

test("getTotalTokenUsage returns correct summed values", async () => {
  await withTempDir(async (tmp) => {
    const modelManager = await createModelManagerForTest();
    const tokenTracker = new TokenTracker();
    const sessionManager = new SessionManager({
      stateDir: tmp,
      modelManager,
      tokenTracker,
    });

    const usage1 = {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      cachedInputTokens: 200,
      reasoningTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 800,
        cacheReadTokens: 200,
        cacheWriteTokens: 50,
      },
      outputTokenDetails: {
        textTokens: 400,
        reasoningTokens: 100,
      },
    };

    const usage2 = {
      inputTokens: 2000,
      outputTokens: 1000,
      totalTokens: 3000,
      cachedInputTokens: 500,
      reasoningTokens: 200,
      inputTokenDetails: {
        noCacheTokens: 1500,
        cacheReadTokens: 500,
        cacheWriteTokens: 100,
      },
      outputTokenDetails: {
        textTokens: 800,
        reasoningTokens: 200,
      },
    };

    sessionManager.recordTurnUsage(usage1);
    sessionManager.recordTurnUsage(usage2);

    const total = sessionManager.getTotalTokenUsage();
    assert.equal(total.inputTokens, 3000);
    assert.equal(total.outputTokens, 1500);
    assert.equal(total.totalTokens, 4500);
    assert.equal(total.cachedInputTokens, 700);
    assert.equal(total.reasoningTokens, 300);
    assert.ok(total.estimatedCost > 0);
  });
});

test("getLastTurnContextWindow returns correct last turn value", async () => {
  await withTempDir(async (tmp) => {
    const modelManager = await createModelManagerForTest();
    const tokenTracker = new TokenTracker();
    const sessionManager = new SessionManager({
      stateDir: tmp,
      modelManager,
      tokenTracker,
    });

    assert.equal(sessionManager.getLastTurnContextWindow(), 0);

    sessionManager.recordTurnUsage({
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      cachedInputTokens: 200,
      reasoningTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 800,
        cacheReadTokens: 200,
        cacheWriteTokens: 50,
      },
      outputTokenDetails: {
        textTokens: 400,
        reasoningTokens: 100,
      },
    });

    assert.equal(sessionManager.getLastTurnContextWindow(), 1500);

    sessionManager.recordTurnUsage({
      inputTokens: 2000,
      outputTokens: 1000,
      totalTokens: 3000,
      cachedInputTokens: 500,
      reasoningTokens: 200,
      inputTokenDetails: {
        noCacheTokens: 1500,
        cacheReadTokens: 500,
        cacheWriteTokens: 100,
      },
      outputTokenDetails: {
        textTokens: 800,
        reasoningTokens: 200,
      },
    });

    assert.equal(sessionManager.getLastTurnContextWindow(), 3000);
  });
});

test("save/restore preserves the full tokenUsage array", async () => {
  await withTempDir(async (tmp) => {
    const modelManager = await createModelManagerForTest();
    const tokenTracker = new TokenTracker();
    const sessionManager = new SessionManager({
      stateDir: tmp,
      modelManager,
      tokenTracker,
    });

    sessionManager.recordTurnUsage({
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      cachedInputTokens: 200,
      reasoningTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 800,
        cacheReadTokens: 200,
        cacheWriteTokens: 50,
      },
      outputTokenDetails: {
        textTokens: 400,
        reasoningTokens: 100,
      },
    });

    sessionManager.recordTurnUsage({
      inputTokens: 2000,
      outputTokens: 1000,
      totalTokens: 3000,
      cachedInputTokens: 500,
      reasoningTokens: 200,
      inputTokenDetails: {
        noCacheTokens: 1500,
        cacheReadTokens: 500,
        cacheWriteTokens: 100,
      },
      outputTokenDetails: {
        textTokens: 800,
        reasoningTokens: 200,
      },
    });

    await sessionManager.save();

    const histories = await SessionManager.load(tmp);
    assert.equal(histories.length, 1);
    assert.ok(histories[0].tokenUsage);

    // New format: check total and lastTurn
    const tokenUsage = histories[0].tokenUsage;
    assert.ok(!Array.isArray(tokenUsage)); // Should be SessionTokenUsage object
    assert.equal(tokenUsage.total.inputTokens, 3000); // 1000 + 2000
    assert.equal(tokenUsage.total.outputTokens, 1500); // 500 + 1000
    assert.equal(tokenUsage.lastTurn.inputTokens, 2000); // Last turn's input
    assert.equal(tokenUsage.lastTurn.totalTokens, 3000); // Last turn's total
  });
});

test("restore correctly restores tokenUsage from saved data (old format)", async () => {
  await withTempDir(async (tmp) => {
    const modelManager = await createModelManagerForTest();
    const tokenTracker = new TokenTracker();
    const sessionManager = new SessionManager({
      stateDir: tmp,
      modelManager,
      tokenTracker,
    });

    // Simulate a restored history with old format (array)
    const savedHistory = {
      project: "test-project",
      sessionId: "test-session-id",
      modelId: "gpt-4",
      title: "Test Session",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T01:00:00.000Z"),
      messages: [],
      tokenUsage: [
        {
          stepIndex: 0,
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          cachedInputTokens: 200,
          reasoningTokens: 100,
          inputTokenDetails: {
            noCacheTokens: 800,
            cacheReadTokens: 200,
            cacheWriteTokens: 50,
          },
          outputTokenDetails: {
            textTokens: 400,
            reasoningTokens: 100,
          },
          timestamp: 1735689600000,
          estimatedCost: 0.015,
        },
      ],
    };

    sessionManager.restore(savedHistory);

    // getTokenUsage is deprecated and returns empty array
    const tokenUsage = sessionManager.getTokenUsage();
    assert.equal(tokenUsage.length, 0);

    // Check that total and lastTurn are correctly restored from old format
    const totalUsage = sessionManager.getTotalTokenUsage();
    assert.equal(totalUsage.inputTokens, 1000);
    assert.equal(totalUsage.totalTokens, 1500);

    const lastContextWindow = sessionManager.getLastTurnContextWindow();
    assert.equal(lastContextWindow, 1500);
  });
});

test("clearTokenUsage clears the token usage", async () => {
  await withTempDir(async (tmp) => {
    const modelManager = await createModelManagerForTest();
    const tokenTracker = new TokenTracker();
    const sessionManager = new SessionManager({
      stateDir: tmp,
      modelManager,
      tokenTracker,
    });

    sessionManager.recordTurnUsage({
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      cachedInputTokens: 200,
      reasoningTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 800,
        cacheReadTokens: 200,
        cacheWriteTokens: 50,
      },
      outputTokenDetails: {
        textTokens: 400,
        reasoningTokens: 100,
      },
    });

    // Check that we have data
    assert.equal(sessionManager.getTotalTokenUsage().inputTokens, 1000);
    assert.equal(sessionManager.getLastTurnContextWindow(), 1500);

    sessionManager.clearTokenUsage();

    // After clear, should return zeros
    assert.equal(sessionManager.getTotalTokenUsage().totalTokens, 0);
    assert.equal(sessionManager.getLastTurnContextWindow(), 0);
  });
});

test("clear also clears token usage", async () => {
  await withTempDir(async (tmp) => {
    const modelManager = await createModelManagerForTest();
    const tokenTracker = new TokenTracker();
    const sessionManager = new SessionManager({
      stateDir: tmp,
      modelManager,
      tokenTracker,
    });

    sessionManager.recordTurnUsage({
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      cachedInputTokens: 200,
      reasoningTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 800,
        cacheReadTokens: 200,
        cacheWriteTokens: 50,
      },
      outputTokenDetails: {
        textTokens: 400,
        reasoningTokens: 100,
      },
    });

    // Check that we have data
    assert.equal(sessionManager.getTotalTokenUsage().inputTokens, 1000);

    sessionManager.clear();

    // After clear, should return zeros
    assert.equal(sessionManager.getTotalTokenUsage().totalTokens, 0);
    assert.equal(sessionManager.getLastTurnContextWindow(), 0);
  });
});

test("cost calculation is accurate", async () => {
  await withTempDir(async (tmp) => {
    const modelManager = await createModelManagerForTest();
    const tokenTracker = new TokenTracker();
    const sessionManager = new SessionManager({
      stateDir: tmp,
      modelManager,
      tokenTracker,
    });

    // Use a specific model with known pricing
    sessionManager.setModelId("gpt-4");
    const modelConfig = modelManager.getModelMetadata("repl");

    sessionManager.recordTurnUsage({
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      inputTokenDetails: {
        noCacheTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      outputTokenDetails: {
        textTokens: 500,
        reasoningTokens: 0,
      },
    });

    // Check cost in total usage
    const totalUsage = sessionManager.getTotalTokenUsage();
    const expectedCost =
      1000 * modelConfig.costPerInputToken +
      500 * modelConfig.costPerOutputToken;
    assert.equal(totalUsage.estimatedCost, expectedCost);
  });
});
