import debug from './debug.ts';
import { Cell, ColSpanCell, RowSpanCell } from './cell.ts';
import type { CellOptions } from './utils.ts';


interface AllocMap {
  [key: string]: number;
}

function next(alloc: AllocMap, col: number): number {
  if (alloc[col] > 0) {
    return next(alloc, col + 1);
  }
  return col;
}

export function layoutTable(table: Cell[][]): void {
  const alloc: AllocMap = {};
  table.forEach((row, rowIndex) => {
    let col = 0;
    row.forEach((cell) => {
      cell.y = rowIndex;
      // Avoid erroneous call to next() on first row
      cell.x = rowIndex ? next(alloc, col) : col;
      const rowSpan = cell.rowSpan || 1;
      const colSpan = cell.colSpan || 1;
      if (rowSpan > 1) {
        for (let cs = 0; cs < colSpan; cs++) {
          alloc[cell.x + cs] = rowSpan;
        }
      }
      col = cell.x + colSpan;
    });
    Object.keys(alloc).forEach((idx) => {
      alloc[idx]--;
      if (alloc[idx] < 1) delete alloc[idx];
    });
  });
}

export function maxWidth(table: Cell[][]): number {
  let mw = 0;
  table.forEach((row) => {
    row.forEach((cell) => {
      if (cell.x !== null) {
        mw = Math.max(mw, cell.x + (cell.colSpan || 1));
      }
    });
  });
  return mw;
}

export function maxHeight(table: Cell[][]): number {
  return table.length;
}

export function cellsConflict(cell1: { x: number; y: number; rowSpan?: number; colSpan?: number }, cell2: { x: number; y: number; rowSpan?: number; colSpan?: number }): boolean {
  const yMin1 = cell1.y;
  const yMax1 = cell1.y - 1 + (cell1.rowSpan || 1);
  const yMin2 = cell2.y;
  const yMax2 = cell2.y - 1 + (cell2.rowSpan || 1);
  const yConflict = !(yMin1 > yMax2 || yMin2 > yMax1);

  const xMin1 = cell1.x;
  const xMax1 = cell1.x - 1 + (cell1.colSpan || 1);
  const xMin2 = cell2.x;
  const xMax2 = cell2.x - 1 + (cell2.colSpan || 1);
  const xConflict = !(xMin1 > xMax2 || xMin2 > xMax1);

  return yConflict && xConflict;
}

export function conflictExists(rows: Cell[][], x: number, y: number): boolean {
  const iMax = Math.min(rows.length - 1, y);
  const cell = { x: x, y: y };
  for (let i = 0; i <= iMax; i++) {
    const row = rows[i];
    for (let j = 0; j < row.length; j++) {
      const currentCell = row[j];
      if (currentCell.x !== null && currentCell.y !== null) {
        if (cellsConflict(cell, { x: currentCell.x, y: currentCell.y, rowSpan: currentCell.rowSpan, colSpan: currentCell.colSpan })) {
          return true;
        }
      }
    }
  }
  return false;
}

export function allBlank(rows: Cell[][], y: number, xMin: number, xMax: number): boolean {
  for (let x = xMin; x < xMax; x++) {
    if (conflictExists(rows, x, y)) {
      return false;
    }
  }
  return true;
}

export function addRowSpanCells(table: Cell[][]): void {
  table.forEach((row, rowIndex) => {
    row.forEach((cell) => {
      for (let i = 1; i < cell.rowSpan; i++) {
        const rowSpanCell = new RowSpanCell(cell);
        if (cell.x !== null && cell.y !== null) {
          rowSpanCell.x = cell.x;
          rowSpanCell.y = cell.y + i;
          rowSpanCell.colSpan = cell.colSpan;
          insertCell(rowSpanCell as unknown as Cell, table[rowIndex + i]);
        }
      }
    });
  });
}

export function addColSpanCells(cellRows: Cell[][]): void {
  for (let rowIndex = cellRows.length - 1; rowIndex >= 0; rowIndex--) {
    const cellColumns = cellRows[rowIndex];
    for (let columnIndex = 0; columnIndex < cellColumns.length; columnIndex++) {
      const cell = cellColumns[columnIndex];
      for (let k = 1; k < cell.colSpan; k++) {
        const colSpanCell = new ColSpanCell();
        if (cell.x !== null && cell.y !== null) {
          colSpanCell.x = cell.x + k;
          colSpanCell.y = cell.y;
          cellColumns.splice(columnIndex + 1, 0, colSpanCell as unknown as Cell);
        }
      }
    }
  }
}

export function insertCell(cell: Cell, row: Cell[]): void {
  let x = 0;
  const cellX = cell.x;
  while (x < row.length) {
    const rowX = row[x].x;
    if (rowX === null || cellX === null || rowX >= cellX) {
      break;
    }
    x++;
  }
  row.splice(x, 0, cell);
}

export function fillInTable(table: Cell[][]): void {
  const hMax = maxHeight(table);
  const wMax = maxWidth(table);
  debug.debug(`Max rows: ${hMax}; Max cols: ${wMax}`);
  for (let y = 0; y < hMax; y++) {
    for (let x = 0; x < wMax; x++) {
      if (!conflictExists(table, x, y)) {
        const opts = { x: x, y: y, colSpan: 1, rowSpan: 1 };
        x++;
        while (x < wMax && !conflictExists(table, x, y)) {
          opts.colSpan++;
          x++;
        }
        let y2 = y + 1;
        while (y2 < hMax && allBlank(table, y2, opts.x, opts.x + opts.colSpan)) {
          opts.rowSpan++;
          y2++;
        }
        const cell = new Cell({ ...opts, content: '' });
        cell.x = opts.x;
        cell.y = opts.y;
        debug.warn(`Missing cell at ${cell.y}-${cell.x}.`);
        insertCell(cell, table[y]);
      }
    }
  }
}

export function generateCells(rows: unknown[]): Cell[][] {
  return rows.map((row) => {
    if (!Array.isArray(row)) {
      const key = Object.keys(row as Record<string, unknown>)[0];
      const rowValue = (row as Record<string, unknown>)[key];
      if (Array.isArray(rowValue)) {
        const newRow = rowValue.slice();
        newRow.unshift(key);
        row = newRow;
      } else {
        row = [key, rowValue];
      }
    }
    return (row as unknown[])
      .filter((cell): cell is CellOptions | string | number | boolean | bigint => 
        cell !== null && cell !== undefined
      )
      .map((cell) => {
        return new Cell(cell);
      });
  });
}

export function makeTableLayout(rows: unknown[]): Cell[][] {
  const cellRows = generateCells(rows);
  layoutTable(cellRows);
  fillInTable(cellRows);
  addRowSpanCells(cellRows);
  addColSpanCells(cellRows);
  return cellRows;
}

export function makeComputeWidths(
  colSpan: 'colSpan',
  desiredWidth: 'desiredWidth' | 'desiredHeight',
  x: 'x' | 'y',
  forcedMin: number,
): (vals: Array<number | null>, table: Cell[][]) => void {
  return (vals: Array<number | null>, table: Cell[][]): void => {
    const result: number[] = [];
    const spanners: Cell[] = [];
    const auto: Record<number, number> = {};
    table.forEach((row) => {
      row.forEach((cell) => {
        if ((cell[colSpan] || 1) > 1) {
          spanners.push(cell);
        } else {
          const key = cell[x];
          if (key !== null) {
            result[key] = Math.max(result[key] || 0, cell[desiredWidth] || 0, forcedMin);
          }
        }
      });
    });

    vals.forEach((val, index) => {
      if (typeof val === 'number') {
        result[index] = val;
      }
    });

    // spanners.forEach(function(cell){
    for (let k = spanners.length - 1; k >= 0; k--) {
      const cell = spanners[k];
      const span = cell[colSpan];
      const col = cell[x];
      if (col === null) continue;
      let existingWidth = result[col];
      let editableCols = typeof vals[col] === 'number' ? 0 : 1;
      if (typeof existingWidth === 'number') {
        for (let i = 1; i < span; i++) {
          existingWidth += 1 + result[col + i];
          if (typeof vals[col + i] !== 'number') {
            editableCols++;
          }
        }
      } else {
        existingWidth = desiredWidth === 'desiredWidth' ? cell.desiredWidth - 1 : 1;
        if (!auto[col] || auto[col] < existingWidth) {
          auto[col] = existingWidth;
        }
      }

      if (cell[desiredWidth] > existingWidth) {
        let i = 0;
        while (editableCols > 0 && cell[desiredWidth] > existingWidth) {
          if (typeof vals[col + i] !== 'number') {
            const dif = Math.round((cell[desiredWidth] - existingWidth) / editableCols);
            existingWidth += dif;
            result[col + i] += dif;
            editableCols--;
          }
          i++;
        }
      }
    }

    Object.assign(vals, result, auto);
    for (let j = 0; j < vals.length; j++) {
      vals[j] = Math.max(forcedMin, vals[j] || 0);
    }
  };
}

export const computeWidths = makeComputeWidths('colSpan', 'desiredWidth', 'x', 1);
export const computeHeights = makeComputeWidths('rowSpan' as 'colSpan', 'desiredHeight', 'y', 1);