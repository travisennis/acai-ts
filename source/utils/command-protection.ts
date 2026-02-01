/**
 * Command Protection Module
 * Detects and blocks destructive commands that could cause data loss
 */

export interface BlockedCommandResult {
  blocked: true;
  reason: string;
  command: string;
  tip: string;
}

export interface SafeCommandResult {
  blocked: false;
}

/**
 * Result type for command safety check
 */
export type CommandSafetyResult = BlockedCommandResult | SafeCommandResult;

/**
 * Detects if a command is destructive and should be blocked
 * @param command - The full command string to check
 * @returns BlockedCommandResult if destructive, SafeCommandResult if safe
 */
export function detectDestructiveCommand(command: string): CommandSafetyResult {
  const trimmed = command.trim();

  // Check for dangerous inline scripts first (bash -c, python -c, etc.)
  const inlineScriptResult = detectDangerousInlineScripts(trimmed);
  if (inlineScriptResult.blocked) {
    return inlineScriptResult;
  }

  // Check for dangerous heredocs
  const heredocResult = detectDangerousHeredocs(trimmed);
  if (heredocResult.blocked) {
    return heredocResult;
  }

  // Check for destructive git commands
  const gitResult = detectDestructiveGitCommands(trimmed);
  if (gitResult.blocked) {
    return gitResult;
  }

  // Check for dangerous rm -rf commands
  const rmResult = detectDangerousRmRf(trimmed);
  if (rmResult.blocked) {
    return rmResult;
  }

  return { blocked: false };
}

/**
 * Detect destructive git commands
 */
function detectDestructiveGitCommands(command: string): CommandSafetyResult {
  const lowerCommand = command.toLowerCase();

  // Block git reset --hard and --merge
  if (
    lowerCommand.includes("git reset --hard") ||
    lowerCommand.includes("git reset --merge")
  ) {
    return {
      blocked: true,
      reason: "git reset --hard or --merge destroys uncommitted changes",
      command,
      tip: "Consider using 'git stash' first to save your changes, or use 'git reset --soft' to preserve changes.",
    };
  }

  // Block git checkout -- <file> (discarding local changes)
  if (lowerCommand.match(/git\s+checkout\s+--\s+\S+/)) {
    return {
      blocked: true,
      reason: "git checkout -- <file> discards uncommitted file changes",
      command,
      tip: "Use 'git restore --staged <file>' to unstage changes, or 'git stash' to save changes temporarily.",
    };
  }

  // Block git restore without --staged (discards uncommitted changes)
  if (
    lowerCommand.startsWith("git restore") &&
    !lowerCommand.includes(" --staged")
  ) {
    // Check if it's restoring files (not branches)
    const afterRestore = lowerCommand.substring("git restore".length).trim();
    if (afterRestore && !afterRestore.startsWith("-b")) {
      return {
        blocked: true,
        reason:
          "git restore <file> (without --staged) discards uncommitted changes",
        command,
        tip: "Use 'git restore --staged <file>' to only unstage, or 'git stash' to save changes.",
      };
    }
  }

  // Block git clean -f (force deletes untracked files)
  if (
    lowerCommand.includes("git clean -f") ||
    lowerCommand.includes("git clean --force")
  ) {
    return {
      blocked: true,
      reason: "git clean -f permanently deletes untracked files",
      command,
      tip: "Use 'git clean -n' to preview what would be deleted, or 'git clean -f -d' to only delete untracked directories.",
    };
  }

  // Block force push (but allow --force-with-lease which is safer)
  if (
    (lowerCommand.includes("git push --force") &&
      !lowerCommand.includes("--force-with-lease")) ||
    lowerCommand.match(/git\s+push\s+-f\b/)
  ) {
    return {
      blocked: true,
      reason: "git push --force overwrites remote commit history",
      command,
      tip: "Use 'git push --force-with-lease' for safer force pushes, or prefer creating a new branch instead.",
    };
  }

  // Block git branch -D (force delete without merge check)
  if (lowerCommand.match(/git\s+branch\s+-[a-z]/)) {
    // Check if it's an uppercase letter (force delete)
    const match = lowerCommand.match(/git\s+branch\s+-[a-z]/);
    if (match && match[0].slice(-1) !== match[0].slice(-1).toLowerCase()) {
      // It's uppercase, block it
    } else if (match) {
      const upperMatch = command.match(/git\s+branch\s+-[A-Z]/);
      if (upperMatch) {
        return {
          blocked: true,
          reason:
            "git branch -D force-deletes branches without checking if they're merged",
          command,
          tip: "Use 'git branch -d' (lowercase) to safely delete branches that are merged.",
        };
      }
    }
  }

  // Block git stash drop and git stash clear
  if (
    lowerCommand.includes("git stash drop") ||
    lowerCommand.includes("git stash clear")
  ) {
    return {
      blocked: true,
      reason: "git stash drop/clear permanently deletes stashed changes",
      command,
      tip: "Use 'git stash list' to see stashes, or 'git stash pop' to apply and remove a stash.",
    };
  }

  return { blocked: false };
}

/**
 * Detect dangerous rm -rf commands outside of temporary directories
 */
function detectDangerousRmRf(command: string): CommandSafetyResult {
  // Check for rm -rf pattern (case insensitive)
  const rmMatch = command.match(/rm\s+-rf\s+/i);
  if (!rmMatch || rmMatch.index === undefined) {
    return { blocked: false };
  }

  // Extract the path argument
  const matchIndex = rmMatch.index + rmMatch[0].length;
  const afterRmRf = command.substring(matchIndex).trim();

  // If no path specified, don't block (will fail naturally)
  if (!afterRmRf) {
    return { blocked: false };
  }

  // Get temporary directory paths
  const tempDirs = ["/tmp", "/var/tmp", process.env["TMPDIR"] || "/tmp"];

  // Check if the path is explicitly targeting only temp directories
  // This handles: rm -rf /tmp/*, rm -rf /var/tmp/*, rm -rf $TMPDIR/*, and any subpaths
  const isTempDirectoryOnly = tempDirs.some((tempDir) => {
    // Check if path starts with temp directory (e.g., /tmp/foo, /tmp/*)
    if (afterRmRf === tempDir || afterRmRf.startsWith(`${tempDir}/`)) {
      return true;
    }
    return false;
  });

  // Also check for $TMPDIR/* pattern (literal strings)
  // Using string concatenation to avoid lint warnings about template-like strings
  const tmpDirVar = "$" + "TMPDIR";
  const tmpDirVarBraces = "$" + "{TMPDIR}";
  if (
    afterRmRf === tmpDirVar ||
    afterRmRf.startsWith(`${tmpDirVar}/`) ||
    afterRmRf === tmpDirVarBraces ||
    afterRmRf.startsWith(`${tmpDirVarBraces}/`)
  ) {
    return { blocked: false };
  }

  if (isTempDirectoryOnly) {
    return { blocked: false };
  }

  // Block any other rm -rf
  return {
    blocked: true,
    reason:
      "rm -rf outside of temporary directories can cause permanent data loss",
    command,
    tip: "Only rm -rf is allowed for /tmp/*, /var/tmp/*, or $TMPDIR/* to clean temporary files.",
  };
}

/**
 * Detect dangerous patterns in inline scripts (-c flags)
 */
function detectDangerousInlineScripts(command: string): CommandSafetyResult {
  // Check for common inline script patterns and scan the content after -c for destructive commands
  const languagePatterns = [
    { pattern: /\bbash\s+-c\s+\S+/i, language: "bash" },
    { pattern: /\bsh\s+-c\s+\S+/i, language: "sh" },
    { pattern: /\bpython\d?\s+-c\s+\S+/i, language: "Python" },
    { pattern: /\bnode\s+-e\s+\S+/i, language: "Node.js" },
    { pattern: /\bnpx\s+-c\s+\S+/i, language: "npx" },
    { pattern: /\bruby\s+-e\s+\S+/i, language: "Ruby" },
    { pattern: /\bperl\s+-e\s+\S+/i, language: "Perl" },
  ];

  for (const { pattern, language } of languagePatterns) {
    if (pattern.test(command)) {
      // Found an inline script, scan the command for destructive patterns
      // Look for patterns after -c flag, handling nested quotes
      const destructivePatterns = [
        /git\s+reset\s+--hard/i,
        /git\s+reset\s+--merge/i,
        /git\s+clean\s+-f/i,
        /git\s+checkout\s+--\s+\S+/i,
        /git\s+push\s+(-f|--force)/i,
        /git\s+branch\s+-[A-Z]/i,
        /git\s+stash\s+(drop|clear)/i,
        /rm\s+-rf\s+\/home/i,
        /rm\s+-rf\s+\/usr/i,
        /rm\s+-rf\s+~/i,
      ];

      // Check if any destructive pattern is present in the command
      for (const destructivePattern of destructivePatterns) {
        if (destructivePattern.test(command)) {
          return {
            blocked: true,
            reason: `Inline ${language} script contains destructive operation`,
            command,
            tip: "Review the script content for destructive commands.",
          };
        }
      }
    }
  }

  return { blocked: false };
}

/**
 * Detect dangerous patterns in heredocs and here-strings
 */
function detectDangerousHeredocs(command: string): CommandSafetyResult {
  // Match heredoc patterns: <<EOF ... EOF
  const heredocPattern = /<<-?\s*['"]?(\w+)['"]?\s*([\s\S]*?)\n\1\b/gi;
  let match: RegExpExecArray | null = null;

  match = heredocPattern.exec(command);
  while (match !== null) {
    const heredocContent = match[2];
    const heredocResult = detectDangerousScriptContent(heredocContent);
    if (heredocResult.blocked) {
      return {
        blocked: true,
        reason: "Heredoc contains destructive operation",
        command,
        tip:
          heredocResult.tip ||
          "Review the heredoc content for destructive commands.",
      };
    }
    match = heredocPattern.exec(command);
  }

  // Match here-string patterns (<<<)
  const hereStringPattern = /<<<\s*(['"])([^"']+)\1/gi;
  match = null;

  match = hereStringPattern.exec(command);
  while (match !== null) {
    const stringContent = match[2];
    const stringResult = detectDangerousScriptContent(stringContent);
    if (stringResult.blocked) {
      return {
        blocked: true,
        reason: "Here-string contains destructive operation",
        command,
        tip:
          stringResult.tip ||
          "Review the here-string content for destructive commands.",
      };
    }
    match = hereStringPattern.exec(command);
  }

  return { blocked: false };
}

/**
 * Check script content for dangerous patterns
 */
function detectDangerousScriptContent(content: string): {
  blocked: boolean;
  tip?: string;
} {
  const lowerContent = content.toLowerCase();

  // Check for destructive git commands within scripts
  const dangerousGitPatterns = [
    /\bgit\s+reset\s+(--hard|--merge|--keep)\b/i,
    /\bgit\s+clean\s+-f\b/i,
    /\bgit\s+checkout\s+--\s+\S+/i,
    /\bgit\s+restore\s+(?!--staged)\s+\S+/i,
    /\bgit\s+push\s+(-f|--force)\b/i,
    /\bgit\s+branch\s+-[D]\b/i,
    /\bgit\s+stash\s+(drop|clear)\b/i,
  ];

  for (const pattern of dangerousGitPatterns) {
    if (pattern.test(lowerContent)) {
      return {
        blocked: true,
        tip: "The script contains a destructive git command. Review the script content.",
      };
    }
  }

  // Check for dangerous rm -rf patterns (more permissive for scripts, block obvious dangers)
  const dangerousRmPatterns = [
    /\brm\s+-rf\s+\/[^\s*]*[a-z]/i, // rm -rf /something (but allow /tmp/* patterns)
    /\brm\s+-rf\s+\/home/i,
    /\brm\s+-rf\s+\/usr/i,
    /\brm\s+-rf\s+\/etc/i,
    /\brm\s+-rf\s+\/var\s*$/i, // Block /var alone but allow /var/tmp
    /\brm\s+-rf\s+~(?!\/)/i, // rm -rf ~ but allow ~/tmp
  ];

  for (const pattern of dangerousRmPatterns) {
    if (pattern.test(content)) {
      return {
        blocked: true,
        tip: "The script contains a dangerous rm -rf command.",
      };
    }
  }

  // Check for format string attacks and other dangerous patterns
  const dangerousPatterns = [
    /\brm\s+-rf\s+\$\w+/i, // rm -rf $VAR (variable expansion could be dangerous)
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      return {
        blocked: true,
        tip: "The script contains a potentially dangerous rm command with variable expansion.",
      };
    }
  }

  return { blocked: false };
}

/**
 * Generate a user-friendly blocked command message
 */
export function formatBlockedCommandMessage(
  result: BlockedCommandResult,
): string {
  return `BLOCKED

Reason: ${result.reason}

Command: ${result.command}

Tip: ${result.tip}`;
}
