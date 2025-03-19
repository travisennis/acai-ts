``` typescript
export interface CodeEntity {
  id: string;
  type: "file" | "class" | "function" | "interface" | "type" | "variable";
  name: string;
  content?: string;
  location: {
    file: string;
    startLine: number;
    endLine: number;
  };
  metadata: Record<string, any>;
  relationships: Array<{
    type: string;
    targetId: string;
  }>;
}
```

``` typescript
export interface GitEntity {
  id: string;
  type: "commit" | "file" | "author" | "branch";
  description?: string;
  metadata: Record<string, any>;
  relationships: Array<{
    type: string;
    targetId: string;
  }>;
}
```

Create a common interface type from the above types. Call it Entity and these two would then extend that base type
