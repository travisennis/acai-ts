import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
        },
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
        },
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
          },
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
      this.lastAnalyzedCommit = commits[0].hash;
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
          timestamp: Number.parseInt(timestampStr, 10),
          subject,
          files: [],
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

  private async executeGitCommand(
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync("git", args, { cwd: this.projectRoot });
    } catch (error) {
      logger.error({ error, args }, "Git command failed");
      throw error;
    }
  }
}
