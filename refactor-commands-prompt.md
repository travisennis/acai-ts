@command-refactor-progress.txt

You are refactoring commands in the source/commands directory to follow the new project structure pattern.

## Reference Pattern

The history command is already refactored as the reference:

```
source/commands/history/
├── index.ts      # Command handler and UI components
├── types.ts      # Type definitions
└── utils.ts      # Exported utilities for testing
```

## Your Task

Refactor `source/commands/${commandFile}` using this pattern:

### 1. Analyze the Command
Read the full command file and identify:
- The exported command function
- Type/interface definitions
- Helper/utilities functions that can be extracted
- UI components (if any)

### 2. Create Directory Structure
Create: `source/commands/${commandName}/`

### 3. Create types.ts
Extract all type/interface definitions specific to this command.
Export them for use by other modules.

### 4. Create utils.ts
Extract pure utility functions that can be tested independently.
IMPORTANT: Export these functions so unit tests can import them directly.

### 5. Create index.ts
- Import command function, types, and utilities
- Keep only the main command handler and UI components
- Update import paths (note: now one level deeper, so "../" becomes "../../")
- Export the main command function as the public API

### 6. Update manager.ts
Change import from:
``` typescript
import { ${capitalizedName}Command } from "./${commandFile}";
```
To:
``` typescript
import { ${capitalizedName}Command } from "./${commandName}/index.ts";
```

### 7. Create Unit Tests
Create `test/commands/${commandName}.test.ts`
Import utilities from `../../source/commands/${commandName}/utils.ts`
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
│   │   │   ├── types.ts
│   │   │   └── utils.ts
```

In File Descriptions, replace:
```
- **source/commands/${commandFile}**: Description...
```
With:
```
- **source/commands/${commandName}/index.ts**: Main ${commandName} implementation.
- **source/commands/${commandName}/types.ts**: Type definitions for ${commandName}.
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

## Important Notes

- Import paths: commands are now one level deeper, adjust "../" to "../../" for sibling modules
- The public API (what manager.ts imports) should remain unchanged
- Export utilities in utils.ts so they can be directly tested
- Follow the code style and conventions in the history command
- ONLY WRITE ONE TEST PER ITERATION.
- If all commands are refactored, then output `<promise>COMPLETE</promise>` and nothing else.

