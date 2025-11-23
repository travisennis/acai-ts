import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ModalTable } from "../../../source/tui/components/modal.ts";

describe("ModalTable", () => {
  it("should handle empty data", () => {
    const table = new ModalTable([]);
    const result = table.render(80);
    assert.deepEqual(result, []);
  });

  it("should render table with headers", () => {
    const data = [
      ["Row 1 Col 1", "Row 1 Col 2"],
      ["Row 2 Col 1", "Row 2 Col 2"],
    ];
    const headers = ["Header 1", "Header 2"];
    const table = new ModalTable(data, headers);
    const result = table.render(80);

    assert(Array.isArray(result));
    assert(result.length > 0);
    assert(result.some((line) => line.includes("Header 1")));
    assert(result.some((line) => line.includes("Header 2")));
  });

  it("should handle long text with proper wrapping", () => {
    const data = [
      [
        "Short",
        "This is a very long text that should wrap properly when displayed in a table cell",
      ],
      [
        "Another",
        "Another long text that exceeds the typical column width and needs to be wrapped",
      ],
    ];
    const headers = ["Column 1", "Column 2"];
    const table = new ModalTable(data, headers);
    const result = table.render(80);

    assert(Array.isArray(result));
    assert(result.length > 0);

    // Check that long text is properly wrapped (not truncated)
    const allLines = result.join("\n");
    assert(allLines.includes("This is a very long text that"));
    assert(allLines.includes("should wrap properly when"));
    assert(allLines.includes("displayed"));
    assert(allLines.includes("in a table cell"));

    // Verify no truncation markers like "..."
    assert(!allLines.includes("..."));
  });

  it("should respect custom column widths", () => {
    const data = [
      ["Short", "Long text"],
      ["Another", "More text"],
    ];
    const headers = ["Col1", "Col2"];
    const colWidths = [30, 70];
    const table = new ModalTable(data, headers, colWidths);
    const result = table.render(100);

    assert(Array.isArray(result));
    assert(result.length > 0);
  });
});
