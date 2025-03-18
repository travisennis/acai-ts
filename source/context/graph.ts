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
          "utf-8",
        );
        const relationshipsData = await fs.readFile(
          path.join(this.dbPath, "relationships.json"),
          "utf-8",
        );

        this.nodes = new Map(JSON.parse(nodesData));

        // Convert relationship arrays back to Sets
        const relMap = JSON.parse(relationshipsData);
        this.relationships = new Map();
        for (const [key, value] of Object.entries(relMap)) {
          this.relationships.set(key, new Set(value as string[]));
        }

        logger.info(
          `Loaded ${this.nodes.size} nodes and ${this.relationships.size} relationships`,
        );
      } catch (error) {
        // If files don't exist, start with empty graph
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          logger.info(
            "No existing graph data found, starting with empty graph",
          );
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
          ...entity.metadata,
        },
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

  updateEntities(entities: any[]): Promise<void> {
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
      if (visited.has(id) || depth > 2) {
        return; // Limit depth to prevent too many results
      }
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
        JSON.stringify(Array.from(this.nodes.entries())),
      );

      await fs.writeFile(
        path.join(this.dbPath, "relationships.json"),
        JSON.stringify(serializableRels),
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
