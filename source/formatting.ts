import path from "node:path";

export function extractXml(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
  return match ? (match[1] ?? "") : "";
}

export function removeAllLineBreaks(text: string) {
  return text.replace(/(\r\n|\n|\r)/gm, " ");
}

export function removeHtmLtags(text: string) {
  return text.replace(/<[^>]*>?/gm, "");
}

export const MD_TRIPLE_QUOTE = "```";

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
      return `<file>\n<name>${file}</name>\n<content>${content}</content>\n</file>`;
    case "markdown":
      return `## File: ${file}\n${MD_TRIPLE_QUOTE} ${codeBlockName}\n${content}\n${MD_TRIPLE_QUOTE}`;
    case "bracket":
      return `[file name]: ${file}\n[file content begin]\n${content}\n[file content end]`;
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
      return `<${blockName}>${content}</${blockName}>\n</file>`;
    case "markdown":
      return `## ${blockName}\n${MD_TRIPLE_QUOTE}n${content}\n${MD_TRIPLE_QUOTE}`;
    case "bracket":
      return `[${blockName} begin]\n${content}\n[${blockName} end]`;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
