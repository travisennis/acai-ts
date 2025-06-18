export type NodeType =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable";

const typeMap: Record<string, NodeType> = {
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  function_declaration: "function",
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  arrow_function: "function",
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  method_definition: "method",
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  method_declaration: "method",
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  class_declaration: "class",
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  interface_declaration: "interface",
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  type_alias_declaration: "type",
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  enum_declaration: "enum",
};

export function normalizeType(nodeType: string): string {
  return typeMap[nodeType] || nodeType;
}
