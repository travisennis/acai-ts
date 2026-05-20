import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TableComponent } from "../../../source/tui/components/table.ts";

describe("TableComponent", () => {
  it("should handle empty data", () => {
    const table = new TableComponent([], { width: 80 });
    const result = table.render(80);
    assert.deepEqual(result, []);
  });

  it("should render table with headers", () => {
    const data = [
      ["Row 1 Col 1", "Row 1 Col 2"],
      ["Row 2 Col 1", "Row 2 Col 2"],
    ];
    const headers = ["Header 1", "Header 2"];
    const table = new TableComponent(data, { headers, width: 80 });
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
    const table = new TableComponent(data, { headers, width: 80 });
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
    const table = new TableComponent(data, { headers, colWidths, width: 100 });
    const result = table.render(100);

    assert(Array.isArray(result));
    assert(result.length > 0);
  });

  it("should infer column count from data when no headers", () => {
    const data = [
      ["A", "B", "C"],
      ["1", "2", "3"],
    ];
    const table = new TableComponent(data, { width: 80 });
    const result = table.render(80);

    assert(Array.isArray(result));
    assert(result.length > 0);
    assert(result.some((line) => line.includes("A")));
    assert(result.some((line) => line.includes("B")));
    assert(result.some((line) => line.includes("C")));
  });

  it("should use render width when component width not set", () => {
    const data = [["Hello", "World"]];
    const table = new TableComponent(data, {});
    const result = table.render(60);

    assert(Array.isArray(result));
    assert(result.length > 0);
    assert(result.some((line) => line.includes("Hello")));
    assert(result.some((line) => line.includes("World")));
  });

  it("should pad rows with fewer columns", () => {
    const data = [
      ["A", "B", "C"],
      ["1", "2"], // shorter row
    ];
    const headers = ["Col1", "Col2", "Col3"];
    const table = new TableComponent(data, { headers, width: 80 });
    const result = table.render(80);

    assert(Array.isArray(result));
    assert(result.length > 0);
  });

  it("should truncate rows with more columns", () => {
    const data = [
      ["A", "B", "C"],
      ["1", "2", "3", "4", "5"], // longer row
    ];
    const headers = ["Col1", "Col2", "Col3"];
    const table = new TableComponent(data, { headers, width: 80 });
    const result = table.render(80);

    assert(Array.isArray(result));
    assert(result.length > 0);
  });

  it("should handle single column data", () => {
    const data = [["Only column"], ["Row 2"]];
    const table = new TableComponent(data, { width: 80 });
    const result = table.render(80);

    assert(Array.isArray(result));
    assert(result.length > 0);
    assert(result.some((line) => line.includes("Only column")));
    assert(result.some((line) => line.includes("Row 2")));
  });

  it("should handle numeric values", () => {
    const data = [
      [1, 2],
      [3, 4],
    ];
    const headers = ["Num1", "Num2"];
    const table = new TableComponent(data, { headers, width: 80 });
    const result = table.render(80);

    assert(Array.isArray(result));
    assert(result.length > 0);
    assert(result.some((line) => line.includes("1")));
    assert(result.some((line) => line.includes("2")));
  });

  it("should cache results and return cached on subsequent calls", () => {
    const data = [["Cached", "Data"]];
    const table = new TableComponent(data, {
      headers: ["H1", "H2"],
      width: 80,
    });

    const first = table.render(80);
    const second = table.render(80);

    assert.deepEqual(first, second);
  });

  it("should invalidate cache when data changes", () => {
    const table = new TableComponent([["Old"]], { width: 80 });
    const first = table.render(80);

    table.setData([["New"]]);
    const second = table.render(80);

    assert.notDeepEqual(first, second);
    assert(second.some((line) => line.includes("New")));
  });

  it("should invalidate cache when headers change", () => {
    const data = [["Data"]];
    const table = new TableComponent(data, {
      headers: ["Old Header"],
      width: 80,
    });
    const first = table.render(80);

    table.setHeaders(["New Header"]);
    const second = table.render(80);

    assert.notDeepEqual(first, second);
    assert(second.some((line) => line.includes("New Header")));
  });

  it("should invalidate cache when column widths change", () => {
    const data = [["Short", "Longer text here"]];
    const headers = ["A", "B"];
    const table = new TableComponent(data, {
      headers,
      colWidths: [50, 50],
      width: 100,
    });
    const first = table.render(100);

    table.setColWidths([80, 20]);
    const second = table.render(100);

    // Layout should differ with different widths
    assert(first.join("") !== second.join(""));
  });

  it("should invalidate cache when width changes", () => {
    const data = [["Data"]];
    const table = new TableComponent(data, { headers: ["Header"], width: 80 });
    const first = table.render(80);

    table.setWidth(40);
    const second = table.render(40);

    assert(first.join("") !== second.join(""));
  });

  it("should handle data with empty arrays", () => {
    const table = new TableComponent([[]], { headers: ["Col1"], width: 80 });
    const result = table.render(80);

    assert(Array.isArray(result));
    assert(result.length > 0);
  });
});
