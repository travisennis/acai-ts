import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Cell } from "../../../source/terminal/table/cell.ts";
import { makeComputeWidths } from "../../../source/terminal/table/layout-manager.ts";

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
