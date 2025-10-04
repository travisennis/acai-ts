/**
 * Modern TypeScript implementation of node-ignore
 * Based on https://github.com/kaelzhang/node-ignore
 */

// A simple implementation of make-array
function makeArray<T>(subject: T | T[]): T[] {
  return Array.isArray(subject) ? subject : [subject];
}

const SPACE = " ";
const ESCAPE = "\\";
const REGEX_TEST_BLANK_LINE = /^\s+$/;
const REGEX_INVALID_TRAILING_BACKSLASH = /(?:[^\\]|^)\\$/;
const REGEX_REPLACE_LEADING_ESCAPED_EXCLAMATION = /^\\!/;
const REGEX_REPLACE_LEADING_ESCAPED_HASH = /^\\#/;
const REGEX_SPLITALL_CRLF = /\r?\n/g;

// Invalid:
// - /foo,
// - ./foo,
// - ../foo,
// - .
// - ..
// Valid:
// - .foo
const REGEX_TEST_INVALID_PATH = /^(?:\/|\.{1,2}(?:\/|$))/;

const REGEX_TEST_TRAILING_SLASH = /\/$/;

const SLASH = "/";

// Do not use ternary expression here
let TmpKeyIgnore: string | symbol = "node-ignore";
if (typeof Symbol !== "undefined") {
  TmpKeyIgnore = Symbol.for("node-ignore");
}
const KEY_IGNORE = TmpKeyIgnore;

const REGEX_REGEXP_RANGE = /([A-Za-z0-9])-([A-Za-z0-9])/g;

const RETURN_FALSE = (): false => false;

// Sanitize the range of a regular expression
// The cases are complicated, see test cases for details
const sanitizeRange = (range: string): string =>
  range.replace(REGEX_REGEXP_RANGE, (match, from: string, to: string) =>
    from.charCodeAt(0) <= to.charCodeAt(0)
      ? match
      : // Invalid range (out of order) which is ok for gitignore rules but
        //   fatal for JavaScript regular expression, so eliminate it.
        "",
  );

// See fixtures #59
const cleanRangeBackSlash = (slashes: string): string => {
  const { length } = slashes;
  return slashes.slice(0, length - (length % 2));
};

// > If the pattern ends with a slash,
// > it is removed for the purpose of the following description,
// > but it would only find a match with a directory.
// > In other words, foo/ will match a directory foo and paths underneath it,
// > but will not match a regular file or a symbolic link foo
// >  (this is consistent with the way how pathspec works in general in Git).
// '`foo/`' will not match regular file '`foo`' or symbolic link '`foo`'
// -> ignore-rules will not deal with it, because it costs extra `fs.stat` call
//      you could use option `mark: true` with `glob`

// '`foo/`' should not continue with the '`..`'
const REPLACERS: Array<[RegExp, (match: string, ...args: string[]) => string]> =
  [
    [
      // Remove BOM
      // TODO:
      // Other similar zero-width characters?
      /^\uFEFF/,
      () => "",
    ],

    // > Trailing spaces are ignored unless they are quoted with backslash ("\\")
    [
      // (a\ ) -> (a )
      // (a  ) -> (a)
      // (a ) -> (a)
      // (a \ ) -> (a  )
      /((?:\\\\)*?)(\\?\s+)$/,
      (_, m1: string, m2: string) => m1 + (m2.indexOf("\\") === 0 ? SPACE : ""),
    ],

    // Replace (\ ) with ' '
    // (\ ) -> ' '
    // (\\ ) -> '\\ '
    // (\\\ ) -> '\\ '
    [
      /(\\+?)\s/g,
      (_, m1: string) => {
        const { length } = m1;
        return m1.slice(0, length - (length % 2)) + SPACE;
      },
    ],

    // Escape metacharacters
    // which is written down by users but means special for regular expressions.

    // > There are 12 characters with special meanings:
    // > - the backslash \,
    // > - the caret ^,
    // > - the dollar sign $,
    // > - the period or dot .,
    // > - the vertical bar or pipe symbol |,
    // > - the question mark ?,
    // > - the asterisk or star *,
    // > - the plus sign +,
    // > - the opening parenthesis (,
    // > - the closing parenthesis ),
    // > - and the opening square bracket [,
    // > - the opening curly brace {,
    // > These special characters are often called "metacharacters".
    [/[\\$.|*+(){^]/g, (match: string) => `\\${match}`],

    [
      // > a question mark (?) matches a single character
      /(?!\\)\?/g,
      () => "[^/]",
    ],

    // leading slash
    [
      // > A leading slash matches the beginning of the pathname.
      // > For example, "/*.c" matches "cat-file.c" but not "mozilla-sha1/sha1.c".
      // A leading slash matches the beginning of the pathname
      /^\//,
      () => "^",
    ],

    // replace special metacharacter slash after the leading slash
    [/\//g, () => "\\/"],

    [
      // > A leading "**" followed by a slash means match in all directories.
      // > For example, "**/foo" matches file or directory "foo" anywhere,
      // > the same as pattern "foo".
      // > "**/foo/bar" matches file or directory "bar" anywhere that is directly
      // >   under directory "foo".
      // Notice that the '*'s have been replaced as '\\*'
      /^\^*\\\*\\\*\\\//,

      // '**/foo' <-> 'foo'
      () => "^(?:.*\\/)?",
    ],

    // starting
    [
      // there will be no leading '/'
      //   (which has been replaced by section "leading slash")
      // If starts with '**', adding a '^' to the regular expression also works
      /^(?=[^^])/,
      (pattern: string): string => {
        // If has a slash `/` at the beginning or middle
        return !/\/(?!$)/.test(pattern)
          ? // > Prior to 2.22.1
            // > If the pattern does not contain a slash /,
            // >   Git treats it as a shell glob pattern
            // Actually, if there is only a trailing slash,
            //   git also treats it as a shell glob pattern

            // After 2.22.1 (compatible but clearer)
            // > If there is a separator at the beginning or middle (or both)
            // > of the pattern, then the pattern is relative to the directory
            // > level of the particular .gitignore file itself.
            // > Otherwise the pattern may also match at any level below
            // > the .gitignore level.
            "(?:^|/)"
          : // > Otherwise, Git treats the pattern as a shell glob suitable for
            // >   consumption by fnmatch(3)
            "^";
      },
    ],

    // two globstars
    [
      // Use lookahead assertions so that we could match more than one `'/**'`
      /\\\/\\\*\\\*(?=\\\/|$)/g,

      // Zero, one or several directories
      // should not use '*', or it will be replaced by the next replacer

      // Check if it is not the last `'/**'`
      (_, index: string, str: string) =>
        Number(index) + 6 < str.length
          ? // case: /**/
            // > A slash followed by two consecutive asterisks then a slash matches
            // >   zero or more directories.
            // > For example, "a/**/b" matches "a/b", "a/x/b", "a/x/y/b" and so on.
            // '/**/'
            "(?:\\/[^\\/]+)*"
          : // case: /**
            // > A trailing `"/**"` matches everything inside.

            // #21: everything inside but it should not include the current folder
            "\\/.+",
    ],

    // normal intermediate wildcards
    [
      // Never replace escaped '*'
      // ignore rule '\*' will match the path '*'

      // 'abc.*/' -> go
      // 'abc.*'  -> skip this rule,
      //    coz trailing single wildcard will be handed by [trailing wildcard]
      /(^|[^\\]+)(\\\*)+(?=.+)/g,

      // '*.js' matches '.js'
      // '*.js' doesn't match 'abc'
      (_, p1: string, p2: string) => {
        // 1.
        // > An asterisk "*" matches anything except a slash.
        // 2.
        // > Other consecutive asterisks are considered regular asterisks
        // > and will match according to the previous rules.
        const unescaped = p2.replace(/\\\*/g, "[^\\/]*");
        return p1 + unescaped;
      },
    ],

    [
      // unescape, revert step 3 except for back slash
      // For example, if a user escape a '\\*',
      // after step 3, the result will be '\\\\\\*'
      /\\\\\\\\(?=[$.|*+(){^])/g,
      () => ESCAPE,
    ],

    [
      // '\\\\' -> '\\'
      /\\\\/g,
      () => ESCAPE,
    ],

    [
      // > The range notation, e.g. [a-zA-Z],
      // > can be used to match one of the characters in a range.

      // `\` is escaped by step 3
      /(\\)?\[([^\]/]*?)(\\*)($|\])/g,
      (
        _: string,
        leadEscape: string,
        range: string,
        endEscape: string,
        close: string,
      ) =>
        leadEscape === ESCAPE
          ? // '\\[bar]' -> '\\\\[bar\\]'
            `\\[${range}${cleanRangeBackSlash(endEscape)}${close}`
          : close === "]"
            ? endEscape.length % 2 === 0
              ? // A normal case, and it is a range notation
                // '[bar]'
                // '[bar\\\\]'
                `[${sanitizeRange(range)}${endEscape}]`
              : // Invalid range notaton
                // '[bar\\]' -> '[bar\\\\]'
                "[]"
            : "[]",
    ],

    // ending
    [
      // 'js' will not match 'js.'
      // 'ab' will not match 'abc'
      /(?:[^*])$/,

      // WTF!
      // https://git-scm.com/docs/gitignore
      // changes in [2.22.1](https://git-scm.com/docs/gitignore/2.22.1)
      // which re-fixes #24, #38

      // > If there is a separator at the end of the pattern then the pattern
      // > will only match directories, otherwise the pattern can match both
      // > files and directories.

      // 'js*' will not match 'a.js'
      // 'js/' will not match 'a.js'
      // 'js' will match 'a.js' and 'a.js/'
      (match: string) =>
        /\/$/.test(match)
          ? // foo/ will not match 'foo'
            `${match}$`
          : // foo matches 'foo' and 'foo/'
            `${match}(?=$|\\/$)`,
    ],
  ] as const;

// Freeze REPLACERS to prevent accidental mutation and help VMs optimize constants
Object.freeze(REPLACERS);

const REGEX_REPLACE_TRAILING_WILDCARD = /(^|\\\/)?\\\*$/;
const MODE_IGNORE = "regex";
const MODE_CHECK_IGNORE = "checkRegex";

const TRAILING_WILD_CARD_REPLACERS = {
  [MODE_IGNORE](_: string, p1: string): string {
    const prefix = p1
      ? // '\\^':
        // '/*' does not match EMPTY
        // '/*' does not match everything

        // '\\\/':
        // 'abc/*' does not match 'abc/'
        `${p1}[^/]+`
      : // 'a*' matches 'a'
        // 'a*' matches 'aa'
        "[^/]*";

    return `${prefix}(?=$|\\/$)`;
  },

  [MODE_CHECK_IGNORE](_: string, p1: string): string {
    // When doing `git check-ignore`
    const prefix = p1
      ? // '\\\/':
        // 'abc/*' DOES match 'abc/' !
        `${p1}[^/]*`
      : // 'a*' matches 'a'
        // 'a*' matches 'aa'
        "[^/]*";

    return `${prefix}(?=$|\\/$)`;
  },
};

// @param {pattern}
const makeRegexPrefix = (pattern: string): string =>
  REPLACERS.reduce(
    (prev: string, [matcher, replacer]) =>
      prev.replace(matcher, (match: string, ...args: string[]) =>
        replacer(match, ...args, pattern),
      ),
    pattern,
  );

const isString = (subject: unknown): subject is string =>
  typeof subject === "string";

// > A blank line matches no files, so it can serve as a separator for readability.
const checkPattern = (pattern: unknown): pattern is string =>
  !!pattern &&
  isString(pattern) &&
  !REGEX_TEST_BLANK_LINE.test(pattern) &&
  !REGEX_INVALID_TRAILING_BACKSLASH.test(pattern) &&
  // > A line starting with # serves as a comment.
  pattern.indexOf("#") !== 0;

const splitPattern = (pattern: string): string[] =>
  pattern.split(REGEX_SPLITALL_CRLF).filter(Boolean);

interface TestResult {
  ignored: boolean;
  unignored: boolean;
  rule?: IgnoreRule;
}

interface PatternObject {
  pattern: string;
  mark?: boolean;
}

class IgnoreRule {
  public readonly pattern: string;
  public readonly mark?: boolean;
  public readonly negative: boolean;

  private readonly ignoreCase: boolean;
  private readonly regexPrefix: string;

  // Simple private cache properties
  private _regex?: RegExp;
  private _checkRegex?: RegExp;

  constructor(
    pattern: string,
    mark: boolean | undefined,
    _body: string,
    ignoreCase: boolean,
    negative: boolean,
    regexPrefix: string,
  ) {
    this.pattern = pattern;
    this.mark = mark;
    this.ignoreCase = ignoreCase;
    this.negative = negative;
    this.regexPrefix = regexPrefix;
  }

  get regex(): RegExp {
    if (!this._regex) {
      this._regex = this.compileRegex("regex");
    }
    return this._regex;
  }

  get checkRegex(): RegExp {
    if (!this._checkRegex) {
      this._checkRegex = this.compileRegex("checkRegex");
    }
    return this._checkRegex;
  }

  private compileRegex(mode: "regex" | "checkRegex"): RegExp {
    const str = this.regexPrefix.replace(
      REGEX_REPLACE_TRAILING_WILDCARD,
      // It does not need to bind pattern
      TRAILING_WILD_CARD_REPLACERS[
        mode as keyof typeof TRAILING_WILD_CARD_REPLACERS
      ],
    );

    return this.ignoreCase ? new RegExp(str, "i") : new RegExp(str);
  }
}

const createRule = (
  { pattern, mark }: PatternObject,
  ignoreCase: boolean,
): IgnoreRule => {
  let negative = false;
  let body = pattern;

  // > An optional prefix "!" which negates the pattern;
  if (body.indexOf("!") === 0) {
    negative = true;
    body = body.substring(1);
  }

  body = body
    // > Put a backslash ("\\") in front of the first "!" for patterns that
    // >   begin with a literal "!", for example, `"\\!important!.txt"`.
    .replace(REGEX_REPLACE_LEADING_ESCAPED_EXCLAMATION, "!")
    // > Put a backslash ("\\") in front of the first hash for patterns that
    // >   begin with a hash.
    .replace(REGEX_REPLACE_LEADING_ESCAPED_HASH, "#");

  const regexPrefix = makeRegexPrefix(body);

  return new IgnoreRule(pattern, mark, body, ignoreCase, negative, regexPrefix);
};

class RuleManager {
  private readonly _ignoreCase: boolean;
  private _rules: IgnoreRule[] = [];
  private _added = false;

  constructor(ignoreCase: boolean) {
    this._ignoreCase = ignoreCase;
  }

  get ignoreCase(): boolean {
    return this._ignoreCase;
  }

  private _add(pattern: string | PatternObject | Ignore): void {
    // #32
    if (
      pattern &&
      (pattern as unknown as Record<string, unknown>)[KEY_IGNORE as string]
    ) {
      const otherRules = (
        pattern as unknown as { _rules: { _rules: IgnoreRule[] } }
      )._rules._rules;
      this._rules.push(...otherRules);
      this._added = true;
      return;
    }

    let patternObj: PatternObject;
    if (isString(pattern)) {
      patternObj = {
        pattern,
      };
    } else {
      patternObj = pattern as PatternObject;
    }

    if (checkPattern(patternObj.pattern)) {
      const rule = createRule(patternObj, this._ignoreCase);
      this._added = true;
      this._rules.push(rule);
    }
  }

  // @param {Array<string> | string | Ignore} pattern
  add(pattern: string | string[] | Ignore | PatternObject): boolean {
    this._added = false;

    let patterns: (string | PatternObject | Ignore)[];
    if (isString(pattern)) {
      patterns = splitPattern(pattern);
    } else if (Array.isArray(pattern)) {
      patterns = pattern;
    } else {
      patterns = [pattern];
    }

    for (const p of patterns) {
      this._add(p);
    }

    return this._added;
  }

  // Test one single path without recursively checking parent directories
  //
  // - checkUnignored `boolean` whether should check if the path is unignored,
  //   setting `checkUnignored` to `false` could reduce additional
  //   path matching.
  // - check `string` either `MODE_IGNORE` or `MODE_CHECK_IGNORE`

  // @returns {TestResult} true if a file is ignored
  test(path: string, checkUnignored: boolean, mode: string): TestResult {
    let ignored = false;
    let unignored = false;
    let matchedRule: IgnoreRule | undefined;

    for (const rule of this._rules) {
      const { negative } = rule;

      //          |           ignored : unignored
      // -------- | ---------------------------------------
      // negative |   0:0   |   0:1   |   1:0   |   1:1
      // -------- | ------- | ------- | ------- | --------
      //     0    |  TEST   |  TEST   |  SKIP   |    X
      //     1    |  TESTIF |  SKIP   |  TEST   |    X

      // - SKIP: always skip
      // - TEST: always test
      // - TESTIF: only test if checkUnignored
      // - X: that never happen
      if (
        (unignored === negative && ignored !== unignored) ||
        (negative && !ignored && !unignored && !checkUnignored)
      ) {
        continue;
      }

      const regex = mode === "regex" ? rule.regex : rule.checkRegex;
      const matched = regex.test(path);

      if (!matched) {
        continue;
      }

      ignored = !negative;
      unignored = negative;

      matchedRule = negative ? undefined : rule;
    }

    const ret: TestResult = {
      ignored,
      unignored,
    };

    if (matchedRule) {
      ret.rule = matchedRule;
    }

    return ret;
  }
}

const throwError = (message: string, Ctor: ErrorConstructor): never => {
  throw new Ctor(message);
};

interface CheckPathFunction {
  (
    path: string | null | undefined,
    originalPath: unknown,
    doThrow: (message: string, Ctor: ErrorConstructor) => boolean | never,
  ): boolean;
  isNotRelative?: (path: string) => boolean;
  convert?: (path: string) => string;
}

const checkPath: CheckPathFunction = (
  path: string | null | undefined,
  originalPath: unknown,
  doThrow: (message: string, Ctor: ErrorConstructor) => boolean | never,
): boolean => {
  if (!isString(path)) {
    return doThrow(
      `path must be a string, but got \`${originalPath}\``,
      TypeError,
    );
  }

  // We don't know if we should ignore EMPTY, so throw
  if (!path) {
    return doThrow("path must not be empty", TypeError);
  }

  // Check if it is a relative path
  if (checkPath.isNotRelative?.(path)) {
    const r = "`path.relative()`d";
    return doThrow(
      `path should be a ${r} string, but got "${originalPath}". Use allowRelativePaths: true to permit absolute paths or './', '../'`,
      RangeError,
    );
  }

  return true;
};

const isNotRelative = (path: string): boolean =>
  REGEX_TEST_INVALID_PATH.test(path);

checkPath.isNotRelative = isNotRelative;

// On windows, the following function will be replaced
checkPath.convert = (p: string): string => p;

export interface IgnoreOptions {
  ignorecase?: boolean;
  ignoreCase?: boolean;
  allowRelativePaths?: boolean;
}

export class Ignore {
  private readonly _rules: RuleManager;
  private readonly _strictPathCheck: boolean;
  private _ignoreCache: Record<string, TestResult> = {};
  private _testCache: Record<string, TestResult> = {};

  /**
   * Create a new Ignore instance
   * @param options - Configuration options
   * @param options.ignorecase - Whether to use case-insensitive matching (default: true)
   * @param options.ignoreCase - Alias for ignorecase
   * @param options.allowRelativePaths - Allow relative paths like './' and '../' (default: false)
   */
  constructor({
    ignorecase = true,
    ignoreCase = ignorecase,
    allowRelativePaths = false,
  }: IgnoreOptions = {}) {
    // Simple instance identification instead of define()
    (this as Record<string | symbol, unknown>)[KEY_IGNORE] = true;

    this._rules = new RuleManager(ignoreCase);
    this._strictPathCheck = !allowRelativePaths;
    this._initCache();
  }

  private _initCache(): void {
    // A cache for the result of `.ignores()`
    this._ignoreCache = Object.create(null);

    // A cache for the result of `.test()`
    this._testCache = Object.create(null);
  }

  /**
   * Clear all internal caches
   */
  clearCache(): this {
    this._initCache();
    return this;
  }

  /**
   * Add ignore patterns
   * @param pattern - Pattern(s) to add
   * @returns This instance for chaining
   */
  add(pattern: string | string[] | Ignore | PatternObject): this {
    if (this._rules.add(pattern)) {
      // Some rules have just added to the ignore,
      //   making the behavior changed,
      //   so we need to re-initialize the result cache
      this._initCache();
    }

    return this;
  }

  /**
   * Legacy alias for add()
   * @deprecated Use add() instead
   */
  addPattern(pattern: string | string[] | Ignore | PatternObject): this {
    return this.add(pattern);
  }

  // @returns {TestResult}
  private _test(
    originalPath: string | null | undefined,
    cache: Record<string, TestResult>,
    checkUnignored: boolean,
    slices?: string[],
  ): TestResult {
    const path = originalPath
      ? // Supports nullable path
        (checkPath.convert?.(originalPath) ?? originalPath)
      : null;

    checkPath(
      path,
      originalPath,
      this._strictPathCheck ? throwError : RETURN_FALSE,
    );

    if (!path) {
      throw new Error("Path cannot be null or undefined");
    }
    return this._t(path, cache, checkUnignored, slices);
  }

  /**
   * Check if a path is ignored (Git check-ignore compatible)
   * @param path - The path to check
   * @returns TestResult with ignored status and matched rule
   */
  checkIgnore(path: string): TestResult {
    // If the path doest not end with a slash, `.ignores()` is much equivalent
    //   to `git check-ignore`
    if (!REGEX_TEST_TRAILING_SLASH.test(path)) {
      return this.test(path);
    }

    const slices = path.split(SLASH).filter(Boolean);
    slices.pop();

    if (slices.length) {
      const parent = this._t(
        slices.join(SLASH) + SLASH,
        this._testCache,
        true,
        slices,
      );

      if (parent.ignored) {
        return parent;
      }
    }

    return this._rules.test(path, false, MODE_CHECK_IGNORE);
  }

  private _t(
    // The path to be tested
    path: string,

    // The cache for the result of a certain checking
    cache: Record<string, TestResult>,

    // Whether should check if the path is unignored
    checkUnignored: boolean,

    // The path slices
    slices?: string[],
  ): TestResult {
    if (path in cache) {
      return cache[path];
    }

    let pathSlices = slices;
    if (!pathSlices) {
      // path/to/a.js
      // ['path', 'to', 'a.js']
      pathSlices = path.split(SLASH).filter(Boolean);
    }

    pathSlices.pop();

    // If the path has no parent directory, just test it
    if (!pathSlices.length) {
      cache[path] = this._rules.test(path, checkUnignored, MODE_IGNORE);
      return cache[path];
    }

    const parent = this._t(
      pathSlices.join(SLASH) + SLASH,
      cache,
      checkUnignored,
      pathSlices,
    );

    // If the path contains a parent directory, check the parent first
    cache[path] = parent.ignored
      ? // > It is not possible to re-include a file if a parent directory of
        // >   that file is excluded.
        parent
      : this._rules.test(path, checkUnignored, MODE_IGNORE);
    return cache[path];
  }

  /**
   * Check if a path is ignored
   * @param path - The path to check
   * @returns True if the path is ignored
   */
  ignores(path: string): boolean {
    return this._test(path, this._ignoreCache, false).ignored;
  }

  /**
   * Create a filter function that returns true for non-ignored paths
   * @returns Filter function
   */
  createFilter(): (path: string) => boolean {
    return (path: string) => !this.ignores(path);
  }

  /**
   * Filter an array of paths, returning only non-ignored paths
   * @param paths - Paths to filter
   * @returns Array of non-ignored paths
   */
  filter(paths: string | string[]): string[] {
    return makeArray(paths).filter(this.createFilter());
  }

  /**
   * Test if a path is ignored
   * @param path - The path to test
   * @returns TestResult with ignored status and matched rule
   */
  test(path: string): TestResult {
    return this._test(path, this._testCache, true);
  }

  /**
   * Compile a pattern to a regular expression
   * @param pattern - The pattern to compile
   * @returns Compiled regular expression
   */
  compile(pattern: string): RegExp {
    // Create a temporary rule to get the compiled regex
    const tempRule = createRule({ pattern }, this._rules.ignoreCase);
    return tempRule.regex;
  }
}

const factory = (options?: IgnoreOptions): Ignore => new Ignore(options);

const isPathValid = (path: unknown): boolean =>
  checkPath(
    (path && checkPath.convert?.(path as string)) as string | null | undefined,
    path,
    RETURN_FALSE,
  );

const setupWindows = (): void => {
  /* eslint no-control-regex: "off" */
  const makePosix = (str: string): string =>
    /^\\\?\\/.test(str) || /["<>|]+/u.test(str)
      ? str
      : str.replace(/\\+/g, "/"); // Collapse multiple backslashes

  checkPath.convert = makePosix;

  // 'C:\\foo'     <- 'C:\\foo' has been converted to 'C:/'
  // 'd:\\foo'
  const RegexTestWindowsPathAbsolute = /^[a-z]:\//i;
  checkPath.isNotRelative = (path: string): boolean =>
    RegexTestWindowsPathAbsolute.test(path) || isNotRelative(path);
};

// Windows
// --------------------------------------------------------------
if (
  // Detect `process` so that it can run in browsers.
  typeof process !== "undefined" &&
  process.platform === "win32"
) {
  setupWindows();
}

// Export the factory function as default
export default factory;

// Although it is an anti-pattern,
//   it is still widely misused by a lot of libraries in github
// Ref: https://github.com/search?q=ignore.default%28%29&type=code
factory.default = factory;

export { isPathValid };

// For testing purposes
(factory as unknown as Record<string | symbol, unknown>)[
  Symbol.for("setupWindows")
] = setupWindows;
