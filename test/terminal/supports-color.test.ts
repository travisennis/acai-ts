import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createSupportsColor } from "../../source/terminal/supports-color.ts";

// Save original env
const ORIG_ENV = { ...process.env };

const RELEVANT_VARS = [
  "FORCE_COLOR",
  "TF_BUILD",
  "AGENT_NAME",
  "TERM",
  "CI",
  "GITHUB_ACTIONS",
  "GITEA_ACTIONS",
  "CIRCLECI",
  "TRAVIS",
  "APPVEYOR",
  "GITLAB_CI",
  "BUILDKITE",
  "DRONE",
  "CI_NAME",
  "TEAMCITY_VERSION",
  "COLORTERM",
  "TERM_PROGRAM",
  "TERM_PROGRAM_VERSION",
];

function clearRelevantEnv() {
  for (const key of RELEVANT_VARS) {
    delete process.env[key];
  }
}

function setEnv(vars: Record<string, string | undefined>) {
  clearRelevantEnv();
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function resetEnv() {
  // Clear all env vars we might have set
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIG_ENV)) {
      delete process.env[key];
    }
  }
  // Restore originals
  for (const [key, value] of Object.entries(ORIG_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("createSupportsColor", () => {
  afterEach(() => {
    resetEnv();
  });

  it("returns false when FORCE_COLOR=0", () => {
    setEnv({ FORCE_COLOR: "0" });
    const result = createSupportsColor({ isTty: true });
    assert.equal(result, false);
  });

  it("returns level 1 when FORCE_COLOR=1", () => {
    setEnv({ FORCE_COLOR: "1" });
    const result = createSupportsColor({ isTty: true });
    assert.notEqual(result, false);
    assert.equal((result as { level: number }).level, 1);
  });

  it("returns level 3 when FORCE_COLOR=3", () => {
    setEnv({ FORCE_COLOR: "3" });
    const result = createSupportsColor({ isTty: true });
    assert.notEqual(result, false);
    assert.equal((result as { level: number }).level, 3);
  });

  it("returns level 1 for Azure DevOps pipelines", () => {
    setEnv({ TF_BUILD: "true", AGENT_NAME: "hosted", FORCE_COLOR: undefined });
    const result = createSupportsColor({ isTty: true });
    assert.notEqual(result, false);
    assert.equal((result as { level: number }).level, 1);
  });

  it("returns 0 when stream is not a TTY and no force color", () => {
    setEnv({ FORCE_COLOR: undefined });
    const result = createSupportsColor({ isTty: false });
    assert.equal(result, false);
  });

  it("returns min level when TERM=dumb with no other indicators", () => {
    setEnv({
      TERM: "dumb",
      FORCE_COLOR: undefined,
      CI: undefined,
      TF_BUILD: undefined,
      AGENT_NAME: undefined,
    });
    const result = createSupportsColor({ isTty: true });
    // min = 0, returns min (0) → false
    assert.equal(result, false);
  });

  it("returns level 1 when TERM=dumb but FORCE_COLOR=1", () => {
    setEnv({ TERM: "dumb", FORCE_COLOR: "1" });
    const result = createSupportsColor({ isTty: true });
    assert.notEqual(result, false);
    assert.equal((result as { level: number }).level, 1);
  });

  it("returns level 3 for COLORTERM=truecolor", () => {
    setEnv({
      COLORTERM: "truecolor",
      FORCE_COLOR: undefined,
      CI: undefined,
      TF_BUILD: undefined,
      AGENT_NAME: undefined,
    });
    const result = createSupportsColor({ isTty: true });
    assert.notEqual(result, false);
    assert.equal((result as { level: number }).level, 3);
  });

  it("returns level 3 for xterm-kitty terminal", () => {
    setEnv({
      TERM: "xterm-kitty",
      FORCE_COLOR: undefined,
      CI: undefined,
      TF_BUILD: undefined,
      AGENT_NAME: undefined,
      COLORTERM: undefined,
    });
    const result = createSupportsColor({ isTty: true });
    assert.notEqual(result, false);
    assert.equal((result as { level: number }).level, 3);
  });

  it("returns level 3 for xterm-ghostty terminal", () => {
    setEnv({
      TERM: "xterm-ghostty",
      FORCE_COLOR: undefined,
      CI: undefined,
      TF_BUILD: undefined,
      AGENT_NAME: undefined,
      COLORTERM: undefined,
    });
    const result = createSupportsColor({ isTty: true });
    assert.notEqual(result, false);
    assert.equal((result as { level: number }).level, 3);
  });

  it("returns level 1 for CI environments with min=0", () => {
    setEnv({
      CI: "true",
      GITHUB_ACTIONS: "true",
      FORCE_COLOR: undefined,
      TERM: undefined,
    });
    const result = createSupportsColor({ isTty: true });
    assert.notEqual(result, false);
    // GITHUB_ACTIONS returns 3 (level 3)
    assert.equal((result as { level: number }).level, 3);
  });

  it("handles TeamCity version check", () => {
    setEnv({
      TEAMCITY_VERSION: "9.1.0",
      FORCE_COLOR: undefined,
      CI: undefined,
      TERM: undefined,
      TF_BUILD: undefined,
      AGENT_NAME: undefined,
    });
    const result = createSupportsColor({ isTty: true });
    assert.notEqual(result, false);
    assert.equal((result as { level: number }).level, 1);
  });

  it("returns 0 for old TeamCity version", () => {
    setEnv({
      TEAMCITY_VERSION: "8.0.0",
      FORCE_COLOR: undefined,
      CI: undefined,
      TERM: undefined,
      TF_BUILD: undefined,
      AGENT_NAME: undefined,
    });
    const result = createSupportsColor({ isTty: true });
    assert.equal(result, false);
  });

  it("handles COLORTERM present but not truecolor", () => {
    setEnv({
      COLORTERM: "256color",
      FORCE_COLOR: undefined,
      CI: undefined,
      TERM: undefined,
      TF_BUILD: undefined,
      AGENT_NAME: undefined,
    });
    const result = createSupportsColor({ isTty: true });
    assert.notEqual(result, false);
    assert.equal((result as { level: number }).level, 1);
  });
});
