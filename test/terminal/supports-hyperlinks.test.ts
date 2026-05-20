import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSupportsHyperlinks } from "../../source/terminal/supports-hyperlinks.ts";

/**
 * Run `createSupportsHyperlinks` with a specific set of env vars.
 * We save/restore process.env around the call so each test is isolated.
 */
function testWithEnv(
  stream: { isTty?: boolean },
  env: Record<string, string | undefined>,
): boolean {
  const saved = { ...process.env };

  try {
    // Apply custom env
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }

    return createSupportsHyperlinks(stream);
  } finally {
    // Restore original env
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) {
        delete process.env[k];
      }
    }
    for (const [k, v] of Object.entries(saved)) {
      process.env[k] = v ?? "";
    }
  }
}

describe("supports-hyperlinks", () => {
  it("FORCE_HYPERLINK=0 returns false", () => {
    const result = testWithEnv({ isTty: true }, { FORCE_HYPERLINK: "0" });
    assert.strictEqual(result, false);
  });

  it("FORCE_HYPERLINK=1 returns true", () => {
    const result = testWithEnv({ isTty: true }, { FORCE_HYPERLINK: "1" });
    assert.strictEqual(result, true);
  });

  it("FORCE_HYPERLINK with non-empty non-numeric value returns true", () => {
    const result = testWithEnv({ isTty: true }, { FORCE_HYPERLINK: "true" });
    assert.strictEqual(result, true);
  });

  it("NETLIFY returns true without TTY check", () => {
    const result = testWithEnv({ isTty: false }, { NETLIFY: "true" });
    assert.strictEqual(result, true);
  });

  it("returns false if supports-color returns false (TERM=dumb)", () => {
    // TERM=dumb makes supports-color return min=0 -> false
    const result = testWithEnv({ isTty: true }, { TERM: "dumb" });
    assert.strictEqual(result, false);
  });

  it("returns false if stream is not a TTY (no override)", () => {
    const result = testWithEnv({ isTty: false }, { COLORTERM: "truecolor" });
    assert.strictEqual(result, false);
  });

  it("WT_SESSION returns true", () => {
    const result = testWithEnv(
      { isTty: true },
      { WT_SESSION: "some-session", COLORTERM: "truecolor" },
    );
    assert.strictEqual(result, true);
  });

  it("CI returns false", () => {
    const result = testWithEnv(
      { isTty: true },
      { CI: "true", COLORTERM: "truecolor" },
    );
    assert.strictEqual(result, false);
  });

  it("TEAMCITY_VERSION returns false", () => {
    const result = testWithEnv(
      { isTty: true },
      { TEAMCITY_VERSION: "2024.1", COLORTERM: "truecolor" },
    );
    assert.strictEqual(result, false);
  });

  describe("TERM_PROGRAM", () => {
    it("iTerm.app version 3.1 returns true", () => {
      const result = testWithEnv(
        { isTty: true },
        { TERM_PROGRAM: "iTerm.app", TERM_PROGRAM_VERSION: "3.1" },
      );
      assert.strictEqual(result, true);
    });

    it("iTerm.app version 3.0 returns false", () => {
      const result = testWithEnv(
        { isTty: true },
        { TERM_PROGRAM: "iTerm.app", TERM_PROGRAM_VERSION: "3.0" },
      );
      assert.strictEqual(result, false);
    });

    it("iTerm.app version 4.0 returns true", () => {
      const result = testWithEnv(
        { isTty: true },
        { TERM_PROGRAM: "iTerm.app", TERM_PROGRAM_VERSION: "4.0" },
      );
      assert.strictEqual(result, true);
    });

    it("WezTerm version >= 200200620 returns true", () => {
      const result = testWithEnv(
        { isTty: true },
        { TERM_PROGRAM: "WezTerm", TERM_PROGRAM_VERSION: "20200620" },
      );
      assert.strictEqual(result, true);
    });

    it("WezTerm version < 200200620 returns false", () => {
      const result = testWithEnv(
        { isTty: true },
        { TERM_PROGRAM: "WezTerm", TERM_PROGRAM_VERSION: "20200619" },
      );
      assert.strictEqual(result, false);
    });

    it("vscode with CURSOR_TRACE_ID returns true", () => {
      const result = testWithEnv(
        { isTty: true },
        {
          TERM_PROGRAM: "vscode",
          TERM_PROGRAM_VERSION: "1.70.0",
          CURSOR_TRACE_ID: "abc",
        },
      );
      assert.strictEqual(result, true);
    });

    it("vscode version >= 1.72 returns true", () => {
      const result = testWithEnv(
        { isTty: true },
        { TERM_PROGRAM: "vscode", TERM_PROGRAM_VERSION: "1.72.0" },
      );
      assert.strictEqual(result, true);
    });

    it("vscode version < 1.72 returns false", () => {
      const result = testWithEnv(
        { isTty: true },
        { TERM_PROGRAM: "vscode", TERM_PROGRAM_VERSION: "1.71.0" },
      );
      assert.strictEqual(result, false);
    });

    it("ghostty returns true", () => {
      const result = testWithEnv(
        { isTty: true },
        { TERM_PROGRAM: "ghostty", TERM_PROGRAM_VERSION: "1.0.0" },
      );
      assert.strictEqual(result, true);
    });
  });

  describe("VTE_VERSION", () => {
    it("0.50.0 returns false (segfault)", () => {
      const result = testWithEnv(
        { isTty: true },
        {
          VTE_VERSION: "0.50.0",
          COLORTERM: "truecolor",
          TERM_PROGRAM: undefined,
        },
      );
      assert.strictEqual(result, false);
    });

    it("0.62.0 returns true", () => {
      const result = testWithEnv(
        { isTty: true },
        {
          VTE_VERSION: "0.62.0",
          COLORTERM: "truecolor",
          TERM_PROGRAM: undefined,
        },
      );
      assert.strictEqual(result, true);
    });
  });

  describe("TERM", () => {
    it("alacritty returns true", () => {
      const result = testWithEnv(
        { isTty: true },
        { TERM: "alacritty", COLORTERM: "truecolor" },
      );
      assert.strictEqual(result, true);
    });

    it("default (no match) returns false", () => {
      const result = testWithEnv(
        { isTty: true },
        { TERM_PROGRAM: "unknown-terminal", COLORTERM: "truecolor" },
      );
      assert.strictEqual(result, false);
    });
  });
});
