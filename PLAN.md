# Implementation Plan

**Overview**: Convert web-fetch.ts and web-search.ts from acai tools to completely independent skills, removing all web functionality from the acai codebase.

This implementation transforms the existing web tools into standalone, self-contained skills that operate independently of the acai-ts project. The skills will handle all web-related functionality including URL fetching, HTML processing, and web searching, while the acai-ts project will remove all dependencies on these capabilities. This follows the established skill pattern where skills are completely independent with their own dependencies, configuration, and execution.

## Types

**Type system changes**: Remove web tool references from acai-ts type system and establish skill-specific types.

### Type Definitions for Skills:

1. **Web Fetch Skill Types** (`.acai/skills/web-fetch/types.ts`):
   ```typescript
   export interface WebFetchOptions {
     url: string;
     output?: 'text' | 'html' | 'markdown' | 'json';
     useJina?: boolean;
     timeout?: number;
     verbose?: boolean;
   }

   export interface WebFetchResult {
     content: string;
     contentType: string;
     tokenCount: number;
     sourceUrl: string;
     success: boolean;
     error?: string;
   }
   ```

2. **Web Search Skill Types** (`.acai/skills/web-search/types.ts`):
   ```typescript
   export interface WebSearchOptions {
     query: string;
     results?: number;
     provider?: 'exa' | 'duckduckgo' | 'auto';
     safeSearch?: 'off' | 'moderate' | 'strict';
     json?: boolean;
   }

   export interface SearchResult {
     title: string;
     url: string;
     content: string;
     provider: string;
   }

   export interface WebSearchResult {
     results: SearchResult[];
     tokenCount: number;
     providerUsed: string;
     success: boolean;
     error?: string;
   }
   ```

### Type Definitions to Remove from acai-ts:

1. **CompleteToolNames** (source/tools/index.ts):
   - Remove: `"webFetch"`, `"webSearch"`
   - No replacements needed as skills are independent

## Files

**File modifications**: Create completely independent skill directories and remove all web functionality from acai-ts.

### New Files to Create (Self-Contained Skills):

1. **`.acai/skills/web-fetch/package.json`**:
   ```json
   {
     "name": "web-fetch",
     "version": "1.0.0",
     "type": "module",
     "dependencies": {
       "cheerio": "^1.0.0-rc.12",
       "zod": "^3.22.4"
     }
   }
   ```

2. **`.acai/skills/web-fetch/SKILL.md`**: Complete documentation with usage examples

3. **`.acai/skills/web-fetch/web-fetch.js`**: Main executable (JavaScript for simplicity)

4. **`.acai/skills/web-fetch/.gitignore`**: Ignore node_modules and temporary files

5. **`.acai/skills/web-search/package.json`**:
   ```json
   {
     "name": "web-search",
     "version": "1.0.0",
     "type": "module",
     "dependencies": {
       "duck-duck-scrape": "^2.6.0",
       "@openrouter/sdk": "^1.0.0",
       "zod": "^3.22.4"
     }
   }
   ```

6. **`.acai/skills/web-search/SKILL.md`**: Complete documentation with usage examples

7. **`.acai/skills/web-search/web-search.js`**: Main executable (JavaScript for simplicity)

8. **`.acai/skills/web-search/.gitignore`**: Ignore node_modules and temporary files

### Existing Files to Modify (acai-ts cleanup):

1. **`source/tools/index.ts`**:
   - Remove imports: `createWebFetchTool`, `WebFetchTool`, `createWebSearchTool`, `WebSearchTool`
   - Remove tool initialization: `webFetchTool`, `webSearchTool`
   - Remove from tools object: `[WebFetchTool.name]`, `[WebSearchTool.name]`
   - Remove from executors map: `WebFetchTool.name`, `WebSearchTool.name`
   - Update CompleteToolNames type to remove web tool references

2. **`source/prompts.ts`**:
   - Remove imports: `WebFetchTool`, `WebSearchTool`
   - Remove "information-gathering-web" prompt section entirely
   - Remove all web tool references from prompt generation

3. **`source/mentions.ts`**:
   - Remove import: `import { type ReadUrlResult, readUrl } from "./tools/web-fetch.ts"`
   - Remove all URL reading functionality
   - Simplify mentions processing to exclude web content

4. **`source/tools/index.ts`** (type section):
   - Update CompleteToolNames type to exclude web tools

5. **`package.json`** (root):
   - Remove dependencies: `cheerio`, `duck-duck-scrape`, `@openrouter/sdk`
   - These will now be handled by individual skills

### Files to Remove:

1. **`source/tools/web-fetch.ts`**: Complete removal
2. **`source/tools/web-search.ts`**: Complete removal

## Functions

**Function modifications**: Remove all web-related functions from acai-ts and implement them in standalone skills.

### New Functions (in skills):

1. **Web Fetch Skill Functions** (`.acai/skills/web-fetch/web-fetch.js`):
   - `main()`: CLI entry point with argument parsing
   - `fetchUrl(url, options)`: Core URL fetching with fallback logic
   - `cleanHtml(html)`: HTML cleaning using cheerio
   - `getContentType(response)`: Content type detection
   - `useJinaReader(url, apiKey)`: Jina AI integration
   - `formatOutput(result, options)`: Result formatting
   - `validateUrl(url)`: URL validation
   - `handleError(error)`: Error handling and reporting

2. **Web Search Skill Functions** (`.acai/skills/web-search/web-search.js`):
   - `main()`: CLI entry point with argument parsing
   - `searchWithExa(query, numResults, apiKey)`: Exa search implementation
   - `searchWithDuckDuckGo(query, numResults)`: DuckDuckGo fallback
   - `formatResults(results, json)`: Result formatting
   - `selectProvider(options)`: Provider selection logic
   - `validateQuery(query)`: Query validation
   - `handleSearchError(error)`: Error handling

### Modified Functions (acai-ts cleanup):

1. **`source/tools/index.ts` - `initTools()`**:
   - Remove all web tool initialization
   - Update function to exclude web tools

2. **`source/tools/index.ts` - `initCliTools()`**:
   - Remove all web tool initialization
   - Update function to exclude web tools

3. **`source/mentions.ts` - mentions processing**:
   - Remove URL reading functionality
   - Simplify to handle only file-based mentions

### Removed Functions:

1. **From `source/tools/web-fetch.ts`**:
   - `createWebFetchTool()`
   - `readUrl()`
   - `HtmlCleaner` class and all methods

2. **From `source/tools/web-search.ts`**:
   - `createWebSearchTool()`
   - `performSearch()`
   - `searchWithDuckDuckGo()`

## Classes

**Class modifications**: Remove all web-related classes from acai-ts as they move to skills.

### Removed Classes:

1. **`HtmlCleaner`** (from `source/tools/web-fetch.ts`):
   - Moved to web-fetch skill as standalone functions
   - No longer part of acai-ts codebase

### New Classes (in skills - optional):

1. **WebFetchSkill** (optional, in `.acai/skills/web-fetch/web-fetch.js`):
   - Static methods for URL operations
   - Configuration management
   - Only if needed for better organization

2. **WebSearchSkill** (optional, in `.acai/skills/web-search/web-search.js`):
   - Static methods for search operations
   - Provider management
   - Only if needed for better organization

## Dependencies

**Dependency modifications**: Move all web-related dependencies from acai-ts to individual skills.

### Dependencies to Remove from acai-ts:

1. **`cheerio`**: Move to web-fetch skill
2. **`duck-duck-scrape`**: Move to web-search skill
3. **`@openrouter/sdk`**: Move to web-search skill

### New Skill Dependencies:

1. **Web Fetch Skill Dependencies**:
   - `cheerio`: For HTML parsing and cleaning
   - `zod`: For input validation (optional)

2. **Web Search Skill Dependencies**:
   - `duck-duck-scrape`: For DuckDuckGo search fallback
   - `@openrouter/sdk`: For Exa search functionality
   - `zod`: For input validation (optional)

### Dependency Management:

1. **Update root package.json**:
   - Remove web-related dependencies
   - Keep only core acai dependencies

2. **Create skill-specific package.json files**:
   - Each skill manages its own dependencies
   - Use exact versions for reproducibility

## Testing

**Testing approach**: Create standalone tests for skills and update acai-ts tests to reflect removed functionality.

### New Test Files (in skills):

1. **`.acai/skills/web-fetch/test/`**:
   - URL fetching with different content types
   - HTML cleaning functionality
   - Error handling scenarios
   - CLI argument parsing

2. **`.acai/skills/web-search/test/`**:
   - Search with different providers
   - Result formatting
   - Fallback logic
   - Query validation

### Existing Test Updates (acai-ts):

1. **Update `source/tools/index.test.ts`**:
   - Remove web tool-related tests
   - Update tool availability assertions

2. **Update integration tests**:
   - Remove tests that depend on web tools
   - Update expected behavior for removed functionality

3. **Update `source/mentions.test.ts`**:
   - Remove URL reading tests
   - Update to reflect simplified mentions processing

### Validation Strategy:

1. **Skill Validation**:
   - Each skill validates its own functionality
   - Skills can be tested independently of acai-ts

2. **acai-ts Validation**:
   - Run `npm run typecheck` to ensure no web tool references remain
   - Run `npm run lint` and `npm run format`
   - Ensure all tests pass without web functionality

## Implementation Order

**Implementation sequence**: Create skills first, then remove functionality from acai-ts to ensure no downtime.

1. **Create Web Fetch Skill Infrastructure**:
   - Create skill directory with package.json
   - Implement core fetching functionality
   - Add HTML cleaning with cheerio
   - Create CLI interface with argument parsing
   - Write SKILL.md documentation

2. **Create Web Search Skill Infrastructure**:
   - Create skill directory with package.json
   - Implement Exa search functionality
   - Add DuckDuckGo fallback
   - Create CLI interface with argument parsing
   - Write SKILL.md documentation

3. **Test Skills Standalone**:
   - Verify web-fetch skill works independently
   - Verify web-search skill works independently
   - Test all CLI options and error handling

4. **Update acai-ts to Remove Web Functionality**:
   - Remove tool imports and registrations
   - Update prompts to remove web tool references
   - Simplify mentions processing
   - Update type definitions
   - Remove old tool files

5. **Update Dependencies**:
   - Remove web-related dependencies from root package.json
   - Run `npm install` to clean up node_modules

6. **Final Validation**:
   - Test acai-ts without web functionality
   - Verify skills work standalone
   - Run full test suite
   - Validate TypeScript compilation and linting

## TODO List

- [x] Create `.acai/skills/web-fetch/` directory structure
- [x] Create web-fetch package.json with cheerio dependency
- [x] Implement web-fetch.js with URL fetching and HTML cleaning
- [x] Add CLI argument parsing and error handling
- [x] Write comprehensive SKILL.md documentation
- [x] Create `.acai/skills/web-search/` directory structure
- [x] Create web-search package.json with Exa/DuckDuckGo dependencies
- [x] Implement web-search.js with provider selection and fallback
- [x] Add CLI argument parsing and error handling
- [x] Write comprehensive SKILL.md documentation
- [x] Test both skills standalone with various inputs
- [x] Remove web tool imports from source/tools/index.ts
- [x] Remove web tool registrations from tools and executors
- [x] Update CompleteToolNames type to exclude web tools
- [x] Remove web tool references from source/prompts.ts
- [x] Remove "information-gathering-web" prompt section
- [x] Update source/mentions.ts to remove URL reading
- [x] Remove web-related dependencies from root package.json
- [x] Delete source/tools/web-fetch.ts
- [x] Delete source/tools/web-search.ts
- [x] Run npm install to clean up dependencies
- [x] Test acai-ts without web functionality
- [x] Validate TypeScript compilation and linting
- [x] Run full test suite to ensure no regressions