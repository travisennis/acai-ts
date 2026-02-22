import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Cell,
  ColSpanCell,
  RowSpanCell,
} from "../../../source/terminal/table/cell.ts";

describe("Cell", () => {
  describe("_topLeftChar", () => {
    const defaultChars: Record<string, string> = {
      top: "─",
      topMid: "┬",
      topLeft: "┌",
      topRight: "┐",
      bottom: "─",
      bottomMid: "┴",
      bottomLeft: "└",
      bottomRight: "┘",
      left: "│",
      leftMid: "├",
      mid: "─",
      midMid: "┼",
      right: "│",
      rightMid: "┤",
      middle: " ",
    };

    function createMockCell(x: number, y: number): Cell {
      const cell = new Cell({ content: "test" });
      cell.x = x;
      cell.y = y;
      cell.chars = defaultChars as unknown as Record<
        import("../../../source/terminal/table/utils.ts").CharName,
        string
      >;
      return cell;
    }

    it("should throw if x is null", () => {
      const cell = new Cell({ content: "test" });
      cell.y = 0;
      assert.throws(() => cell._topLeftChar(0), /Cell x must be initialized/);
    });

    describe("when y === 0 (top row)", () => {
      it("should return topLeft when x === 0 and offset === 0", () => {
        const cell = createMockCell(0, 0);
        assert.equal(cell._topLeftChar(0), "┌");
      });

      it("should return topMid when x > 0 and offset === 0", () => {
        const cell = createMockCell(1, 0);
        assert.equal(cell._topLeftChar(0), "┬");
      });

      it("should return top when x > 0 and offset > 0", () => {
        const cell = createMockCell(2, 0);
        assert.equal(cell._topLeftChar(1), "─");
      });

      // When x=0 and offset>0, x becomes this.x+offset > 0, so it returns "top"
      it("should return top when x === 0 and offset > 0", () => {
        const cell = createMockCell(0, 0);
        assert.equal(cell._topLeftChar(1), "─");
      });
    });

    describe("when y !== 0 (non-top row)", () => {
      it("should return leftMid when x === 0", () => {
        const cell = createMockCell(0, 1);
        assert.equal(cell._topLeftChar(0), "├");
      });

      it("should return midMid when offset === 0", () => {
        const cell = createMockCell(1, 1);
        assert.equal(cell._topLeftChar(0), "┼");
      });

      it("should return bottomMid when offset > 0", () => {
        const cell = createMockCell(2, 1);
        assert.equal(cell._topLeftChar(1), "┴");
      });

      // When x=0 and offset>0, x becomes this.x+offset > 0, so it returns "bottomMid"
      it("should return bottomMid when x === 0 and offset > 0", () => {
        const cell = createMockCell(0, 1);
        assert.equal(cell._topLeftChar(1), "┴");
      });
    });

    describe("with ColSpanCell above", () => {
      it("should return topMid when offset === 0 and span above", () => {
        // Create a cell at position (1, 1), checking for span at (1, 0)
        const colSpanCell = new ColSpanCell();
        // cells[y][x] - check row above (y-1) at same x
        const cells: (Cell | ColSpanCell | undefined)[][] = [
          [undefined, colSpanCell], // row 0: colSpanCell at x=1
          [undefined, createMockCell(1, 1)], // row 1: our cell at x=1
        ];
        const cell = createMockCell(1, 1);
        cell.cells = cells as Cell[][];
        assert.equal(cell._topLeftChar(0), "┬");
      });

      // Note: When offset > 0 and span above, the code still returns "bottomMid"
      // if the spanAbove check doesn't match or cells isn't properly set up
      it("should return mid when offset > 0 and span above", () => {
        const colSpanCell = new ColSpanCell();
        // For offset 1, x = this.x + offset = 1 + 1 = 2
        // Check cells[this.y - 1]?.[x] = cells[0]?.[2]
        const cells: (Cell | ColSpanCell | undefined)[][] = [
          [undefined, undefined, colSpanCell], // row 0: colSpanCell at x=2
          [undefined, undefined, createMockCell(2, 1)], // row 1: our cell at x=2
        ];
        const cell = createMockCell(1, 1);
        cell.cells = cells as Cell[][];
        assert.equal(cell._topLeftChar(1), "─");
      });
    });

    describe("with RowSpanCell to the left after walking past ColSpanCells", () => {
      it("should return leftMid when offset === 0, span above, and RowSpanCell to left", () => {
        const originalCell = createMockCell(0, 0);
        const rowSpanCell = new RowSpanCell(originalCell);
        const colSpanCell = new ColSpanCell();
        // cells[y][x]: check this.cells[this.y]?.[x - i] for RowSpanCell
        // For cell at (2,1), check x-1=1, then x-2=0
        // cells[1][1] should be ColSpanCell, cells[1][0] should be RowSpanCell
        const cells: (Cell | ColSpanCell | RowSpanCell | undefined)[][] = [
          [rowSpanCell, colSpanCell, undefined], // row 0
          [rowSpanCell, colSpanCell, createMockCell(2, 1)], // row 1
        ];
        const cell = createMockCell(2, 1);
        cell.cells = cells as Cell[][];
        assert.equal(cell._topLeftChar(0), "├");
      });
    });
  });
});
