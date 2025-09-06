import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  type CommandNode,
  execute,
  type PipelineNode,
  parse,
  type SequenceNode,
  type Token,
  tokenize,
  type ValidationContext,
  validate,
} from "../../source/utils/safe-shell.ts";

const testDir = path.join(process.cwd(), ".tmp", "safe-shell-test");

describe("safe-shell tokenizer", () => {
  it("tokenizes simple command", () => {
    const res = tokenize("echo hello");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.value, [
        { kind: "WORD", value: "echo" },
        { kind: "WORD", value: "hello" },
      ]);
    }
  });

  it("tokenizes with single quotes", () => {
    const res = tokenize("echo 'hello world'");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.value, [
        { kind: "WORD", value: "echo" },
        { kind: "WORD", value: "'hello world'" },
      ]);
    }
  });

  it("tokenizes with double quotes", () => {
    const res = tokenize('echo "hello world"');
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.value, [
        { kind: "WORD", value: "echo" },
        { kind: "WORD", value: '"hello world"' },
      ]);
    }
  });

  it("tokenizes pipes", () => {
    const res = tokenize("echo hello | sort");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.value, [
        { kind: "WORD", value: "echo" },
        { kind: "WORD", value: "hello" },
        { kind: "OP", value: "|" },
        { kind: "WORD", value: "sort" },
      ]);
    }
  });

  it("tokenizes chaining operators", () => {
    const res = tokenize("echo hello && echo world || echo fail");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.value, [
        { kind: "WORD", value: "echo" },
        { kind: "WORD", value: "hello" },
        { kind: "OP", value: "&&" },
        { kind: "WORD", value: "echo" },
        { kind: "WORD", value: "world" },
        { kind: "OP", value: "||" },
        { kind: "WORD", value: "echo" },
        { kind: "WORD", value: "fail" },
      ]);
    }
  });

  it("tokenizes redirections", () => {
    const res = tokenize("echo hello > out.txt 2> err.txt < in.txt");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.value, [
        { kind: "WORD", value: "echo" },
        { kind: "WORD", value: "hello" },
        { kind: "OP", value: ">" },
        { kind: "WORD", value: "out.txt" },
        { kind: "OP", value: "2>" },
        { kind: "WORD", value: "err.txt" },
        { kind: "OP", value: "<" },
        { kind: "WORD", value: "in.txt" },
      ]);
    }
  });

  it("tokenizes append redirections", () => {
    const res = tokenize("echo hello >> out.txt 2>> err.txt");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.value, [
        { kind: "WORD", value: "echo" },
        { kind: "WORD", value: "hello" },
        { kind: "OP", value: ">>" },
        { kind: "WORD", value: "out.txt" },
        { kind: "OP", value: "2>>" },
        { kind: "WORD", value: "err.txt" },
      ]);
    }
  });

  it("tokenizes stderr merge", () => {
    const res = tokenize("echo hello 2>&1");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.value, [
        { kind: "WORD", value: "echo" },
        { kind: "WORD", value: "hello" },
        { kind: "OP", value: "2>&1" },
      ]);
    }
  });

  it("rejects backticks", () => {
    const res = tokenize("echo `whoami`");
    assert.equal(res.ok, false);
    assert.match(res.error, /Backticks are not allowed/);
  });

  it("rejects command substitution", () => {
    const res = tokenize("echo $(date)");
    assert.equal(res.ok, false);
    assert.match(res.error, /Command substitution \$\(\) is not allowed/);
  });

  it("rejects newlines", () => {
    const res = tokenize("echo hello\necho world");
    assert.equal(res.ok, false);
    assert.match(res.error, /Newlines are not allowed/);
  });

  it("rejects backgrounding", () => {
    const res = tokenize("echo hello &");
    assert.equal(res.ok, false);
    assert.match(res.error, /Backgrounding '&' is not allowed/);
  });

  it("rejects unterminated quotes", () => {
    const res = tokenize("echo 'hello");
    assert.equal(res.ok, false);
    assert.match(res.error, /Unterminated quote/);
  });

  it("rejects empty command", () => {
    const res = tokenize("");
    assert.equal(res.ok, false);
    assert.match(res.error, /Empty command/);
  });
});

describe("safe-shell parser", () => {
  it("parses simple command", () => {
    const tokens: Token[] = [
      { kind: "WORD", value: "echo" },
      { kind: "WORD", value: "hello" },
    ];
    const res = parse(tokens);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.items.length, 1);
      assert.equal(res.value.items[0].commands.length, 1);
      assert.deepEqual(res.value.items[0].commands[0].argv, ["echo", "hello"]);
    }
  });

  it("parses pipeline", () => {
    const tokens: Token[] = [
      { kind: "WORD", value: "echo" },
      { kind: "WORD", value: "hello" },
      { kind: "OP", value: "|" },
      { kind: "WORD", value: "sort" },
      { kind: "OP", value: "|" },
      { kind: "WORD", value: "uniq" },
    ];
    const res = parse(tokens);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.items.length, 1);
      assert.equal(res.value.items[0].commands.length, 3);
      assert.deepEqual(res.value.items[0].commands[0].argv, ["echo", "hello"]);
      assert.deepEqual(res.value.items[0].commands[1]?.argv, ["sort"]);
      assert.deepEqual(res.value.items[0].commands[2]?.argv, ["uniq"]);
    }
  });

  it("parses chained commands", () => {
    const tokens: Token[] = [
      { kind: "WORD", value: "echo" },
      { kind: "WORD", value: "start" },
      { kind: "OP", value: "&&" },
      { kind: "WORD", value: "echo" },
      { kind: "WORD", value: "middle" },
      { kind: "OP", value: "||" },
      { kind: "WORD", value: "echo" },
      { kind: "WORD", value: "end" },
    ];
    const res = parse(tokens);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.items.length, 3);
      assert.deepEqual(res.value.connectors, ["&&", "||"]);
      assert.deepEqual(res.value.items[0].commands[0].argv, ["echo", "start"]);
      assert.deepEqual(res.value.items[1]?.commands[0]?.argv, [
        "echo",
        "middle",
      ]);
      assert.deepEqual(res.value.items[2]?.commands[0]?.argv, ["echo", "end"]);
    }
  });

  it("parses commands with redirections", () => {
    const tokens: Token[] = [
      { kind: "WORD", value: "echo" },
      { kind: "WORD", value: "hello" },
      { kind: "OP", value: ">" },
      { kind: "WORD", value: "out.txt" },
      { kind: "OP", value: "2>" },
      { kind: "WORD", value: "err.txt" },
      { kind: "OP", value: "<" },
      { kind: "WORD", value: "in.txt" },
    ];
    const res = parse(tokens);
    assert.equal(res.ok, true);
    if (res.ok) {
      const cmd = res.value.items[0].commands[0];
      assert.deepEqual(cmd.argv, ["echo", "hello"]);
      assert.equal(cmd.redirs.stdoutFile?.path, "out.txt");
      assert.equal(cmd.redirs.stdoutFile?.append, false);
      assert.equal(cmd.redirs.stderrFile?.path, "err.txt");
      assert.equal(cmd.redirs.stderrFile?.append, false);
      assert.equal(cmd.redirs.stdinFile, "in.txt");
    }
  });

  it("parses commands with stderr merge", () => {
    const tokens: Token[] = [
      { kind: "WORD", value: "echo" },
      { kind: "WORD", value: "hello" },
      { kind: "OP", value: "2>&1" },
    ];
    const res = parse(tokens);
    assert.equal(res.ok, true);
    if (res.ok) {
      const cmd = res.value.items[0].commands[0];
      assert.equal(cmd.redirs.mergeStderrToStdout, true);
    }
  });

  it("rejects unexpected tokens", () => {
    const tokens: Token[] = [
      { kind: "WORD", value: "echo" },
      { kind: "OP", value: "&&" },
      { kind: "OP", value: "||" },
    ];
    const res = parse(tokens);
    assert.equal(res.ok, false);
    assert.match(res.error, /Expected word/);
  });
});

describe("safe-shell validator", () => {
  const baseCtx: ValidationContext = {
    allowedCommands: ["echo", "sort", "uniq", "cat", "grep", "find"],
    baseDir: "/safe/test",
    cwd: "/safe/test",
    config: {
      allowPipes: true,
      allowChaining: true,
      allowRedirection: true,
      maxSegments: 6,
      maxOutputBytes: 2_000_000,
    },
  };

  it("allows valid commands", () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["echo", "hello"],
              redirs: {},
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = validate(ast, baseCtx);
    assert.equal(res.ok, true);
  });

  it("rejects disallowed commands", () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["rm", "-rf", "/"],
              redirs: {},
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = validate(ast, baseCtx);
    assert.equal(res.ok, false);
    assert.match(res.error, /Command 'rm' is not allowed/);
  });

  it("rejects too many segments", () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            { argv: ["echo", "1"], redirs: {} },
            { argv: ["echo", "2"], redirs: {} },
            { argv: ["echo", "3"], redirs: {} },
            { argv: ["echo", "4"], redirs: {} },
            { argv: ["echo", "5"], redirs: {} },
            { argv: ["echo", "6"], redirs: {} },
            { argv: ["echo", "7"], redirs: {} },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = validate(ast, {
      ...baseCtx,
      config: { ...baseCtx.config, maxSegments: 6 },
    });
    assert.equal(res.ok, false);
    assert.match(res.error, /Too many command segments/);
  });

  it("rejects pipes when disabled", () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            { argv: ["echo", "hello"], redirs: {} },
            { argv: ["sort"], redirs: {} },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = validate(ast, {
      ...baseCtx,
      config: { ...baseCtx.config, allowPipes: false },
    });
    assert.equal(res.ok, false);
    assert.match(res.error, /Pipes are disabled/);
  });

  it("rejects chaining when disabled", () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [{ argv: ["echo", "1"], redirs: {} }] as [
            CommandNode,
            ...CommandNode[],
          ],
        },
        {
          commands: [{ argv: ["echo", "2"], redirs: {} }] as [
            CommandNode,
            ...CommandNode[],
          ],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: ["&&"],
    };
    const res = validate(ast, {
      ...baseCtx,
      config: { ...baseCtx.config, allowChaining: false },
    });
    assert.equal(res.ok, false);
    assert.match(res.error, /Chaining is disabled/);
  });

  it("rejects redirections when disabled", () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["echo", "hello"],
              redirs: { stdoutFile: { path: "out.txt", append: false } },
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = validate(ast, {
      ...baseCtx,
      config: { ...baseCtx.config, allowRedirection: false },
    });
    assert.equal(res.ok, false);
    assert.match(res.error, /Redirection is disabled/);
  });

  it("rejects paths outside base directory", () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["cat", "/etc/passwd"],
              redirs: {},
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = validate(ast, baseCtx);
    assert.equal(res.ok, false);
    assert.match(res.error, /resolves outside the project directory/);
  });

  it("rejects redirection paths outside base directory", () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["echo", "hello"],
              redirs: { stdoutFile: { path: "/etc/out.txt", append: false } },
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = validate(ast, baseCtx);
    assert.equal(res.ok, false);
    assert.match(res.error, /resolves outside the project directory/);
  });

  it("allows paths within base directory", () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["cat", "file.txt"],
              redirs: {},
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = validate(ast, baseCtx);
    assert.equal(res.ok, true);
  });

  it("allows relative paths within base directory", () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["cat", "./file.txt"],
              redirs: {},
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = validate(ast, baseCtx);
    assert.equal(res.ok, true);
  });

  it("ignores URLs", () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["echo", "https://example.com/path"],
              redirs: {},
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = validate(ast, baseCtx);
    assert.equal(res.ok, true);
  });

  it("ignores options", () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["find", ".", "-type", "f"],
              redirs: {},
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = validate(ast, baseCtx);
    assert.equal(res.ok, true);
  });
});

describe("safe-shell executor", () => {
  before(async () => {
    // Create test directory and files
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, "input.txt"), "hello\nworld\n");
    await fs.writeFile(path.join(testDir, "expected.txt"), "expected output\n");
  });

  after(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("executes simple command", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["echo", "hello world"],
              redirs: {},
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });
    assert.equal(res.code, 0);
    assert.match(res.stdout, /hello world/);
  });

  it("executes pipeline", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            { argv: ["echo", "hello\nworld\nhello"], redirs: {} },
            { argv: ["sort"], redirs: {} },
            { argv: ["uniq"], redirs: {} },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });
    assert.equal(res.code, 0);
    assert.match(res.stdout, /hello\nworld/);
  });

  it("handles && chaining (success case)", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [{ argv: ["echo", "first"], redirs: {} }] as [
            CommandNode,
            ...CommandNode[],
          ],
        },
        {
          commands: [{ argv: ["echo", "second"], redirs: {} }] as [
            CommandNode,
            ...CommandNode[],
          ],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: ["&&"],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });
    assert.equal(res.code, 0);
    assert.match(res.stdout, /first.*second/s);
  });

  it("handles && chaining (failure case)", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [{ argv: ["false"], redirs: {} }] as [
            CommandNode,
            ...CommandNode[],
          ],
        },
        {
          commands: [{ argv: ["echo", "should not run"], redirs: {} }] as [
            CommandNode,
            ...CommandNode[],
          ],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: ["&&"],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });
    assert.notEqual(res.code, 0);
    assert.equal(res.stdout, "");
  });

  it("handles || chaining (success case)", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [{ argv: ["true"], redirs: {} }] as [
            CommandNode,
            ...CommandNode[],
          ],
        },
        {
          commands: [{ argv: ["echo", "should not run"], redirs: {} }] as [
            CommandNode,
            ...CommandNode[],
          ],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: ["||"],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });
    assert.equal(res.code, 0);
    assert.equal(res.stdout, "");
  });

  it("handles || chaining (failure case)", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [{ argv: ["false"], redirs: {} }] as [
            CommandNode,
            ...CommandNode[],
          ],
        },
        {
          commands: [{ argv: ["echo", "fallback"], redirs: {} }] as [
            CommandNode,
            ...CommandNode[],
          ],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: ["||"],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });
    assert.equal(res.code, 0);
    assert.match(res.stdout, /fallback/);
  });

  it("handles input redirection", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["sort"],
              redirs: { stdinFile: "input.txt" },
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });
    assert.equal(res.code, 0);
    assert.match(res.stdout, /hello\nworld/);
  });

  it("handles output redirection", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["echo", "test output"],
              redirs: { stdoutFile: { path: "output.txt", append: false } },
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });
    assert.equal(res.code, 0);
    const output = await fs.readFile(path.join(testDir, "output.txt"), "utf8");
    assert.match(output, /test output/);
  });

  it("handles append redirection", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["echo", "first"],
              redirs: { stdoutFile: { path: "append.txt", append: false } },
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });

    const ast2: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["echo", "second"],
              redirs: { stdoutFile: { path: "append.txt", append: true } },
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    await execute(ast2, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });

    const output = await fs.readFile(path.join(testDir, "append.txt"), "utf8");
    assert.match(output, /first\nsecond/);
  });

  it("handles stderr redirection", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["sh", "-c", "echo error >&2"],
              redirs: { stderrFile: { path: "stderr.txt", append: false } },
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });
    assert.equal(res.code, 0);
    const stderr = await fs.readFile(path.join(testDir, "stderr.txt"), "utf8");
    assert.match(stderr, /error/);
  });

  it("handles stderr merge to stdout", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["sh", "-c", "echo stdout; echo stderr >&2"],
              redirs: { mergeStderrToStdout: true },
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });
    assert.equal(res.code, 0);
    assert.match(res.stdout, /stdout/);
    assert.match(res.stdout, /stderr/);
  });

  it("handles timeouts", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["sleep", "10"],
              redirs: {},
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 100,
      maxOutputBytes: 1000,
    });
    assert.equal(res.code, 124);
    assert.equal(res.signal, "SIGTERM");
  });

  it("respects output byte limits", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: [
                "sh",
                "-c",
                "for i in $(seq 1 1000); do echo 'line with lots of text to generate output'; done",
              ],
              redirs: {},
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 100, // Very small limit
    });
    assert.equal(res.code, 0);
    assert.ok(res.stdout.length <= 100);
  });

  it("handles command failures", async () => {
    const ast: SequenceNode = {
      items: [
        {
          commands: [
            {
              argv: ["false"],
              redirs: {},
            },
          ] as [CommandNode, ...CommandNode[]],
        },
      ] as [PipelineNode, ...PipelineNode[]],
      connectors: [],
    };
    const res = await execute(ast, {
      cwd: testDir,
      timeoutMs: 5000,
      maxOutputBytes: 1000,
    });
    assert.notEqual(res.code, 0);
  });
});
