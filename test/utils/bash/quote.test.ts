import assert from "node:assert/strict";
import test from "node:test";

import { quote } from "../../../source/utils/bash/quote.ts";

test("quote", () => {
  assert.equal(quote(["a", "b", "c d"]), "a b 'c d'");
  assert.equal(
    quote(["a", "b", 'it\'s a "neat thing"']),
    'a b "it\'s a \\"neat thing\\""',
  );
  assert.equal(quote(["$", "`", "'"]), '\\$ \\` "\'"');
  assert.equal(quote([]), "");
  assert.equal(quote(["a\nb"]), "'a\nb'");
  assert.equal(quote([" #(){}*|][!"]), "' #(){}*|][!'");
  assert.equal(quote(["'#(){}*|][!"]), '"\'#(){}*|][\\!"');
  assert.equal(quote(["X#(){}*|][!"]), "X\\#\\(\\)\\{\\}\\*\\|\\]\\[\\!");
  assert.equal(quote(["a\n#\nb"]), "'a\n#\nb'");
  assert.equal(quote(["><;{}"]), "\\>\\<\\;\\{\\}");
  assert.equal(quote(["a", 1, true, false]), "a 1 true false");
  assert.equal(quote(["a", 1, null, undefined]), "a 1 null undefined");
  assert.equal(quote(["a\\x"]), "'a\\x'");
  assert.equal(quote(['a"b']), "'a\"b'");
  assert.equal(quote(['"a"b"']), '\'"a"b"\'');
  assert.equal(quote(['a\\"b']), "'a\\\"b'");
  assert.equal(quote(["a\\b"]), "'a\\b'");
});

test("quote ops", () => {
  assert.equal(quote(["a", { op: "|" }, "b"]), "a \\| b");
  assert.equal(
    quote(["a", { op: "&&" }, "b", { op: ";" }, "c"]),
    "a \\&\\& b \\; c",
  );
});

test("quote windows paths - chars for windows paths don't break out", () => {
  const x = "`:\\a\\b";
  assert.equal(quote([x]), "'`:\\a\\b'");
});

test("empty strings", () => {
  assert.equal(quote(["-x", "", "y"]), "-x '' y");
});
