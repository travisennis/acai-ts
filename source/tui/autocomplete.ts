// Main autocomplete module - exports all providers and utilities

import { AttachmentProvider } from "./autocomplete/attachment-provider.ts";
import type { AutocompleteItem } from "./autocomplete/base-provider.ts";
import { CombinedProvider } from "./autocomplete/combined-provider.ts";
import {
  CommandProvider,
  type SlashCommand,
} from "./autocomplete/command-provider.ts";
import { FileSearchProvider } from "./autocomplete/file-search-provider.ts";
import { PathProvider } from "./autocomplete/path-provider.ts";

export { AttachmentProvider } from "./autocomplete/attachment-provider.ts";
export type {
  AutocompleteItem,
  AutocompleteProvider,
} from "./autocomplete/base-provider.ts";
export { CombinedProvider } from "./autocomplete/combined-provider.ts";
export type { SlashCommand } from "./autocomplete/command-provider.ts";
export { CommandProvider } from "./autocomplete/command-provider.ts";
export { FileSearchProvider } from "./autocomplete/file-search-provider.ts";
export { PathProvider } from "./autocomplete/path-provider.ts";
export {
  DirectoryCache,
  directoryCache,
  extractPathPrefix,
  getDirectoryEntries,
  isPathWithinAllowedDirs,
} from "./autocomplete/utils.ts";

// Convenience function for backward compatibility
export function createDefaultProvider<
  T extends SlashCommand | AutocompleteItem,
>(commands: T[] = [], allowedDirs: string[] = [process.cwd()]) {
  return new CombinedProvider([
    new CommandProvider<T>(commands),
    new AttachmentProvider(),
    new FileSearchProvider(),
    new PathProvider(allowedDirs),
  ]);
}
