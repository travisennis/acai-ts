// Inline from sindresorhus/strip-ansi v7.1.0

const ansiRegex = ({ onlyFirst = false }: { onlyFirst?: boolean } = {}) => {
  // Valid string terminator sequences are BEL, ESC\, and 0x9c
  const St = "(?:\\\\u0007|\\\\u001B\\\\u005C|\\\\u009C)";

  // OSC sequences only: ESC ] ... ST (non-greedy until the first ST)
  const osc = `(?:\\\\u001B\\\\][\\\\s\\\\S]*?${St})`;

  // CSI and related: ESC/C1, optional intermediates, optional params (supports ; and :) then final byte
  const csi =
    "[\\\\u001B\\\\u009B][[\\\\]()#;?]*(?:\\\\d{1,4}(?:[;:]\\\\d{0,4})*)?[\\\\dA-PR-TZcf-nq-uy=&gt;~]";

  const pattern = `${osc}|${csi}`;

  return new RegExp(pattern, onlyFirst ? undefined : "g");
};

export default function stripAnsi(string: string): string {
  if (typeof string !== "string") {
    throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
  }

  // Even though the regex is global, we don't need to reset the `.lastIndex`
  // because unlike `.exec()` and `.test()`, `.replace()` does it automatically
  // and doing it manually has a performance penalty.
  return string.replace(ansiRegex(), "");
}
