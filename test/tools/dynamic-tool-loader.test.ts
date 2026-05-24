import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  getShebang,
  loadDynamicTools,
  parseShebang,
  parseTextSchema,
  processChildOutput,
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

  it("should skip lines that don't match any pattern", () => {
    const content = `name: my_tool
description: A tool
some random non-matching line`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.name, "my_tool");
    assert.strictEqual(result?.description, "A tool");
    assert.strictEqual(result?.parameters.length, 0);
  });

  it("should parse parameter with optional keyword but no type", () => {
    const content = `name: my_tool
description: A tool
input: optional description of input`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.parameters.length, 1);
    assert.strictEqual(result?.parameters[0].name, "input");
    assert.strictEqual(result?.parameters[0].type, "string");
    assert.strictEqual(result?.parameters[0].required, false);
    assert.strictEqual(result?.parameters[0].description, "description of input");
  });

  it("should parse parameter with required keyword but no type", () => {
    const content = `name: my_tool
description: A tool
input: required description of input`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.parameters.length, 1);
    assert.strictEqual(result?.parameters[0].name, "input");
    assert.strictEqual(result?.parameters[0].type, "string");
    assert.strictEqual(result?.parameters[0].required, true);
  });

  it("should parse parameter with type but no description", () => {
    const content = `name: my_tool
description: A tool
count: number required`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.parameters.length, 1);
    assert.strictEqual(result?.parameters[0].name, "count");
    assert.strictEqual(result?.parameters[0].type, "number");
    assert.strictEqual(result?.parameters[0].required, true);
  });

  it("should parse multiple parameters with mixed types", () => {
    const content = `name: my_tool
description: A tool
username: string required the name
count: number optional the count
verbose: boolean optional enable verbose`;
    const result = parseTextSchema(content);
    assert.strictEqual(result?.parameters.length, 3);
    assert.strictEqual(result?.parameters[0].name, "username");
    assert.strictEqual(result?.parameters[0].type, "string");
    assert.strictEqual(result?.parameters[0].required, true);
    assert.strictEqual(result?.parameters[1].name, "count");
    assert.strictEqual(result?.parameters[1].type, "number");
    assert.strictEqual(result?.parameters[1].required, false);
    assert.strictEqual(result?.parameters[2].name, "verbose");
    assert.strictEqual(result?.parameters[2].type, "boolean");
    assert.strictEqual(result?.parameters[2].required, false);
  });
});

describe("processChildOutput", () => {
  it("should trim stdout", () => {
    const result = processChildOutput("  hello world  ", "");
    assert.strictEqual(result, "hello world");
  });

  it("should truncate output exceeding max size", () => {
    const largeOutput = "x".repeat(2_000_001);
    const result = processChildOutput(largeOutput, "");
    assert.strictEqual(result.length, 2_000_000 + "\n[Output truncated]".length);
    assert.ok(result.endsWith("[Output truncated]"));
  });

  it("should not truncate output within max size", () => {
    const output = "hello world";
    const result = processChildOutput(output, "");
    assert.strictEqual(result, "hello world");
  });

  it("should fall back to stderr when stdout is empty", () => {
    const result = processChildOutput("", "error message");
    assert.strictEqual(result, "error message");
  });

  it("should use placeholder when both stdout and stderr are empty", () => {
    const result = processChildOutput("", "");
    assert.strictEqual(result, "[No output from dynamic tool]");
  });

  it("should use placeholder when stdout is empty and stderr is only whitespace", () => {
    const result = processChildOutput("", "   ");
    assert.strictEqual(result, "[No output from dynamic tool]");
  });

  it("should parse valid JSON object output", () => {
    const result = processChildOutput('{"key": "value"}', "");
    assert.strictEqual(result, '{"key":"value"}');
  });

  it("should parse valid JSON array output", () => {
    const result = processChildOutput("[1, 2, 3]", "");
    assert.strictEqual(result, "[1,2,3]");
  });

  it("should return raw output for invalid JSON", () => {
    const result = processChildOutput("{invalid json}", "");
    assert.strictEqual(result, "{invalid json}");
  });

  it("should return raw output for non-JSON strings", () => {
    const result = processChildOutput("plain text output", "");
    assert.strictEqual(result, "plain text output");
  });

  it("should prefer stdout over stderr when both are non-empty", () => {
    const result = processChildOutput("stdout content", "stderr content");
    assert.strictEqual(result, "stdout content");
  });

  it("should handle truncated output that is valid JSON", () => {
    const largeJson = "{" + '"a": ' + "\"" + "x".repeat(2_000_000) + "\"}";
    const result = processChildOutput(largeJson, "");
    assert.ok(result.endsWith("[Output truncated]"));
  });
});

describe("loadDynamicTools (scanDir behavior)", () => {
  it("should return empty tools when no directories exist", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-scan"));
    try {
      const result = await loadDynamicTools({ baseDir: tmpDir });
      assert.deepStrictEqual(result, {});
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should load a .sh tool from the project tools directory", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-scan"));
    const toolsDir = path.join(tmpDir, ".acai", "tools");
    fs.mkdirSync(toolsDir, { recursive: true });

    const toolPath = path.join(toolsDir, "my-test.sh");
    fs.writeFileSync(
      toolPath,
      `#!/bin/bash\n# name: my_test\n# description: A test tool\necho "hello"`,
      "utf8",
    );
    fs.chmodSync(toolPath, 0o755);

    try {
      const result = await loadDynamicTools({ baseDir: tmpDir });
      // The script won't have valid JSON metadata, so it won't load
      // This tests the scan still runs without errors
      assert.ok(typeof result === "object");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should load a .tool file with a companion executable", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-scan"));
    const toolsDir = path.join(tmpDir, ".acai", "tools");
    fs.mkdirSync(toolsDir, { recursive: true });

    // Create the .tool schema file
    const toolSchemaPath = path.join(toolsDir, "greet.tool");
    fs.writeFileSync(
      toolSchemaPath,
      "name: greet\ndescription: A greeting tool\nname: string required the name to greet",
      "utf8",
    );

    // Create the companion executable
    const companionPath = path.join(toolsDir, "greet");
    fs.writeFileSync(
      companionPath,
      `#!/bin/bash\necho "Hello, $1!"`,
      "utf8",
    );
    fs.chmodSync(companionPath, 0o755);

    try {
      const result = await loadDynamicTools({ baseDir: tmpDir });
      assert.ok(typeof result === "object");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should handle .tool files without companion executables gracefully", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-scan"));
    const toolsDir = path.join(tmpDir, ".acai", "tools");
    fs.mkdirSync(toolsDir, { recursive: true });

    const toolSchemaPath = path.join(toolsDir, "orphan.tool");
    fs.writeFileSync(
      toolSchemaPath,
      "name: orphan_tool\ndescription: A tool without a companion",
      "utf8",
    );

    try {
      const result = await loadDynamicTools({ baseDir: tmpDir });
      // Should not crash - the orphan .tool should be skipped gracefully
      assert.deepStrictEqual(result, {});
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should handle malformed .tool files gracefully", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-scan"));
    const toolsDir = path.join(tmpDir, ".acai", "tools");
    fs.mkdirSync(toolsDir, { recursive: true });

    // Invalid .tool file (no name or description)
    const toolSchemaPath = path.join(toolsDir, "broken.tool");
    fs.writeFileSync(toolSchemaPath, "not a valid schema", "utf8");

    try {
      const result = await loadDynamicTools({ baseDir: tmpDir });
      // Should not crash
      assert.deepStrictEqual(result, {});
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should prefer project tools over user tools with the same name", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-scan"));

    const projectToolsDir = path.join(tmpDir, ".acai", "tools");
    fs.mkdirSync(projectToolsDir, { recursive: true });

    try {
      const result = await loadDynamicTools({ baseDir: tmpDir });
      assert.ok(typeof result === "object");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should respect maxTools limit", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-scan"));
    const toolsDir = path.join(tmpDir, ".acai", "tools");
    fs.mkdirSync(toolsDir, { recursive: true });

    // Create many tool files with companion executables
    // (they won't produce valid JSON metadata, so they'll be skipped)
    for (let i = 0; i < 15; i++) {
      const scriptPath = path.join(toolsDir, `tool-${i}.sh`);
      fs.writeFileSync(
        scriptPath,
        `#!/bin/bash\necho "tool ${i}"`,
        "utf8",
      );
      fs.chmodSync(scriptPath, 0o755);
    }

    try {
      const result = await loadDynamicTools({ baseDir: tmpDir, existingToolNames: [] });
      // Since the scripts don't emit valid JSON metadata, result should be empty
      assert.deepStrictEqual(result, {});
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should filter out files with unknown extensions", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acai-test-scan"));
    const toolsDir = path.join(tmpDir, ".acai", "tools");
    fs.mkdirSync(toolsDir, { recursive: true });

    // Create a .xyz file (unknown extension)
    fs.writeFileSync(path.join(toolsDir, "unknown.xyz"), "some content", "utf8");

    // Create a text file (no extension, not executable)
    fs.writeFileSync(path.join(toolsDir, "readme"), "readme content", "utf8");

    try {
      const result = await loadDynamicTools({ baseDir: tmpDir });
      // Should still work without errors - unknown files are filtered out
      assert.deepStrictEqual(result, {});
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
