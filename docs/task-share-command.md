# Task: Implement `/share` Command for Sharing Sessions via GitHub Gist

## Overview

Implement a `/share` command that creates a shareable view of the current conversation session by uploading it to a GitHub Gist. The shared session will be accessible via a web viewer, allowing others to view the conversation in a read-only format.

## Reference Implementation

The command should follow the pattern established by [shittycodingagent.ai](https://shittycodingagent.ai/session/?0cba14eb446b3d306be8899dd615cc73), which:
- Stores sessions as GitHub Gists
- Renders sessions as interactive HTML pages
- Preserves conversation structure, tool calls, and outputs

## Requirements

### Functional Requirements

1. **Command Behavior**
   - Command name: `/share`
   - Description: "Share the current session as a GitHub Gist for viewing in a web browser"
   - Scope: Only share the current active session (not historical sessions)
   - No arguments required

2. **Authentication**
   - Use GitHub CLI (`gh`) for authentication
   - Assume user has already run `gh auth login`
   - Verify authentication is available before attempting to create gist

3. **Output**
   - Display the shareable URL after successful creation
   - Show clear error messages if:
     - Not authenticated with GitHub
     - GitHub CLI not installed
     - Network errors
     - Gist creation fails

4. **Session Data to Include**
   - Conversation messages (system, user and assistant)
   - Tool calls and their results (including tool names)
   - Timestamps
   - Session title
   - Model information
   - Project name

### Technical Requirements

1. **Command Structure**
   - Follow existing command patterns in `source/commands/`
   - Create new directory: `source/commands/share/`
   - Files needed:
     - `source/commands/share/index.ts` - Main command implementation
     - `source/commands/share/types.ts` - Type definitions (if needed)
     - `source/commands/share/html-renderer.ts` - HTML generation utility (keeps index.ts clean and improves testability)

2. **Session Format**
   - Export session as **HTML file** for Gist content (named `index.html`)
   - HTML should be formatted for the [Gist Preview](https://gistpreview.github.io/) viewer
   - Include metadata: sessionId, title, modelId, project, createdAt, updatedAt, messages
   - HTML structure should render the conversation in a readable format
   - Include CSS styling for a clean terminal-like appearance
   - Display tool calls and outputs in a formatted way (include tool names)
   - **HTML-escape all message content** to prevent XSS (user/assistant content could contain `<script>` tags or other HTML)

3. **Gist Creation**
   - Use `gh gist create` command
   - Set visibility: public
   - Filename: `index.html`
   - Description: "Acai session: {session title}"

4. **Gist Content Format**
   The Gist should contain an HTML file (`index.html`) formatted for the Gist Preview viewer. The HTML should:
   - Use a terminal-like design with dark theme
   - Display conversation messages in chronological order
   - Distinguish between user, assistant, and system messages (each with distinct styling)
   - Format tool calls and their outputs in a readable way, displaying tool names
   - Include session metadata (title, model, project, dates) at the top
   - Be self-contained with embedded CSS

   Example HTML structure:
   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <meta charset="utf-8">
     <title>Session: {title}</title>
     <style>
       /* Terminal-like dark theme styles */
       .message { margin: 8px 0; padding: 8px; }
       .user { color: #4af626; }
       .assistant { color: #ffffff; }
       .system { color: #888888; font-style: italic; }
       .tool { color: #ffd700; font-family: monospace; }
       .tool-name { color: #ff8c00; font-weight: bold; }
       /* ... additional styles ... */
     </style>
   </head>
   <body>
     <h1>Session: {title}</h1>
      <p><strong>Project:</strong> {project} | <strong>Model:</strong> {modelId} | <strong>Created:</strong> {createdAt}</p>
     <hr>
     <!-- Messages rendered as div elements -->
   </body>
   </html>
   ```

5. **URL Generation**
   - Gist URL format: `https://gist.github.com/{gistId}`
   - Shareable URL: `https://gistpreview.github.io/?{gistId}`
   - Display both URLs to the user

### Integration Requirements

1. **Command Manager Integration**
   - Register the command in `source/commands/manager.ts`
   - Add to the commands array in `initializeCommmands()`
   - Import: `import { shareCommand } from "./share/index.ts";`

2. **TUI Integration**
   - Use existing TUI components from `source/tui/index.ts`
   - Components to use:
     - `Text` - For displaying messages
     - `Spacer` - For layout
     - `Markdown` - If displaying formatted content
   - Follow patterns from similar commands (e.g., `/handoff`, `/history`)

3. **Session Access**
   - Use `sessionManager.get()` to retrieve current session data
   - Access session metadata: `getSessionId()`, `getTitle()`, `getModelId()`
   - Use types from `SavedMessageHistory`

### Error Handling

1. **Authentication Errors**
   - Check if `gh` is installed
   - Check if user is authenticated
   - Display friendly error: "Please run `gh auth login` first"

2. **Gist Creation Errors**
   - Network failures
   - Rate limiting
   - Invalid session data
   - Display descriptive error messages

3. **Validation Errors**
   - Empty sessions
   - Malformed session data

## Implementation Steps

### Step 1: Create Command Structure

1. Create directory: `source/commands/share/`
2. Create files:
   - `index.ts` - Main command implementation
   - `types.ts` - Type definitions (if needed)
   - `utils.ts` - Utility functions (if needed)

### Step 2: Implement Command Logic

1. **Import Dependencies**
   - `sessionManager` from `CommandOptions`
   - TUI components from `source/tui/index.ts`
   - `CommandOptions` and `ReplCommand` types
   - Style utilities from `source/terminal/style.ts`

2. **Create Command Object**
   - Define command name: `/share`
   - Define description
   - Implement `getSubCommands()` (returns empty array)
   - Implement `handle()` method

3. **Handle Method Implementation**
   - Validate session exists and has content
   - Check GitHub CLI availability
   - Check GitHub authentication
   - Retrieve session data
   - **Prompt for confirmation if session is large** (>100 messages or >100KB content)
   - Create Gist via `gh gist create`
   - Display results

### Step 3: Gist Creation

1. **Prepare Session Data**
   - Get session from `sessionManager.get()`
   - Transform session data into HTML format using `html-renderer.ts`
   - **HTML-escape all user-generated content** before embedding
   - Include embedded CSS for terminal-like appearance
   - Validate data completeness

2. **Execute Gist Creation**
   - Use `gh gist create` command
   - Pass HTML content via stdin or file
   - Set appropriate flags
   - Capture Gist ID from output
   - Create `index.html` file with the HTML content

3. **Generate Shareable URLs**
   - Construct Gist URL
   - Construct viewer URL: `https://gistpreview.github.io/?{gistId}`

### Step 4: Display Results

1. **Success Output**
   ```
   Session shared successfully!
   View: https://gist.github.com/{gistId}
   Share: https://gistpreview.github.io/?{gistId}
   ```

2. **Error Output**
   ```
   Failed to share session: {error message}
   ```

### Step 5: Register Command

1. **Update Command Manager**
   - Import share command
   - Add to commands array
   - Ensure proper ordering

### Step 6: Testing

1. **Unit Tests**
   - Test command registration
   - Test error handling for unauthenticated state
   - Test session data formatting
   - Test URL generation
   - Test HTML escaping of dangerous content
   - Test tool name rendering in output

2. **Integration Tests**
   - Test with authenticated GitHub CLI
   - Test Gist creation and URL retrieval
   - Test with empty sessions
   - Test with large sessions

3. **Manual Testing**
   - Verify command appears in `/help`
   - Verify autocomplete works
   - Test sharing a conversation
   - Verify Gist is created correctly
   - Verify URLs are accessible

## Code Style Guidelines

Follow existing project conventions:

- **Language**: Strict TypeScript with ESNext target
- **Modules**: ES Modules with `.ts` extensions for relative imports
- **Node Built-ins**: Use `node:` prefix
- **Formatting**: Biome rules (2-space indents, 80 char line width)
- **Types**: Explicit types required, avoid `any`
- **Naming**: camelCase for variables/functions
- **Error Handling**: Robust try/catch with descriptive errors
- **Logging**: Use logger or `console.info` (not `console.log`)
- **Comments**: Only add comments that explain how code works

## Deliverables

1. **Code Files**
   - `source/commands/share/index.ts`
   - `source/commands/share/types.ts` (if needed)
   - `source/commands/share/html-renderer.ts`

2. **Tests**
   - `test/commands/share.test.ts`

3. **Documentation**
   - Update `source/commands/help/index.ts` if needed
   - Update `README.md` with command documentation
   - Update `ARCHITECTURE.md` if adding new files

4. **Verification**
   - All existing tests pass
   - New tests pass
   - Type checking passes
   - Linting passes
   - Code builds successfully

## Success Criteria

- [ ] Command is registered and accessible via `/share`
- [ ] Command appears in `/help` output
- [ ] Command works with GitHub CLI authentication
- [ ] Creates public Gist with session data
- [ ] Displays shareable URLs to user
- [ ] Handles errors gracefully with clear messages
- [ ] All message content is HTML-escaped to prevent XSS
- [ ] Tool calls display tool names
- [ ] System messages are properly styled
- [ ] Large sessions prompt for confirmation
- [ ] All tests pass
- [ ] Code follows project style guidelines
- [ ] Documentation updated

## Dependencies

- GitHub CLI (`gh`) - must be installed and authenticated
- No new npm dependencies required

## Related Files

- `source/commands/types.ts` - Command type definitions
- `source/commands/manager.ts` - Command registration
- `source/sessions/manager.ts` - Session management
- `source/tui/index.ts` - TUI components
- `source/terminal/style.ts` - Styling utilities
- `test/commands/` - Test examples

## Notes

- The viewer at `gistpreview.github.io/` expects Gist content to be HTML files
- Gist visibility should be public so the viewer can access it
- Consider adding a confirmation step for very long sessions
- The Gist filename must be `index.html` for the viewer to render it correctly
- The HTML should be self-contained with embedded CSS (no external dependencies)
- Design the HTML to work well in both the viewer and when opened directly from GitHub
