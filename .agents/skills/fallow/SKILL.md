---
name: fallow
description: "Run fallow static analysis to find dead code, duplication, complexity issues, and architecture drift. Use before committing, after generating code, or when asked to clean up the codebase."
---

# Fallow

Fallow is a Rust-native static analysis tool for TypeScript and JavaScript that finds dead code, duplication, complexity hotspots, and architecture boundary violations. It builds a project-wide module graph, so it catches problems file-local tools cannot: unused exports, files nothing imports, circular dependencies, cross-file duplicate blocks, and boundary violations.

Run fallow after generating or editing code to review the impact, before committing to catch regressions, or when asked to clean up dead code or reduce complexity.

## Quick Reference

```bash
npx fallow                      # Full analysis: dead code + duplication + health
npx fallow dead-code            # Dead code only
npx fallow dupes                # Duplication only
npx fallow health               # Complexity and health score
npx fallow audit                # Audit changed files (PR gate)
npx fallow fix --dry-run        # Preview automatic cleanup
npx fallow --format json        # Structured output with per-issue actions
npx fallow --summary            # Category counts only
```

## When to Run Fallow

**After generating or editing code:**
```bash
npx fallow --summary
```

**Before committing (audit changed files):**
```bash
npx fallow audit --base main --format json
```

**When asked to clean up or reduce complexity:**
```bash
npx fallow --format json
npx fallow health --top 20       # 20 most complex functions
npx fallow dead-code             # See what can be removed
```

## Key Commands

### Dead Code

Finds unused files, exports, types, dependencies, enum members, class members, circular dependencies, boundary violations, and stale suppressions.

```bash
npx fallow dead-code
npx fallow dead-code --unused-exports         # Only unused exports
npx fallow dead-code --circular-deps          # Only circular dependencies
npx fallow dead-code --production             # Exclude test/dev files
npx fallow dead-code --changed-since main     # Only files changed vs main
npx fallow dead-code --group-by owner         # Group by CODEOWNERS
```

### Duplication

Finds copy-pasted code blocks across the codebase. Four modes: strict (exact tokens), mild (default, AST-based), weak (different string literals), semantic (renamed identifiers).

```bash
npx fallow dupes
npx fallow dupes --mode semantic               # Catch clones with renamed variables
npx fallow dupes --skip-local                  # Only cross-directory duplicates
npx fallow dupes --trace src/utils.ts:42       # Show all clones of code at this line
```

### Complexity

Surfaces the most complex functions and identifies refactoring targets.

```bash
npx fallow health                              # Functions exceeding thresholds
npx fallow health --score                      # Project health score (0-100)
npx fallow health --top 20                     # 20 most complex functions
npx fallow health --file-scores                # Per-file maintainability index
npx fallow health --hotspots                   # Risk files (git churn x complexity)
npx fallow health --targets                    # Ranked refactoring recommendations
npx fallow health --targets --effort low       # Quick-win refactoring targets
npx fallow health --coverage-gaps              # Static test coverage gaps
```

### Audit

Quality gate for changesets. Compares current tree against a base ref and gates only newly introduced findings.

```bash
npx fallow audit                               # Auto-detects base branch
npx fallow audit --base main                   # Explicit base ref
npx fallow audit --base HEAD~3                 # Audit last 3 commits
npx fallow audit --format json                 # Structured output with verdict
```

Returns verdict: pass (exit 0), warn (exit 0, warn only), fail (exit 1). By default only gates findings introduced by the changeset.

## Fixing Findings

### 1. Fix real issues in code

When a finding is real, edit the code: delete unused exports/files, remove unused dependencies, extract complex functions, deduplicate repeated logic.

### 2. Suppress intentional findings

When code should stay but fallow cannot infer that from syntax alone, use the narrowest suppression:

```ts
// fallow-ignore-next-line unused-export
export const publicApiHelper = () => {};

// fallow-ignore-file
```

Or use JSDoc visibility tags for libraries consumed externally:

```ts
/** @public */ export function apiFunction() {}
/** @internal */ export function internalHelper() {}
```

In `.fallowrc.json`, use targeted config:

```jsonc
{
  "ignorePatterns": ["**/*.generated.ts"],
  "ignoreDependencies": ["autoprefixer"],
  "ignoreExports": ["src/internal.ts:helperFn"],
  "rules": {
    "unused-files": "error",
    "unused-exports": "warn",
    "circular-dependencies": "off"
  }
}
```

### 3. Adjust policy, not just findings

When the defaults are wrong for the project, change them in config deliberately:

```jsonc
{
  "health": {
    "maxCyclomatic": 20,
    "maxCognitive": 15,
    "maxCrap": 30
  }
}
```

Do not raise thresholds globally just to hide a few bad hotspots.

## Adoption Loop

1. Run `npx fallow` to see the current state.
2. Fix real issues first.
3. For remaining findings, decide: fix, suppress with reason, or adjust policy.
4. Re-run fallow after each batch.
5. Once clean, wire `npx fallow audit` as the change-set gate.
6. Stop when dead code and duplication are resolved or documented, and `fallow health` has `Above threshold: 0` for the project's chosen thresholds.

## Staged Adoption

If the repo cannot be cleaned in one pass:

```bash
npx fallow dead-code --save-baseline fallow-baselines/dead-code.json
npx fallow health    --save-baseline fallow-baselines/health.json
npx fallow dupes     --save-baseline fallow-baselines/dupes.json

npx fallow audit \
  --dead-code-baseline fallow-baselines/dead-code.json \
  --health-baseline    fallow-baselines/health.json \
  --dupes-baseline     fallow-baselines/dupes.json
```

Keep baselines outside `.fallow/` (that directory is for cache and is usually gitignored). Use `fallow-baselines/`.

## JSON Output

When you need machine-actionable output, use `--format json`. Every issue includes an `actions` array with fix suggestions and an `auto_fixable` flag:

```bash
npx fallow --format json
npx fallow dead-code --format json
npx fallow health --format json
npx fallow audit --format json
```

## Suppression Rules

- Prefer inline suppression over file-wide suppression.
- Prefer specific `ignoreExports` / `ignoreDependencies` over broad patterns.
- Prefer targeted `overrides` over global rule changes.
- Document the reason next to every exception.
- Use baselines only as a temporary migration aid, not as the steady state.
