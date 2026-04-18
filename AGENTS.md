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
- **Application logs:** `~/.acai/logs/current.log` Do not read this file directly as it can be quite big. Use tail to see the end of the log file.
- **Sessions:** `~/.acai/sessions/*.json` Do not read session files directly as they can be quite big. Use the dynamic-read-session tool to get a serialized version of the file.
- **IMPORTANT:** Use `tmux` when running the REPL. The `Bash` tool does not support interactive commands. See the `manual-testing` skill for detailed instructions.

## Code Style Guidelines

- **Language:** Strict TypeScript with ESNext target
- **Modules:** ES Modules only. Use `.ts` extensions for relative imports
- **Error Handling:** Robust try/catch, result patterns
- **Testing:** `node:test` and `node:assert/strict` in `./test` directory

## PR Requirements

- Follow PR template with description, testing details, and checklist
- All tests must pass
- Code follows style guidelines
- No new warnings generated
- Documentation updated if needed

## ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in .agent/PLANS.md) from design to implementation.

## Important Notes

- Run the `Full Check` command when you complete a task to make sure the code is correct.
- The version of node that acai supports can run typescript directly.
- Always use single quotes for commit messages containing special characters
- Never add comments explaining edits - only add comments that explain or clarify how code works
- Never add comments indicating that code was removed
- Always run `Full Check` before committing
- Whenever adding or removing files from the project, always update ./ARCHITECTURE.md
- Whenever adding or removing files from the project or adding or removing features from the project, update ./README.md if needed
- When `npm install` or typecheck fails due to missing type definitions or stale `node_modules`, delete `node_modules` and reinstall with `npm install --include=dev --ignore-scripts`
