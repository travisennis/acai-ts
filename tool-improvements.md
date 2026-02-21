# Tool Performance & Efficiency Improvements

## Instructions

Work on the next unchecked todo item in the list below. Implement the changes for that tool file, run the full check (`npm run check`) and tests (`npm test`), and mark the todo as done (`[x]`) when successfully completed. Commit the code files including any tests you updated; nothing else. Then stop.

## Todo List

- [x] [Bash (`source/tools/bash.ts`)](#bash)
- [x] [Read (`source/tools/read-file.ts`)](#read)
- [x] [Grep (`source/tools/grep.ts`)](#grep)
- [x] [Glob (`source/tools/glob.ts`)](#glob)
- [x] [Edit (`source/tools/edit-file.ts`)](#edit)

---

## Bash

File: `source/tools/bash.ts`

1. **`fixRgCommand` uses wrong escaped regex** — `trimmed.split(/\\s+/)` splits on literal `\s+` instead of whitespace. Should be `trimmed.split(/\s+/)`.
2. **Redundant `&`-stripping logic** — the same 5-line block for stripping a trailing `&` is duplicated in both the background and foreground branches. Extract to a small helper function.
3. **`expandEnvVars` is imported but never used** — dead import adds unnecessary module loading. Remove it.

---

## Read

File: `source/tools/read-file.ts`

1. **Reads entire file into memory before slicing lines** — `fs.readFile` loads the full file, then splits all lines, even if only a small range is requested. For large files, use a streaming/readline approach or `fs.createReadStream` with byte offsets to avoid loading megabytes just to read 10 lines.
2. **Double encoding conversion on `maxBytes` truncation** — when `maxBytes` truncation applies, the already-decoded string is re-encoded to a `Buffer` (`Buffer.from(file, encoding)`) just to measure byte length, then decoded again. Use `Buffer.byteLength()` for the size check and only create a truncated buffer when actually needed.
3. **`effectiveMaxBytes` null/undefined check is redundant** — `maxBytes ?? DEFAULT_BYTE_LIMIT` already guarantees a number, but the subsequent `if` re-checks for `null` and `undefined`. Simplify the conditional.

---

## Grep

File: `source/tools/grep.ts`

1. **Uses synchronous `execSync`** — blocks the Node.js event loop while ripgrep runs. Should use `execFile` or `spawn` (async) to allow concurrent operations and proper abort signal handling.
2. **`likelyUnbalancedRegex` is called twice** — once in `execute()` and potentially again in `buildGrepCommand()` when `options.literal` is null. The result should be computed once and passed through.
3. **`parseRipgrepOutput` uses fragile regex matching** — the regex `^([^:]+):(\d+):(.+)$` will mis-parse file paths containing colons (e.g., Windows paths or files with `:` in the name). Use `rg --json` output format for reliable structured parsing.
4. **Full output is parsed then truncated** — all matches are parsed into objects, counted, then truncated. Pass `--max-count` more aggressively or use ripgrep's `--json` with a streaming parser to stop early.
5. **`truncateMatches` discards context lines** — when truncating, context lines associated with kept matches are dropped because only `isMatch && !isContext` entries are kept.
6. **`extractMatches` and `grepFiles` appear unused** — dead code that adds maintenance burden. Verify and remove if confirmed unused.

---

## Glob

File: `source/tools/glob.ts`

1. **`stat()` called on every matched file** — `Promise.all` over all matches issues a syscall per file to get mtime. For large result sets (thousands of files), this is very expensive. Consider only stat-ing when sorting is actually needed, or use the glob library's built-in stat option if available.
2. **Sorting all files before truncating** — all files are stat'd, sorted, then sliced to `maxResults`. Stat and sort only the top N using a partial sort or heap, or pass a limit to the glob itself to reduce work.
3. **`isRecent` heuristic is wasteful** — computing `Date.now()` minus mtime for every file just to bucket into "recent vs. not" is an unnecessary branch. A single sort by mtime descending with alphabetical as tiebreaker would be simpler and faster.
4. **`globOptions` typed as `Record<string, unknown>`** — loses type safety. Use the actual options type from the glob utility.

---

## Edit

File: `source/tools/edit-file.ts`

1. **`applyLiteralEdit` uses repeated string concatenation via `slice` + `+`** — each replacement creates two substrings and concatenates. For files with many matches, this is O(n²). Use `String.prototype.replaceAll()` or build the result with an array of segments joined once.
2. **`config.getConfig()` called on every edit** — this async call to load project config happens per tool invocation. Cache the config or pass it in from the caller.
3. **`createUnifiedDiff` re-normalizes line endings** — the content is already normalized at that point, so `normalizeLineEndings` is called redundantly on `content` (which was already normalized) and `finalContent` (which has had line endings restored, then re-normalized for diffing). Pass the pre-normalized content directly.
4. **`applyEditWithLlmFix` is misleadingly named** — there's no LLM fix logic; it's just a literal edit with normalization. The name suggests unused/planned functionality that adds confusion. Rename to something like `applyNormalizedEdit`.
5. **`edits.find(edit => edit.oldText.length === 0)` should use `some()`** — `find` returns the element while `some` short-circuits and returns a boolean, which is what's actually needed here.
