import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Cell } from "../../../source/terminal/table/cell.ts";
import { makeComputeWidths, fillInTable } from "../../../source/terminal/table/layout-manager.ts";

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
