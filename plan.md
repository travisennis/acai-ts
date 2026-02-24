# Implementation Plan: Skill Autocomplete Trigger (Issue #130)

## Overview

Create an autocomplete trigger in the Editor component that lists user-invocable skills by name, triggered via a new trigger character (`>`).

## Summary

This feature adds a new autocomplete provider for skills, triggered when the user types `>` at the start of a message or after whitespace. The autocomplete will show all skills where `userInvocable: true`.

## Design Decisions

### Trigger Character: `>`
- Common convention for skill/command palette style
- Doesn't conflict with existing triggers (`/` for commands, `@` for files, `#` for attachments)
- Visually distinct from similar features in other tools

### Architecture
- Create a new `SkillProvider` class implementing `AutocompleteProvider`
- Add trigger detection in `Editor.insertCharacter()` method
- Extend `createDefaultProvider()` to accept optional skills parameter, or create new factory function in REPL

---

## Phase 1: Create SkillProvider

### Files to Create
- `source/tui/autocomplete/skill-provider.ts` - New autocomplete provider

### Implementation Details

**SkillProvider class** (`source/tui/autocomplete/skill-provider.ts`):
```typescript
import type {
  AutocompleteItem,
  AutocompleteProvider,
} from "./base-provider.ts";
import type { Skill } from "../../skills/index.ts";

export class SkillProvider implements AutocompleteProvider {
  private skills: Skill[];

  constructor(skills: Skill[] = []) {
    // Filter to only user-invocable skills
    this.skills = skills.filter((skill) => skill.userInvocable);
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Check for skill trigger (">" at start or after whitespace)
    if (textBeforeCursor.match(/(?:^|[\s])>$/)) {
      // User just typed ">" - show all skills
      const items = this.skills.map((skill) => ({
        value: skill.name,
        label: skill.name,
        description: skill.description,
      }));

      // Sort alphabetically
      items.sort((a, b) => a.label.localeCompare(b.label));

      return { items, prefix: "" };
    }

    // Check for partial match (typing after ">")
    const match = textBeforeCursor.match(/(?:^|[\s])>([^\s]*)$/);
    if (match) {
      const prefix = match[1];
      const filtered = this.skills
        .filter((skill) => skill.name.toLowerCase().startsWith(prefix.toLowerCase()))
        .map((skill) => ({
          value: skill.name,
          label: skill.name,
          description: skill.description,
        }));

      filtered.sort((a, b) => a.label.localeCompare(b.label));

      if (filtered.length === 0) return null;

      return { items: filtered, prefix };
    }

    return null;
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Find the position of ">" in the text before cursor
    const triggerMatch = textBeforeCursor.match(/(?:^|[\s])>([^\s]*)$/);
    if (!triggerMatch) {
      return { lines, cursorLine, cursorCol };
    }

    const triggerStart = triggerMatch.index!;
    const beforeTrigger = currentLine.slice(0, triggerStart + 1); // Include ">"
    const afterCursor = currentLine.slice(cursorCol);

    // Replace prefix after ">" with selected skill name
    const newLine = `${beforeTrigger}${item.value}${afterCursor}`;
    const newLines = [...lines];
    newLines[cursorLine] = newLine;

    return {
      lines: newLines,
      cursorLine,
      cursorCol: beforeTrigger.length + item.value.length,
    };
  }
}
```

### Export
Add export to `source/tui/autocomplete.ts`:
```typescript
export { SkillProvider } from "./autocomplete/skill-provider.ts";
```

### Success Criteria - Phase 1
- [x] **Automated**: `SkillProvider` class compiles without errors
- [x] **Automated**: TypeScript type checking passes
- [x] **Automated**: Unit tests created for SkillProvider in `test/tui/autocomplete/skill-provider.test.ts`
- [x] **Manual**: SkillProvider correctly filters non-user-invocable skills

---

## Phase 2: Add Trigger Detection in Editor

### Files to Modify
- `source/tui/components/editor.ts` - Add `>` trigger detection in `insertCharacter()`

### Implementation Details

Add trigger detection in `insertCharacter()` method around line 856 (after `#` trigger):

```typescript
// Auto-trigger for ">" skill invocation
else if (char === ">") {
  const currentLine = this.state.lines[this.state.cursorLine] || "";
  const textBeforeCursor = currentLine.slice(0, this.state.cursorCol);
  const charBeforeGt = textBeforeCursor[textBeforeCursor.length - 2];
  if (
    textBeforeCursor.length === 1 ||
    charBeforeGt === " " ||
    charBeforeGt === "\t"
  ) {
    void this.tryTriggerAutocomplete();
  }
}
```

Also update the existing letter-typing handler to support `>` context (around line 897):

```typescript
// Check if we're in a skill context (">" with optional prefix)
else if (textBeforeCursor.match(/(?:^|[\s])>[^\s]*$/)) {
  void this.tryTriggerAutocomplete();
}
```

### Success Criteria - Phase 2
- [x] **Automated**: TypeScript type checking passes
- [x] **Automated**: `npm run lint` passes (with pre-existing warning)
- [x] **Manual**: Typing `>` at start of message triggers autocomplete
- [x] **Manual**: Typing `>` after whitespace triggers autocomplete
- [x] **Manual**: Continuing to type after `>` filters skills

---

## Phase 3: Integrate SkillProvider in REPL

### Files to Modify
- `source/repl/index.ts` - Load skills and create SkillProvider
- `source/tui/autocomplete.ts` - Optionally enhance createDefaultProvider

### Implementation Details

Option A - Enhance REPL initialization (`source/repl/index.ts:185-190`):

```typescript
import { SkillProvider } from "./tui/autocomplete/skill-provider.ts";
import { loadSkills } from "./skills/index.ts";

// In init() method, before creating autocomplete provider:
const skills = await loadSkills();
const userInvocableSkills = skills.filter(s => s.userInvocable);

const autocompleteProvider = new CombinedProvider([
  new CommandProvider(await this.options.commands.getCompletions()),
  new AttachmentProvider(),
  new FileSearchProvider(),
  new SkillProvider(userInvocableSkills),
]);
```

Option B - Extend createDefaultProvider (simpler, maintains backward compatibility):

```typescript
// In source/tui/autocomplete.ts
export function createSkillAwareProvider(
  commands: SlashCommand[] = [],
  skills: Skill[] = [],
  allowedDirs: string[] = [process.cwd()],
) {
  const userInvocableSkills = skills.filter((s) => s.userInvocable);
  
  return new CombinedProvider([
    new CommandProvider(commands),
    new AttachmentProvider(),
    new FileSearchProvider(),
    new SkillProvider(userInvocableSkills),
  ]);
}
```

**Recommendation**: Use Option B for cleaner API and backward compatibility.

### Success Criteria - Phase 3
- [x] **Automated**: TypeScript type checking passes
- [x] **Automated**: All existing tests pass
- [x] **Manual**: Skills appear in autocomplete when typing `>`
- [x] **Manual**: Selecting a skill inserts the skill name correctly
- [x] **Manual**: Skills without `userInvocable: true` do NOT appear

---

## Phase 4: Testing and Edge Cases

### Test Scenarios

1. **No skills available**: Show empty list or no autocomplete (graceful handling)
2. **Skill with arguments**: Arguments not supported in this phase (v2)
3. **Partial matching**: Filter skills as user types after `>`
4. **Special characters**: Skills use lowercase letters, numbers, hyphens only
5. **Concurrent typing**: Use existing debounce in autocomplete system
6. **Multiple cursors**: Not supported (single cursor only)

### Additional Tests

Create tests in `test/tui/autocomplete/skill-provider.test.ts`:
- `getSuggestions` returns all user-invocable skills when just `>` is typed
- `getSuggestions` filters by prefix when typing after `>`
- `getSuggestions` returns null for non-`>` contexts
- `applyCompletion` correctly inserts skill name
- Skills are sorted alphabetically

### Success Criteria - Phase 4
- [x] **Automated**: All new tests pass
- [x] **Automated**: Full test suite passes (`npm test`)
- [x] **Manual**: Test with real skills in `~/.agents/skills/`
- [x] **Manual**: Verify skill descriptions display in autocomplete

---

## What We're NOT Doing (v1)

1. **Skill arguments** - Full command syntax with arguments will be v2
2. **Nested skill paths** - Only skill name, not directory path
3. **Custom trigger characters** - Only `>` in this implementation
4. **Skill preview/description expansion** - Just labels in v1

---

## Dependencies

- `loadSkills()` from `source/skills/index.ts` (already exported)
- `AutocompleteProvider` interface from `source/tui/autocomplete/base-provider.ts`
- `Editor` component from `source/tui/components/editor.ts`
- `CombinedProvider` from `source/tui/autocomplete/combined-provider.ts`

---

## Key Files Summary

| File | Action |
|------|--------|
| `source/tui/autocomplete/skill-provider.ts` | Create |
| `source/tui/autocomplete.ts` | Modify (add export) |
| `source/tui/components/editor.ts` | Modify (add trigger) |
| `source/repl/index.ts` | Modify (integrate provider) |
| `test/tui/autocomplete/skill-provider.test.ts` | Create |

---

## Verification Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Format check
npm run format

# Full check
npm run check

# Tests
npm test

# Manual testing in REPL
tmux
# Then run: acai
```
