export class CommandValidation {
  private readonly allowedCommands: string[];
  private readonly dangerousPatterns: RegExp[];

  constructor(allowedCommands: string[]) {
    this.allowedCommands = allowedCommands;
    // Block shell operators and substitutions outright
    this.dangerousPatterns = [
      /`/, // backticks (command substitution)
      /\$\(/, // $() command substitution
      /\|/, // pipes
      />|>>|<|<</, // redirects
      /;|&&|\|\||&/, // chaining and backgrounding
      /[\r\n]/, // newlines
    ];
  }

  private isCommandAllowed(command: string): boolean {
    const baseCommand = command.split(" ")[0] || "";
    return this.allowedCommands.includes(baseCommand);
  }

  private hasDangerousPatterns(command: string): boolean {
    // Do not strip quotes; reject if any dangerous pattern appears anywhere
    return this.dangerousPatterns.some((re) => re.test(command));
  }

  isValid(command: string): { isValid: boolean; error?: string } {
    if (!command.trim()) {
      return { isValid: false, error: "Command cannot be empty" };
    }

    if (this.hasDangerousPatterns(command)) {
      return {
        isValid: false,
        error:
          "Pipes, redirects, command substitution, chaining, and newlines are disabled for security.",
      };
    }

    // No pipes to split now; validate the single command only
    const trimmed = command.trim();
    if (!this.isCommandAllowed(trimmed)) {
      const baseCmd = trimmed.split(" ")[0] || "";
      return {
        isValid: false,
        error: `Command '${baseCmd}' is not allowed. Allowed commands: ${this.allowedCommands.join(", ")}`,
      };
    }

    return { isValid: true };
  }
}
