export type Dedent = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => string;

const spaces = /^(\s+)\S+/;

export const dedent: Dedent = (
  strings: TemplateStringsArray,
  ...values: unknown[]
): string => {
  // Perform interpolation
  let result = "";
  for (let i = 0; i < strings.raw.length; i++) {
    const next =
      strings.raw[i] ??
      ""
        // handle escaped newlines, backticks, and interpolation characters
        .replace(/\\\n[ \t]*/g, "")
        .replace(/\\`/g, "`")
        .replace(/\\\$/g, "$")
        .replace(/\\\{/g, "{");

    result += next;

    if (i < values.length) {
      result += values[i];
    }
  }

  // Strip indentation
  const lines = result.split("\n");
  let mindent: null | number = null;

  for (const line of lines) {
    const m = line.match(spaces);
    if (m) {
      const indent = m[1]?.length ?? 0;
      mindent = mindent === null ? indent : Math.min(mindent, indent);
    }
  }

  if (mindent !== null) {
    result = lines
      .map((l) => (l[0] === " " || l[0] === "\t" ? l.slice(mindent) : l))
      .join("\n");
  }

  // Trim leading and trailing whitespace
  result = result.trim();

  // Handle escaped newlines at the end
  result = result.replace(/\\n/g, "\n");

  return result;
};
