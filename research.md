# Research Report: Skill Autocomplete Trigger (Issue #130)

## Issue Summary

**Title:** Create an autocomplete trigger that will list skills by name

**Description:** Create an autocomplete trigger in the Editor component that will list skills by name. These skills should be user invocable.

## Current State Analysis

### 1. Skills System (`source/skills/index.ts`)

**Key Findings:**

- Skills are loaded from multiple directories:
  - `~/.codex/skills/` (recursive)
  - `~/.claude/skills/` (single level)
  - `~/.claude/project/skills/` (single level)
  - `~/.agents/skills/` (recursive, primary)
  - `./.agents/skills/` (project-level, recursive)

- **Skill Interface** (`source/skills/index.ts:16-30`):
  ```typescript
  interface Skill {
    name: string;
    description: string;
    filePath: string;
    baseDir: string;
    source: string; // "user", "project", "codex-user", etc.
    userInvocable: boolean;  // <-- Key property for filtering
    disableModelInvocation: boolean;
    allowedTools?: string;
    arguments?: string;
    examples?: string[];
  }
  ```

- **`userInvocable` defaults to `true`** (`source/skills/index.ts:155`):
  ```typescript
  userInvocable: frontmatter["user-invocable"] ?? true,
  ```

- Skills with `userInvocable: false` are hidden from users but can still be invoked by the AI model.

### 2. Skills Registration as Commands (`source/commands/manager.ts`)

**Key Findings:**

- Skills are registered as slash commands via `registerSkillCommands()` (`source/commands/manager.ts:139-175`)
- Only skills with `userInvocable: true` are registered (`source/commands/manager.ts:143-145`):
  ```typescript
  if (!skill.userInvocable) {
    continue;
  }
  ```
- Commands are named with `/` prefix (e.g., `/commit`, `/review-pr`, `/pdf`)

- **`getCompletions()` method** (`source/commands/manager.ts:224-240`):
  - Returns ALL commands including skills as `SlashCommand[]`
  - Each command has a `name` and `description`
  - Includes sub-command completion support

### 3. Autocomplete System

**Architecture:**

1. **Base Provider Interface** (`source/tui/autocomplete/base-provider.ts:1-25`):
   ```typescript
   interface AutocompleteProvider {
     getSuggestions(lines, cursorLine, cursorCol): Promise<{items: AutocompleteItem[], prefix: string} | null>;
     applyCompletion(lines, cursorLine, cursorCol, item, prefix): {lines, cursorLine, cursorCol};
   }
   ```

2. **CombinedProvider** (`source/tui/autocomplete/combined-provider.ts`):
   - Chains multiple providers together
   - Tries each provider in order until suggestions are found

3. **Existing Providers:**
   - **CommandProvider** (`source/tui/autocomplete/command-provider.ts`): Handles `/` slash commands
   - **FileSearchProvider** (`source/tui/autocomplete/file-search-provider.ts`): Handles file path completions
   - **AttachmentProvider** (`source/tui/autocomplete/attachment-provider.ts`): Extends FileSearchProvider for `#` file attachments

4. **Trigger Characters** (`source/tui/components/editor.ts:850-895`):
   - `/` - Slash commands (at start of message)
   - `@` - File references (fuzzy search)
   - `#` - File attachments

### 4. Editor Component (`source/tui/components/editor.ts`)

**Key Methods:**

- `setAutocompleteProvider(provider)` - Sets the autocomplete provider (`source/tui/components/editor.ts:282-284`)
- `tryTriggerAutocomplete()` - Triggers autocomplete based on context (`source/tui/components/editor.ts:1388-1420`)
- `insertCharacter()` - Handles character input and triggers autocomplete (`source/tui/components/editor.ts:836-895`)

**Current Autocomplete Triggers:**
- When typing `/` at start of message: triggers slash command autocomplete
- When typing `@` after whitespace: triggers file reference autocomplete
- When typing `#` after whitespace: triggers file attachment autocomplete
- When typing letters after `/`: updates slash command suggestions

### 5. REPL Integration (`source/repl/index.ts:185-190`)

```typescript
const autocompleteProvider = createDefaultProvider(
  [...(await this.options.commands.getCompletions())],
  this.options.workspace.allowedDirs,
);
this.editor.setAutocompleteProvider(autocompleteProvider);
```

## Implementation Requirements

To implement issue #130, the following changes are needed:

### Option A: Add a New Trigger Character for Skills

1. **Choose a trigger character**: Common options include:
   - `>` - Common for skill/command palette style
   - `!` - Exclamation for "actions"
   - `:` - Colon (used in some tools)

2. **Create a SkillProvider** (`source/tui/autocomplete/skill-provider.ts`):
   - Implement `AutocompleteProvider` interface
   - Load skills via `loadSkills()` from `source/skills/index.ts`
   - Filter to only include `userInvocable: true` skills
   - Return skill names as autocomplete items

3. **Add trigger logic in Editor** (`source/tui/components/editor.ts`):
   - In `insertCharacter()`, detect the chosen trigger character
   - Call `tryTriggerAutocomplete()` when trigger is typed

4. **Register provider in REPL** (`source/repl/index.ts`):
   - Add SkillProvider to CombinedProvider

### Option B: Enhance CommandProvider with Skill Filtering

1. Modify `CommandProvider` to accept a separate list of skills
2. Add a second trigger mechanism that only shows skills

## Key Files to Modify

1. **`source/tui/components/editor.ts`** - Add skill trigger detection in `insertCharacter()`
2. **`source/tui/autocomplete/`** - Create new `skill-provider.ts` or extend existing providers
3. **`source/repl/index.ts`** - Register new provider
4. **`source/skills/index.ts`** - Already has `loadSkills()` function (use existing)

## Test Coverage Considerations

- Test skill autocomplete with various trigger characters
- Test filtering of non-user-invocable skills
- Test that skills are sorted alphabetically
- Test completion application inserts correct text

## Edge Cases

1. **No skills available**: Should show empty list or no autocomplete
2. **Skill with arguments**: Should allow passing arguments after skill name
3. **Partial matching**: Should filter skills as user types
4. **Special characters in skill names**: Skills use lowercase letters, numbers, hyphens only
5. **Concurrent typing**: Debounce rapid autocomplete requests

## Dependencies

- `loadSkills()` from `source/skills/index.ts`
- `AutocompleteProvider` interface from `source/tui/autocomplete/base-provider.ts`
- `Editor` component from `source/tui/components/editor.ts`
- `CombinedProvider` from `source/tui/autocomplete/combined-provider.ts`

## Conclusion

The implementation requires:
1. A new trigger character detection in the Editor
2. A new autocomplete provider for skills (or repurposing existing providers)
3. Integration with the REPL's autocomplete system

The skills system is already well-established with proper filtering for `userInvocable`, so the main work is adding the UI trigger and provider.
