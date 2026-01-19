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

test("recordTurnUsage correctly appends to the tokenUsage array", async () => {
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

    const tokenUsage = sessionManager.getTokenUsage();
    assert.equal(tokenUsage.length, 1);
    assert.equal(tokenUsage[0].stepIndex, 0);
    assert.equal(tokenUsage[0].inputTokens, 1000);
    assert.equal(tokenUsage[0].outputTokens, 500);
    assert.equal(tokenUsage[0].totalTokens, 1500);
    assert.equal(tokenUsage[0].cachedInputTokens, 200);
    assert.equal(tokenUsage[0].reasoningTokens, 100);
    assert.ok(tokenUsage[0].timestamp > 0);
    assert.ok(tokenUsage[0].estimatedCost > 0);
  });
});

test("multiple turns accumulate correctly", async () => {
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

    const tokenUsage = sessionManager.getTokenUsage();
    assert.equal(tokenUsage.length, 2);
    assert.equal(tokenUsage[0].stepIndex, 0);
    assert.equal(tokenUsage[0].inputTokens, 1000);
    assert.equal(tokenUsage[1].stepIndex, 1);
    assert.equal(tokenUsage[1].inputTokens, 2000);
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
    assert.equal(histories[0].tokenUsage.length, 2);
    assert.equal(histories[0].tokenUsage[0].inputTokens, 1000);
    assert.equal(histories[0].tokenUsage[1].inputTokens, 2000);
  });
});

test("restore correctly restores tokenUsage from saved data", async () => {
  await withTempDir(async (tmp) => {
    const modelManager = await createModelManagerForTest();
    const tokenTracker = new TokenTracker();
    const sessionManager = new SessionManager({
      stateDir: tmp,
      modelManager,
      tokenTracker,
    });

    // Simulate a restored history
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

    const tokenUsage = sessionManager.getTokenUsage();
    assert.equal(tokenUsage.length, 1);
    assert.equal(tokenUsage[0].inputTokens, 1000);
    assert.equal(tokenUsage[0].totalTokens, 1500);

    const lastContextWindow = sessionManager.getLastTurnContextWindow();
    assert.equal(lastContextWindow, 1500);

    const totalUsage = sessionManager.getTotalTokenUsage();
    assert.equal(totalUsage.inputTokens, 1000);
    assert.equal(totalUsage.totalTokens, 1500);
  });
});

test("clearTokenUsage clears the token usage array", async () => {
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

    assert.equal(sessionManager.getTokenUsage().length, 1);

    sessionManager.clearTokenUsage();

    assert.equal(sessionManager.getTokenUsage().length, 0);
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

    assert.equal(sessionManager.getTokenUsage().length, 1);

    sessionManager.clear();

    assert.equal(sessionManager.getTokenUsage().length, 0);
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

    const tokenUsage = sessionManager.getTokenUsage();
    const expectedCost =
      1000 * modelConfig.costPerInputToken +
      500 * modelConfig.costPerOutputToken;
    assert.equal(tokenUsage[0].estimatedCost, expectedCost);
  });
});
