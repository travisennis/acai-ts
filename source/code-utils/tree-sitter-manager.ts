import Parser, { Query } from "tree-sitter";
import Java from "tree-sitter-java";
import TypeScript from "tree-sitter-typescript";
import { logger } from "../logger.ts";
import { tags as javaTags } from "./queries/java-tags.scm.ts";
import { tags as typescriptTags } from "./queries/typescript-tags.scm.ts";

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

      const parser = this.getParser(ext);
      if (!parser) {
        logger.warn(`getQuery: parser not found for ${ext}`);
        return undefined;
      }

      let tagsContent: string;
      if (ext === ".java") {
        tagsContent = javaTags;
      } else if (ext === ".ts") {
        tagsContent = typescriptTags;
      } else {
        return undefined;
      }

      try {
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
