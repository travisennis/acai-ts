# Agent Guidelines for acai-ts

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
- **Dev Mode:** `npm run dev`
- **Find Unused Code/Deps:** `npm run knip`
- **Full Check:** npm run typecheck && npm run lint:fix && npm run format

## Running the App
- **CLI:** `acai -p <prompt>`
- **Application logs:** `~/.acai/logs/current.log`

## Code Style Guidelines
- **Language:** Strict TypeScript with ESNext target
- **Modules:** ES Modules only. Use `.ts` extensions for relative imports
- **Node Built-ins:** Use `node:` prefix (e.g., `import fs from 'node:fs'`)
- **Formatting:** Biome rules (2-space indents, 80 char line width)
- **Types:** Explicit types required. Avoid `any`. No non-null assertions (`!`)
- **Naming:** camelCase (variables/functions), PascalCase (classes/types)
- **Error Handling:** Robust try/catch, result patterns
- **Logging:** Use `console.info`, never `console.log` for debugging
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
- Run the full check command when you complete a task to make sure the code is correct.
- The version of node acai supports can run typescript directly.
- Never add comments explaining edits - only comments that explain how code works
- Always run `Full Check` before committing
- Whenever adding or removing files from the project, always update ./ARCHITECTURE.md
- Whenever adding or removing files from the project or adding or removing features from the project, update ./README.md if needed
