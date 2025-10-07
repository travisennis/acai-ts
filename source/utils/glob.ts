import * as fs from "node:fs";
import { readFile } from "node:fs/promises";
import path, * as nodePath from "node:path";
import * as process from "node:process";
import type { Entry, Options as FastGlobOptions } from "fast-glob";
import * as fastGlob from "fast-glob";
import { isDirectory, slash, toPath } from "./filesystem.ts";
import { Ignore } from "./ignore.ts";

type GlobTask = {
  readonly patterns: string[];
  readonly options: Options;
};

type ExpandDirectoriesOption =
  | boolean
  | readonly string[]
  | { files?: readonly string[]; extensions?: readonly string[] };

type FastGlobOptionsWithoutCwd = Omit<FastGlobOptions, "cwd">;

type Options = {
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

const normalizePathForDirectoryGlob = (
  filePath: string,
  cwd: string,
): string => {
  const path = isNegativePattern(filePath) ? filePath.slice(1) : filePath;
  return nodePath.isAbsolute(path) ? path : nodePath.join(cwd, path);
};

const shouldExpandGlobstarDirectory = (pattern: string): boolean => {
  const match = pattern?.match(/\*\*\/([^/]+)$/);
  if (!match) {
    return false;
  }

  const dirname = match[1];
  const hasWildcards = /[*?[\]{}]/.test(dirname);
  const hasExtension = nodePath.extname(dirname) && !dirname.startsWith(".");

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
    ? files.map((file) =>
        nodePath.posix.join(
          directoryPath,
          `**/${nodePath.extname(file) ? file : `${file}${extensionGlob}`}`,
        ),
      )
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
  } catch {
    return;
  }

  if (!stat.isDirectory()) {
    throw new Error("The `cwd` option must be a path to a directory");
  }
};

const normalizeOptions = (options: Options = {}): Options => {
  const normalizedOptions: Options = {
    ...options,
    ignore: options.ignore ?? [],
    expandDirectories: options.expandDirectories ?? true,
    cwd: options.cwd ? toPath(options.cwd) : undefined,
  };

  if (normalizedOptions.cwd) {
    checkCwdOption(toPath(normalizedOptions.cwd));
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

const createFilterFunction = (
  isIgnored: ((path: string) => boolean) | false,
): ((fastGlobResult: string | Entry) => boolean) => {
  const seen = new Set<string>();

  return (fastGlobResult) => {
    const pathKey = nodePath.normalize(
      typeof fastGlobResult === "string"
        ? fastGlobResult
        : ((fastGlobResult as Entry).path ?? String(fastGlobResult)),
    );

    if (
      seen.has(pathKey) ||
      (typeof isIgnored === "boolean" ? isIgnored : isIgnored(pathKey))
    ) {
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
      tasks.push({ patterns, options });
      break;
    }

    const ignorePattern = localPatterns[index].slice(1);

    for (const task of tasks) {
      task.options.ignore?.push(ignorePattern);
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
        fastGlob(task.patterns, convertOptionsForFastGlob(task.options)),
      ),
    );
    return unionFastGlobResults(results, filter) as string[];
  },
);

// Helper function to convert our Options to fast-glob compatible options
const convertOptionsForFastGlob = (options: Options): fastGlob.Options => {
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
];

const ignoreFilesGlobOptions = {
  absolute: true,
  dot: true,
};

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

  return file.content
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((pattern) => applyBaseToPattern(pattern, base));
};

const toRelativePath = (
  fileOrDirectory: string,
  cwd: string,
): string | undefined => {
  const normalizedCwd = slash(cwd);
  if (path.isAbsolute(fileOrDirectory)) {
    if (slash(fileOrDirectory).startsWith(normalizedCwd)) {
      return path.relative(normalizedCwd, fileOrDirectory);
    }

    throw new Error(`Path ${fileOrDirectory} is not in cwd ${cwd}`);
  }

  // Normalize relative paths:
  // - Git treats './foo' as 'foo' when checking against patterns
  // - Patterns starting with './' in .gitignore are invalid and don't match anything
  // - The ignore library expects normalized paths without './' prefix
  if (fileOrDirectory.startsWith("./")) {
    return fileOrDirectory.slice(2);
  }

  // Paths with ../ point outside cwd and cannot match patterns from this directory
  // Return undefined to indicate this path is outside scope
  if (fileOrDirectory.startsWith("../")) {
    return undefined;
  }

  return fileOrDirectory;
};

const getIsIgnoredPredicate = (
  files: Array<{ filePath: string; content: string }>,
  cwd: string,
): GlobFilterFunction => {
  const patterns = files.flatMap((file) => parseIgnoreFile(file, cwd));
  const ignoreInstance = new Ignore().add(patterns);

  return (fileOrDirectory: URL | string) => {
    let fileOrDirectoryAsPath = toPath(fileOrDirectory);
    fileOrDirectoryAsPath = toRelativePath(fileOrDirectoryAsPath, cwd) ?? "";
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

  const paths = await fastGlob(patterns as string | string[], {
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
