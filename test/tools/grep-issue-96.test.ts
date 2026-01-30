import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGrepCommand,
  grepFiles,
  likelyUnbalancedRegex,
} from "../../source/tools/grep.ts";

// Test for the specific issue mentioned in GitHub issue #96
test("GitHub issue #96 - grep tool handles spawnChildProcess({ pattern", () => {
  // Test that the pattern is detected as unbalanced
  assert.ok(likelyUnbalancedRegex("spawnChildProcess({"));

  // Test that the pattern works with fixed-string mode
  const cmd = buildGrepCommand("spawnChildProcess({", ".", { literal: true });
  assert.ok(cmd.includes(" -F"));

  // Test that grepFiles doesn't throw an error with this pattern
  const result = grepFiles("spawnChildProcess({", ".", { literal: true });
  // Should either find matches or return "No matches found." without throwing
  assert.ok(result === "No matches found." || result.includes(":"));
});

test("GitHub issue #96 - grep tool handles problematic regex patterns gracefully", () => {
  // Test various problematic patterns that would cause regex parse errors
  const problematicPatterns = [
    "spawnChildProcess({",
    "terminal.table(",
    "function test(",
    "array[",
    "const obj = {",
    "a{",
    "a{1",
    "a{1,",
  ];

  for (const pattern of problematicPatterns) {
    // All these patterns should be detected as unbalanced
    assert.ok(
      likelyUnbalancedRegex(pattern),
      `Pattern "${pattern}" should be detected as unbalanced`,
    );

    // All these patterns should work with fixed-string mode
    const cmd = buildGrepCommand(pattern, ".", { literal: true });
    assert.ok(
      cmd.includes(" -F"),
      `Pattern "${pattern}" should use fixed-string mode`,
    );

    // All these patterns should not throw errors
    const result = grepFiles(pattern, ".", { literal: true });
    assert.ok(
      result === "No matches found." || result.includes(":"),
      `Pattern "${pattern}" should return valid result`,
    );
  }
});
