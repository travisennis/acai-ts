import { readFile } from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";
import {
  createSourceFile,
  ScriptTarget,
  type Node,
  isClassDeclaration,
  isFunctionDeclaration,
  isInterfaceDeclaration,
  isPropertySignature,
  forEachChild,
} from "typescript";
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
  private fileCache: Map<string, { content: string; entities: CodeEntity[] }> =
    new Map();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  initialize(): void {
    logger.info("Initializing code analyzer");
    // No specific initialization needed currently
  }

  async analyzeProject(): Promise<CodeEntity[]> {
    logger.info("Analyzing project code structure");

    // Find all TypeScript files
    const files = await globby(["**/*.ts", "**/*.tsx"], {
      cwd: this.projectRoot,
      gitignore: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
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
            endLine: fileContent.split("\n").length,
          },
          metadata: {
            path: filePath,
            extension: path.extname(filePath),
          },
          relationships: [],
        };

        entities.push(fileEntity);

        // Parse TypeScript AST
        if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
          const fileEntities = this.parseTypeScriptFile(filePath, fileContent);

          // Connect file to its contained entities
          for (const entity of fileEntities) {
            fileEntity.relationships.push({
              type: "CONTAINS",
              targetId: entity.id,
            });

            entity.relationships.push({
              type: "CONTAINED_IN",
              targetId: fileEntity.id,
            });

            entities.push(entity);
          }
        }

        // Cache the file analysis
        this.fileCache.set(filePath, {
          content: fileContent,
          entities: [
            fileEntity,
            ...entities.filter((e) =>
              e.relationships.some((r) => r.targetId === fileEntity.id),
            ),
          ],
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
    const sourceFile = createSourceFile(
      filePath,
      content,
      ScriptTarget.Latest,
      true,
    );

    const visitNode = (node: Node) => {
      // Handle different node types
      if (isClassDeclaration(node) && node.name) {
        const name = node.name.text;
        const startPos = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(),
        );
        const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

        entities.push({
          id: `class:${filePath}:${name}`,
          type: "class",
          name,
          content: node.getText(),
          location: {
            file: filePath,
            startLine: startPos.line + 1,
            endLine: endPos.line + 1,
          },
          metadata: {
            modifiers: node.modifiers?.map((m) => m.getText()) || [],
          },
          relationships: [],
        });
      } else if (isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        const startPos = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(),
        );
        const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

        entities.push({
          id: `function:${filePath}:${name}`,
          type: "function",
          name,
          content: node.getText(),
          location: {
            file: filePath,
            startLine: startPos.line + 1,
            endLine: endPos.line + 1,
          },
          metadata: {
            returnType: node.type?.getText() || "unknown",
            parameters: node.parameters.map((p) => p.getText()),
          },
          relationships: [],
        });
      } else if (isInterfaceDeclaration(node)) {
        const name = node.name.text;
        const startPos = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(),
        );
        const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

        entities.push({
          id: `interface:${filePath}:${name}`,
          type: "interface",
          name,
          content: node.getText(),
          location: {
            file: filePath,
            startLine: startPos.line + 1,
            endLine: endPos.line + 1,
          },
          metadata: {
            properties: node.members.filter(isPropertySignature).map((m) => ({
              name: m.name.getText(),
              type: m.type?.getText() || "unknown",
            })),
          },
          relationships: [],
        });
      }

      // Continue traversing the AST
      forEachChild(node, visitNode);
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
          if (entity.id === otherEntity.id) {
            continue;
          }

          // Check for references to other entity's name
          if (otherEntity.name && content.includes(otherEntity.name)) {
            entity.relationships.push({
              type: "REFERENCES",
              targetId: otherEntity.id,
            });

            otherEntity.relationships.push({
              type: "REFERENCED_BY",
              targetId: entity.id,
            });
          }
        }
      }
    }
  }
}
