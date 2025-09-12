import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type Connector = ";" | "&&" | "||";

export interface Redirections {
  stdinFile?: string;
  stdoutFile?: { path: string; append: boolean };
  stderrFile?: { path: string; append: boolean };
  mergeStderrToStdout?: boolean; // 2>&1
}

export interface CommandNode {
  argv: [string, ...string[]];
  redirs: Redirections;
}

export interface PipelineNode {
  commands: [CommandNode, ...CommandNode[]];
}

export interface SequenceNode {
  items: [PipelineNode, ...PipelineNode[]];
  connectors: Connector[]; // connectors[i] connects items[i] -> items[i+1]
}

export interface SafeShellConfig {
  allowPipes: boolean;
  allowChaining: boolean;
  allowRedirection: boolean;
  maxSegments: number;
  maxOutputBytes: number;
}

export interface ValidationContext {
  allowedCommands: string[];
  baseDir: string;
  cwd: string;
  config: SafeShellConfig;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// Tokenizer --------------------------------------------------------------

export type TokKind = "WORD" | "OP";
export interface Token {
  kind: TokKind;
  value: string;
}

export function tokenize(
  input: string,
  abortSignal?: AbortSignal,
): ParseResult<Token[]> {
  if (abortSignal?.aborted) {
    return { ok: false, error: "Command parsing aborted" };
  }

  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;
  let buf = "";
  let inSingle = false;
  let inDouble = false;

  function flushWord() {
    if (buf.length > 0) {
      tokens.push({ kind: "WORD", value: buf });
      buf = "";
    }
  }

  const disallow = (msg: string): ParseResult<Token[]> => ({
    ok: false,
    error: msg,
  });

  while (i < n) {
    const ch = input[i] ?? "";

    if (ch === "`") return disallow("Backticks are not allowed");
    if (ch === "\n" || ch === "\r") return disallow("Newlines are not allowed");
    if (!inSingle && ch === "$" && i + 1 < n && input[i + 1] === "(") {
      return disallow("Command substitution $() is not allowed");
    }

    // Quotes - add opening quote to buffer
    if (!inDouble && ch === "'" && !inSingle) {
      inSingle = true;
      buf += ch;
      i += 1;
      continue;
    }
    if (inSingle && ch === "'") {
      inSingle = false;
      buf += ch;
      i += 1;
      continue;
    }
    if (!inSingle && ch === '"' && !inDouble) {
      inDouble = true;
      buf += ch;
      i += 1;
      continue;
    }
    if (inDouble && ch === '"') {
      inDouble = false;
      buf += ch;
      i += 1;
      continue;
    }

    if (!inSingle && !inDouble) {
      // Skip whitespace boundaries
      if (/\s/.test(ch)) {
        flushWord();
        i += 1;
        continue;
      }

      // Operators (longest-first)
      // Special case 2>&1
      if (input.startsWith("2>&1", i)) {
        flushWord();
        tokens.push({ kind: "OP", value: "2>&1" });
        i += 4; // length of 2>&1
        continue;
      }
      let operatorFound = false;
      for (const op of ["||", "&&", ">>", "2>>", "2>", ">", "<", "|", ";"]) {
        if (input.startsWith(op, i)) {
          flushWord();
          tokens.push({ kind: "OP", value: op });
          i += op.length;
          operatorFound = true;
          break;
        }
      }
      if (operatorFound) {
        continue;
      }
      if (ch === "&") {
        return disallow("Backgrounding '&' is not allowed");
      }
    }

    // Regular char
    buf += ch;
    i += 1;
  }
  if (inSingle || inDouble) return { ok: false, error: "Unterminated quote" };
  flushWord();
  if (tokens.length === 0) return { ok: false, error: "Empty command" };
  return { ok: true, value: tokens };
}

// Parser --------------------------------------------------------------

export function parse(
  tokens: Token[],
  abortSignal?: AbortSignal,
): ParseResult<SequenceNode> {
  if (abortSignal?.aborted) {
    return { ok: false, error: "Command parsing aborted" };
  }

  let i = 0;

  function expectWord(): ParseResult<string> {
    const t = tokens[i];
    if (!t || t.kind !== "WORD") return { ok: false, error: "Expected word" };
    i += 1;
    return { ok: true, value: t.value };
  }

  function parseRedirs(redirs: Redirections): ParseResult<Redirections> {
    // parse zero or more redirection operators
    /* eslint-disable no-constant-condition */
    while (true) {
      const t = tokens[i];
      if (!t || t.kind !== "OP") break;
      if (t.value === "<") {
        i += 1;
        const file = expectWord();
        if (!file.ok) return file;
        redirs.stdinFile = file.value;
        continue;
      }
      if (t.value === ">" || t.value === ">>") {
        i += 1;
        const file = expectWord();
        if (!file.ok) return file;
        redirs.stdoutFile = { path: file.value, append: t.value === ">>" };
        continue;
      }
      if (t.value === "2>" || t.value === "2>>") {
        i += 1;
        const file = expectWord();
        if (!file.ok) return file;
        redirs.stderrFile = { path: file.value, append: t.value === "2>>" };
        continue;
      }
      if (t.value === "2>&1") {
        i += 1;
        redirs.mergeStderrToStdout = true;
        continue;
      }
      break;
    }
    /* eslint-enable no-constant-condition */
    return { ok: true, value: redirs };
  }

  function parseCommand(): ParseResult<CommandNode> {
    const argv: string[] = [];
    // at least one word
    const first = expectWord();
    if (!first.ok) return first;
    argv.push(first.value);
    // read subsequent words
    while (true) {
      const t = tokens[i];
      if (!t) break;
      if (t.kind === "OP") {
        // redirections may follow
        const red = parseRedirs({});
        if (!red.ok) return red;
        return {
          ok: true,
          value: { argv: argv as [string, ...string[]], redirs: red.value },
        };
      }
      // word
      argv.push(t.value);
      i += 1;
    }
    return {
      ok: true,
      value: { argv: argv as [string, ...string[]], redirs: {} },
    };
  }

  function parsePipeline(): ParseResult<PipelineNode> {
    const cmds: CommandNode[] = [];
    const first = parseCommand();
    if (!first.ok) return first;
    cmds.push(first.value);
    while (true) {
      const t = tokens[i];
      if (!t || t.kind !== "OP" || t.value !== "|") break;
      i += 1; // consume |
      const next = parseCommand();
      if (!next.ok) return next;
      cmds.push(next.value);
    }
    if (cmds.length === 0) return { ok: false, error: "Empty pipeline" };
    return {
      ok: true,
      value: { commands: cmds as [CommandNode, ...CommandNode[]] },
    };
  }

  const items: PipelineNode[] = [];
  const connectors: Connector[] = [];
  const first = parsePipeline();
  if (!first.ok) return first;
  items.push(first.value);
  while (true) {
    const t = tokens[i];
    if (!t || t.kind !== "OP") break;
    if (t.value === ";" || t.value === "&&" || t.value === "||") {
      connectors.push(t.value as Connector);
      i += 1;
      const next = parsePipeline();
      if (!next.ok) return next;
      items.push(next.value);
      continue;
    }
    break;
  }
  if (i !== tokens.length)
    return { ok: false, error: "Unexpected tokens at end" };
  return {
    ok: true,
    value: { items: items as [PipelineNode, ...PipelineNode[]], connectors },
  };
}

// Validation --------------------------------------------------------------

export function validate(
  ast: SequenceNode,
  ctx: ValidationContext,
  abortSignal?: AbortSignal,
): ParseResult<null> {
  if (abortSignal?.aborted) {
    return { ok: false, error: "Command validation aborted" };
  }
  let segmentCount = 0;
  const { allowedCommands, baseDir, cwd, config } = ctx;

  function isPathWithinBaseDir(requestedPath: string, base: string): boolean {
    const normalizedRequestedPath = path.normalize(requestedPath);
    const normalizedBaseDir = path.normalize(base);
    return normalizedRequestedPath.startsWith(normalizedBaseDir);
  }

  function isOptionToken(tok: string): boolean {
    return tok.startsWith("-");
  }

  for (let i = 0; i < ast.items.length; i++) {
    const pipe = ast.items[i] as PipelineNode;
    segmentCount += pipe.commands.length;
    if (segmentCount > config.maxSegments) {
      return {
        ok: false,
        error: `Too many command segments (${segmentCount}). Max allowed is ${config.maxSegments}`,
      };
    }

    for (let j = 0; j < pipe.commands.length; j++) {
      const cmd = pipe.commands[j] as CommandNode;
      const base = cmd.argv[0] ?? "";
      if (!allowedCommands.includes(base)) {
        return {
          ok: false,
          error: `Command '${base}' is not allowed. Allowed: ${allowedCommands.join(", ")}`,
        };
      }
      // features enablement
      if (!config.allowPipes && pipe.commands.length > 1) {
        return { ok: false, error: "Pipes are disabled by configuration" };
      }
      if (!config.allowChaining && ast.connectors.length > 0) {
        return { ok: false, error: "Chaining is disabled by configuration" };
      }
      // redirections presence
      if (
        !config.allowRedirection &&
        (cmd.redirs.stdinFile ||
          cmd.redirs.stdoutFile ||
          cmd.redirs.stderrFile ||
          cmd.redirs.mergeStderrToStdout)
      ) {
        return { ok: false, error: "Redirection is disabled by configuration" };
      }

      // argv path validation
      for (let k = 1; k < cmd.argv.length; k++) {
        const arg = cmd.argv[k] ?? "";
        const prev = cmd.argv[k - 1] ?? "";
        if (isOptionToken(arg)) continue;
        const clean = arg.replace(/^['"]|['"]$/g, "");
        if (clean.includes("://")) continue; // URLs
        // Special-case git commit message flags
        if (prev === "-m" || prev === "--message") continue;

        // We consider as path if contains '/' or starts with './' or '../' or absolute '/'
        const looksPath =
          clean.startsWith("/") ||
          clean.startsWith("./") ||
          clean.startsWith("../") ||
          clean.includes("/");
        if (!looksPath) continue;
        try {
          const resolved = path.resolve(cwd, clean);
          if (!isPathWithinBaseDir(resolved, baseDir)) {
            return {
              ok: false,
              error: `Path '${clean}' resolves outside the project directory (${resolved}). All paths must be within ${baseDir}`,
            };
          }
        } catch {
          /* ignore */
        }
      }

      // redirection path validation
      const r = cmd.redirs;
      const redirFiles: string[] = [];
      if (r.stdinFile) redirFiles.push(r.stdinFile);
      if (r.stdoutFile) redirFiles.push(r.stdoutFile.path);
      if (r.stderrFile) redirFiles.push(r.stderrFile.path);
      for (const f of redirFiles) {
        const clean = f.replace(/^['"]|['"]$/g, "");
        const resolved = path.resolve(cwd, clean);
        if (!isPathWithinBaseDir(resolved, baseDir)) {
          return {
            ok: false,
            error: `Redirection path '${clean}' resolves outside the project directory (${resolved}).`,
          };
        }
      }
    }
  }
  return { ok: true, value: null };
}

// Execution --------------------------------------------------------------
// Strip outer quotes from arguments since spawn() doesn't need shell-style quote processing
function stripOuterQuotes(arg: string): string {
  if (arg.length >= 2) {
    const first = arg[0];
    const last = arg[arg.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return arg.slice(1, -1);
    }
  }
  return arg;
}

export interface ExecOptions {
  cwd: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
  maxOutputBytes: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  signal?: NodeJS.Signals;
}

export async function execute(
  ast: SequenceNode,
  opts: ExecOptions,
): Promise<ExecResult> {
  if (opts.abortSignal?.aborted) {
    return {
      stdout: "",
      stderr: "Command execution aborted",
      code: 130,
      signal: "SIGINT",
    };
  }
  let stdoutAcc = "";
  let stderrAcc = "";
  let overallCode = 0;
  let timedOut = false;

  const killAll = (procs: ChildProcess[]) => {
    for (const p of procs) {
      try {
        p.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
  };

  const startTime = Date.now();

  for (let i = 0; i < ast.items.length; i++) {
    if (timedOut) break;
    const pipe = ast.items[i] as PipelineNode;
    // Determine whether to execute this segment based on connector and previous code
    if (i > 0) {
      const connector = ast.connectors[i - 1] as Connector | undefined;
      if (connector === "&&" && overallCode !== 0) {
        continue;
      }
      if (connector === "||" && overallCode === 0) {
        continue;
      }
    }

    const procs: ChildProcess[] = [];

    // Spawn commands
    for (let j = 0; j < pipe.commands.length; j++) {
      const cmd = pipe.commands[j] as CommandNode;
      const [exe, ...args] = cmd.argv;
      // Strip outer quotes from arguments since spawn() doesn't process shell quotes
      const strippedArgs = args.map(stripOuterQuotes);
      const stdio: ("pipe" | "ignore")[] = ["pipe", "pipe", "pipe"];
      const p = spawn(exe, strippedArgs, {
        cwd: opts.cwd,
        stdio,
        signal: opts.abortSignal,
      });
      procs.push(p);
      if (j > 0) {
        // connect previous stdout to this stdin
        const prev = procs[j - 1] as ChildProcess;
        if (prev.stdout && p.stdin) {
          prev.stdout.pipe(p.stdin);
        }
      }
    }

    if (procs.length === 0) {
      overallCode = 0;
      continue;
    }

    const firstProc = procs[0];
    const lastProc = procs[procs.length - 1];
    if (!firstProc || !lastProc) {
      killAll(procs);
      overallCode = 1;
      continue;
    }

    // Handle input redirection on first
    const firstCmd = pipe.commands[0] as CommandNode;
    if (firstCmd.redirs.stdinFile) {
      const inPath = path.resolve(opts.cwd, firstCmd.redirs.stdinFile);
      const rs = fs.createReadStream(inPath);
      if (firstProc.stdin) {
        rs.pipe(firstProc.stdin);
      }
    }

    // Handle output redirection on last
    const lastCmd = pipe.commands[pipe.commands.length - 1] as CommandNode;
    let outWriter: fs.WriteStream | null = null;
    let errWriter: fs.WriteStream | null = null;
    if (lastCmd.redirs.stdoutFile) {
      const mode = lastCmd.redirs.stdoutFile.append ? "a" : "w";
      const outPath = path.resolve(opts.cwd, lastCmd.redirs.stdoutFile.path);
      outWriter = fs.createWriteStream(outPath, { flags: mode });
      if (lastProc.stdout) {
        lastProc.stdout.pipe(outWriter);
      }
    }
    if (lastCmd.redirs.stderrFile) {
      const mode = lastCmd.redirs.stderrFile.append ? "a" : "w";
      const errPath = path.resolve(opts.cwd, lastCmd.redirs.stderrFile.path);
      errWriter = fs.createWriteStream(errPath, { flags: mode });
      if (lastProc.stderr) {
        lastProc.stderr.pipe(errWriter);
      }
    }

    // Merge stderr to stdout if requested
    const mergeToStdout = lastCmd.redirs.mergeStderrToStdout === true;

    // Capture outputs with size limits
    const cleanup: Array<() => void> = [];
    await new Promise<void>((resolve, _reject) => {
      const abortHandler = () => {
        killAll(procs);
        clearTimeout(timeout);
        resolve();
      };
      opts.abortSignal?.addEventListener("abort", abortHandler);

      const timeout = setTimeout(
        () => {
          timedOut = true;
          killAll(procs);
          resolve();
        },
        Math.max(1, opts.timeoutMs - (Date.now() - startTime)),
      );
      cleanup.push(() => {
        clearTimeout(timeout);
        opts.abortSignal?.removeEventListener("abort", abortHandler);
      });

      const onStdout = (chunk: Buffer) => {
        if (!outWriter) {
          const chunkStr = chunk.toString("utf8");
          const remaining = opts.maxOutputBytes - stdoutAcc.length;
          if (remaining > 0) {
            stdoutAcc += chunkStr.substring(0, remaining);
          }
        }
      };
      const onStderr = (chunk: Buffer) => {
        const chunkStr = chunk.toString("utf8");
        if (mergeToStdout && !outWriter) {
          const remaining = opts.maxOutputBytes - stdoutAcc.length;
          if (remaining > 0) {
            stdoutAcc += chunkStr.substring(0, remaining);
          }
        } else if (!errWriter) {
          const remaining = opts.maxOutputBytes - stderrAcc.length;
          if (remaining > 0) {
            stderrAcc += chunkStr.substring(0, remaining);
          }
        }
      };

      lastProc.stdout?.on("data", onStdout);
      lastProc.stderr?.on("data", onStderr);

      const onExit = () => {
        // Wait for all children to exit
        let remaining = procs.length;
        for (const p of procs) {
          p.once("exit", () => {
            remaining -= 1;
            if (remaining === 0) {
              for (const fn of cleanup) {
                fn();
              }
              resolve();
            }
          });
        }
      };

      // If any process errors, kill all
      for (const p of procs) {
        p.once("error", () => {
          killAll(procs);
        });
      }

      // Close stdin for first if not piped
      if (!firstCmd.redirs.stdinFile && procs.length === 1) {
        firstProc.stdin?.end();
      }

      onExit();
    });

    for (const fn of cleanup) fn();

    if (timedOut) {
      return {
        stdout: stdoutAcc,
        stderr: stderrAcc,
        code: 124,
        signal: "SIGTERM",
      };
    }

    // Determine exit code from last process
    const lastExitCode = await new Promise<number>((resolve) => {
      if (typeof lastProc.exitCode === "number")
        return resolve(lastProc.exitCode);
      lastProc.once("exit", (code) =>
        resolve(typeof code === "number" ? code : 1),
      );
    });

    overallCode = lastExitCode;
  }

  return { stdout: stdoutAcc, stderr: stderrAcc, code: overallCode };
}
