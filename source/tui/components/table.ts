import { Table } from "../../terminal/table/index.ts";
import type { Component } from "../tui.ts";

/**
 * Table component - displays tabular data with proper formatting and wrapping
 */
export class TableComponent implements Component {
  private data: (string | number)[][];
  private headers?: string[];
  private colWidths?: number[];
  private width?: number;

  // Cache for rendered output
  private cachedOutput?: string[];
  private cachedData?: (string | number)[][];
  private cachedHeaders?: string[];
  private cachedColWidths?: number[];
  private cachedWidth?: number;

  constructor(
    data: (string | number)[][],
    options: { headers?: string[]; colWidths?: number[]; width?: number },
  ) {
    this.data = data;
    this.headers = options.headers;
    this.colWidths = options.colWidths;
    this.width = options.width;
  }

  setData(data: (string | number)[][]): void {
    this.data = data;
    this.invalidateCache();
  }

  setHeaders(headers?: string[]): void {
    this.headers = headers;
    this.invalidateCache();
  }

  setColWidths(colWidths?: number[]): void {
    this.colWidths = colWidths;
    this.invalidateCache();
  }

  setWidth(width: number): void {
    this.width = width;
    this.invalidateCache();
  }

  private invalidateCache(): void {
    this.cachedOutput = undefined;
    this.cachedData = undefined;
    this.cachedHeaders = undefined;
    this.cachedColWidths = undefined;
    this.cachedWidth = undefined;
  }

  render(width: number): string[] {
    // Use provided width if specified, otherwise use component width
    const renderWidth = this.width || width;

    // Check cache
    if (
      this.cachedOutput &&
      this.cachedData === this.data &&
      this.cachedHeaders === this.headers &&
      this.cachedColWidths === this.colWidths &&
      this.cachedWidth === renderWidth
    ) {
      return this.cachedOutput;
    }

    if (this.data.length === 0) {
      this.cachedOutput = [];
      return [];
    }

    // Determine number of columns from data or header
    let colCount = this.headers?.length;
    if (colCount === undefined) {
      colCount = this.data.length > 0 && this.data[0] ? this.data[0].length : 1;
    }

    // Calculate column widths based on terminal width
    const padding = 5; // Account for table borders and padding
    const availableWidth = Math.max(20, renderWidth - padding);

    let computedColWidths: number[];

    if (this.colWidths && this.colWidths.length === colCount) {
      // Use provided percentages
      computedColWidths = this.colWidths.map((percent) =>
        Math.max(10, Math.floor((percent / 100) * availableWidth)),
      );
    } else {
      // Distribute width evenly with minimum width per column
      const minColWidth = 15;
      const maxColsThatFit = Math.floor(availableWidth / minColWidth);
      const actualColCount = Math.min(colCount, maxColsThatFit);

      if (actualColCount === 1) {
        computedColWidths = [availableWidth];
      } else {
        // Calculate base width and distribute remaining pixels
        const baseWidth = Math.floor(availableWidth / actualColCount);
        const remainder = availableWidth % actualColCount;
        computedColWidths = Array(actualColCount).fill(baseWidth);

        // Distribute remainder pixels to first few columns
        for (let i = 0; i < remainder && i < actualColCount; i++) {
          computedColWidths[i] = (computedColWidths[i] || 0) + 1;
        }
      }

      // If we have fewer computed widths than columns, extend the array
      while (computedColWidths.length < colCount) {
        computedColWidths.push(minColWidth);
      }
    }

    const table = new Table({
      head: this.headers,
      colWidths: computedColWidths,
      wordWrap: true,
      wrapOnWordBoundary: true,
    });

    // Ensure all data rows have the same number of columns
    const normalizedData = this.data.map((row) => {
      if (row.length < colCount) {
        // Pad with empty strings if row has fewer columns
        return [...row, ...Array(colCount - row.length).fill("")];
      }
      if (row.length > colCount) {
        // Truncate if row has more columns
        return row.slice(0, colCount);
      }
      return row;
    });

    table.push(...normalizedData);

    const tableString = table.toString();
    const result = tableString.split("\n");

    // Update cache
    this.cachedOutput = result;
    this.cachedData = this.data;
    this.cachedHeaders = this.headers;
    this.cachedColWidths = this.colWidths;
    this.cachedWidth = renderWidth;

    return result;
  }
}
