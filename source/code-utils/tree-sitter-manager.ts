import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dirname } from "@travisennis/stdlib/desm";
import Parser, { Query } from "tree-sitter";
import Java from "tree-sitter-java";
import TypeScript from "tree-sitter-typescript";
import { logger } from "../logger.ts";

export type SupportedLanguage = "typescript" | "tsx" | "java";
export type SupportedExtension = ".ts" | ".tsx" | ".java";

export function isSupportedExtension(ext: string): ext is SupportedExtension {
  return ext === ".ts" || ext === ".tsx" || ext === ".java";
}

const LANGUAGES: Record<SupportedExtension, SupportedLanguage> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".java": "java",
};

// Adjust QUERIES_ROOT to be relative to this file, then go up two levels to project root, then into "queries"
const QUERIES_ROOT = resolve(dirname(import.meta.url), "./queries");

export class TreeSitterManager {
  private parsers: Map<SupportedExtension, Parser> = new Map();
  private queries: Map<SupportedExtension, Query> = new Map();

  constructor() {
    // Initialize parsers for each language
    const tsParser = new Parser();
    tsParser.setLanguage(TypeScript.typescript);
    this.parsers.set(".ts", tsParser);

    const javaParser = new Parser();
    javaParser.setLanguage(Java);
    this.parsers.set(".java", javaParser);
  }

  getParser(ext: string): Parser | undefined {
    if (isSupportedExtension(ext)) {
      if (this.parsers.get(ext)) {
        return this.parsers.get(ext);
      }
    }
    return undefined;
  }

  getQuery(ext: string): Query | undefined {
    if (isSupportedExtension(ext)) {
      const lang = LANGUAGES[ext];
      if (!lang) {
        return undefined;
      }
      if (this.queries.has(ext)) {
        logger.debug(`getQuery: query cached for ext ${ext}`);
        return this.queries.get(ext);
      }

      const tagsPath: string = join(QUERIES_ROOT, `${lang}-tags.scm`);
      logger.debug(
        `getQuery: tags_path=${tagsPath} exists=${existsSync(tagsPath)}`,
      );

      if (!existsSync(tagsPath)) {
        logger.warn(`getQuery: tags.scm not found at ${tagsPath}`);
        return undefined;
      }

      const parser = this.getParser(ext);
      if (!parser) {
        logger.warn(`getQuery: parser not found for ${ext}`);
        return undefined;
      }

      try {
        const tagsContent = readFileSync(tagsPath, "utf8");
        const query = new Query(parser.getLanguage(), tagsContent);
        this.queries.set(ext, query);
        logger.debug(`getQuery: Query loaded successfully for ext ${ext}`);
        return query;
      } catch (e) {
        logger.error(
          `getQuery: Query compile error for ext ${ext}: ${e instanceof Error ? e.message : String(e)}`,
        );
        logger.error(
          e instanceof Error && e.stack ? e.stack : "No stack trace available",
        );
      }
    }
    logger.debug(`getQuery: Extension ${ext} not supported.`);
    return undefined;
  }
}
