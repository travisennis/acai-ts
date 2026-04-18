import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  getShebang,
  parseShebang,
  parseTextSchema,
  resolveToolInterpreter,
} from "../../source/tools/dynamic-tool-loader.ts";

describe("resolveToolInterpreter", () => {
  it("should resolve .js files to node", () => {
    const result = resolveToolInterpreter("/path/to/tool.js");
    assert.strictEqual(result?.command, process.execPath);
    assert.deepStrictEqual(result?.args, ["/path/to/tool.js"]);
  });

  it("should resolve .mjs files to node", () => {
    const result = resolveToolInterpreter("/path/to/tool.mjs");
    assert.strictEqual(result?.command, process.execPath);
    assert.deepStrictEqual(result?.args, ["/path/to/tool.mjs"]);
  });

  it("should resolve .cjs files to node", () => {
    const result = resolveToolInterpreter("/path/to/tool.cjs");
    assert.strictEqual(result?.command, process.execPath);
    assert.deepStrictEqual(result?.args, ["/path/to/tool.cjs"]);
  });

  it("should resolve .sh files to bash", () => {
    const result = resolveToolInterpreter("/path/to/tool.sh");
    assert.strictEqual(result?.command, "/bin/bash");
    assert.deepStrictEqual(result?.args, ["/path/to/tool.sh"]);
  });

  it("should resolve .bash files to bash", () => {
    const result = resolveToolInterpreter("/path/to/tool.bash");
    assert.strictEqual(result?.command, "/bin/bash");
  });

  it("should resolve .zsh files to zsh", () => {
    const result = resolveToolInterpreter("/path/to/tool.zsh");
    assert.strictEqual(result?.command, "/bin/zsh");
  });

  it("should resolve .py files to python3", () => {
    const result = resolveToolInterpreter("/path/to/tool.py");
    assert.strictEqual(result?.command, "python3");
  });

  it("should resolve .rb files to ruby", () => {
    const result = resolveToolInterpreter("/path/to/tool.rb");
    assert.strictEqual(result?.command, "ruby");
  });

  it("should return null for unknown extensions", () => {
    const result = resolveToolInterpreter("/path/to/tool.xyz");
    assert.strictEqual(result, null);
  });

  it("should detect shebang #!/bin/bash", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-"));
    const scriptPath = path.join(tmpDir, "tool-with-shebang");
    fs.writeFileSync(scriptPath, "#!/bin/bash\necho hello\n", "utf8");
    fs.chmodSync(scriptPath, 0o755);

    const result = resolveToolInterpreter(scriptPath);
    assert.strictEqual(result?.command, "/bin/bash");
    assert.deepStrictEqual(result?.args, [scriptPath]);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("should detect shebang #!/usr/bin/env node", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-"));
    const scriptPath = path.join(tmpDir, "tool-env-node");
    fs.writeFileSync(
      scriptPath,
      "#!/usr/bin/env node\nconsole.log('hi');\n",
      "utf8",
    );
    fs.chmodSync(scriptPath, 0o755);

    const result = resolveToolInterpreter(scriptPath);
    assert.strictEqual(result?.command, "node");
    assert.deepStrictEqual(result?.args, [scriptPath]);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("should detect shebang #!/usr/bin/env python3", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-"));
    const scriptPath = path.join(tmpDir, "tool-env-py");
    fs.writeFileSync(
      scriptPath,
      "#!/usr/bin/env python3\nprint('hi')\n",
      "utf8",
    );
    fs.chmodSync(scriptPath, 0o755);

    const result = resolveToolInterpreter(scriptPath);
    assert.strictEqual(result?.command, "python3");
    assert.deepStrictEqual(result?.args, [scriptPath]);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("should run extensionless executable files directly", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-"));
    const scriptPath = path.join(tmpDir, "my-tool");
    fs.writeFileSync(scriptPath, "#!/bin/bash\necho hello\n", "utf8");
    fs.chmodSync(scriptPath, 0o755);

    // Since it has a shebang, it should use the shebang, not the extensionless path
    const result = resolveToolInterpreter(scriptPath);
    assert.strictEqual(result?.command, "/bin/bash");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("should return null for non-executable extensionless files", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-"));
    const scriptPath = path.join(tmpDir, "my-tool-noexec");
    fs.writeFileSync(scriptPath, "some content\n", "utf8");
    // Not making it executable

    const result = resolveToolInterpreter(scriptPath);
    assert.strictEqual(result, null);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("getShebang", () => {
  it("should return shebang from a file with shebang", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-"));
    const scriptPath = path.join(tmpDir, "shebang-script");
    fs.writeFileSync(
      scriptPath,
      "#!/usr/bin/env python3\nprint('hi')\n",
      "utf8",
    );

    const result = getShebang(scriptPath);
    assert.strictEqual(result, "/usr/bin/env python3");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("should return null for a file without shebang", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-"));
    const scriptPath = path.join(tmpDir, "no-shebang-script");
    fs.writeFileSync(scriptPath, "console.log('hi');\n", "utf8");

    const result = getShebang(scriptPath);
    assert.strictEqual(result, null);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("should return null for a non-existent file", () => {
    const result = getShebang("/nonexistent/path/to/script");
    assert.strictEqual(result, null);
  });
});

describe("parseShebang", () => {
  it("should parse /usr/bin/env shebangs", () => {
    const result = parseShebang("/usr/bin/env node", "/path/to/script");
    assert.strictEqual(result.command, "node");
    assert.deepStrictEqual(result.args, ["/path/to/script"]);
  });

  it("should parse /usr/bin/env shebangs with arguments", () => {
    const result = parseShebang("/usr/bin/env python3", "/path/to/script");
    assert.strictEqual(result.command, "python3");
    assert.deepStrictEqual(result.args, ["/path/to/script"]);
  });

  it("should parse direct path shebangs", () => {
    const result = parseShebang("/bin/bash", "/path/to/script");
    assert.strictEqual(result.command, "/bin/bash");
    assert.deepStrictEqual(result.args, ["/path/to/script"]);
  });

  it("should parse direct path shebangs with arguments", () => {
    const result = parseShebang("/usr/bin/perl -w", "/path/to/script");
    assert.strictEqual(result.command, "/usr/bin/perl");
    assert.deepStrictEqual(result.args, ["-w", "/path/to/script"]);
  });
});

describe("parseTextSchema", () => {
  it("should parse valid text schema with all fields", () => {
    const content = `name: run_tests
description: Run the tests in the project
workspace: string optional name of the workspace directory
test: string optional test name pattern`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.name, "run_tests");
    assert.strictEqual(result?.description, "Run the tests in the project");
    assert.strictEqual(result?.parameters.length, 2);
    assert.strictEqual(result?.parameters[0].name, "workspace");
    assert.strictEqual(result?.parameters[0].type, "string");
    assert.strictEqual(result?.parameters[0].required, false);
  });

  it("should reject schema without name", () => {
    const content = "description: A tool without a name";
    const result = parseTextSchema(content);
    assert.strictEqual(result, null);
  });

  it("should reject schema without description", () => {
    const content = "name: my_tool";
    const result = parseTextSchema(content);
    assert.strictEqual(result, null);
  });

  it("should treat params as required by default", () => {
    const content = `name: my_tool
description: A tool
param1: string a required param`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.parameters[0].required, true);
  });

  it("should skip comment lines starting with #", () => {
    const content = `# This is a comment
name: my_tool
description: A tool`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.name, "my_tool");
  });

  it("should skip comment lines starting with //", () => {
    const content = `// This is also a comment
name: my_tool
description: A tool`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.name, "my_tool");
  });

  it("should reject invalid tool names", () => {
    const content = `name: 123invalid
description: A tool with invalid name`;
    const result = parseTextSchema(content);
    assert.strictEqual(result, null);
  });

  it("should parse number type parameters", () => {
    const content = `name: my_tool
description: A tool
count: number required number of items`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.parameters[0].type, "number");
  });

  it("should parse boolean type parameters", () => {
    const content = `name: my_tool
description: A tool
verbose: boolean optional enable verbose output`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.parameters[0].type, "boolean");
    assert.strictEqual(result?.parameters[0].required, false);
  });

  it("should default type to string when not specified", () => {
    const content = `name: my_tool
description: A tool
input: a string parameter`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.parameters[0].type, "string");
  });

  it("should handle empty lines", () => {
    const content = `name: my_tool

description: A tool

param1: string a param`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.name, "my_tool");
    assert.strictEqual(result?.parameters.length, 1);
  });

  it("should default needsApproval to true", () => {
    const content = `name: my_tool
description: A tool`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.needsApproval, true);
  });
});
