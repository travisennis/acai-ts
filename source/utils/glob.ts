import * as fs from "node:fs";
import { readFile } from "node:fs/promises";
import path, * as nodePath from "node:path";
import * as process from "node:process";
import fg, { type Entry, type Options as FastGlobOptions } from "fast-glob";
import { isDirectory, slash, toPath } from "./filesystem/operations.ts";
import { Ignore } from "./ignore.ts";

// Cache for ignore patterns to avoid repeated IO
const ignoreCache = new Map<
  string,
  { patterns: string[]; timestamp: number }
>();
const CACHE_TTL = 60000; // 1 minute TTL

type GlobTask = {
  readonly patterns: string[];
  readonly options: Options;
};

type ExpandDirectoriesOption =
  | boolean
  | readonly string[]
  | { files?: readonly string[]; extensions?: readonly string[] };

type FastGlobOptionsWithoutCwd = Omit<FastGlobOptions, "cwd">;

export type Options = {
  /**
   * If set to `true`, `glob` will automatically glob directories for you. If you define an `Array` it will only glob files that matches the patterns inside the `Array`. You can also define an `Object` with `files` and `extensions` like in the example below.
   *
   * Note that if you set this option to `false`, you won't get back matched directories unless you set `onlyFiles: false`.
   *
   * @default true
   */
  readonly expandDirectories?: ExpandDirectoriesOption;

  /**
   * Respect ignore patterns in `.gitignore` files that apply to the globbed files.
   *
   * Performance note: This option searches for all `.gitignore` files in the entire directory tree before globbing, which can be slow. For better performance, use `ignoreFiles: '.gitignore'` to only respect the root `.gitignore` file.
   *
   * @default false
   */
  readonly gitignore?: boolean;

  /**
   * Glob patterns to look for ignore files, which are then used to ignore globbed files.
   *
   * This is a more generic form of the `gitignore` option, allowing you to find ignore files with a [compatible syntax](http://git-scm.com/docs/gitignore). For instance, this works with Babel's `.babelignore`, Prettier's `.prettierignore`, or ESLint's `.eslintignore` files.
   *
   * Performance tip: Using a specific path like `'.gitignore'` is much faster than recursive patterns.
   *
   * @default undefined
   */
  readonly ignoreFiles?: string | readonly string[];

  /**
   * The current working directory in which to search.
   *
   * @default process.cwd()
   */
  readonly cwd?: URL | string;
} & FastGlobOptionsWithoutCwd;

type GlobFilterFunction = (path: URL | string) => boolean;

const assertPatternsInput = (patterns: unknown[]): void => {
  if (patterns.some((pattern) => typeof pattern !== "string")) {
    throw new TypeError("Patterns must be a string or an array of strings");
  }
};

// Pre-compiled regexes for performance
const GLOBSTAR_DIRECTORY_REGEX = /\*\*\/([^/]+)$/;
const WILDCARD_CHARS_REGEX = /[*?[\]{}]/;
const EXTENSION_PATTERN_REGEX = /\.[a-zA-Z0-9]{1,5}$/;

const normalizePathForDirectoryGlob = (
  filePath: string,
  cwd: string,
): string => {
  const path = isNegativePattern(filePath) ? filePath.slice(1) : filePath;
  return nodePath.isAbsolute(path) ? path : nodePath.join(cwd, path);
};

const shouldExpandGlobstarDirectory = (pattern: string): boolean => {
  const match = pattern?.match(GLOBSTAR_DIRECTORY_REGEX);
  if (!match) {
    return false;
  }

  const dirname = match[1];
  const hasWildcards = WILDCARD_CHARS_REGEX.test(dirname);

  // Only consider it an extension if it looks like a file extension pattern
  // (e.g., contains common extension chars and doesn't look like a directory name)
  const hasExtension =
    EXTENSION_PATTERN_REGEX.test(dirname) && !dirname.startsWith(".");

  return !hasWildcards && !hasExtension;
};

const getDirectoryGlob = ({
  directoryPath,
  files,
  extensions,
}: {
  directoryPath: string;
  files?: readonly string[];
  extensions?: readonly string[];
}): string[] => {
  const extensionGlob =
    extensions && extensions.length > 0
      ? `.${extensions.length > 1 ? `{${extensions.join(",")}}` : extensions[0]}`
      : "";
  return files
    ? files.map((file) => {
        // Don't append extension glob if file already has wildcards, extension, or looks like a pattern
        const hasGlobChars = /[*?[\]{}]/.test(file);
        const hasExtension = nodePath.extname(file);
        const shouldAppendExtension =
          extensionGlob && !hasGlobChars && !hasExtension;

        return nodePath.posix.join(
          directoryPath,
          `**/${shouldAppendExtension ? `${file}${extensionGlob}` : file}`,
        );
      })
    : [
        nodePath.posix.join(
          directoryPath,
          `**${extensionGlob ? `/*${extensionGlob}` : ""}`,
        ),
      ];
};

const directoryToGlob = async (
  directoryPaths: string[],
  {
    cwd = process.cwd(),
    files,
    extensions,
  }: {
    cwd?: string;
    files?: readonly string[];
    extensions?: readonly string[];
  } = {},
): Promise<string[]> => {
  const globs = await Promise.all(
    directoryPaths.map(async (directoryPath) => {
      // Check pattern without negative prefix
      const checkPattern = isNegativePattern(directoryPath)
        ? directoryPath.slice(1)
        : directoryPath;

      // Expand globstar directory patterns like **/dirname to **/dirname/**
      if (shouldExpandGlobstarDirectory(checkPattern)) {
        return getDirectoryGlob({ directoryPath, files, extensions });
      }

      // If pattern contains any glob wildcard, do not stat; leave as-is
      if (/[*?[\]{}]/.test(checkPattern)) {
        return directoryPath;
      }

      // Original logic for checking actual directories
      const pathToCheck = normalizePathForDirectoryGlob(directoryPath, cwd);
      return (await isDirectory(pathToCheck))
        ? getDirectoryGlob({ directoryPath, files, extensions })
        : directoryPath;
    }),
  );

  return globs.flat();
};

const toPatternsArray = <T extends string | string[] | readonly string[]>(
  patterns: T,
): string[] => {
  const flattenedPatterns = Array.from(new Set([patterns].flat())) as string[];
  assertPatternsInput(flattenedPatterns);
  return flattenedPatterns;
};

const checkCwdOption = (cwd: string | undefined): void => {
  if (!cwd) {
    return;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(cwd);
  } catch (_error) {
    throw new Error(
      `The \`cwd\` option must point to an existing directory: ${cwd}`,
    );
  }

  if (!stat.isDirectory()) {
    throw new Error("The `cwd` option must be a path to a directory");
  }
};

const normalizeOptions = (options: Options = {}): Options => {
  const resolvedCwd = options.cwd ? toPath(options.cwd) : undefined;
  const normalizedOptions: Options = {
    ...options,
    ignore: options.ignore ?? [],
    expandDirectories: options.expandDirectories ?? true,
    cwd: resolvedCwd,
  };

  if (resolvedCwd) {
    checkCwdOption(resolvedCwd);
  }

  return normalizedOptions;
};

const normalizeArguments =
  <T extends string | string[] | readonly string[], R>(
    fn: (patterns: string[], options: Options) => R,
  ): ((patterns: T, options?: Options) => R) =>
  (patterns, options) =>
    fn(toPatternsArray(patterns), normalizeOptions(options || {}));

const getIgnoreFilesPatterns = (options: Options): string[] => {
  const { ignoreFiles, gitignore } = options;

  const patterns = ignoreFiles ? toPatternsArray(ignoreFiles) : [];
  if (gitignore) {
    patterns.push(GITIGNORE_FILES_PATTERN);
  }

  return patterns;
};

const getFilter = async (
  options: Options,
): Promise<(fastGlobResult: string | Entry) => boolean> => {
  const ignoreFilesPatterns = getIgnoreFilesPatterns(options);
  const isIgnoredFn =
    ignoreFilesPatterns.length > 0
      ? await isIgnoredByIgnoreFiles(ignoreFilesPatterns, options)
      : false;
  return createFilterFunction(isIgnoredFn);
};

// No-op predicate for when no ignore filtering is needed
const noOpPredicate = (): boolean => false;

const createFilterFunction = (
  isIgnored: ((path: string) => boolean) | false,
): ((fastGlobResult: string | Entry) => boolean) => {
  const seen = new Set<string>();
  const ignorePredicate = isIgnored === false ? noOpPredicate : isIgnored;

  return (fastGlobResult) => {
    let pathKey: string;
    if (typeof fastGlobResult === "string") {
      pathKey = fastGlobResult;
    } else {
      const entry = fastGlobResult as Entry;
      if (!entry.path) {
        // Entry without path is invalid - skip it
        return false;
      }
      pathKey = entry.path;
    }
    // Normalize to POSIX for consistent cross-platform behavior
    pathKey = slash(nodePath.normalize(pathKey));

    if (seen.has(pathKey) || ignorePredicate(pathKey)) {
      return false;
    }

    seen.add(pathKey);

    return true;
  };
};

const unionFastGlobResults = (
  results: (string | Entry)[][],
  filter: (fastGlobResult: string | Entry) => boolean,
): (string | Entry)[] =>
  results.flat().filter((fastGlobResult) => filter(fastGlobResult));

const convertNegativePatterns = (
  patterns: string[],
  options: Options,
): GlobTask[] => {
  const tasks: GlobTask[] = [];

  let localPatterns = patterns;
  while (localPatterns.length > 0) {
    const index = localPatterns.findIndex((pattern) =>
      isNegativePattern(pattern),
    );

    if (index === -1) {
      tasks.push({ patterns: localPatterns, options });
      break;
    }

    const ignorePattern = localPatterns[index].slice(1);

    // Create immutable copies for all existing tasks
    for (let i = 0; i < tasks.length; i++) {
      tasks[i] = {
        ...tasks[i],
        options: {
          ...tasks[i].options,
          ignore: [...(tasks[i].options.ignore ?? []), ignorePattern],
        },
      };
    }

    if (index !== 0) {
      tasks.push({
        patterns: localPatterns.slice(0, index),
        options: {
          ...options,
          ignore: [...(options.ignore ?? []), ignorePattern],
        },
      });
    }

    localPatterns = localPatterns.slice(index + 1);
  }

  return tasks;
};

const normalizeExpandDirectoriesOption = (
  options: ExpandDirectoriesOption,
  cwd: string | undefined,
): {
  cwd?: string;
  files?: readonly string[];
  extensions?: readonly string[];
} => {
  const result: {
    cwd?: string;
    files?: readonly string[];
    extensions?: readonly string[];
  } = {};

  if (cwd) {
    result.cwd = cwd;
  }

  if (Array.isArray(options)) {
    result.files = options;
  } else if (typeof options === "object" && options !== null) {
    if ("files" in options) result.files = options.files;
    if ("extensions" in options) result.extensions = options.extensions;
  }

  return result;
};

const generateTasks = async (
  patterns: string[],
  options: Options,
): Promise<GlobTask[]> => {
  const globTasks = convertNegativePatterns(patterns, options);

  const { cwd, expandDirectories } = options;

  if (!expandDirectories) {
    return globTasks;
  }

  const directoryToGlobOptions = normalizeExpandDirectoriesOption(
    expandDirectories,
    cwd ? toPath(cwd) : cwd,
  );

  return Promise.all(
    globTasks.map(async (task) => {
      let { patterns, options } = task;

      [patterns, options.ignore] = await Promise.all([
        directoryToGlob(patterns, directoryToGlobOptions),
        directoryToGlob(options.ignore as string[], {
          cwd: cwd ? toPath(cwd) : cwd,
        }),
      ]);

      return { patterns, options };
    }),
  );
};

/**
 * Find files and directories using glob patterns.
 *
 * Note that glob patterns can only contain forward-slashes, not backward-slashes, so if you want to construct a glob pattern from path components, you need to use `path.posix.join()` instead of `path.join()`.
 *
 * @param patterns - See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).
 * @param options - See the [`fast-glob` options](https://github.com/mrmlnc/fast-glob#options-3) in addition to the ones in this package.
 * @returns The matching paths.
 */
export const glob = normalizeArguments(
  async (patterns: string[], options: Options): Promise<string[]> => {
    const [tasks, filter] = await Promise.all([
      generateTasks(patterns, options),
      getFilter(options),
    ]);

    const results = await Promise.all(
      tasks.map((task) =>
        fg(task.patterns, convertOptionsForFastGlob(task.options)),
      ),
    );
    return unionFastGlobResults(results, filter) as string[];
  },
);

// Helper function to convert our Options to fast-glob compatible options
const convertOptionsForFastGlob = (options: Options): FastGlobOptions => {
  const { cwd, ...rest } = options;
  return {
    ...rest,
    cwd: cwd ? toPath(cwd) : undefined,
  };
};
const defaultIgnoredDirectories = [
  "**/node_modules",
  "**/flow-typed",
  "**/coverage",
  "**/.git",
] as const;

const ignoreFilesGlobOptions = {
  absolute: true,
  dot: true,
} as const;

const GITIGNORE_FILES_PATTERN = "**/.gitignore";

// Apply base path to gitignore patterns based on .gitignore spec 2.22.1
// https://git-scm.com/docs/gitignore#_pattern_format
// See also https://github.com/sindresorhus/globby/issues/146
const applyBaseToPattern = (pattern: string, base: string): string => {
  if (!base) {
    return pattern;
  }

  const isNegative = isNegativePattern(pattern);
  const cleanPattern = isNegative ? pattern.slice(1) : pattern;

  // Check if pattern has non-trailing slashes
  const slashIndex = cleanPattern.indexOf("/");
  const hasNonTrailingSlash =
    slashIndex !== -1 && slashIndex !== cleanPattern.length - 1;

  let result: string;
  if (!hasNonTrailingSlash) {
    // "If there is no separator at the beginning or middle of the pattern,
    // then the pattern may also match at any level below the .gitignore level."
    // So patterns like '*.log' or 'temp' or 'build/' (trailing slash) match recursively.
    result = path.posix.join(base, "**", cleanPattern);
  } else if (cleanPattern.startsWith("/")) {
    // "If there is a separator at the beginning [...] of the pattern,
    // then the pattern is relative to the directory level of the particular .gitignore file itself."
    // Leading slash anchors the pattern to the .gitignore's directory.
    result = path.posix.join(base, cleanPattern.slice(1));
  } else {
    // "If there is a separator [...] middle [...] of the pattern,
    // then the pattern is relative to the directory level of the particular .gitignore file itself."
    // Patterns like 'src/foo' are relative to the .gitignore's directory.
    result = path.posix.join(base, cleanPattern);
  }

  return isNegative ? `!${result}` : result;
};

const parseIgnoreFile = (
  file: { filePath: string; content: string },
  cwd: string,
): string[] => {
  const base = slash(path.relative(cwd, path.dirname(file.filePath)));
  const patterns: string[] = [];
  for (const raw of file.content.split(/\r?\n/)) {
    if (raw === "") continue; // blank line
    if (raw.startsWith("#")) continue; // comment line (only when not escaped)
    const line = raw; // preserve escapes like \# and \  for Ignore engine
    patterns.push(applyBaseToPattern(line, base));
  }
  return patterns;
};

const toRelativePath = (
  fileOrDirectory: string,
  cwd: string,
): string | undefined => {
  const abs = path.isAbsolute(fileOrDirectory)
    ? fileOrDirectory
    : path.resolve(cwd, fileOrDirectory);
  const rel = path.relative(cwd, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
  return rel.startsWith("./") ? rel.slice(2) : rel;
};

const getIsIgnoredPredicate = (
  files: Array<{ filePath: string; content: string }>,
  cwd: string,
): GlobFilterFunction => {
  // Sort files by path depth (ascending) so deeper .gitignore files override shallower ones
  const sortedFiles = [...files].sort((a, b) => {
    const depthA = a.filePath.split(nodePath.sep).length;
    const depthB = b.filePath.split(nodePath.sep).length;
    return depthA - depthB;
  });

  // Generate cache key using file paths + content hash
  const hashString = (s: string): string => {
    // FNV-1a 32-bit
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    // force to uint32 and hex
    return (h >>> 0).toString(16);
  };
  const cacheKey =
    `${cwd}|` +
    sortedFiles.map((f) => `${f.filePath}:${hashString(f.content)}`).join("|");
  const now = Date.now();
  const cached = ignoreCache.get(cacheKey);

  let patterns: string[];
  if (cached && now - cached.timestamp < CACHE_TTL) {
    patterns = cached.patterns;
  } else {
    patterns = sortedFiles.flatMap((file) => parseIgnoreFile(file, cwd));
    ignoreCache.set(cacheKey, { patterns, timestamp: now });
  }

  const ignoreInstance = new Ignore().add(patterns);

  return (fileOrDirectory: URL | string) => {
    let fileOrDirectoryAsPath: string | undefined = toPath(fileOrDirectory);
    fileOrDirectoryAsPath = toRelativePath(fileOrDirectoryAsPath, cwd);
    // If path is outside cwd (undefined), it can't be ignored by patterns in cwd
    if (fileOrDirectoryAsPath === undefined) {
      return false;
    }

    return fileOrDirectoryAsPath
      ? ignoreInstance.ignores(slash(fileOrDirectoryAsPath))
      : false;
  };
};

const normalizeIgnoreOptions = (options: Options = {}) => ({
  cwd: options.cwd ? toPath(options.cwd) : process.cwd(),
  suppressErrors: Boolean(options.suppressErrors),
  deep:
    typeof options.deep === "number" ? options.deep : Number.POSITIVE_INFINITY,
  ignore: [...(options.ignore ?? []), ...defaultIgnoredDirectories],
});

const isIgnoredByIgnoreFiles = async (
  patterns: string | readonly string[],
  options?: Options,
): Promise<GlobFilterFunction> => {
  const { cwd, suppressErrors, deep, ignore } = normalizeIgnoreOptions(options);

  const paths = await fg(patterns as string | string[], {
    cwd,
    suppressErrors,
    deep,
    ignore: ignore as string[],
    ...ignoreFilesGlobOptions,
  });

  const files = await Promise.all(
    paths.map(async (filePath) => ({
      filePath,
      content: await readFile(filePath, "utf8"),
    })),
  );

  return getIsIgnoredPredicate(files, cwd);
};

/**
 * Check if a pattern is negative (starts with '!')
 */
const isNegativePattern = (pattern: string): boolean => pattern[0] === "!";
