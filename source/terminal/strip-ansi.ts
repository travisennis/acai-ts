// Pre-compile the regex outside the function to avoid recreation on every call
const ANSI_REGEX = (() => {
  const St = "(?:\u0007|\u001B\u005C|\u009C)";
  // biome-ignore lint/suspicious/noUselessEscapeInString: later
  const osc = `(?:\u001B\][\\s\\S]*?${St})`;
  const csi =
    "[\u001B\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]";
  return new RegExp(`${osc}|${csi}`, "g");
})();

export default function stripAnsi(string: string): string {
  if (typeof string !== "string") {
    throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
  }
  return string.replace(ANSI_REGEX, "");
}
