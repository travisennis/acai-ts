import Parser, { Query } from "tree-sitter";
import Java from "tree-sitter-java";
import TypeScript from "tree-sitter-typescript";
import { logger } from "../logger.ts";
import { tags as javaTags } from "./queries/java-tags.scm.ts";
import { tags as typescriptTags } from "./queries/typescript-tags.scm.ts";
import { isSupportedExtension, type SupportedExtension } from "./types.ts";

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
      if (this.queries.has(ext)) {
        logger.debug(`getQuery: query cached for ext ${ext}`);
        return this.queries.get(ext);
      }

      const parser = this.getParser(ext);
      if (!parser) {
        logger.warn(`getQuery: parser not found for ${ext}`);
        return undefined;
      }

      const tagsContent = this.getTags(ext);
      if (!tagsContent) {
        return undefined;
      }

      try {
        const query = new Query(parser.getLanguage(), tagsContent);
        this.queries.set(ext, query);
        logger.debug(`getQuery: Query loaded successfully for ext ${ext}`);
        return query;
      } catch (e) {
        logger.error(
          e,
          `getQuery: Query compile error for ext ${ext}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    logger.debug(`getQuery: Extension ${ext} not supported.`);
    return undefined;
  }

  private getTags(ext: string): string | undefined {
    let tagsContent: string | undefined;
    if (ext === ".java") {
      tagsContent = javaTags;
    } else if (ext === ".ts") {
      tagsContent = typescriptTags;
    }
    return tagsContent;
  }
}
