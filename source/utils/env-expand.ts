const ENV_VAR_PATTERN = /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

export function expandEnvVars(
  vars: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    result[key] = value.replace(
      ENV_VAR_PATTERN,
      (_match, bracedName: string | undefined, plainName: string | undefined) =>
        process.env[bracedName ?? plainName ?? ""] ?? "",
    );
  }
  return result;
}
