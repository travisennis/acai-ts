export interface PromptMetadata {
  name: string;
  description: string;
  enabled: boolean;
  path: string;
  type: "project" | "user";
}

export interface ParsedPrompt {
  content: string;
  metadata: {
    description: string;
    enabled: boolean;
  };
}
