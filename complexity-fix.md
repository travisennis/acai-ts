# Cognitive Complexity Fix Workflow

Iteratively reduce cognitive complexity across the codebase to a maximum threshold of 15.

## Setup

1. **Set the threshold**: Update `biome.json` and set `noExcessiveCognitiveComplexity` → `maxAllowedComplexity` to **15** and change the `level` to **"error"**.

## Iteration Loop

2. **Find violations**: Run `npm run check` and collect all `lint/complexity/noExcessiveCognitiveComplexity` errors. If there are no errors, the workflow is complete — stop here.

3. **Pick one method**: Choose a single method from the list of violations to fix.

4. **Analyze the method**: Read the method and understand its structure. Identify the sources of complexity — deeply nested logic, long if-else chains, repeated branching patterns, etc.

5. **Write tests first**: Before refactoring, write comprehensive tests that cover the method's current behavior. These tests serve as a safety net to ensure the refactor doesn't break anything.

6. **Verify tests pass**: Run `npm test` to confirm all tests (including the new ones) pass against the current code.

7. **Refactor the method**: Apply the approved refactoring approach to reduce the method's cognitive complexity below the threshold.

8. **Verify the fix**: Run `npm run check` to confirm the method no longer triggers a complexity error, then run `npm test` to confirm all tests still pass.

9. **Commit the fix**: Stage and commit the changes. Since there are existing lint errors elsewhere in the codebase that will cause the precommit hook to fail, you must use `git commit --no-verify` to bypass the precommit checks. Use a conventional commit message following the format `fix: reduce cognitive complexity of <method/function-name> in <file-path>`, replacing `<method/function-name>` with the method or function you worked on and the `<file-path>` with the relative path to the modified file.

11. **Ask to continue**: Present the results to the user and ask if they'd like to proceed to the next violation. If yes, return to step 2. If no, stop.
