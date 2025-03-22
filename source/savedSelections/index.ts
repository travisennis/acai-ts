import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Range } from "vscode-languageserver";
import { config } from "../config.ts";

export interface Selection {
  documentUri: string;
  range: Range;
  documentText: string;
}

export async function getSavedSelections() {
  const contextDir = config.project.ensurePath("context");
  const selectionsPath = join(contextDir, "selections.json");

  try {
    // Read selections file
    const content = await readFile(selectionsPath, { encoding: "utf8" });
    const data = JSON.parse(content);

    // Ensure selections array exists
    const selections: Selection[] = Array.isArray(data.selections)
      ? data.selections
      : [];

    // Format selections for LLM prompt
    return selections.map((selection) => {
      const { documentUri, range, documentText } = selection;

      return {
        documentUri,
        range,
        documentText,
      };
    });
  } catch (error) {
    // Handle specific errors
    if ((error as any).code === "ENOENT") {
      console.warn("No saved selections found.");
      return [];
    }

    if (error instanceof SyntaxError) {
      console.error("Invalid JSON in selections file.");
      return [];
    }

    console.error("Error retrieving saved selections:", error);
    return [];
  }
}

export function formatSelection(selection: Selection) {
  const absolutePath = selection.documentUri.startsWith("file://")
    ? decodeURIComponent(selection.documentUri.replace(/^file:\/\//, ""))
    : selection.documentUri;
  return `File: ${absolutePath}\nSelection (lines ${selection.range.start.line}-${selection.range.end.line}):\n${selection.documentText}`;
}

export async function saveSelection(selection: Selection): Promise<void>;
export async function saveSelection(selections: Selection[]): Promise<void>;
export async function saveSelection(
  selections: Selection | Selection[],
): Promise<void> {
  const contextDir = config.project.ensurePath("context");
  const selectionsPath = join(contextDir, "selections.json");
  // Check if selections.json exists
  let result: { selections: Selection[] } = {
    selections: [],
  };

  try {
    const content = await readFile(selectionsPath, {
      encoding: "utf8",
    });
    result = JSON.parse(content);

    // Ensure selections array exists
    if (!result.selections) {
      result.selections = [];
    }
  } catch (_error) {
    // File doesn't exist or is invalid JSON, use default empty structure
  }

  // Add the new extract
  for (const selection of Array.isArray(selections)
    ? selections
    : [selections]) {
    result.selections.push(selection);
  }

  // Write back to file
  await writeFile(selectionsPath, JSON.stringify(result, null, 2), {
    encoding: "utf8",
  });
}

export async function updateSelections(selections: string): Promise<void>;
export async function updateSelections(selections: {
  selections: Selection[];
}): Promise<void>;
export async function updateSelections(
  selections:
    | string
    | {
        selections: Selection[];
      },
): Promise<void> {
  const contextDir = config.project.ensurePath("context");
  const selectionsPath = join(contextDir, "selections.json");

  // Write back to file
  await writeFile(selectionsPath, JSON.stringify(selections, null, 2), {
    encoding: "utf8",
  });
}

export async function clearSavedSelections() {
  const contextDir = config.project.ensurePath("context");
  const selectionsPath = join(contextDir, "selections.json");

  const selections: { selections: Selection[] } = {
    selections: [],
  };

  // Write to file
  await writeFile(selectionsPath, JSON.stringify(selections, null, 2), {
    encoding: "utf8",
  });
}
