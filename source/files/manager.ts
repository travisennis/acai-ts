import { readFile } from "node:fs/promises";
import { formatFile } from "../formatting.ts";
import type { TerminalInterface } from "../terminal/types.ts";

export class FileManager {
  private terminal: TerminalInterface;
  private loadedFiles = new Set<string>();
  private pendingFileContents: string;

  constructor({ terminal }: { terminal: TerminalInterface }) {
    this.terminal = terminal;
    this.loadedFiles = new Set();
    this.pendingFileContents = "";
  }

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
        this.pendingFileContents += `${formatFile(filePath, content, format)}\n\n`;
      } catch (error) {
        this.terminal.error(
          `Error reading file ${filePath}: ${(error as Error).message}`,
        );
      }
    }
  }

  hasPendingContent() {
    return this.pendingFileContents.trim().length > 0;
  }

  getPendingContent() {
    return this.pendingFileContents;
  }

  clearPendingContent() {
    this.pendingFileContents = "";
  }

  clearAll() {
    this.pendingFileContents = "";
    this.loadedFiles.clear();
  }

  addPendingContent(content: string): void {
    this.pendingFileContents += `${content}\n\n`;
  }
}
