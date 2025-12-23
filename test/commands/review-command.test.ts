/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { strict as assertStrict } from "node:assert";
import { describe, it } from "node:test";
import { reviewCommand } from "../../source/commands/review-command.ts";
import type { CommandOptions } from "../../source/commands/types.ts";

describe("reviewCommand", () => {
  const mockOptions: CommandOptions = {
    promptManager: {
      set: () => {},
      get: () => "",
      addContext: () => {},
      clearContext: () => {},
      getContext: () => "",
      setSystemPrompt: () => {},
      getSystemPrompt: () => "",
    } as any,
    modelManager: {
      setModel: () => {},
      getModel: () => "",
      listModels: () => [],
    } as any,
    sessionManager: {
      addMessage: () => {},
      getMessages: () => [],
      clear: () => {},
      save: () => {},
      restore: () => {},
    } as any,
    tokenTracker: {
      track: () => {},
      getTotal: () => 0,
      reset: () => {},
    } as any,
    config: {
      get: () => ({}),
      set: () => {},
      save: () => {},
    } as any,
    tokenCounter: {
      count: () => 0,
    } as any,
    promptHistory: [],
    workspace: {
      primaryDir: "/tmp",
      allowedDirs: ["/tmp"],
    } as any,
  };

  it("should be defined", () => {
    const command = reviewCommand(mockOptions);

    assertStrict.ok(command);
    assertStrict.equal(command.command, "/review");
    assertStrict.equal(
      command.description,
      "Shows a diff of all changes in the current directory.",
    );
  });

  it("should have correct command properties", () => {
    const command = reviewCommand(mockOptions);

    assertStrict.ok(command);
    assertStrict.equal(command.command, "/review");
    assertStrict.equal(
      command.description,
      "Shows a diff of all changes in the current directory.",
    );
    assertStrict.ok(Array.isArray(command.aliases) || !command.aliases);
  });
});
