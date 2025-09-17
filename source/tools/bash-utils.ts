import path from "node:path";

// Ensure path is within base directory
function isPathWithinBaseDir(requestedPath: string, baseDir: string): boolean {
  const normalizedRequestedPath = path.normalize(requestedPath);
  const normalizedBaseDir = path.normalize(baseDir);
  return normalizedRequestedPath.startsWith(normalizedBaseDir);
}

// Validate path arguments to ensure they're within the project
export function validatePaths(
  command: string,
  baseDir: string,
  cwd: string,
): { isValid: boolean; error?: string } {
  // Simple tokenization - split on spaces but respect quotes
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
      current += char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = "";
      current += char;
    } else if (char === " " && !inQuotes) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);

  // Check each token that looks like a path
  for (let i = 1; i < tokens.length; i++) {
    // Skip the command itself
    const token = tokens[i];
    if (!token) continue;

    // Remove quotes for path checking
    const cleanToken = token.replace(/^['"]|['"]$/g, "");

    // Skip if it's clearly not a path
    if (
      cleanToken.startsWith("-") ||
      cleanToken.includes("://") ||
      !cleanToken.includes("/")
    ) {
      continue;
    }

    // Skip git commit messages and other special cases
    const prevToken = tokens[i - 1]?.replace(/^['"]|['"]$/g, "");
    if (prevToken === "-m" || prevToken === "--message") {
      continue;
    }

    try {
      const resolvedPath = path.resolve(cwd, cleanToken);
      if (!isPathWithinBaseDir(resolvedPath, baseDir)) {
        return {
          isValid: false,
          error: `Path '${cleanToken}' resolves outside the project directory (${resolvedPath}). All paths must be within ${baseDir}`,
        };
      }
    } catch (_e) {}
  }

  return { isValid: true };
}
