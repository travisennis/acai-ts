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
    const renderWidth = this.width || width;

    const cached = this.getCachedOutput(renderWidth);
    if (cached) {
      return cached;
    }

    if (this.data.length === 0) {
      this.cachedOutput = [];
      return [];
    }

    const colCount = this.getColumnCount();
    const padding = 5;
    const availableWidth = Math.max(20, renderWidth - padding);
    const computedColWidths = this.getColumnWidths(colCount, availableWidth);

    const table = new Table({
      head: this.headers,
      colWidths: computedColWidths,
      wordWrap: true,
      wrapOnWordBoundary: true,
    });

    const normalizedData = this.normalizeData(colCount);
    table.push(...normalizedData);

    const tableString = table.toString();
    const result = tableString.split("\n");

    this.updateCache(result, renderWidth);

    return result;
  }

  private getCachedOutput(renderWidth: number): string[] | undefined {
    if (
      this.cachedOutput &&
      this.cachedData === this.data &&
      this.cachedHeaders === this.headers &&
      this.cachedColWidths === this.colWidths &&
      this.cachedWidth === renderWidth
    ) {
      return this.cachedOutput;
    }
    return undefined;
  }

  private getColumnCount(): number {
    if (this.headers?.length !== undefined) {
      return this.headers.length;
    }
    if (this.data.length > 0 && this.data[0]) {
      return this.data[0].length;
    }
    return 1;
  }

  private getColumnWidths(colCount: number, availableWidth: number): number[] {
    if (this.colWidths && this.colWidths.length === colCount) {
      return this.colWidths.map((percent) =>
        Math.max(10, Math.floor((percent / 100) * availableWidth)),
      );
    }

    const minColWidth = 15;
    const maxColsThatFit = Math.floor(availableWidth / minColWidth);
    const actualColCount = Math.min(colCount, maxColsThatFit);

    const computedColWidths = this.distributeColumnWidths(
      actualColCount,
      availableWidth,
    );

    while (computedColWidths.length < colCount) {
      computedColWidths.push(minColWidth);
    }

    return computedColWidths;
  }

  private distributeColumnWidths(
    actualColCount: number,
    availableWidth: number,
  ): number[] {
    if (actualColCount === 1) {
      return [availableWidth];
    }

    const baseWidth = Math.floor(availableWidth / actualColCount);
    const remainder = availableWidth % actualColCount;
    const widths = Array(actualColCount).fill(baseWidth);

    for (let i = 0; i < remainder && i < actualColCount; i++) {
      widths[i] = (widths[i] || 0) + 1;
    }

    return widths;
  }

  private normalizeData(colCount: number): (string | number)[][] {
    return this.data.map((row) => {
      if (row.length < colCount) {
        return [...row, ...Array(colCount - row.length).fill("")];
      }
      if (row.length > colCount) {
        return row.slice(0, colCount);
      }
      return row;
    });
  }

  private updateCache(result: string[], renderWidth: number): void {
    this.cachedOutput = result;
    this.cachedData = this.data;
    this.cachedHeaders = this.headers;
    this.cachedColWidths = this.colWidths;
    this.cachedWidth = renderWidth;
  }
}
