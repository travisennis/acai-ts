import assert from "node:assert/strict";
import test from "node:test";

import { parse } from "../../../source/utils/bash/parse.ts";

test("parse shell commands", () => {
  assert.deepEqual(parse(""), []);

  assert.throws(
    () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing parse of ${
      parse("${}");
    },
    Error,
    "empty substitution throws",
  );
  assert.throws(
    () => {
      parse("${");
    },
    Error,
    "incomplete substitution throws",
  );

  assert.deepEqual(parse("a 'b' \"c\""), ["a", "b", "c"]);
  assert.deepEqual(
    parse('beep "boop" \'foo bar baz\' "it\'s \\"so\\" groovy"'),
    ["beep", "boop", "foo bar baz", 'it\'s "so" groovy'],
  );
  assert.deepEqual(parse("a b\\ c d"), ["a", "b c", "d"]);
  assert.deepEqual(parse("\\$beep bo\\`op"), ["$beep", "bo`op"]);
  assert.deepEqual(parse('echo "foo = \\"foo\\""'), ["echo", 'foo = "foo"']);
  assert.deepEqual(parse(""), []);
  assert.deepEqual(parse(" "), []);
  assert.deepEqual(parse("\t"), []);
  assert.deepEqual(parse('a"b c d"e'), ["ab c de"]);
  assert.deepEqual(parse('a\\ b"c d"\\ e f'), ["a bc d e", "f"]);
  assert.deepEqual(parse("a\\ b\"c d\"\\ e'f g' h"), ["a bc d ef g", "h"]);
  assert.deepEqual(parse("x \"bl'a\"'h'"), ["x", "bl'ah"]);
  assert.deepEqual(parse("x bl^'a^'h'", {}, { escape: "^" }), ["x", "bl'a'h"]);
  assert.deepEqual(parse("abcH def", {}, { escape: "H" }), ["abc def"]);

  assert.deepEqual(
    parse("# abc  def  ghi"),
    [{ comment: " abc  def  ghi" }],
    "start-of-line comment content is unparsed",
  );
  assert.deepEqual(
    parse("xyz # abc  def  ghi"),
    ["xyz", { comment: " abc  def  ghi" }],
    "comment content is unparsed",
  );

  assert.deepEqual(
    parse('-x "" -y'),
    ["-x", "", "-y"],
    "empty string is preserved",
  );
});

test("parse with env object", () => {
  const env: Record<string, string> = {};
  // Using bracket notation to bypass naming convention check
  env["PWD"] = "/home/robot";
  assert.deepEqual(parse('beep --boop="$PWD"', env), [
    "beep",
    "--boop=/home/robot",
  ]);
});

test("parse with custom escape", () => {
  const env: Record<string, string> = {};
  // Using bracket notation to bypass naming convention check
  env["PWD"] = "/home/robot";
  assert.deepEqual(parse('beep ^--boop="$PWD"', env, { escape: "^" }), [
    "beep",
    "--boop=/home/robot",
  ]);
});

test("parse shell operators", () => {
  assert.deepEqual(parse("beep || boop > /byte"), [
    "beep",
    { op: "||" },
    "boop",
    { op: ">" },
    "/byte",
  ]);
});

test("parse shell comment", () => {
  assert.deepEqual(parse("beep > boop # > kaboom"), [
    "beep",
    { op: ">" },
    "boop",
    { comment: " > kaboom" },
  ]);
});
