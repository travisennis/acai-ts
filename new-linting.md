# ast-grep

Here's the complete setup:

## 1. Install @ast-grep/napi

```bash
npm install @ast-grep/napi --save-dev
```

**Important:** Use `@ast-grep/napi` (the native binary), not `ast-grep` (the npm wrapper).

## 2. Create the config file

ast-grep needs an `sgconfig.yml` at your project root:

```yaml
# sgconfig.yml
ruleDirs:
  - rules/ast-grep
```

## 3. Create the rules directory and rule files

```
mkdir -p rules/ast-grep
```

Then create each rule as its own file:

**`rules/ast-grep/no-console-log.yml`**
```yaml
id: no-console-log
language: TypeScript
rule:
  pattern: console.log($$$ARGS)
message: "Use logger or console.info instead of console.log"
severity: error
```

**`rules/ast-grep/no-non-null-assertion.yml`**
```yaml
id: no-non-null-assertion
language: TypeScript
rule:
  pattern: $EXPR!
message: "Avoid non-null assertions (!). Handle null/undefined explicitly."
severity: error
```

**`rules/ast-grep/node-builtin-prefix.yml`**
```yaml
id: node-builtin-prefix
language: TypeScript
rule:
  any:
    - pattern: import $_ from '$MOD'
      has:
        regex: "^(fs|path|os|crypto|http|https|url|stream|buffer|events|child_process|util|assert|readline|net|tls|dns|zlib|vm|worker_threads|perf_hooks|timers|module|process)$"
    - pattern: import '$MOD'
      has:
        regex: "^(fs|path|os|crypto|http|https|url|stream|buffer|events|child_process|util|assert|readline|net|tls|dns|zlib|vm|worker_threads|perf_hooks|timers|module|process)$"
    - pattern: require('$MOD')
      has:
        regex: "^(fs|path|os|crypto|http|https|url|stream|buffer|events|child_process|util|assert|readline|net|tls|dns|zlib|vm|worker_threads|perf_hooks|timers|module|process)$"
message: "Use the node: prefix for built-in modules (e.g., 'node:fs' not 'fs')"
severity: error
```

**Note:** The `where` clause is not supported in the current version of ast-grep. Use `has` with `regex` instead to filter matches.

## 4. Add npm scripts

In your `package.json`:

```json
{
  "scripts": {
    "lint:ast-grep": "sg scan",
    "lint:ast-grep:fix": "sg scan --update-all",
    "lint:biome": "biome lint",
    "lint:biome:fix": "biome lint --unsafe --write",
    "lint": "npm run lint:ast-grep && npm run lint:biome",
    "lint:fix": "(npm run lint:ast-grep || true) && npm run lint:biome:fix"
  }
}
```

## 5. Run it

```bash
# Check for violations
npm run lint:ast-grep

# Apply auto-fixes where available (currently none - rules are report-only)
npm run lint:ast-grep:fix

# Run both linters
npm run lint

# Fix all auto-fixable issues (biome only)
npm run lint:fix
```

## Current violations in the codebase

The following violations currently exist and need to be fixed manually:

1. **no-console-log** (2 instances in `source/tui/tui-output.test.ts`):
   - Line 336: `console.log("\nSIGINT received - exiting TUI test...")`
   - Line 343: `console.log("\nAuto-exiting TUI test after 10 seconds...")`

2. **no-non-null-assertion** (3 instances in `source/terminal/style.ts`):
   - Line 367: `levelMapping[level]!`
   - Line 380: `model[0]!`
   - Line 387: `levelMapping[level]!`

## A few things to know

**The `no-non-null-assertion` rule will have false positives.** The `$EXPR!` pattern catches non-null assertions but TypeScript's `!` is syntactically ambiguous with logical NOT in some positions. Test it against your codebase with `sg scan --rule rules/ast-grep/no-non-null-assertion.yml` first and adjust if needed.

**Scan a subset while tuning.** You can target a specific rule and path during development to avoid noise:
```bash
sg scan --rule rules/ast-grep/no-console-log.yml source/
```
