# Session Storage Migration Plan

## Overview

Migrate session storage from `~/.acai/message-history/` to `~/.acai/sessions/` with a new filename format. Existing files remain untouched; only new sessions use the new structure.

**Key Decisions:**
- Existing `message-history` files are left in place and not migrated
- New sessions use ISO 8601 timestamp format in filenames
- `/history` command reads from the new `sessions` directory only

## Changes Required

### 1. Source Code Changes

#### `source/index.ts` (line 157)
```diff
- appDir.ensurePath("message-history")
+ appDir.ensurePath("sessions")
```

#### `source/commands/history/index.ts` (line 97)
```diff
- const messageHistoryDir = await appDir.ensurePath("message-history");
+ const sessionsDir = await appDir.ensurePath("sessions");
```

#### `source/commands/session/index.ts` (line 106)
- Update displayed session filename from `message-history-${sessionId}.json` to `session-[timestamp]-[sessionId].json`
- This is a display-only change for the `/session` command output

#### `source/sessions/manager.ts`

**Line 309** - Filename generation:
```diff
- const fileName = `message-history-${this.sessionId}.json`;
+ const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
+ const fileName = `session-${timestamp}-${this.sessionId}.json`;
```

**Line 520-521** - Load pattern matching:
```diff
- const messageHistoryFiles = files.filter(
-   (file) => file.startsWith("message-history-") && file.endsWith(".json"),
- );
+ const sessionFiles = files.filter(
+   (file) => file.startsWith("session-") && file.endsWith(".json"),
+ );
```

### 2. Documentation Updates

#### `README.md`
- Update any references from `message-history` to `sessions`

#### `ARCHITECTURE.md`
- Update session storage section to reflect new directory

### 3. Test Updates

#### `test/commands/history-command.integration.test.ts`
- Update expected directory paths
- Adjust any filename assertions

#### `test/sessions/manager.test.ts`
- Update save/load assertions for new filename format (line ~280)
- The tests use temp directories, so they should naturally pick up the new format

### 4. Implementation Details

#### Filename Generation
```typescript
// New format: session-YYYY-MM-DDTHH-mm-ss-[sessionId].json
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const fileName = `session-${timestamp}-${this.sessionId}.json`;
```

Example filename:
```
session-2026-01-19T15-30-00-a1b2c3d4-e5f6-7890-1234-567890abcdef.json
```

#### Load Pattern Matching
The `SessionManager.load()` method recognizes files with the new pattern:
- New pattern: `session-*-*.json` (timestamp-sessionid)

### 5. Files Modified Summary

| File | Changes |
|------|---------|
| `source/index.ts` | 1 line change |
| `source/commands/history/index.ts` | 1 line change |
| `source/commands/session/index.ts` | 1 line change (display) |
| `source/sessions/manager.ts` | 2-3 locations (filename + filter) |
| `README.md` | 1-2 references |
| `ARCHITECTURE.md` | 1 reference |
| `test/commands/history-command.integration.test.ts` | 2-3 assertions |
| `test/sessions/manager.test.ts` | 1-2 assertions |

### 6. Backward Compatibility

- **Existing files**: Old files in `~/.acai/message-history/` continue to work for reading
- **New sessions**: Only saved to `~/.acai/sessions/`
- **No migration**: Existing files are not moved or renamed
- **Dual support**: The load method only looks for new `session-*.json` files (not legacy)

### 7. Verification Steps

1. **Run full test suite**:
   ```bash
   npm test
   ```
   - All tests must pass

2. **Run checks**:
   ```bash
   npm run check
   ```
   - Typecheck, lint, and format all clean

3. **Manual verification**:
   - New sessions saved to `~/.acai/sessions/`
   - `/session` command shows correct new filename format
   - `/history` command lists new sessions correctly

## Rollback Plan

If issues arise, revert changes to:
- `source/index.ts` (restore `message-history`)
- `source/commands/history/index.ts` (restore `message-history`)
- `source/sessions/manager.ts` (restore old filename pattern)
