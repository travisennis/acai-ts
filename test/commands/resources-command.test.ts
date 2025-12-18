import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { resourcesCommand } from "../../source/commands/resources-command.ts";
import {
  createMockCommandOptions,
  createMockContainer,
  createMockEditor,
  createMockTui,
} from "../utils/mocking.ts";

describe("/resources command", () => {
  it("displays resources when available", async () => {
    const mockTui = createMockTui();
    const mockContainer = createMockContainer();
    const mockEditor = createMockEditor();

    // Mock the dependencies directly on the options
    const options = createMockCommandOptions();

    // Mock config.readAgentsFile
    const mockReadAgentsFile = mock.fn(async () => "# AGENTS.md content");
    options.config.readAgentsFile = mockReadAgentsFile;

    // We can't easily mock loadSkills and loadContexts without dependency injection
    // For now, we'll test that the command runs without throwing
    const cmd = resourcesCommand(options);

    // This will use the real loadSkills and loadContexts functions
    // which will work if the directories exist
    await cmd.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    // Should have called showModal
    assert.equal(mockTui.showModal.mock.calls.length, 1);
    // Should have called readAgentsFile
    assert.equal(mockReadAgentsFile.mock.calls.length, 1);
  });

  it("handles AGENTS.md not found", async () => {
    const mockTui = createMockTui();
    const mockContainer = createMockContainer();
    const mockEditor = createMockEditor();

    const options = createMockCommandOptions();

    // Mock config.readAgentsFile to return empty string (not found)
    const mockReadAgentsFile = mock.fn(async () => "");
    options.config.readAgentsFile = mockReadAgentsFile;

    const cmd = resourcesCommand(options);
    await cmd.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    assert.equal(mockTui.showModal.mock.calls.length, 1);
    assert.equal(mockReadAgentsFile.mock.calls.length, 1);
  });

  it("handles errors gracefully", async () => {
    const mockTui = createMockTui();
    const mockContainer = createMockContainer();
    const mockEditor = createMockEditor();

    const options = createMockCommandOptions();

    // Mock config.readAgentsFile to throw an error
    const mockReadAgentsFile = mock.fn(async () => {
      throw new Error("Failed to read AGENTS.md");
    });
    options.config.readAgentsFile = mockReadAgentsFile;

    const cmd = resourcesCommand(options);
    await cmd.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    // Should still show modal with error
    assert.equal(mockTui.showModal.mock.calls.length, 1);
    assert.equal(mockReadAgentsFile.mock.calls.length, 1);
  });
});
