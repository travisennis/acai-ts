import { logger } from "../logger.ts";
import { executeCommand } from "../utils/process.ts";
import type { Entity, EntityMetadata } from "./manager.ts";

// Specific types for Git entities and parsing
interface GitFileChange {
  status: string;
  path: string;
}

interface ParsedCommit {
  hash: string;
  author: string;
  email: string;
  timestamp: number;
  subject: string;
  files: GitFileChange[];
}

// Specific metadata types for GitEntity
interface CommitMetadata extends EntityMetadata {
  hash: string;
  timestamp: number;
  subject: string;
}

interface AuthorMetadata extends EntityMetadata {
  name: string;
  email: string;
}

interface GitFileMetadata extends EntityMetadata {
  path: string;
  status: string;
}

type GitEntityMetadata =
  | CommitMetadata
  | AuthorMetadata
  | GitFileMetadata
  | EntityMetadata; // Fallback for branch or other types

export interface GitAnalyzerOptions {
  projectRoot: string;
  maxHistoryDepth: number;
}

export interface GitEntity extends Entity<GitEntityMetadata> {
  type: "commit" | "file" | "author" | "branch";
  description?: string;
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

      logger.info(
        `Git analyzer initialized at commit ${this.lastAnalyzedCommit}`,
      );
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
      "--name-status",
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
          subject: commit.subject,
        } satisfies CommitMetadata,
        relationships: [
          { type: "AUTHORED_BY", targetId: `author:${commit.email}` },
        ],
      });

      // Add author entity
      entities.push({
        id: `author:${commit.email}`,
        type: "author",
        description: commit.author,
        metadata: {
          name: commit.author,
          email: commit.email,
        } satisfies AuthorMetadata,
        relationships: [],
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
            status: file.status,
          } satisfies GitFileMetadata,
          relationships: [
            { type: "MODIFIED_IN", targetId: `commit:${commit.hash}` },
          ],
        });

        // Add relationship from commit to file
        entities
          .find((e) => e.id === `commit:${commit.hash}`)
          ?.relationships.push({
            type: "MODIFIED",
            targetId: fileId,
          });
      }
    }

    // Keep track of the last analyzed commit
    if (commits.length > 0) {
      this.lastAnalyzedCommit = commits[0]?.hash ?? null;
    }

    logger.info(
      `Analyzed ${commits.length} commits with ${entities.length} entities`,
    );
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
      "--name-status",
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
      this.lastAnalyzedCommit = commits[0]?.hash ?? null;
    }

    return entities;
  }

  private parseGitLog(logOutput: string): Array<{
    hash: string;
    author: string;
    email: string;
    timestamp: number;
    subject: string;
    files: GitFileChange[];
  }> {
    const commits: ParsedCommit[] = [];

    const lines = logOutput.trim().split("\n");

    let currentCommit: ParsedCommit | null = null;

    for (const line of lines) {
      if (line.includes("|")) {
        // This is a commit line
        if (currentCommit) {
          commits.push(currentCommit);
        }

        const [hash, author, email, timestampStr, subject] = line.split("|");
        currentCommit = {
          hash: hash ?? "",
          author: author ?? "",
          email: email ?? "",
          timestamp: Number.parseInt(timestampStr ?? "", 10),
          subject: subject ?? "",
          files: [],
        };
      } else if (line.trim() && currentCommit) {
        // This is a file change line
        const match = line.match(/^([A-Z])\s+(.+)$/);
        if (match) {
          const [, status, path] = match as [string, string, string]; // Assert match result
          currentCommit.files.push({ status, path });
        }
      }
    }

    if (currentCommit) {
      commits.push(currentCommit);
    }

    return commits;
  }

  private async executeGitCommand(
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await executeCommand(["git", ...args], {
        cwd: this.projectRoot,
        throwOnError: true,
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      logger.error({ error, args }, "Git command failed");
      throw error;
    }
  }
}
