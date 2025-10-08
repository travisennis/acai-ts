import path from "node:path";
import { getCodeblockFromFilePath } from "./utils/filetype-detection.ts";

const MD_TRIPLE_QUOTE = "```";

export type FormatType = "xml" | "markdown" | "bracket";

export function formatFile(
  file: string,
  content: string,
  format: FormatType,
): string {
  const codeBlockName =
    getCodeblockFromFilePath(file) || path.extname(file).slice(1);
  switch (format) {
    case "xml":
      return `<file>\n<name>${file}</name>\n<content>\n${content}\n</content>\n</file>`;
    case "markdown":
      return `## File: ${file}\n${MD_TRIPLE_QUOTE} ${codeBlockName}\n${content}\n${MD_TRIPLE_QUOTE}`;
    case "bracket":
      return `[file name]: ${file}\n[file content begin]\n${content}\n[file content end]`;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

export function formatUrl(
  siteUrl: string,
  content: string,
  format: FormatType,
): string {
  switch (format) {
    case "xml":
      return `<webpage>\n<url>${siteUrl}</url>\n<content>\n${content}\n</content>\n</webpage>`;
    case "markdown":
      return `## URL: ${siteUrl}\n${MD_TRIPLE_QUOTE}\n${content}\n${MD_TRIPLE_QUOTE}`;
    case "bracket":
      return `[url]: ${siteUrl}\n[url content begin]\n${content}\n[url content end]`;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

export function formatCodeBlock(file: string, content: string): string {
  const codeBlockName =
    getCodeblockFromFilePath(file) || path.extname(file).slice(1);
  return `${MD_TRIPLE_QUOTE} ${codeBlockName}\n${content}\n${MD_TRIPLE_QUOTE}`;
}

export function formatBlock(
  content: string,
  blockName: string,
  format: FormatType,
): string {
  switch (format) {
    case "xml":
      return `<${blockName}>\n${content}\n</${blockName}>\n</file>`;
    case "markdown":
      return `## ${blockName}\n${MD_TRIPLE_QUOTE}\n${content}\n${MD_TRIPLE_QUOTE}`;
    case "bracket":
      return `[${blockName} begin]\n${content}\n[${blockName} end]`;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
