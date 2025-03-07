Let's start with the core manager file:

```typescript
// source/context/manager.ts
import { EventEmitter } from "node:events";
import path from "node:path";
import { envPaths } from "@travisennis/stdlib/env";
import { logger } from "../logger.ts";
import { CodeAnalyzer } from "./code-analyzer.ts";
import { ContextGraph } from "./graph.ts";
import { GitAnalyzer } from "./git-analyzer.ts";
import { VectorStore } from "./embeddings.ts";

export interface ContextOptions {
  projectRoot: string;
  refreshInterval?: number; // in milliseconds
  maxHistoryDepth?: number; // how many commits back to analyze
}

export class ContextManager extends EventEmitter {
  private projectRoot: string;
  private graph: ContextGraph;
  private gitAnalyzer: GitAnalyzer;
  private codeAnalyzer: CodeAnalyzer;
  private vectorStore: VectorStore;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor(options: ContextOptions) {
    super();
    this.projectRoot = options.projectRoot;

    const dataDir = path.join(envPaths("acai").data,
      Buffer.from(this.projectRoot).toString("base64url"));

    this.graph = new ContextGraph(path.join(dataDir, "graph"));
    this.vectorStore = new VectorStore(path.join(dataDir, "vectors"));
    this.gitAnalyzer = new GitAnalyzer({
      projectRoot: this.projectRoot,
      maxHistoryDepth: options.maxHistoryDepth || 100,
    });
    this.codeAnalyzer = new CodeAnalyzer(this.projectRoot);

    if (options.refreshInterval) {
      this.startRefreshTimer(options.refreshInterval);
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info(`Initializing context manager for ${this.projectRoot}`);

    try {
      await this.gitAnalyzer.initialize();
      await this.codeAnalyzer.initialize();
      await this.graph.initialize();
      await this.vectorStore.initialize();

      // Perform initial analysis
      await this.performFullAnalysis();

      this.isInitialized = true;
      this.emit("initialized");
      logger.info("Context manager initialized successfully");
    } catch (error) {
      logger.error({ error }, "Failed to initialize context manager");
      throw error;
    }
  }

  async performFullAnalysis(): Promise<void> {
    logger.info("Starting full context analysis");

    // Analyze git history
    const gitEntities = await this.gitAnalyzer.analyzeHistory();

    // Analyze code structure
    const codeEntities = await this.codeAnalyzer.analyzeProject();

    // Update graph with new entities
    await this.graph.addEntities([...gitEntities, ...codeEntities]);

    // Update vector embeddings
    await this.vectorStore.updateEmbeddings([
      ...gitEntities.map(e => ({ id: e.id, text: e.description || "" })),
      ...codeEntities.map(e => ({ id: e.id, text: e.content || "" }))
    ]);

    logger.info("Full context analysis completed");
    this.emit("analysisCompleted");
  }

  async enrichPrompt(prompt: string): Promise<string> {
    if (!this.isInitialized) {
      logger.warn("Context manager not initialized, returning original prompt");
      return prompt;
    }

    // Find relevant context for the prompt
    const relevantDocs = await this.vectorStore.search(prompt, 5);
    const relevantIds = relevantDocs.map(doc => doc.id);

    // Get connected entities from graph
    const connectedEntities = await this.graph.getConnectedEntities(relevantIds);

    // Format context to include in prompt
    const contextBlock = this.formatContextForPrompt(connectedEntities);

    return `${contextBlock}\n\n${prompt}`;
  }

  private formatContextForPrompt(entities: any[]): string {
    // Format entities into a context block
    const contextParts = entities.map(entity => {
      return `${entity.type}: ${entity.id}\n${entity.description || entity.content || ""}`;
    });

    return "Project Context:\n" + contextParts.join("\n\n");
  }

  private startRefreshTimer(interval: number): void {
    this.refreshTimer = setInterval(() => {
      this.performIncrementalUpdate().catch(error => {
        logger.error({ error }, "Failed to perform incremental update");
      });
    }, interval);
  }

  async performIncrementalUpdate(): Promise<void> {
    if (!this.isInitialized) return;

    logger.debug("Starting incremental context update");

    // Get recent changes
    const recentGitChanges = await this.gitAnalyzer.getRecentChanges();
    const changedFiles = recentGitChanges.map(change => change.filePath);

    // Only analyze files that have changed
    const codeEntities = await this.codeAnalyzer.analyzeFiles(changedFiles);

    // Update graph and vector store
    await this.graph.updateEntities([...recentGitChanges, ...codeEntities]);
    await this.vectorStore.updateEmbeddings([
      ...recentGitChanges.map(e => ({ id: e.id, text: e.description || "" })),
      ...codeEntities.map(e => ({ id: e.id, text: e.content || "" }))
    ]);

    logger.debug("Incremental context update completed");
  }

  async query(question: string): Promise<any[]> {
    if (!this.isInitialized) {
      throw new Error("Context manager not initialized");
    }

    // Search for relevant context
    const relevantDocs = await this.vectorStore.search(question, 10);
    const relevantIds = relevantDocs.map(doc => doc.id);

    // Get connected entities from graph
    return this.graph.getConnectedEntities(relevantIds);
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.graph.dispose();
    this.vectorStore.dispose();
    this.isInitialized = false;
    this.emit("disposed");
  }
}
```

Let's continue with the git analyzer:

```typescript
// source/context/git-analyzer.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { logger } from "../logger.ts";

const execFileAsync = promisify(execFile);

export interface GitAnalyzerOptions {
  projectRoot: string;
  maxHistoryDepth: number;
}

export interface GitEntity {
  id: string;
  type: "commit" | "file" | "author" | "branch";
  description?: string;
  metadata: Record<string, any>;
  relationships: Array<{
    type: string;
    targetId: string;
  }>;
}

export class GitAnalyzer {
  private projectRoot: string;
  private maxHistoryDepth: number;
  private lastAnalyzedCommit: string | null = null;

  constructor(options: GitAnalyzerOptions) {
    this.projectRoot = options.projectRoot;
    this.maxHistoryDepth = options.maxHistoryDepth;
  }

  async initialize(): Promise<void> {
    try {
      // Check if this is a git repository
      await this.executeGitCommand(["rev-parse", "--is-inside-work-tree"]);

      // Get the most recent commit to start with
      const { stdout } = await this.executeGitCommand(["rev-parse", "HEAD"]);
      this.lastAnalyzedCommit = stdout.trim();

      logger.info(`Git analyzer initialized at commit ${this.lastAnalyzedCommit}`);
    } catch (error) {
      logger.error({ error }, "Failed to initialize git analyzer");
      throw new Error(`Not a git repository: ${this.projectRoot}`);
    }
  }

  async analyzeHistory(): Promise<GitEntity[]> {
    logger.info(`Analyzing git history (depth: ${this.maxHistoryDepth})`);

    // Get commit history
    const { stdout } = await this.executeGitCommand([
      "log",
      `-${this.maxHistoryDepth}`,
      "--pretty=format:%H|%an|%ae|%at|%s",
      "--name-status"
    ]);

    const entities: GitEntity[] = [];
    const commits = this.parseGitLog(stdout);

    // Process each commit
    for (const commit of commits) {
      // Add commit entity
      entities.push({
        id: `commit:${commit.hash}`,
        type: "commit",
        description: commit.subject,
        metadata: {
          hash: commit.hash,
          timestamp: commit.timestamp,
          subject: commit.subject
        },
        relationships: [
          { type: "AUTHORED_BY", targetId: `author:${commit.email}` }
        ]
      });

      // Add author entity
      entities.push({
        id: `author:${commit.email}`,
        type: "author",
        description: commit.author,
        metadata: {
          name: commit.author,
          email: commit.email
        },
        relationships: []
      });

      // Add file entities and their relationships to the commit
      for (const file of commit.files) {
        const fileId = `file:${file.path}`;

        entities.push({
          id: fileId,
          type: "file",
          description: `File: ${file.path}`,
          metadata: {
            path: file.path,
            status: file.status
          },
          relationships: [
            { type: "MODIFIED_IN", targetId: `commit:${commit.hash}` }
          ]
        });

        // Add relationship from commit to file
        entities.find(e => e.id === `commit:${commit.hash}`)?.relationships.push({
          type: "MODIFIED",
          targetId: fileId
        });
      }
    }

    // Keep track of the last analyzed commit
    if (commits.length > 0) {
      this.lastAnalyzedCommit = commits[0].hash;
    }

    logger.info(`Analyzed ${commits.length} commits with ${entities.length} entities`);
    return entities;
  }

  async getRecentChanges(): Promise<GitEntity[]> {
    if (!this.lastAnalyzedCommit) {
      return this.analyzeHistory();
    }

    // Get commits since the last analyzed one
    const { stdout } = await this.executeGitCommand([
      "log",
      `${this.lastAnalyzedCommit}..HEAD`,
      "--pretty=format:%H|%an|%ae|%at|%s",
      "--name-status"
    ]);

    // If no new commits, return empty array
    if (!stdout.trim()) {
      return [];
    }

    const entities: GitEntity[] = [];
    const commits = this.parseGitLog(stdout);

    // Process each commit (similar to analyzeHistory)
    // ... [same processing logic as in analyzeHistory]

    // Update the last analyzed commit
    if (commits.length > 0) {
      this.lastAnalyzedCommit = commits[0].hash;
    }

    return entities;
  }

  private parseGitLog(logOutput: string): Array<{
    hash: string;
    author: string;
    email: string;
    timestamp: number;
    subject: string;
    files: Array<{ status: string; path: string }>;
  }> {
    const commits: any[] = [];
    const lines = logOutput.split("\n");

    let currentCommit: any = null;

    for (const line of lines) {
      if (line.includes("|")) {
        // This is a commit line
        if (currentCommit) {
          commits.push(currentCommit);
        }

        const [hash, author, email, timestampStr, subject] = line.split("|");
        currentCommit = {
          hash,
          author,
          email,
          timestamp: parseInt(timestampStr, 10),
          subject,
          files: []
        };
      } else if (line.trim() && currentCommit) {
        // This is a file change line
        const match = line.match(/^([A-Z])\s+(.+)$/);
        if (match) {
          const [, status, path] = match;
          currentCommit.files.push({ status, path });
        }
      }
    }

    if (currentCommit) {
      commits.push(currentCommit);
    }

    return commits;
  }

  private async executeGitCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync("git", args, { cwd: this.projectRoot });
    } catch (error) {
      logger.error({ error, args }, "Git command failed");
      throw error;
    }
  }
}
```

Next, let's create the code analyzer:

```typescript
// source/context/code-analyzer.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";
import * as ts from "typescript";
import { logger } from "../logger.ts";

export interface CodeEntity {
  id: string;
  type: "file" | "class" | "function" | "interface" | "type" | "variable";
  name: string;
  content?: string;
  location: {
    file: string;
    startLine: number;
    endLine: number;
  };
  metadata: Record<string, any>;
  relationships: Array<{
    type: string;
    targetId: string;
  }>;
}

export class CodeAnalyzer {
  private projectRoot: string;
  private fileCache: Map<string, { content: string; entities: CodeEntity[] }> = new Map();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async initialize(): Promise<void> {
    logger.info("Initializing code analyzer");
    // No specific initialization needed currently
  }

  async analyzeProject(): Promise<CodeEntity[]> {
    logger.info("Analyzing project code structure");

    // Find all TypeScript files
    const files = await globby(["**/*.ts", "**/*.tsx"], {
      cwd: this.projectRoot,
      gitignore: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"]
    });

    return this.analyzeFiles(files);
  }

  async analyzeFiles(filePaths: string[]): Promise<CodeEntity[]> {
    logger.info(`Analyzing ${filePaths.length} files`);

    const entities: CodeEntity[] = [];

    for (const filePath of filePaths) {
      const absolutePath = path.join(this.projectRoot, filePath);

      try {
        // Check if we have this file cached and it hasn't changed
        let fileContent: string;

        try {
          fileContent = await readFile(absolutePath, "utf-8");
        } catch (error) {
          logger.warn({ error, filePath }, "Failed to read file");
          continue;
        }

        // Create file entity
        const fileEntity: CodeEntity = {
          id: `file:${filePath}`,
          type: "file",
          name: path.basename(filePath),
          content: fileContent,
          location: {
            file: filePath,
            startLine: 1,
            endLine: fileContent.split("\n").length
          },
          metadata: {
            path: filePath,
            extension: path.extname(filePath)
          },
          relationships: []
        };

        entities.push(fileEntity);

        // Parse TypeScript AST
        if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
          const fileEntities = this.parseTypeScriptFile(filePath, fileContent);

          // Connect file to its contained entities
          for (const entity of fileEntities) {
            fileEntity.relationships.push({
              type: "CONTAINS",
              targetId: entity.id
            });

            entity.relationships.push({
              type: "CONTAINED_IN",
              targetId: fileEntity.id
            });

            entities.push(entity);
          }
        }

        // Cache the file analysis
        this.fileCache.set(filePath, {
          content: fileContent,
          entities: [fileEntity, ...entities.filter(e =>
            e.relationships.some(r => r.targetId === fileEntity.id))]
        });

      } catch (error) {
        logger.error({ error, filePath }, "Error analyzing file");
      }
    }

    // Build cross-references between entities
    this.buildCrossReferences(entities);

    logger.info(`Analyzed ${entities.length} code entities`);
    return entities;
  }

  private parseTypeScriptFile(filePath: string, content: string): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const visitNode = (node: ts.Node) => {
      // Handle different node types
      if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.text;
        const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

        entities.push({
          id: `class:${filePath}:${name}`,
          type: "class",
          name,
          content: node.getText(),
          location: {
            file: filePath,
            startLine: startPos.line + 1,
            endLine: endPos.line + 1
          },
          metadata: {
            modifiers: node.modifiers?.map(m => m.getText()) || []
          },
          relationships: []
        });
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

        entities.push({
          id: `function:${filePath}:${name}`,
          type: "function",
          name,
          content: node.getText(),
          location: {
            file: filePath,
            startLine: startPos.line + 1,
            endLine: endPos.line + 1
          },
          metadata: {
            returnType: node.type?.getText() || "unknown",
            parameters: node.parameters.map(p => p.getText())
          },
          relationships: []
        });
      } else if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.text;
        const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

        entities.push({
          id: `interface:${filePath}:${name}`,
          type: "interface",
          name,
          content: node.getText(),
          location: {
            file: filePath,
            startLine: startPos.line + 1,
            endLine: endPos.line + 1
          },
          metadata: {
            properties: node.members
              .filter(ts.isPropertySignature)
              .map(m => ({
                name: m.name.getText(),
                type: m.type?.getText() || "unknown"
              }))
          },
          relationships: []
        });
      }

      // Continue traversing the AST
      ts.forEachChild(node, visitNode);
    };

    // Start AST traversal
    visitNode(sourceFile);

    return entities;
  }

  private buildCrossReferences(entities: CodeEntity[]): void {
    // Build a map for quick entity lookup
    const entityMap = new Map<string, CodeEntity>();
    for (const entity of entities) {
      entityMap.set(entity.id, entity);
    }

    // Analyze dependencies between entities
    for (const entity of entities) {
      if (entity.type === "function" || entity.type === "class") {
        const content = entity.content || "";

        // Look for imports and usage of other entities
        for (const otherEntity of entities) {
          if (entity.id === otherEntity.id) continue;

          // Check for references to other entity's name
          if (otherEntity.name && content.includes(otherEntity.name)) {
            entity.relationships.push({
              type: "REFERENCES",
              targetId: otherEntity.id
            });

            otherEntity.relationships.push({
              type: "REFERENCED_BY",
              targetId: entity.id
            });
          }
        }
      }
    }
  }
}
```

Now for the graph database interface:

```typescript
// source/context/graph.ts
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../logger.ts";

// This is a simplified in-memory graph implementation
// In a real implementation, you would use Neo4j or a similar graph database
export class ContextGraph {
  private dbPath: string;
  private nodes: Map<string, any> = new Map();
  private relationships: Map<string, Set<string>> = new Map();
  private initialized = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing context graph at ${this.dbPath}`);

    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      // Try to load existing data
      try {
        const nodesData = await fs.readFile(
          path.join(this.dbPath, "nodes.json"),
          "utf-8"
        );
        const relationshipsData = await fs.readFile(
          path.join(this.dbPath, "relationships.json"),
          "utf-8"
        );

        this.nodes = new Map(JSON.parse(nodesData));

        // Convert relationship arrays back to Sets
        const relMap = JSON.parse(relationshipsData);
        this.relationships = new Map();
        for (const [key, value] of Object.entries(relMap)) {
          this.relationships.set(key, new Set(value as string[]));
        }

        logger.info(`Loaded ${this.nodes.size} nodes and ${this.relationships.size} relationships`);
      } catch (error) {
        // If files don't exist, start with empty graph
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          logger.info("No existing graph data found, starting with empty graph");
        } else {
          throw error;
        }
      }

      this.initialized = true;
    } catch (error) {
      logger.error({ error }, "Failed to initialize context graph");
      throw error;
    }
  }

  async addEntities(entities: any[]): Promise<void> {
    if (!this.initialized) {
      throw new Error("Graph not initialized");
    }

    logger.debug(`Adding ${entities.length} entities to graph`);

    for (const entity of entities) {
      // Add the node
      this.nodes.set(entity.id, {
        id: entity.id,
        type: entity.type,
        properties: {
          name: entity.name,
          description: entity.description,
          ...entity.metadata
        }
      });

      // Add relationships
      if (!this.relationships.has(entity.id)) {
        this.relationships.set(entity.id, new Set<string>());
      }

      for (const rel of entity.relationships || []) {
        const relKey = `${entity.id}-${rel.type}->${rel.targetId}`;
        this.relationships.get(entity.id)?.add(relKey);

        // Add reciprocal relationship entry for the target
        if (!this.relationships.has(rel.targetId)) {
          this.relationships.set(rel.targetId, new Set<string>());
        }
        this.relationships.get(rel.targetId)?.add(relKey);
      }
    }

    // Persist changes
    await this.saveToFile();
  }

  async updateEntities(entities: any[]): Promise<void> {
    // For simplicity, update is the same as add in this implementation
    return this.addEntities(entities);
  }

  async getConnectedEntities(entityIds: string[]): Promise<any[]> {
    if (!this.initialized) {
      throw new Error("Graph not initialized");
    }

    const result: any[] = [];
    const visited = new Set<string>();

    // Helper function for traversal
    const traverse = (id: string, depth = 0) => {
      if (visited.has(id) || depth > 2) return; // Limit depth to prevent too many results
      visited.add(id);

      const node = this.nodes.get(id);
      if (node) {
        result.push(node);

        // Find all relationships for this node
        const nodeRels = this.relationships.get(id);
        if (nodeRels) {
          for (const relKey of nodeRels) {
            const [sourceId, , targetId] = relKey.split(/->(.*?)$/);
            const nextId = sourceId === id ? targetId : sourceId;

            if (nextId && !visited.has(nextId)) {
              traverse(nextId, depth + 1);
            }
          }
        }
      }
    };

    // Start traversal from each requested entity
    for (const id of entityIds) {
      traverse(id);
    }

    return result;
  }

  private async saveToFile(): Promise<void> {
    // Convert relationships Map to a serializable format
    const serializableRels: Record<string, string[]> = {};
    for (const [key, value] of this.relationships.entries()) {
      serializableRels[key] = Array.from(value);
    }

    try {
      await fs.writeFile(
        path.join(this.dbPath, "nodes.json"),
        JSON.stringify(Array.from(this.nodes.entries()))
      );

      await fs.writeFile(
        path.join(this.dbPath, "relationships.json"),
        JSON.stringify(serializableRels)
      );
    } catch (error) {
      logger.error({ error }, "Failed to save graph to file");
      throw error;
    }
  }

  dispose(): void {
    this.nodes.clear();
    this.relationships.clear();
    this.initialized = false;
  }
}
```

And finally, the vector store for semantic search:

```typescript
// source/context/embeddings.ts
import fs from "node:fs/promises";
import path from "node:path";
import { ModelName, getLanguageModel } from "@travisennis/acai-core";
import { envPaths } from "@travisennis/stdlib/env";
import { generateEmbeddings } from "ai";
import { logger } from "../logger.ts";

interface EmbeddingItem {
  id: string;
  text: string;
  embedding?: number[];
}

interface SearchResult {
  id: string;
  score: number;
}

export class VectorStore {
  private dbPath: string;
  private items: Map<string, EmbeddingItem> = new Map();
  private initialized = false;
  private embeddingModel: ModelName = "openai:text-embedding-3-small";

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing vector store at ${this.dbPath}`);

    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      // Try to load existing data
      try {
        const data = await fs.readFile(
          path.join(this.dbPath, "embeddings.json"),
          "utf-8"
        );

        const loadedItems = JSON.parse(data) as EmbeddingItem[];
        for (const item of loadedItems) {
          this.items.set(item.id, item);
        }

        logger.info(`Loaded ${this.items.size} embeddings`);
      } catch (error) {
        // If file doesn't exist, start with empty store
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          logger.info("No existing embeddings found, starting with empty store");
        } else {
          throw error;
        }
      }

      this.initialized = true;
    } catch (error) {
      logger.error({ error }, "Failed to initialize vector store");
      throw error;
    }
  }

  async updateEmbeddings(items: Array<{ id: string; text: string }>): Promise<void> {
    if (!this.initialized) {
      throw new Error("Vector store not initialized");
    }

    logger.debug(`Updating embeddings for ${items.length} items`);

    const itemsToEmbed: EmbeddingItem[] = [];

    for (const item of items) {
      // Check if item exists and if text has changed
      const existingItem = this.items.get(item.id);
      if (!existingItem || existingItem.text !== item.text) {
        itemsToEmbed.push(item);
      }
    }

    if (itemsToEmbed.length === 0) {
      logger.debug("No embeddings to update");
      return;
    }

    logger.info(`Generating embeddings for ${itemsToEmbed.length} items`);

    // Process in batches to avoid overloading the API
    const batchSize = 20;
    for (let i = 0; i < itemsToEmbed.length; i += batchSize) {
      const batch = itemsToEmbed.slice(i, i + batchSize);

      try {
        const embeddings = await generateEmbeddings({
          model: getLanguageModel({
            model: this.embeddingModel,
            app: "context-embeddings",
            stateDir: envPaths("acai").state,
          }),
          input: batch.map(item => item.text),
        });

        // Update items with embeddings
        for (let j = 0; j < batch.length; j++) {
          const item = batch[j];
          const embedding = embeddings.embeddings[j];

          this.items.set(item.id, {
            id: item.id,
            text: item.text,
            embedding,
          });
        }
      } catch (error) {
        logger.error({ error }, "Failed to generate embeddings for batch");
      }
    }

    // Persist changes
    await this.saveToFile();
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    if (!this.initialized) {
      throw new Error("Vector store not initialized");
    }

    if (this.items.size === 0) {
      logger.warn("Vector store is empty, cannot perform search");
      return [];
    }

    try {
      // Generate embedding for query
      const { embeddings } = await generateEmbeddings({
        model: getLanguageModel({
          model: this.embeddingModel,
          app: "context-embeddings",
          stateDir: envPaths("acai").state,
        }),
        input: [query],
      });

      const queryEmbedding = embeddings[0];

      // Calculate similarity scores
      const results: SearchResult[] = [];

      for (const [id, item] of this.items.entries()) {
        if (item.embedding) {
          const score = this.cosineSimilarity(queryEmbedding, item.embedding);
          results.push({ id, score });
        }
      }

      // Sort by similarity score (descending)
      results.sort((a, b) => b.score - a.score);

      return results.slice(0, limit);
    } catch (error) {
      logger.error({ error }, "Search failed");
      throw error;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have the same dimensionality");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  private async saveToFile(): Promise<void> {
    const serializedItems = Array.from(this.items.values());

    try {
      await fs.writeFile(
        path.join(this.dbPath, "embeddings.json"),
        JSON.stringify(serializedItems)
      );
    } catch (error) {
      logger.error({ error }, "Failed to save embeddings to file");
      throw error;
    }
  }

  dispose(): void {
    this.items.clear();
    this.initialized = false;
  }
}
```
