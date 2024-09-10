import type { CoreTool } from "ai";

export function mergeTools(tools: Array<{ [key: string]: CoreTool<any> }>): {
  [key: string]: CoreTool<any>;
} {
  return tools.reduce((acc, curr) => {
    const [key, value] = Object.entries(curr)[0];
    acc[key] = value;
    return acc;
  }, {});
}
