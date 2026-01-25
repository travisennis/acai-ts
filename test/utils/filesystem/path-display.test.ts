import { strict as assert } from "node:assert/strict";
import { describe, it } from "node:test";
import { toDisplayPath } from "../../../source/utils/filesystem/path-display.ts";

describe("toDisplayPath", () => {
  const cwd = "/Users/user/project";

  it("should convert absolute path within cwd to relative path", () => {
    const result = toDisplayPath("/Users/user/project/src/file.ts", cwd);
    assert.strictEqual(result, "src/file.ts");
  });

  it("should keep absolute path outside cwd unchanged", () => {
    const result = toDisplayPath("/tmp/file.txt", cwd);
    assert.strictEqual(result, "/tmp/file.txt");
  });

  it("should keep relative paths unchanged", () => {
    const result = toDisplayPath("./src/file.ts", cwd);
    assert.strictEqual(result, "./src/file.ts");
  });

  it("should handle paths at the root of cwd", () => {
    const result = toDisplayPath("/Users/user/project", cwd);
    assert.strictEqual(result, ".");
  });

  it("should use process.cwd() when cwd not provided", () => {
    const result = toDisplayPath(`${process.cwd()}/src/file.ts`);
    assert.strictEqual(result, "src/file.ts");
  });

  it("should handle paths in parent directory", () => {
    const result = toDisplayPath("/Users/user/other/file.ts", cwd);
    assert.strictEqual(result, "/Users/user/other/file.ts");
  });

  it("should handle deeply nested paths", () => {
    const result = toDisplayPath(
      "/Users/user/project/src/components/button/Button.tsx",
      cwd,
    );
    assert.strictEqual(result, "src/components/button/Button.tsx");
  });

  it("should handle paths with special characters", () => {
    const result = toDisplayPath(
      "/Users/user/project/src/file with spaces.ts",
      cwd,
    );
    assert.strictEqual(result, "src/file with spaces.ts");
  });
});
