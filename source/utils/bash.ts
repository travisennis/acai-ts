import fs, { type Stats } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isPathWithinAllowedDirs } from "./filesystem/security.ts";

// Tokenize shell command respecting quotes and escapes
function tokenizeShellWords(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let mode: "normal" | "single" | "double" = "normal";

  for (let i = 0; i < command.length; i++) {
    const char = command[i] ?? "";

    if (mode === "normal") {
      if (/\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = "";
        }
        continue;
      }
      if (char === "'") {
        mode = "single";
        current += char;
        continue;
      }
      if (char === '"') {
        mode = "double";
        current += char;
        continue;
      }
      if (char === "\\") {
        const next = command[i + 1];
        if (next !== undefined) {
          current += char + next;
          i++;
          continue;
        }
      }
      current += char;
      continue;
    }

    if (mode === "single") {
      current += char;
      if (char === "'") mode = "normal";
      continue;
    }

    // double quote mode
    current += char;
    if (char === "\\") {
      const next = command[i + 1];
      if (next !== undefined) {
        current += next;
        i++;
      }
      continue;
    }
    if (char === '"') mode = "normal";
  }

  if (current) tokens.push(current);
  return tokens;
}

// Strip surrounding quotes from a token
function stripQuotes(token: string): string {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

// Check if a token is fully quoted (content should not be path-validated)
function isFullyQuoted(token: string): boolean {
  if (token.length < 2) return false;
  const first = token[0];
  const last = token[token.length - 1];
  return (first === '"' && last === '"') || (first === "'" && last === "'");
}

// Compute which tokens should be skipped from path validation
function computeSkipTokenMask(tokens: string[]): boolean[] {
  const skip = new Array(tokens.length).fill(false) as boolean[];

  const bin = stripQuotes(tokens[0] ?? "");
  const sub = stripQuotes(tokens[1] ?? "");

  // Commands where -m/--message is a string argument (not a path)
  const gitMessageSubs = new Set(["commit", "merge", "tag", "revert", "notes"]);

  if (bin === "git" && gitMessageSubs.has(sub)) {
    let seenDoubleDash = false;
    for (let i = 2; i < tokens.length; i++) {
      const t = stripQuotes(tokens[i] ?? "");
      if (t === "--") {
        seenDoubleDash = true;
        continue;
      }
      if (seenDoubleDash) continue;

      // --message=<msg> - skip this entire token
      if (t.startsWith("--message=")) {
        skip[i] = true;
        continue;
      }

      // -m<msg> (attached message) - skip this entire token
      if (/^-m.+/.test(t)) {
        skip[i] = true;
        continue;
      }

      // -m or --message consumes next token
      if (t === "-m" || t === "--message") {
        if (i + 1 < tokens.length) skip[i + 1] = true;
        continue;
      }

      // Combined short opts containing m, e.g. -am, -avm
      if (/^-[^-]+$/.test(t) && t.includes("m")) {
        if (i + 1 < tokens.length) skip[i + 1] = true;
      }
    }
  }

  return skip;
}

// Validate path arguments to ensure they're within the project
export function validatePaths(
  command: string,
  allowedDirs: string[],
  cwd: string,
): { isValid: boolean; error?: string } {
  const tokens = tokenizeShellWords(command);
  const skip = computeSkipTokenMask(tokens);

  // Check each token that looks like a path
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    // Skip tokens marked by command-aware logic
    if (skip[i]) continue;

    // Skip fully quoted tokens - they're string arguments, not paths
    // (paths are typically unquoted or only quoted to handle spaces)
    if (isFullyQuoted(token) && token.includes("\n")) {
      continue;
    }

    // Remove quotes for path checking
    const cleanToken = stripQuotes(token);

    // Skip if it's clearly not a path
    if (
      cleanToken.startsWith("-") ||
      cleanToken.includes("://") ||
      (!cleanToken.includes("/") && cleanToken !== "~")
    ) {
      continue;
    }

    try {
      // Expand ~ to home directory for proper validation
      const expandedToken =
        cleanToken.startsWith("~/") || cleanToken === "~"
          ? path.join(os.homedir(), cleanToken.slice(1))
          : cleanToken;

      const resolvedPath = path.resolve(cwd, expandedToken);

      if (!isPathWithinAllowedDirs(resolvedPath, allowedDirs)) {
        return {
          isValid: false,
          error: `Path '${cleanToken}' resolves outside the allowed directories (${resolvedPath}). All paths must be within ${allowedDirs.join(", ")}`,
        };
      }
    } catch (_e) {}
  }

  return { isValid: true };
}

export const resolveCwd = (
  cwdInput: string | null | undefined,
  workingDir: string,
  allowedDirs?: string[],
): string => {
  // Determine which directory to use as the base for resolving relative paths
  // If allowedDirs is provided and non-empty, use the first allowed directory
  // Otherwise use the workingDir parameter (backward compatibility)
  const baseDirForResolution =
    allowedDirs && allowedDirs.length > 0 ? allowedDirs[0] : workingDir;

  const projectRootAbs = path.resolve(baseDirForResolution);
  let projectRoot = projectRootAbs;
  try {
    projectRoot = fs.realpathSync(projectRootAbs);
  } catch {
    // Fallback to resolved path
  }

  const raw =
    typeof cwdInput === "string" && cwdInput.trim() !== ""
      ? cwdInput.trim()
      : projectRoot;

  const abs = path.isAbsolute(raw) ? raw : path.resolve(projectRoot, raw);

  let target = abs;
  try {
    target = fs.realpathSync(abs);
  } catch {
    // If the path doesn't exist entirely, validate intended path
  }

  // Check if within allowed directories if provided, otherwise check project root
  if (allowedDirs && allowedDirs.length > 0) {
    if (!isPathWithinAllowedDirs(target, allowedDirs)) {
      throw new Error(
        `Working directory must be within the allowed directories: ${allowedDirs.join(", ")}. Received: ${cwdInput ?? "<default>"} -> ${target}`,
      );
    }
  } else {
    // Fallback to original behavior: check within project root
    const rel = path.relative(projectRoot, target);
    const inside =
      rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    if (!inside) {
      throw new Error(
        `Working directory must be within the project directory: ${projectRoot}. Received: ${cwdInput ?? "<default>"} -> ${target}`,
      );
    }
  }

  // Check existence and that it's a directory
  let stats: Stats;
  try {
    stats = fs.statSync(target);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      throw new Error(
        `Working directory does not exist: ${target} (from ${cwdInput ?? "<default>"})`,
      );
    }
    throw error;
  }
  if (!stats.isDirectory()) {
    throw new Error(`Working directory is not a directory: ${target}`);
  }

  return target;
};

export const isMutatingCommand = (rawCommand: string): boolean => {
  const command = rawCommand.trim();

  // Redirections that write to disk
  if (/>|>>/.test(command)) {
    return true;
  }

  // Normalize whitespace and split into simple segments (does not fully parse shell)
  const segments = command
    .split(/\s*(?:&&|\|\||;|\|)\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const mutatingBinaries = new Set([
    "rm",
    "mv",
    "cp",
    "mkdir",
    "rmdir",
    "touch",
    "chmod",
    "chown",
    "ln",
    "truncate",
    "dd",
    "tee",
  ]);

  const npmMutating = new Set([
    "install",
    "uninstall",
    "update",
    "ci",
    "publish",
    "link",
    "dedupe",
    "prune",
    "rebuild",
    "add",
  ]);

  const gitMutating = new Set([
    "add",
    "am",
    "apply",
    "branch",
    "checkout",
    "switch",
    "cherry-pick",
    "clean",
    "commit",
    "merge",
    "mv",
    "pull",
    "push",
    "rebase",
    "reset",
    "revert",
    "stash",
    "tag",
    "worktree",
    "submodule",
    "config",
  ]);

  // Generic action words that should be considered mutating when present in the command
  const actionMutating = new Set(["create", "update", "upgrade", "install"]);

  for (const seg of segments) {
    const tokens = seg.split(/\s+/);
    if (tokens.length === 0) continue;
    const bin = tokens[0];
    if (!bin) continue;

    // If any token is an action-like mutating word, consider mutating
    if (tokens.some((t) => actionMutating.has(t))) {
      return true;
    }

    // sed -i is mutating
    if (bin === "sed") {
      if (tokens.some((t) => /^-i/.test(t))) {
        return true;
      }
      // sed without -i is not mutating
    }

    if (mutatingBinaries.has(bin)) {
      return true;
    }

    if (bin === "git" && tokens.length > 1) {
      const sub = tokens[1];
      if (typeof sub === "string" && gitMutating.has(sub)) {
        return true;
      }
    }

    if (bin === "npm" && tokens.length > 1) {
      const sub = tokens[1];
      if (typeof sub === "string" && npmMutating.has(sub)) {
        return true;
      }
    }

    if ((bin === "pnpm" || bin === "yarn") && tokens.length > 1) {
      const sub = tokens[1];
      if (typeof sub === "string" && npmMutating.has(sub)) {
        return true;
      }
    }
  }

  return false;
};
