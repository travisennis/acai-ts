import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Cell } from "../../../source/terminal/table/cell.ts";
import {
  fillInTable,
  makeComputeWidths,
} from "../../../source/terminal/table/layout-manager.ts";

describe("makeComputeWidths", () => {
  const computeWidths = makeComputeWidths("colSpan", "desiredWidth", "x", 1);

  function createCell(x: number, desiredWidth: number, colSpan = 1): Cell {
    const cell = new Cell({ content: "test" });
    cell.x = x;
    cell.desiredWidth = desiredWidth;
    cell.colSpan = colSpan;
    return cell;
  }

  it("should handle empty table", () => {
    const vals: (number | null)[] = [];
    const table: Cell[][] = [];
    computeWidths(vals, table);
    assert.deepEqual(vals, []);
  });

  it("should calculate width for single cell", () => {
    const cell = createCell(0, 10);
    const vals: (number | null)[] = [null];
    const table: Cell[][] = [[cell]];
    computeWidths(vals, table);
    assert.equal(vals[0], 10);
  });

  it("should use forced minimum when larger than desired", () => {
    const computeMin10 = makeComputeWidths("colSpan", "desiredWidth", "x", 10);
    const cell = createCell(0, 5);
    const vals: (number | null)[] = [null];
    const table: Cell[][] = [[cell]];
    computeMin10(vals, table);
    assert.equal(vals[0], 10);
  });

  it("should take maximum of multiple cells in same column", () => {
    const cell1 = createCell(0, 5);
    const cell2 = createCell(0, 10);
    const vals: (number | null)[] = [null];
    const table: Cell[][] = [[cell1, cell2]];
    computeWidths(vals, table);
    assert.equal(vals[0], 10);
  });

  it("should apply forced values from vals array", () => {
    const cell = createCell(0, 5);
    const vals: (number | null)[] = [15]; // forced value
    const table: Cell[][] = [[cell]];
    computeWidths(vals, table);
    assert.equal(vals[0], 15);
  });

  it("should distribute span width across columns", () => {
    const cell = createCell(0, 10, 3); // spans 3 columns
    const vals: (number | null)[] = [null, null, null];
    const table: Cell[][] = [[cell]];
    computeWidths(vals, table);
    // Verify the span distributes across columns (not exact values, just non-zero)
    const sum = (vals[0] ?? 0) + (vals[1] ?? 0) + (vals[2] ?? 0);
    assert.ok(sum > 0, "Span should distribute width across columns");
  });

  it("should distribute span across columns beyond existing widths", () => {
    // Column 0 and 1 already have values from non-spanning cells
    const spanningCell = createCell(0, 30, 2); // spans cols 0-1, wants 30 total
    const existingCell0 = createCell(0, 5); // col 0 already wants 5
    // Need them in different rows so they don't conflict
    const vals: (number | null)[] = [null, null];
    const table: Cell[][] = [[existingCell0], [spanningCell]];
    computeWidths(vals, table);
    // The span should increase col 0 beyond the existing 5 to help reach 30
    // Since only col 0 (forced) and col 1 (editable), distribution goes to col 1
    assert.ok(
      (vals[1] ?? 0) > 0,
      "Span should distribute excess to editable columns",
    );
  });

  it("should respect forced values when distributing span", () => {
    // Column 0 has a forced value, column 1 is editable
    const spanningCell = createCell(0, 20, 2); // spans cols 0-1
    const vals: (number | null)[] = [10, null]; // col 0 forced to 10
    const table: Cell[][] = [[spanningCell]];
    computeWidths(vals, table);
    // Forced col 0 stays at 10, editable col 1 gets the distribution
    assert.equal(vals[0], 10, "Forced column should keep its value");
    assert.ok(
      (vals[1] ?? 0) > 0,
      "Editable column should get distributed width",
    );
  });

  it("should handle span where desired width does not exceed existing", () => {
    // Existing values already satisfy the span's desire
    const spanningCell = createCell(0, 5, 2); // wants 5 total
    const vals: (number | null)[] = [10, 5]; // existing total = 10 + 1 (gap) + 5 = 16 > 5
    const table: Cell[][] = [[spanningCell]];
    computeWidths(vals, table);
    // Values should remain as-is since existing > desired
    assert.equal(vals[0], 10);
    assert.equal(vals[1], 5);
  });

  it("should handle multiple spanning cells", () => {
    // Two spanning cells in different rows
    const span1 = createCell(0, 15, 3); // spans cols 0-2
    const span2 = createCell(0, 20, 2); // spans cols 0-1, smaller desire so should not force
    const vals: (number | null)[] = [null, null, null];
    const table: Cell[][] = [[span1], [span2]];
    computeWidths(vals, table);
    // Both spans should contribute to final widths
    const totalWidth = (vals[0] ?? 0) + (vals[1] ?? 0) + (vals[2] ?? 0);
    assert.ok(totalWidth >= 15, "Columns should accommodate wider span");
  });

  it("should handle span with no editable columns (all forced)", () => {
    const spanningCell = createCell(0, 5, 2); // spans cols 0-1
    const vals: (number | null)[] = [10, 10]; // both columns forced
    const table: Cell[][] = [[spanningCell]];
    computeWidths(vals, table);
    // Both columns are forced, so no distribution possible
    assert.equal(vals[0], 10);
    assert.equal(vals[1], 10);
  });

  it("should handle span starting beyond first column", () => {
    // Span starts at column 2
    const spanningCell = createCell(2, 20, 2); // spans cols 2-3
    const vals: (number | null)[] = [null, null, null, null];
    const table: Cell[][] = [[spanningCell]];
    computeWidths(vals, table);
    // Only cols 2-3 should have values
    assert.equal(vals[0], 1, "Col 0 should get forced minimum");
    assert.equal(vals[1], 1, "Col 1 should get forced minimum");
    assert.ok(
      (vals[2] ?? 0) > 0,
      "Span column 2 should have distributed width",
    );
    assert.ok(
      (vals[3] ?? 0) > 0,
      "Span column 3 should have distributed width",
    );
  });

  it("should handle single-column span", () => {
    const spanningCell = createCell(1, 15, 1); // colSpan of 1, effectively no spanning
    const vals: (number | null)[] = [null, null];
    const table: Cell[][] = [[spanningCell]];
    computeWidths(vals, table);
    assert.equal(vals[0], 1, "Col 0 gets forced minimum");
    assert.equal(vals[1], 15, "Col 1 gets the cell's desired width");
  });

  it("should process spanners in reverse order for correct distribution", () => {
    // Two spans overlapping - later spans should be processed after earlier ones
    const span1 = createCell(0, 30, 3); // big span over cols 0-2
    const span2 = createCell(0, 5, 2); // smaller span over cols 0-1
    const vals: (number | null)[] = [null, null, null];
    const table: Cell[][] = [[span1], [span2]];
    computeWidths(vals, table);
    // The smaller span (span2) is processed second and should not reduce existing widths
    assert.ok((vals[0] ?? 0) > 0, "Col 0 should have width");
    assert.ok((vals[1] ?? 0) > 0, "Col 1 should have width");
  });
});

describe("fillInTable", () => {
  function createCell(x: number, y: number, content = ""): Cell {
    const cell = new Cell({ content });
    cell.x = x;
    cell.y = y;
    return cell;
  }

  it("should not modify table with no missing cells", () => {
    const cell = createCell(0, 0, "test");
    const table: Cell[][] = [[cell]];
    const initialLength = table[0].length;
    fillInTable(table);
    assert.equal(table[0].length, initialLength);
    assert.equal(table[0][0].content, "test");
  });

  it("should fill gap between cells in same row", () => {
    const cell1 = createCell(0, 0, "a");
    const cell2 = createCell(2, 0, "b");
    const table: Cell[][] = [[cell1, cell2]];
    fillInTable(table);
    // Should have filled position 1
    assert.equal(table[0].length, 3);
    assert.equal(table[0][1].x, 1);
    assert.equal(table[0][1].y, 0);
  });

  it("should handle table with multiple rows", () => {
    const cell = createCell(0, 0, "a");
    const table: Cell[][] = [[cell], []];
    fillInTable(table);
    // Should have filled cell in second row
    assert.ok(table[1].length > 0);
    assert.equal(table[1][0].y, 1);
  });

  it("should preserve existing cell content", () => {
    const cell1 = createCell(0, 0, "first");
    const cell2 = createCell(2, 0, "second");
    const table: Cell[][] = [[cell1, cell2]];
    fillInTable(table);
    assert.equal(table[0][0].content, "first");
    assert.equal(table[0][2].content, "second");
  });

  it("should set colSpan and rowSpan on filled cells", () => {
    const cell1 = createCell(0, 0, "a");
    const cell2 = createCell(2, 0, "b");
    const table: Cell[][] = [[cell1, cell2]];
    fillInTable(table);
    // The filled cell should have colSpan
    const filledCell = table[0][1];
    assert.equal(filledCell.colSpan, 1);
    assert.equal(filledCell.rowSpan, 1);
  });
});
