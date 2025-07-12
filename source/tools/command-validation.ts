export class CommandValidation {
  private readonly allowedCommands: string[];
  private readonly unsafeOperatorPatterns: RegExp[];

  constructor(allowedCommands: string[]) {
    this.allowedCommands = allowedCommands;
    this.unsafeOperatorPatterns = [
      /`/, // backticks
      /\$\(/, // $(
      />/, // redirect out
      /</, // redirect in
    ];
  }

  private isCommandAllowed(command: string): boolean {
    const baseCommand = command.split(" ")[0] || "";
    return this.allowedCommands.includes(baseCommand);
  }

  private hasUnsafeOperators(command: string): boolean {
    // Remove all quoted segments first
    const stripped = command
      .replace(/'([^'\\]|\\.)*'/g, "")
      .replace(/"([^"\\]|\\.)*"/g, "");

    // Check for unsafe operators only in unquoted portions
    return this.unsafeOperatorPatterns.some((re) => re.test(stripped));
  }

  isValid(command: string): boolean {
    if (!command.trim()) return false;

    // First check for unsafe operators in unquoted portions
    if (this.hasUnsafeOperators(command)) {
      return false;
    }

    // Process command while preserving quoted strings
    const subCommands: string[] = [];
    let currentSegment = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      // Handle quote states
      if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
      if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;

      // Split on operators only when not in quotes
      if (
        !inSingleQuote &&
        !inDoubleQuote &&
        (char === "&" || char === "|" || char === ";")
      ) {
        if (currentSegment.trim()) {
          subCommands.push(currentSegment.trim());
          currentSegment = "";
        }
        // Skip the operator and any subsequent same operators (like && or ||)
        while (
          i + 1 < command.length &&
          ["&", "|", ";"].includes(command[i + 1] ?? "")
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

    // Validate all sub-commands
    return subCommands.every((cmd) => this.isCommandAllowed(cmd));
  }
}
