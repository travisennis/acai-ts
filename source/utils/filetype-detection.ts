import { basename, extname } from "node:path";

interface LanguageInfo {
  name: string;
  codeblock: string;
}

const extensionToLanguageMap: { [key: string]: LanguageInfo } = {
  ".ts": { name: "TypeScript", codeblock: "typescript" },
  ".js": { name: "JavaScript", codeblock: "javascript" },
  ".mjs": { name: "JavaScript", codeblock: "javascript" },
  ".cjs": { name: "JavaScript", codeblock: "javascript" },
  ".jsx": { name: "JavaScript", codeblock: "javascript" },
  ".tsx": { name: "TypeScript", codeblock: "typescript" },
  ".py": { name: "Python", codeblock: "python" },
  ".java": { name: "Java", codeblock: "java" },
  ".go": { name: "Go", codeblock: "go" },
  ".rb": { name: "Ruby", codeblock: "ruby" },
  ".php": { name: "PHP", codeblock: "php" },
  ".phtml": { name: "PHP", codeblock: "php" },
  ".cs": { name: "C#", codeblock: "csharp" },
  ".cpp": { name: "C++", codeblock: "cpp" },
  ".cxx": { name: "C++", codeblock: "cpp" },
  ".cc": { name: "C++", codeblock: "cpp" },
  ".c": { name: "C", codeblock: "c" },
  ".h": { name: "C/C++", codeblock: "cpp" },
  ".hpp": { name: "C++", codeblock: "cpp" },
  ".swift": { name: "Swift", codeblock: "swift" },
  ".kt": { name: "Kotlin", codeblock: "kotlin" },
  ".rs": { name: "Rust", codeblock: "rust" },
  ".m": { name: "Objective-C", codeblock: "objectivec" },
  ".mm": { name: "Objective-C", codeblock: "objectivec" },
  ".pl": { name: "Perl", codeblock: "perl" },
  ".pm": { name: "Perl", codeblock: "perl" },
  ".lua": { name: "Lua", codeblock: "lua" },
  ".r": { name: "R", codeblock: "r" },
  ".scala": { name: "Scala", codeblock: "scala" },
  ".sc": { name: "Scala", codeblock: "scala" },
  ".sh": { name: "Shell", codeblock: "bash" },
  ".ps1": { name: "PowerShell", codeblock: "powershell" },
  ".bat": { name: "Batch", codeblock: "batch" },
  ".cmd": { name: "Batch", codeblock: "batch" },
  ".sql": { name: "SQL", codeblock: "sql" },
  ".html": { name: "HTML", codeblock: "html" },
  ".htm": { name: "HTML", codeblock: "html" },
  ".css": { name: "CSS", codeblock: "css" },
  ".less": { name: "Less", codeblock: "less" },
  ".sass": { name: "Sass", codeblock: "sass" },
  ".scss": { name: "Sass", codeblock: "scss" },
  ".json": { name: "JSON", codeblock: "json" },
  ".xml": { name: "XML", codeblock: "xml" },
  ".yaml": { name: "YAML", codeblock: "yaml" },
  ".yml": { name: "YAML", codeblock: "yaml" },
  ".md": { name: "Markdown", codeblock: "markdown" },
  ".markdown": { name: "Markdown", codeblock: "markdown" },
  ".dockerfile": { name: "Dockerfile", codeblock: "dockerfile" },
  ".vim": { name: "Vim script", codeblock: "vim" },
  ".vb": { name: "Visual Basic", codeblock: "vb" },
  ".fs": { name: "F#", codeblock: "fsharp" },
  ".clj": { name: "Clojure", codeblock: "clojure" },
  ".cljs": { name: "Clojure", codeblock: "clojure" },
  ".dart": { name: "Dart", codeblock: "dart" },
  ".ex": { name: "Elixir", codeblock: "elixir" },
  ".erl": { name: "Erlang", codeblock: "erlang" },
  ".hs": { name: "Haskell", codeblock: "haskell" },
  ".lisp": { name: "Lisp", codeblock: "lisp" },
  ".rkt": { name: "Racket", codeblock: "racket" },
  ".groovy": { name: "Groovy", codeblock: "groovy" },
  ".jl": { name: "Julia", codeblock: "julia" },
  ".tex": { name: "LaTeX", codeblock: "latex" },
  ".ino": { name: "Arduino", codeblock: "arduino" },
  ".asm": { name: "Assembly", codeblock: "asm" },
  ".s": { name: "Assembly", codeblock: "asm" },
  ".toml": { name: "TOML", codeblock: "toml" },
  ".vue": { name: "Vue", codeblock: "vue" },
  ".svelte": { name: "Svelte", codeblock: "svelte" },
  ".gohtml": { name: "Go Template", codeblock: "go" },
  ".hbs": { name: "Handlebars", codeblock: "handlebars" },
  ".ejs": { name: "EJS", codeblock: "ejs" },
  ".erb": { name: "ERB", codeblock: "erb" },
  ".jsp": { name: "JSP", codeblock: "jsp" },
  ".dockerignore": { name: "Docker", codeblock: "dockerfile" },
  ".gitignore": { name: "Git", codeblock: "gitignore" },
  ".npmignore": { name: "npm", codeblock: "npmignore" },
  ".editorconfig": { name: "EditorConfig", codeblock: "editorconfig" },
  ".prettierrc": { name: "Prettier", codeblock: "json" },
  ".eslintrc": { name: "ESLint", codeblock: "json" },
  ".babelrc": { name: "Babel", codeblock: "json" },
  ".tsconfig": { name: "TypeScript", codeblock: "json" },
  ".flow": { name: "Flow", codeblock: "flow" },
  ".graphql": { name: "GraphQL", codeblock: "graphql" },
  ".proto": { name: "Protocol Buffers", codeblock: "protobuf" },
  ".txt": { name: "Text", codeblock: "text" },
};

export function getLanguageFromFilePath(filePath: string): string | undefined {
  const extension = extname(filePath).toLowerCase();
  const languageInfo = extension
    ? extensionToLanguageMap[extension]
    : undefined;
  if (languageInfo) {
    return languageInfo.name;
  }
  const filename = basename(filePath).toLowerCase();
  const filenameLanguageInfo = extensionToLanguageMap[`.${filename}`];
  return filenameLanguageInfo?.name;
}

export function getCodeblockFromFilePath(filePath: string): string | undefined {
  const extension = extname(filePath).toLowerCase();
  const languageInfo = extension
    ? extensionToLanguageMap[extension]
    : undefined;
  if (languageInfo) {
    return languageInfo.codeblock;
  }
  const filename = basename(filePath).toLowerCase();
  const filenameLanguageInfo = extensionToLanguageMap[`.${filename}`];
  return filenameLanguageInfo?.codeblock;
}
