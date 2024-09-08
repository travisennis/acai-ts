import type Tool from "@anthropic-ai/sdk";

export type ToolParameters = {
  type: "object";
  requiredProperties: {
    [key: string]: {
      type: "string";
      description: string;
      enum?: string[];
    };
  };
  optionalProperties?: {
    [key: string]: {
      type: "string";
      description: string;
      enum?: string[];
    };
  };
  additionalProperties?: boolean;
};

export abstract class CallableTool {
  abstract getName(): string;
  abstract getDescription(): string;
  abstract getParameters(): ToolParameters;
  getDefinition(): Tool.Tool {
    const params = this.getParameters();
    return {
      name: this.getName(),
      description: this.getDescription(),
      input_schema: {
        type: "object",
        properties: {
          ...params.requiredProperties,
          ...params.optionalProperties,
        },
        required: Object.keys(params.requiredProperties),
        additionalProperties: params.additionalProperties,
      },
    };
  }
  abstract call(args: { [key: string]: string }): Promise<string>;
}
