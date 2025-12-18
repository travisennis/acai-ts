---
name: "Team Conventions"
description: "Coding standards and team practices for acai-ts"
---
# Team Conventions

## Code Style

- **Indentation**: 2 spaces
- **Line length**: 80 characters max
- **Naming**: camelCase for variables/functions, PascalCase for classes/types
- **Imports**: Use `node:` prefix for Node.js built-ins
- **Types**: Explicit types required, avoid `any`, no non-null assertions (`!`)

## Error Handling

- Use try/catch blocks for async operations
- Log errors with `logger.error()`
- Never use `console.log()` for debugging - use `console.info()` instead
- Validate inputs and sanitize outputs

## Git Practices

- Conventional Commits standard
- Feature branches: `feat/`, `fix/`, etc.
- PRs require passing tests and code review
- Keep commit messages under 100 characters

## Testing

- Use `node:test` and `node:assert/strict`
- Tests in `./test/` directory
- Run tests with `npm test`
- Test single file: `node --no-warnings --test test/path/to/test.ts`