import assert from "node:assert/strict";
import test from "node:test";

import { expandEnvVars } from "../source/utils/env-expand.ts";

function envRecord(entries: [string, string][]): Record<string, string> {
  return Object.fromEntries(entries);
}

test("expandEnvVars passes literal values through unchanged", () => {
  const result = expandEnvVars(
    envRecord([
      ["FOO", "bar"],
      ["URL", "postgres://localhost:5432/mydb"],
    ]),
  );
  assert.equal(result["FOO"], "bar");
  assert.equal(result["URL"], "postgres://localhost:5432/mydb");
});

test("expandEnvVars expands $VAR syntax", () => {
  const saved = process.env["ACAI_TEST_VAR"];
  try {
    process.env["ACAI_TEST_VAR"] = "expanded_value";
    const result = expandEnvVars(envRecord([["KEY", "$ACAI_TEST_VAR"]]));
    assert.equal(result["KEY"], "expanded_value");
  } finally {
    if (saved !== undefined) {
      process.env["ACAI_TEST_VAR"] = saved;
    } else {
      delete process.env["ACAI_TEST_VAR"];
    }
  }
});

// biome-ignore lint/suspicious/noTemplateCurlyInString: testing env var expansion syntax
test("expandEnvVars expands ${VAR} syntax", () => {
  const saved = process.env["ACAI_TEST_BRACED"];
  try {
    process.env["ACAI_TEST_BRACED"] = "braced_value";
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing env var expansion syntax
    const result = expandEnvVars(envRecord([["KEY", "${ACAI_TEST_BRACED}"]]));
    assert.equal(result["KEY"], "braced_value");
  } finally {
    if (saved !== undefined) {
      process.env["ACAI_TEST_BRACED"] = saved;
    } else {
      delete process.env["ACAI_TEST_BRACED"];
    }
  }
});

test("expandEnvVars resolves undefined variables to empty string", () => {
  delete process.env["ACAI_NONEXISTENT_VAR_12345"];
  const result = expandEnvVars(
    envRecord([["KEY", "$ACAI_NONEXISTENT_VAR_12345"]]),
  );
  assert.equal(result["KEY"], "");
});

test("expandEnvVars handles mixed literal and variable values", () => {
  const saved = process.env["ACAI_TEST_MIX"];
  try {
    process.env["ACAI_TEST_MIX"] = "/home/user";
    const result = expandEnvVars(
      envRecord([
        // biome-ignore lint/suspicious/noTemplateCurlyInString: testing env var expansion syntax
        ["PATH_VAR", "${ACAI_TEST_MIX}/tools/bin"],
        ["LITERAL", "plain_value"],
      ]),
    );
    assert.equal(result["PATH_VAR"], "/home/user/tools/bin");
    assert.equal(result["LITERAL"], "plain_value");
  } finally {
    if (saved !== undefined) {
      process.env["ACAI_TEST_MIX"] = saved;
    } else {
      delete process.env["ACAI_TEST_MIX"];
    }
  }
});

test("expandEnvVars does not expand $$ or partial patterns", () => {
  const result = expandEnvVars(
    envRecord([
      ["DOUBLE", "$$NOT_A_VAR"],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing env var expansion syntax
      ["EMPTY_BRACE", "${}"],
      ["BARE_DOLLAR", "value$"],
    ]),
  );
  assert.equal(result["DOUBLE"], "$NOT_A_VAR");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: testing env var expansion syntax
  assert.equal(result["EMPTY_BRACE"], "${}");
  assert.equal(result["BARE_DOLLAR"], "value$");
});

test("expandEnvVars handles multiple variables in one value", () => {
  const savedA = process.env["ACAI_A"];
  const savedB = process.env["ACAI_B"];
  try {
    process.env["ACAI_A"] = "hello";
    process.env["ACAI_B"] = "world";
    const result = expandEnvVars(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing env var expansion syntax
      envRecord([["KEY", "$ACAI_A ${ACAI_B}"]]),
    );
    assert.equal(result["KEY"], "hello world");
  } finally {
    if (savedA !== undefined) {
      process.env["ACAI_A"] = savedA;
    } else {
      delete process.env["ACAI_A"];
    }
    if (savedB !== undefined) {
      process.env["ACAI_B"] = savedB;
    } else {
      delete process.env["ACAI_B"];
    }
  }
});

test("expandEnvVars returns empty record for empty input", () => {
  const result = expandEnvVars({});
  assert.deepEqual(result, {});
});
