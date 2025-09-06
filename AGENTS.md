### Commands

- **Build:** `npm run build`
- **Typecheck:** `npm run typecheck`
- **Lint:** `npm run lint`
- **Lint Single File:** `npm run lint -- path/to/file.ts`
- **Format:** `npm run format`
- **Fix Lint/Format:** `npm run lint:fix`
- **Test:** `npm test`
- **Run Single Test File:** `node --no-warnings --test test/path/to/your.test.ts`
- **Find Unused Code/Deps:** `npm run knip`

### Code Style & Guidelines

- **Code Organization:** All source code for this project is stored in `./source`.
- **Language:** Strict TypeScript (ESNext target). Enable all strict checks.
- **Modules:** Use ES Modules (`import`/`export`). Add `.ts` extensions to relative imports. Use `node:` prefix for Node.js built-ins (e.g., `import fs from 'node:fs'`).
- **Formatting/Linting:** Adhere strictly to Biome rules (`npm run format`, `npm run lint`).
- **Types:** Provide explicit types. Avoid `any` unless absolutely necessary. Always check potentially `undefined`/`null` values. **Do not use non-null assertions (`!`)**.
- **Naming:** Use camelCase for variables/functions, PascalCase for classes/types/interfaces.
- **Error Handling:** Implement robust error handling (try/catch, result patterns, etc.).
- **Logging:** Avoid `console.log` for debugging; use a proper logger or remove before committing.
- **Commits:** Follow the Conventional Commits standard for commit messages.
- **Commit Message Length:** Keep commit message lines (header, body, and footer) under 100 characters.
- **Comments** Never add comments to the code explaining the edit you are making. Comments that help explain how code works are acceptable.
- **Testing** Use `node:test` and `node:assert/strict` to write unit tests in the `./test` directory. Test directory should follow the same folder structure as source.
