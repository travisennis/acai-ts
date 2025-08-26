export class CommandValidation {
  private readonly allowedCommands: string[];
  private readonly dangerousPatterns: RegExp[];

  constructor(allowedCommands: string[]) {
    this.allowedCommands = allowedCommands;
    // Only block truly dangerous patterns, not useful shell operations
    this.dangerousPatterns = [
      /`/, // backticks (command substitution)
      /\$\(/, // $() command substitution
      /&&\s*rm\s+-rf/, // dangerous rm chains
      /;\s*rm\s+-rf/, // dangerous rm chains
    ];
  }

  private isCommandAllowed(command: string): boolean {
    const baseCommand = command.split(" ")[0] || "";
    return this.allowedCommands.includes(baseCommand);
  }

  private hasDangerousPatterns(command: string): boolean {
    // Remove all quoted segments first
    const stripped = command
      .replace(/'([^'\\]|\\.)*'/g, "")
      .replace(/"([^"\\]|\\.)*"/g, "");

    // Check for dangerous patterns only in unquoted portions
    return this.dangerousPatterns.some((re) => re.test(stripped));
  }

  isValid(command: string): { isValid: boolean; error?: string } {
    if (!command.trim()) {
      return { isValid: false, error: "Command cannot be empty" };
    }

    // First check for dangerous patterns
    if (this.hasDangerousPatterns(command)) {
      return {
        isValid: false,
        error:
          "Command contains dangerous patterns (command substitution or unsafe rm chains)",
      };
    }

    // Process command while preserving quoted strings to extract sub-commands
    const subCommands: string[] = [];
    let currentSegment = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      // Handle quote states
      if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
      if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;

      // Split on command separators only when not in quotes
      // Note: We allow pipes (|) and redirects (>, <) but split on command separators
      if (!inSingleQuote && !inDoubleQuote && (char === "&" || char === ";")) {
        if (currentSegment.trim()) {
          subCommands.push(currentSegment.trim());
          currentSegment = "";
        }
        // Skip the operator and any subsequent same operators (like &&)
        while (
          i + 1 < command.length &&
          ["&", ";"].includes(command[i + 1] ?? "")
        ) {
          i++;
        }
      } else {
        currentSegment += char;
      }
    }

    // Add the last segment
    if (currentSegment.trim()) {
      subCommands.push(currentSegment.trim());
    }

    // Validate all sub-commands (but be smart about pipes)
    for (const subCmd of subCommands) {
      // For piped commands, validate each part of the pipe
      const pipeParts = this.splitOnPipes(subCmd);
      for (const part of pipeParts) {
        const trimmedPart = part.trim();
        if (trimmedPart && !this.isCommandAllowed(trimmedPart)) {
          const baseCmd = trimmedPart.split(" ")[0] || "";
          return {
            isValid: false,
            error: `Command '${baseCmd}' is not allowed. Allowed commands: ${this.allowedCommands.join(", ")}`,
          };
        }
      }
    }

    return { isValid: true };
  }

  private splitOnPipes(command: string): string[] {
    const parts: string[] = [];
    let current = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
      if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;

      if (char === "|" && !inSingleQuote && !inDoubleQuote) {
        if (current.trim()) {
          parts.push(current.trim());
          current = "";
        }
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }
}
