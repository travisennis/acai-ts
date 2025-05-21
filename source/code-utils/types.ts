export type SupportedLanguage = "typescript" | "java";
export type SupportedExtension = ".ts" | ".java";

export function isSupportedExtension(ext: string): ext is SupportedExtension {
  return ext === ".ts" || ext === ".java";
}

export const LANGUAGES: Record<SupportedExtension, SupportedLanguage> = {
  ".ts": "typescript",
  ".java": "java",
};

export function extensionToLanguage(
  extension: string,
): SupportedLanguage | null {
  switch (extension) {
    case ".ts":
      return "typescript";
    case ".java":
      return "java";
    default:
      return null;
  }
}
