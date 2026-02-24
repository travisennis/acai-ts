// '<(' is process substitution operator and
// can be parsed the same as control operator
const CONTROL = `(?:${[
  "\\|\\|",
  "\\&\\&",
  ";;",
  "\\|\\&",
  "\\<\\(",
  "\\<\\<\\<",
  ">>",
  ">\\&",
  "<\\&",
  "[&;()|<>]",
].join("|")})`;
const controlRe = new RegExp(`^${CONTROL}$`);
const META = "|&;()<> \t";
const SINGLE_QUOTE = '"((\\\\"|[^"])*?)"';
const DOUBLE_QUOTE = "'((\\\\'|[^'])*?)'";
const hash = /^#$/;

const SQ = "'";
const DQ = '"';
const DS = "$";

let Token = "";
const mult = 0x100000000; // Math.pow(16, 8);
for (let i = 0; i < 4; i++) {
  Token += (mult * Math.random()).toString(16);
}
const startsWithToken = new RegExp(`^${Token}`);

interface ControlOperator {
  op:
    | "||"
    | "&&"
    | ";;"
    | "|&"
    | "<("
    | "<<<"
    | ">>"
    | ">&"
    | "&"
    | ";"
    | "("
    | ")"
    | "|"
    | "<"
    | ">";
}

interface GlobOperator {
  op: "glob";
  pattern: string;
}

interface CommentOperator {
  comment: string;
}

type ParseEntry = string | ControlOperator | GlobOperator | CommentOperator;

interface ParseOptions {
  escape?: string;
}

type EnvFunction = (key: string) => unknown;

function matchAll(s: string, r: RegExp): RegExpExecArray[] {
  const origIndex = r.lastIndex;

  const matches: RegExpExecArray[] = [];
  let matchObj: RegExpExecArray | null = r.exec(s);

  while (matchObj !== null) {
    matches.push(matchObj);
    if (r.lastIndex === matchObj.index) {
      r.lastIndex += 1;
    }
    matchObj = r.exec(s);
  }

  r.lastIndex = origIndex;

  return matches;
}

function getVar(
  env: Record<string, unknown> | EnvFunction,
  pre: string,
  key: string,
): string {
  let r: unknown = typeof env === "function" ? env(key) : env[key];
  if (typeof r === "undefined" && key !== "") {
    r = "";
  } else if (typeof r === "undefined") {
    r = "$";
  }

  if (typeof r === "object") {
    return pre + Token + JSON.stringify(r) + Token;
  }
  return pre + String(r);
}

function parseInternal(
  string: string,
  env: Record<string, unknown> | EnvFunction,
  opts: ParseOptions = {},
): ParseEntry[] {
  const Bs = opts.escape || "\\";
  const Bareword = `(\\${Bs}["'${META}]|[^\\s'""${META}])+`;

  const chunker = new RegExp(
    [
      `(${CONTROL})`, // control chars
      `(${Bareword}|${SINGLE_QUOTE}|${DOUBLE_QUOTE})+`,
    ].join("|"),
    "g",
  );

  const matches = matchAll(string, chunker);

  if (matches.length === 0) {
    return [];
  }
  const envToUse = env ?? {};

  let commented = false;

  return matches
    .map(
      // biome-ignore lint:noExcessiveCognitiveComplexity
      (match) => {
        const s = match[0];
        if (!s || commented) {
          return undefined;
        }
        if (controlRe.test(s)) {
          return { op: s as ControlOperator["op"] };
        }

        // Hand-written scanner/parser for Bash quoting rules:
        //
        // 1. inside single quotes, all characters are printed literally.
        // 2. inside double quotes, all characters are printed literally
        //    except variables prefixed by '$' and backslashes followed by
        //    either a double quote or another backslash.
        // 3. outside of any quotes, backslashes are treated as escape
        //    characters and not printed (unless they are themselves escaped)
        // 4. quote context can switch mid-token if there is no whitespace
        //     between the two quote contexts (e.g. all'one'"token" parses as
        //     "allonetoken")
        let quote: string | false = false;
        let esc = false;
        let out = "";
        let isGlob = false;
        let i = 0;

        function parseEnvVar(): string {
          i += 1;
          let varend: number;
          let varname: string;
          const char = s.charAt(i);

          if (char === "{") {
            i += 1;
            if (s.charAt(i) === "}") {
              throw new Error(`Bad substitution: ${s.slice(i - 2, i + 1)}`);
            }
            varend = s.indexOf("}", i);
            if (varend < 0) {
              throw new Error(`Bad substitution: ${s.slice(i)}`);
            }
            varname = s.slice(i, varend);
            i = varend;
          } else if (/[*@#?$!_-]/.test(char)) {
            varname = char;
            i += 1;
          } else {
            const slicedFromI = s.slice(i);
            const varendMatch = slicedFromI.match(/[^\w\d_]/);
            if (!varendMatch) {
              varname = slicedFromI;
              i = s.length;
            } else {
              varname = slicedFromI.slice(0, varendMatch.index);
              i += (varendMatch.index ?? 0) - 1;
            }
          }
          return getVar(envToUse, "", varname);
        }

        for (i = 0; i < s.length; i++) {
          const c = s.charAt(i);
          isGlob = isGlob || (!quote && (c === "*" || c === "?"));
          if (esc) {
            out += c;
            esc = false;
          } else if (quote) {
            if (c === quote) {
              quote = false;
            } else if (quote === SQ) {
              out += c;
            } else {
              // Double quote
              if (c === Bs) {
                i += 1;
                const charAtI = s.charAt(i);
                if (charAtI === DQ || charAtI === Bs || charAtI === DS) {
                  out += charAtI;
                } else {
                  out += Bs + charAtI;
                }
              } else if (c === DS) {
                out += parseEnvVar();
              } else {
                out += c;
              }
            }
          } else if (c === DQ || c === SQ) {
            quote = c;
          } else if (controlRe.test(c)) {
            return { op: s as ControlOperator["op"] };
          } else if (hash.test(c)) {
            commented = true;
            const matchIndex = match.index;
            const commentObj: CommentOperator = {
              comment: string.slice((matchIndex ?? 0) + i + 1),
            };
            if (out.length) {
              return [out, commentObj];
            }
            return [commentObj];
          } else if (c === Bs) {
            esc = true;
          } else if (c === DS) {
            out += parseEnvVar();
          } else {
            out += c;
          }
        }

        if (isGlob) {
          return { op: "glob" as const, pattern: out };
        }

        return out;
      },
    )
    .reduce<ParseEntry[]>((prev, arg) => {
      // TODO: replace this whole reduce with a concat
      return typeof arg === "undefined" ? prev : prev.concat(arg as ParseEntry);
    }, []);
}

export function parse(
  s: string,
  env?: Record<string, string | undefined> | EnvFunction,
  opts?: ParseOptions,
): ParseEntry[];
export function parse<T extends object | string>(
  s: string,
  env: (key: string) => T | undefined,
  opts?: ParseOptions,
): (ParseEntry | T)[];
export function parse<T>(
  s: string,
  env: Record<string, unknown> | ((key: string) => T | undefined) = {},
  opts?: ParseOptions,
): ParseEntry[] | (ParseEntry | T)[] {
  const mapped = parseInternal(
    s,
    env as Record<string, unknown> | EnvFunction,
    opts,
  );
  if (typeof env !== "function") {
    return mapped;
  }
  return mapped.reduce<ParseEntry[]>((acc, s) => {
    if (typeof s === "object") {
      return acc.concat(s as ParseEntry);
    }
    const xs = s.split(RegExp(`(${Token}.*?${Token})`, "g"));
    if (xs.length === 1) {
      return acc.concat(xs[0] as ParseEntry);
    }
    return acc.concat(
      xs.filter(Boolean).map((x) => {
        if (startsWithToken.test(x)) {
          const parts = x.split(Token);
          return JSON.parse(parts[1]);
        }
        return x;
      }),
    );
  }, []);
}
