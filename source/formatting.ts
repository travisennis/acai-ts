import path from "node:path";

const MD_CODE_BLOCK = /```(?:[\w-]+)?\n(.*?)```/s;

/**
 * Extracts the first code block content from the given text.
 * If a Markdown-style triple backtick code block is found, returns its inner content.
 * Otherwise, returns the original text unchanged.
 *
 * @param text - The input string potentially containing a Markdown code block.
 * @returns The extracted code inside the first code block, or the original text if no block is found.
 */
export const extractCodeBlock = (text: string): string => {
  const pattern = MD_CODE_BLOCK;
  const match = text.match(pattern);
  if (match) {
    return match[1] ?? "";
  }
  return text;
};

export function extractXml(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
  return match ? (match[1] ?? "") : "";
}

export function removeAllLineBreaks(text: string) {
  return text.replace(/(\r\n|\n|\r)/gm, " ");
}

export function removeHtmlTags(text: string) {
  return text.replace(/<[^>]*>?/gm, "");
}

const MD_TRIPLE_QUOTE = "```";

export type FormatType = "xml" | "markdown" | "bracket";

const codeBlockExtensions: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  java: "java",
  cpp: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  php: "php",
  html: "html",
  css: "css",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  txt: "text",
};

export function formatFile(
  file: string,
  content: string,
  format: FormatType,
): string {
  const fileExtension = path.extname(file).slice(1);
  const codeBlockName = codeBlockExtensions[fileExtension] || fileExtension;
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

export function formatCodeSnippet(
  file: string,
  content: string,
  format: FormatType,
) {
  const fileExtension = path.extname(file).slice(1);
  const codeBlockName = codeBlockExtensions[fileExtension] || fileExtension;
  switch (format) {
    case "xml":
      return `<code>\n${content}\n</code>`;
    case "markdown":
      return `${MD_TRIPLE_QUOTE} ${codeBlockName}\n${content}\n${MD_TRIPLE_QUOTE}`;
    case "bracket":
      return `[code begin]\n${content}\n[code end]`;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
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
