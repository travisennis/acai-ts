# Fix Bash Tool Path Validation Errors

## Problem Statement

The Bash tool's path validation incorrectly blocks valid commands that use system temporary directories:

1. **`/tmp`** - Standard Unix temp directory - blocked even though `/tmp/acai` is allowed
2. **`/var/folders`** - macOS system temp directories - completely blocked

### Current Allowed Directories (source/index.ts:41-47)
```typescript
const allowedDirs = [
  primaryDir,
  "/tmp/acai",
  path.join(os.homedir(), ".acai"),
  path.join(os.homedir(), ".agents"),
];
```

### Key Files
- `source/index.ts` - Defines allowed directories
- `source/utils/bash.ts` - Contains `validatePaths()` function (lines 136-189)
- `source/utils/filesystem/security.ts` - Contains `isPathWithinAllowedDirs()` (lines 84-91)

---

## Implementation Plan

### Phase 1: Add System Temp Directories to Allowed List

**Objective:** Allow `/tmp` and `/var/folders` as valid paths.

**Changes:**
1. Edit `source/index.ts` to add `/tmp` and `/var/folders` to allowed directories

**File:** `source/index.ts`

**Lines:** ~41-47

**Change:**
```typescript
const allowedDirs = [
  primaryDir,
  "/tmp",
  "/tmp/acai",
  "/var/folders",
  path.join(os.homedir(), ".acai"),
  path.join(os.homedir(), ".agents"),
];
```

**Verification:**
- Run `npm run typecheck`
- Run `npm run lint`
- Run `npm run format`

---

### Phase 2: Add Unit Tests for Path Validation

**Objective:** Ensure path validation works correctly for system temp directories and home directory restrictions.

**File to create/modify:** `test/utils/bash.test.ts`

**Tests to add:**

1. **System temp directories should be allowed**
   - `ls /tmp` should pass
   - `cat /tmp/test.txt` should pass
   - `ls /var/folders/xx` should pass

2. **Home directory should be blocked (security)**
   - `ls ~` should be blocked
   - `cat ~/Documents/file.txt` should be blocked

**Verification:**
- Run `npm test`

---

### Phase 3: Manual Verification

**Objective:** Test the fix in the REPL.

**Steps:**
1. Start the REPL: `npm run dev` (in tmux)
2. Run commands that were previously blocked:
   - `ls /tmp`
   - `echo "test" > /tmp/test.txt`
   - `ls /var/folders`
3. Verify these commands are still blocked:
   - `ls ~`
   - `ls ~/Documents`

---

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes  
- [ ] `npm run format` passes
- [ ] `npm test` passes (new tests for path validation)

### Manual Verification
- [ ] `ls /tmp` works in REPL
- [ ] Files can be created/read in `/tmp`
- [ ] Commands using `/var/folders` work
- [ ] `ls ~` is still blocked
- [ ] `ls ~/Documents` is still blocked

---

## What We're NOT Doing

1. **Not allowing full home directory access** - Home directory (`~`) should remain blocked for security
2. **Not allowing `/` root** - Root filesystem access remains blocked
3. **Not allowing `/dev/*`** - Device files remain blocked (except via explicit command handling)

---

## Alternative Approaches Considered

### Option A: Add Special Handling in validatePaths (REJECTED)
Add prefix checking for system temp directories in `validatePaths()` before checking allowed directories.

**Pros:** More flexible runtime handling
**Cons:** More complex logic; better to just expand allowed directories

### Option B: Add Command-Aware Whitelisting (REJECTED)
Skip path validation for certain commands like `ls /tmp`.

**Pros:** Could handle more edge cases
**Cons:** Overly complex; the simple fix of adding directories to allowed list is sufficient
