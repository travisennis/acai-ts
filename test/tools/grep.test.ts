import assert from "node:assert/strict";
import test from "node:test";

import { buildGrepCommand } from "../../source/tools/grep.ts";

test("buildGrepCommand uses -F when literal=true", () => {
  const cmd = buildGrepCommand("terminal.table(", "/repo", { literal: true });
  assert.ok(cmd.includes(" -F"));
});

test("buildGrepCommand does not use -F when literal=false", () => {
  const cmd = buildGrepCommand("\\w+", "/repo", { literal: false });
  assert.ok(!cmd.includes(" -F"));
});

test("buildGrepCommand auto-detects unbalanced pattern and uses -F when literal omitted", () => {
  const cmd = buildGrepCommand("terminal.table(", "/repo", { literal: null });
  assert.ok(cmd.includes(" -F"));
});
