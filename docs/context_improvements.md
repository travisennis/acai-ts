**Code Overlap Analysis:**

1. **codeManager/analyzer.ts**
   - Project-wide static analysis (file structure, dependencies, metrics)
   - Language-agnostic scanning
   - Focus: Quantitative metrics and dependency graphs

2. **context/code-analyzer.ts**
   - Semantic code analysis (AST parsing)
   - Entity relationship mapping
   - Focus: Dynamic context for AI interactions

**Refactoring Suggestions:**

1. Create `source/core/ast-utils.ts` with shared TS parsing logic from both
2. Move `CodeEntity` interface to `source/core/types.ts`
3. Have `CodeAnalyzer` consume `analyzeTypeScriptFile` from codeMap
4. Delete redundant dependency analysis in context/code-analyzer

**Integration Opportunities:**

1. **AI Prompt Enrichment**
   ```ts
   // In Repl class
   const context = await contextManager.enrichPrompt(userPrompt);
   promptManager.push(`${context}\n\n${userPrompt}`);
   ```

2. **Change Impact Analysis**
   ```ts
   // After git analysis
   const affected = contextManager.query('file:src/featureX.ts');
   terminal.box('Impact', affected.map(e => e.id).join('\n'));
   ```

3. **Code Navigation**
   ```ts
   // Add command
   commands.register({
     name: 'where-used',
     handler: async (term, args) => {
       const results = await contextManager.query(args[0]);
       term.table(results.map(r => [r.type, r.id]));
     }
   });
   ```

**Key Architectural Moves:**

1. Make `codeManager` the source of truth for static analysis
2. Use `context` subsystem for runtime relationships/LLM context
3. Add `ContextAwareCommand` base class that injects contextManager

**Suggested PR Structure:**
```
refactor(core): Consolidate AST analysis utilities
- Create shared ast-utils module
- Update CodeAnalyzer to use core AST functions
- Remove duplicate type definitions
```
