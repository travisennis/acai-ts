# AGENTS.md

## Project Overview

This app, acai-ts, is an AI-assistant CLI tool built with TypeScript. It is an agent hardness similar to Claude Code, opencode, and Codex. The project uses a modular architecture with source code in `./source`, organized into commands, tool (agent/llm callable), models, and UI components. Tests are in `/test`. Tech stack: Node.js ≥20, TypeScript (ESNext), Biome for linting/formatting, and AI SDK providers.

## Build & Development Commands

- **Build:** `npm run build`
- **Typecheck:** `npm run typecheck`
- **Lint:** `npm run lint`
- **Lint Single File:** `npm run lint -- path/to/file.ts`
- **Format:** `npm run format`
- **Fix Lint/Format:** `npm run lint:fix`
- **Run All Tests:** `npm test`
- **Run Single Test:** `node --no-warnings --test test/path/to/test.ts`
- **Find Unused Code/Deps:** `npm run knip`
- **Full Check (typecheck, lint, format):** `npm run check` 

## Running the App

- **REPL:** `acai`
- **CLI:** `acai -p <prompt>`
- **Dev Mode:** `node source/index.ts`
- **Application logs:** `~/.acai/logs/current.log`
- **IMPORTANT:** Use `tmux` when running the REPL. The `Bash` tool does not support interactive commands. See the `manual-testing` skill for detailed instructions.

## Code Style Guidelines

- **Language:** Strict TypeScript with ESNext target
- **Modules:** ES Modules only. Use `.ts` extensions for relative imports
- **Organization:** Keep files <~500 LOC; split/refactor as needed.
- **Node Built-ins:** Use `node:` prefix (e.g., `import fs from 'node:fs'`)
- **Formatting:** Biome rules (2-space indents, 80 char line width)
- **Types:** Explicit types required. Avoid `any`. No non-null assertions (`!`)
- **Naming:** camelCase (variables/functions), PascalCase (classes/types)
- **Error Handling:** Robust try/catch, result patterns
- **Logging:** Use logger or `console.info`, never `console.log` for debugging
- **Testing:** `node:test` and `node:assert/strict` in `./test` directory

## Commit & Branch Strategy

- **Commits:** Conventional Commits standard
- **Message Length:** Keep lines under 100 characters
- **Branch Strategy:** Feature branches (`feat/`, `fix/`) merged to `master`

## PR Requirements

- Follow PR template with description, testing details, and checklist
- All tests must pass
- Code follows style guidelines
- No new warnings generated
- Documentation updated if needed

## Important Notes

- Run the `Full Check` command when you complete a task to make sure the code is correct.
- The version of node that acai supports can run typescript directly.
- Always use single quotes for commit messages containing special characters
- Never add comments explaining edits - only add comments that explain or clarify how code works
- Never add comments indicating that code was removed
- Always run `Full Check` before committing
- Whenever adding or removing files from the project, always update ./ARCHITECTURE.md
- Whenever adding or removing files from the project or adding or removing features from the project, update ./README.md if needed

## Git Workflow Rules

- **Never modify published git history** (no amend, rebase, reset --hard on pushed commits)
- **Never perform hard resets without explicit user permission**
- **Always confirm before destructive git operations** (reset --hard, clean, stash pop that could overwrite changes)
- **Use `git add -p` with tmux or `git add <specific-files>` instead of `git add -A`** to avoid staging unintended changes
- If you accidentally stage unrelated changes, point it out to the user before committing
- **Never use `--no-verify` without explicit user permission**
