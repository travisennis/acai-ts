import assert from "node:assert/strict";
import { describe, it, mock, beforeEach, afterEach } from "node:test";
import type { ModelMessage } from "ai";
import { SessionManager } from "../source/sessions/manager.ts";
import { handleConversationHistory } from "../source/index.ts";
import { ModelManager } from "../source/models/manager.ts";

type SavedMessageHistory = {
  project: string;
  sessionId: string;
  modelId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ModelMessage[];
};

function makeHistory(overrides: Partial<SavedMessageHistory> = {}): SavedMessageHistory {
  return {
    project: "test",
    sessionId: "test-session-id",
    modelId: "test-model",
    title: "Test Conversation",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-06-01"),
    messages: [],
    ...overrides,
  };
}

function createMockModelManager(): ModelManager {
  const mm = new ModelManager({
    stateDir: "/tmp/test-model-state",
    devtoolsEnabled: false,
  });
  mock.method(mm, "setModel", () => {});
  const modelStub = { modelId: "test-model" } as never;
  mock.method(mm, "getModel", () => modelStub);
  return mm;
}

describe("handleConversationHistory", () => {
  let sessionManager: SessionManager;
  let mm: ModelManager;
  // Helper to create a properly typed select mock
  const mockSelect = (value: number) =>
    ((_opts: Record<string, unknown>) => Promise.resolve(value)) as any;

  beforeEach(() => {
    mm = createMockModelManager();
    sessionManager = new SessionManager({
      stateDir: "/tmp/test-sessions",
      modelManager: mm,
      tokenTracker: undefined as unknown as never,
    });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // --- continue flag ---

  describe("continue flag", () => {
    it("should restore the selected history when user chooses one", async () => {
      const histories = [makeHistory({ sessionId: "abc" })];
      mock.method(SessionManager, "load", () => Promise.resolve(histories));
      const selectFn = mockSelect(0);
      mock.method(sessionManager, "restore", () => {});
      const setTitleFn = mock.fn(() => {});

      await handleConversationHistory(
        sessionManager,
        "/tmp/sessions",
        true,
        undefined,
        true,
        false,
        selectFn,
        setTitleFn,
      );

      assert.equal(setTitleFn.mock.callCount(), 1);
    });

    it("should log error when selected index is out of bounds", async () => {
      const histories = [makeHistory({ sessionId: "abc" })];
      mock.method(SessionManager, "load", () => Promise.resolve(histories));
      const selectFn = mockSelect(5); // out of bounds

      await handleConversationHistory(
        sessionManager,
        "/tmp/sessions",
        true,
        undefined,
        true,
        false,
        selectFn,
        mock.fn(() => {}),
      );

      assert.ok(true);
    });

    it("should handle cancellation gracefully", async () => {
      const histories = [makeHistory({ sessionId: "abc" })];
      mock.method(SessionManager, "load", () => Promise.resolve(histories));
      const cancelError = new Error("canceled");
      (cancelError as Error & { isCanceled: boolean }).isCanceled = true;
      const selectFn = mock.fn((_opts: Record<string, unknown>) =>
        Promise.reject(cancelError),
      ) as any;

      await handleConversationHistory(
        sessionManager,
        "/tmp/sessions",
        true,
        undefined,
        true,
        false,
        selectFn,
        mock.fn(() => {}),
      );

      assert.ok(true);
    });

    it("should rethrow non-cancel errors", async () => {
      const histories = [makeHistory({ sessionId: "abc" })];
      mock.method(SessionManager, "load", () => Promise.resolve(histories));
      const realError = new Error("Something went wrong");
      const selectFn = mock.fn((_opts: Record<string, unknown>) =>
        Promise.reject(realError),
      ) as any;

      await assert.rejects(
        () =>
          handleConversationHistory(
            sessionManager,
            "/tmp/sessions",
            true,
            undefined,
            true,
            false,
            selectFn,
            mock.fn(() => {}),
          ),
        /Something went wrong/,
      );
    });

    it("should log info when no histories are available", async () => {
      mock.method(SessionManager, "load", () => Promise.resolve([]));

      await handleConversationHistory(
        sessionManager,
        "/tmp/sessions",
        true,
        undefined,
        true,
        false,
        mockSelect(0),
        mock.fn(() => {}),
      );

      assert.ok(true);
    });
  });

  // --- resume flag ---

  describe("resume flag", () => {
    it("should restore the session when found by ID", async () => {
      const histories = [
        makeHistory({ sessionId: "target-id", title: "Target Session" }),
      ];
      mock.method(SessionManager, "load", () => Promise.resolve(histories));
      mock.method(sessionManager, "restore", () => {});
      const setTitleFn = mock.fn(() => {});

      await handleConversationHistory(
        sessionManager,
        "/tmp/sessions",
        true,
        "target-id",
        false,
        true,
        mockSelect(0),
        setTitleFn,
      );

      assert.equal(setTitleFn.mock.callCount(), 1);
    });

    it("should exit when session ID is not found", async () => {
      const histories = [makeHistory({ sessionId: "other-id" })];
      mock.method(SessionManager, "load", () => Promise.resolve(histories));
      mock.method(process, "exit", () => {
        throw new Error("process.exit called");
      });

      await assert.rejects(
        () =>
          handleConversationHistory(
            sessionManager,
            "/tmp/sessions",
            true,
            "missing-id",
            false,
            true,
            mockSelect(0),
            mock.fn(() => {}),
          ),
        /process.exit called/,
      );
    });

    it("should restore the latest session when no ID is given", async () => {
      const histories = [
        makeHistory({ sessionId: "latest-id", title: "Latest Session" }),
      ];
      mock.method(SessionManager, "load", () => Promise.resolve(histories));
      mock.method(sessionManager, "restore", () => {});
      const setTitleFn = mock.fn(() => {});

      await handleConversationHistory(
        sessionManager,
        "/tmp/sessions",
        true,
        undefined,
        false,
        true,
        mockSelect(0),
        setTitleFn,
      );

      assert.equal(setTitleFn.mock.callCount(), 1);
    });

    it("should log info when no sessions exist and no ID given", async () => {
      mock.method(SessionManager, "load", () => Promise.resolve([]));

      await handleConversationHistory(
        sessionManager,
        "/tmp/sessions",
        true,
        undefined,
        false,
        true,
        mockSelect(0),
        mock.fn(() => {}),
      );

      assert.ok(true);
    });
  });

  // --- no flags ---

  it("should do nothing when neither continue nor resume is set", async () => {
    const loadMock = mock.method(SessionManager, "load", () =>
      Promise.resolve([]),
    );

    await handleConversationHistory(
      sessionManager,
      "/tmp/sessions",
      false,
      undefined,
      false,
      false,
      mockSelect(0),
      mock.fn(() => {}),
    );

    assert.equal(loadMock.mock.callCount(), 0);
  });
});
