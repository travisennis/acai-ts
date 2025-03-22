# PromptManager Integration Plan

## Overview
This document outlines the plan to combine PromptManager (source/prompts/manager.ts) and FileManager (source/files/manager.ts) into a single, more powerful PromptManager class. The FileManager functionality will be integrated into PromptManager, and the pending content functionality will be made internal to PromptManager.

## Goals
- Consolidate file and prompt management into a single class
- Rename `addPendingContent` to `addContext` for better semantic clarity
- Remove FileManager class entirely
- Maintain all existing functionality
- Create a more intuitive API

## Implementation Plan

### 1. Enhanced PromptManager Class

```typescript
export class PromptManager {
  private prompts: string[];
  private terminal: TerminalInterface;
  private loadedFiles = new Set<string>();
  private contextContent: string;

  constructor({ terminal }: { terminal: TerminalInterface }) {
    this.terminal = terminal;
    this.prompts = [];
    this.loadedFiles = new Set();
    this.contextContent = "";
  }

  // Original PromptManager functionality
  push(prompt: string) {
    this.prompts.push(prompt);
  }

  pop() {
    if (this.prompts.length > 0) {
      const queuedPrompt = this.prompts.pop();
      if (queuedPrompt) {
        return queuedPrompt;
      }
    }
    throw new Error("No prompt queued.");
  }

  isPending() {
    return this.prompts.length > 0;
  }

  // Integrated FileManager functionality
  async addFiles({
    files,
    format,
  }: { files: string[]; format: "xml" | "markdown" | "bracket" }) {
    const newFiles = files.filter((f) => !this.loadedFiles.has(f));

    for (const file of newFiles) {
      this.loadedFiles.add(file);
    }

    // Read the content of the files and format them for the next prompt
    for (const filePath of newFiles) {
      try {
        const content = await readFile(filePath, "utf-8");
        this.contextContent += `${formatFile(filePath, content, format)}\n\n`;
      } catch (error) {
        this.terminal.error(
          `Error reading file ${filePath}: ${(error as Error).message}`,
        );
      }
    }
  }

  // Renamed from addPendingContent to addContext
  addContext(content: string): void {
    this.contextContent += `${content}\n\n`;
  }

  hasContext() {
    return this.contextContent.trim().length > 0;
  }

  getContext() {
    return this.contextContent;
  }

  clearContext() {
    this.contextContent = "";
  }

  clearAll() {
    this.contextContent = "";
    this.loadedFiles.clear();
    this.prompts = [];
  }

  // New method to get the next prompt with context
  getNextPromptWithContext() {
    if (!this.isPending()) {
      throw new Error("No prompt queued.");
    }
    
    const prompt = this.pop();
    
    if (this.hasContext()) {
      const fullPrompt = this.contextContent + prompt;
      this.clearContext(); // Clear context after using
      return fullPrompt;
    }
    
    return prompt;
  }
}
```

### 2. Refactoring Required

#### Import Changes
- Update all imports from `import { FileManager } from "./files/manager.ts"` to use the new PromptManager
- Remove FileManager imports across the codebase

#### Usage Changes
- Replace all uses of `fileManager.addPendingContent()` with `promptManager.addContext()`
- Replace all uses of `fileManager.hasPendingContent()` with `promptManager.hasContext()`
- Replace all uses of `fileManager.getPendingContent()` with `promptManager.getContext()`
- Replace all uses of `fileManager.clearPendingContent()` with `promptManager.clearContext()`
- Replace all uses of `fileManager.clearAll()` with `promptManager.clearAll()`
- Replace all uses of `fileManager.addFiles()` with `promptManager.addFiles()`

#### In repl.ts
- Update the prompt handling logic to use the new `getNextPromptWithContext()` method where appropriate

#### In index.ts
- Remove the FileManager initialization and only initialize PromptManager

### 3. Additional Enhancements

#### Context Management
- Add methods to manage context categories (e.g., `addFileContext`, `addUserContext`, `addSystemContext`)
- Implement priority levels for different types of context

#### Prompt History
- Add a prompt history feature to track previous prompts
- Implement methods to recall and reuse previous prompts

#### Context Enrichment
- Integrate with any existing context enrichment functionality
- Provide hooks for future context enrichment plugins

### 4. Testing
- Create unit tests for the new combined PromptManager class
- Test all existing functionality to ensure compatibility
- Test new methods and features

## Benefits
- Simplified codebase with fewer classes
- More intuitive API with better named methods
- Consolidated prompt and context management
- Better code organization
- Reduced duplicated functionality

## Migration Steps
1. Create the new enhanced PromptManager class
2. Update all imports and usages
3. Run tests to ensure everything works correctly
4. Remove the now unused FileManager class
5. Update documentation to reflect the new API