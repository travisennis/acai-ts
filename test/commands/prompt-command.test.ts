import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parsePromptFile } from "../../source/commands/prompt/utils.ts";

describe("parsePromptFile", () => {
  it("should parse YAML front matter with description and enabled fields", () => {
    const content = `---
description: Test prompt description
enabled: true
---
This is the prompt content.`;

    const result = parsePromptFile(content);

    assert.equal(result.metadata.description, "Test prompt description");
    assert.equal(result.metadata.enabled, true);
    assert.equal(result.content, "This is the prompt content.");
  });

  it("should handle disabled prompts", () => {
    const content = `---
description: Disabled prompt
enabled: false
---
This prompt is disabled.`;

    const result = parsePromptFile(content);

    assert.equal(result.metadata.description, "Disabled prompt");
    assert.equal(result.metadata.enabled, false);
    assert.equal(result.content, "This prompt is disabled.");
  });

  it("should use first 50 characters as description when no front matter", () => {
    const content =
      "This is a prompt without any YAML front matter. It should use the first 50 characters.";

    const result = parsePromptFile(content);

    assert.equal(
      result.metadata.description,
      "This is a prompt without any YAML front matter. It...",
    );
    assert.equal(result.metadata.enabled, true);
    assert.equal(result.content, content);
  });

  it("should handle partial YAML (only description)", () => {
    const content = `---
description: Only description provided
---
Prompt content.`;

    const result = parsePromptFile(content);

    assert.equal(result.metadata.description, "Only description provided");
    assert.equal(result.metadata.enabled, true); // Default to true
    assert.equal(result.content, "Prompt content.");
  });

  it("should handle partial YAML (only enabled)", () => {
    const content = `---
enabled: false
---
Disabled prompt.`;

    const result = parsePromptFile(content);

    // Should use first 50 chars of content for description
    assert.equal(result.metadata.description, "Disabled prompt.");
    assert.equal(result.metadata.enabled, false);
    assert.equal(result.content, "Disabled prompt.");
  });

  it("should trim whitespace from YAML values", () => {
    const content = `---
description:   Test with spaces  
enabled:   true  
---
Content.`;

    const result = parsePromptFile(content);

    assert.equal(result.metadata.description, "Test with spaces");
    assert.equal(result.metadata.enabled, true);
    assert.equal(result.content, "Content.");
  });

  it("should handle YAML with extra newlines", () => {
    const content = `---

description: Multi-line test

enabled: true

---
Prompt content.`;

    const result = parsePromptFile(content);

    assert.equal(result.metadata.description, "Multi-line test");
    assert.equal(result.metadata.enabled, true);
    assert.equal(result.content, "Prompt content.");
  });

  it("should handle case-insensitive enabled field", () => {
    const content = `---
description: Test
enabled: FALSE
---
Content.`;

    const result = parsePromptFile(content);

    assert.equal(result.metadata.enabled, false);
  });

  it("should handle empty content", () => {
    const content = "";

    const result = parsePromptFile(content);

    assert.equal(result.metadata.description, "");
    assert.equal(result.metadata.enabled, true);
    assert.equal(result.content, "");
  });

  it("should handle content with only YAML front matter", () => {
    const content = `---
description: Only YAML
enabled: true
---`;

    const result = parsePromptFile(content);

    assert.equal(result.metadata.description, "Only YAML");
    assert.equal(result.metadata.enabled, true);
    assert.equal(result.content, "");
  });
});
