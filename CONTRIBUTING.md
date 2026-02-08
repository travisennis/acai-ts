# Contributing to Acai

## Development Environment Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/travisennis/acai-ts.git
   cd acai-ts
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   touch .env
   # Add your API keys (see docs/configuration.md)
   ```

3. **Development workflow:**
   ```bash
   # Run in development mode (uses .env file)
   npm run dev

   # Build and test
   npm run build
   npm test

   # Code quality
   npm run lint
   npm run format
   ```

## Available NPM Scripts

| Script | Description |
| :--- | :--- |
| `npm run build` | Compiles TypeScript source to JavaScript. |
| `npm run clean` | Removes `dist/` and `coverage/` directories. |
| `npm run compile` | Compiles TypeScript files (`tsc --pretty`). |
| `npm run lint` | Runs Biome linter for code style and quality. |
| `npm run lint:fix` | Automatically fixes linting issues using Biome. |
| `npm run test` | Runs unit tests using `node:test`. |
| `npm run test:coverage` | Runs tests with code coverage using `c8`. |
| `npm run format` | Formats the codebase using Biome. |
| `npm run dev` | Starts the application in development mode. |
| `npm run check` | Runs typecheck, lint fix, and format. |
| `npm run typecheck` | Type checks the codebase without emitting files. |
| `npm run oxlint` | Runs Oxlint for additional code quality checks. |
| `npm run knip` | Detects unused files, dependencies, and exports. |
| `npm run update` | Interactively checks for outdated npm packages. |
| `npm run cpd` | Checks for copy-pasted code using `jscpd`. |

## Code Style

- **Language:** Strict TypeScript with ESNext target
- **Modules:** ES Modules only. Use `.ts` extensions for relative imports
- **Node Built-ins:** Use `node:` prefix (e.g., `import fs from 'node:fs'`)
- **Formatting:** Biome rules (2-space indents, 80 char line width)
- **Types:** Explicit types required. Avoid `any`. No non-null assertions (`!`)
- **Naming:** camelCase (variables/functions), PascalCase (classes/types)
- **Testing:** `node:test` and `node:assert/strict` in `./test` directory

## Commit & Branch Strategy

- **Commits:** Follow [Conventional Commits](https://www.conventionalcommits.org/) standard
- **Message Length:** Keep lines under 100 characters
- **Branch Strategy:** Feature branches (`feat/`, `fix/`) merged to `master`

## PR Requirements

- All tests must pass
- Code follows style guidelines
- No new warnings generated
- Documentation updated if needed
