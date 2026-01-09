@command-refactor-progress.txt

You are refactoring commands in the source/commands directory to follow the new project structure pattern.

## Critical Workflow Instructions

**WORK ON ONE COMMAND AT A TIME.** Complete steps 1-12 for a single command. Choose a command that has not been updated and work on it to completion. When that command is done you are done. The shell script will call this prompt again to continue with the next command. If all commands have been refactored then respond with `<promise>COMPLETE</promise>`.

## Reference Pattern

The history command is already refactored as the reference:

```
source/commands/history/
├── index.ts      # Command handler and UI components
├── types.ts      # Type definitions (only if types exist)
└── utils.ts      # Exported utilities for testing (only if utilities exist)
```

## Your Task

Refactor `source/commands/${commandFile}` using this pattern:

### 1. Analyze the Command
Read the full command file and identify:
- The exported command function
- Type/interface definitions that are specific to this command
- Helper/utilities functions that can be extracted and tested independently
- UI components (if any)

### 2. Create Directory Structure
Create: `source/commands/${commandName}/`

### 3. Create index.ts
- Keep the main command handler and UI components
- Update import paths: commands are now one level deeper, so "../" becomes "../../"
- Export the main command function as the public API

### 4. Conditionally Create types.ts
ONLY create this file if the command has type/interface definitions specific to this command that aren't already in `./types.ts`.
Extract and export them for use by other modules.

### 5. Conditionally Create utils.ts
ONLY create this file if the command has pure utility functions that can be tested independently.
Extract and export them so unit tests can import them directly.

### 6. Update manager.ts
Change import from:
```typescript
import { ${capitalizedName}Command } from "./${commandFile}";
```
To:
```typescript
import { ${capitalizedName}Command } from "./${commandName}/index.ts";
```

### 7. Create Unit Tests
Create `test/commands/${commandName}.test.ts`
If utils.ts exists, import utilities from `../../source/commands/${commandName}/utils.ts`
Test all exported utility functions with comprehensive cases.

### 8. Delete Original File
Delete `source/commands/${commandFile}` after verification.

### 9. Update ARCHITECTURE.md
In Project Structure, replace:
```
│   │   ├── ${commandFile}
```
With:
```
│   │   ├── ${commandName}/
│   │   │   ├── index.ts
```
If types.ts exists, add:
```
│   │   │   ├── types.ts
```
If utils.ts exists, add:
```
│   │   │   ├── utils.ts
```

In File Descriptions, replace:
```
- **source/commands/${commandFile}**: Description...
```
With:
```
- **source/commands/${commandName}/index.ts**: Main ${commandName} implementation.
```
If types.ts exists, add:
```
- **source/commands/${commandName}/types.ts**: Type definitions for ${commandName}.
```
If utils.ts exists, add:
```
- **source/commands/${commandName}/utils.ts**: Utility functions for ${commandName}.
```

### 10. Verify
Run these commands and ensure they pass:
```bash
npm test -- test/commands/${commandName}.test.ts
npm run typecheck
npm run check
```

### 11. Commit
Commit with message: refactor: <describe command and how it was refactored>

### 12. Update progress file
Append super-concise notes to command-refactor-progress.txt: what you did, any learnings.

## Important Notes to Remember

- Import paths: commands are now one level deeper, adjust "../" to "../../" for sibling modules
- The public API (what manager.ts imports) should remain unchanged
- Only create types.ts and utils.ts if there's actual code to put in them
- Follow the code style and conventions in the history command
- If all commands are refactored, then output `<promise>COMPLETE</promise>` and nothing else.
