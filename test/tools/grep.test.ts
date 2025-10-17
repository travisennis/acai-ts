import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGrepCommand,
  likelyUnbalancedRegex,
} from "../../source/tools/grep.ts";

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

test("likelyUnbalancedRegex detects unbalanced parentheses", () => {
  assert.ok(likelyUnbalancedRegex("terminal.table("));
  assert.ok(likelyUnbalancedRegex("loadDynamicTools({"));
  assert.ok(likelyUnbalancedRegex("function test("));
  assert.ok(!likelyUnbalancedRegex("function test()"));
});

test("likelyUnbalancedRegex detects unbalanced brackets", () => {
  assert.ok(likelyUnbalancedRegex("array["));
  assert.ok(!likelyUnbalancedRegex("array[0]"));
});

test("likelyUnbalancedRegex detects unbalanced braces", () => {
  assert.ok(likelyUnbalancedRegex("const obj = {"));
  assert.ok(!likelyUnbalancedRegex("const obj = {}"));
});

test("likelyUnbalancedRegex detects invalid repetition operators", () => {
  assert.ok(likelyUnbalancedRegex("a{"));
  assert.ok(likelyUnbalancedRegex("a{1"));
  assert.ok(likelyUnbalancedRegex("a{1,"));
  assert.ok(likelyUnbalancedRegex("a{}"));
  assert.ok(!likelyUnbalancedRegex("a{1}"));
  assert.ok(!likelyUnbalancedRegex("a{1,5}"));
});

test("likelyUnbalancedRegex does not treat { inside character classes as repetition", () => {
  assert.ok(!likelyUnbalancedRegex("[a{]"));
  assert.ok(!likelyUnbalancedRegex("[\\}]"));
});

test("likelyUnbalancedRegex handles character classes correctly", () => {
  assert.ok(!likelyUnbalancedRegex("[a-z]"));
  assert.ok(!likelyUnbalancedRegex("[\\w+]"));
  assert.ok(likelyUnbalancedRegex("[a-z"));
});

test("likelyUnbalancedRegex handles escape sequences", () => {
  assert.ok(!likelyUnbalancedRegex("\\["));
  assert.ok(!likelyUnbalancedRegex("\\]"));
  assert.ok(!likelyUnbalancedRegex("\\("));
  assert.ok(!likelyUnbalancedRegex("\\)"));
  assert.ok(!likelyUnbalancedRegex("\\{"));
  assert.ok(!likelyUnbalancedRegex("\\}"));
});
