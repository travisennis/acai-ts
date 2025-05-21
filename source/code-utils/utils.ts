export type NodeType =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable";

const typeMap: Record<string, NodeType> = {
  // biome-ignore lint/style/useNamingConvention: <explanation>
  function_declaration: "function",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  arrow_function: "function",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  method_definition: "method",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  method_declaration: "method",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  class_declaration: "class",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  interface_declaration: "interface",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  type_alias_declaration: "type",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  enum_declaration: "enum",
};

export function normalizeType(nodeType: string): string {
  return typeMap[nodeType] || nodeType;
}
