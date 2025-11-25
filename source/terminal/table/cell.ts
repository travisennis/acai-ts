import debug from './debug.ts';
import {
  type CharName,
  type HorizontalAlignment,
  type VerticalAlignment,
  type TableInstanceOptions,
  type CellOptions,
  strlen,
  repeat,
  pad,
  truncate,
  multiLineWordWrap,
  colorizeLines,
  hyperlink,
} from './utils.ts';

const CHAR_NAMES: CharName[] = [
  'top',
  'topMid',
  'topLeft',
  'topRight',
  'bottom',
  'bottomMid',
  'bottomLeft',
  'bottomRight',
  'left',
  'leftMid',
  'mid',
  'midMid',
  'right',
  'rightMid',
  'middle',
];

export class Cell {
  options!: CellOptions;
  content!: string;
  colSpan!: number;
  rowSpan!: number;
  x: number | null = null;
  y: number | null = null;
  chars: Record<CharName, string> = {} as Record<CharName, string>;
  truncate = '…';
  paddingLeft = 1;
  paddingRight = 1;
  head: string[] = [];
  border: string[] = [];
  fixedWidth: number | null = null;
  lines: string[] = [];
  desiredWidth = 0;
  desiredHeight = 0;
  widths: number[] = [];
  heights: number[] = [];
  width = 0;
  height = 0;
  hAlign: HorizontalAlignment = 'left';
  vAlign: VerticalAlignment = 'top';
  drawRight = false;
  cells: Cell[][] | null = null;

  /**
   * A representation of a cell within the table.
   * Implementations must have `init` and `draw` methods,
   * as well as `colSpan`, `rowSpan`, `desiredHeight` and `desiredWidth` properties.
   */
  constructor(options: CellOptions | string | number | boolean | bigint) {
    this.setOptions(options);
  }

  setOptions(options: CellOptions | string | number | boolean | bigint): void {
    if (['boolean', 'number', 'bigint', 'string'].indexOf(typeof options) !== -1) {
      options = { content: `${options}` } as CellOptions;
    }
    const opts = (options || {}) as CellOptions;
    this.options = opts;
    const content = opts.content;
    if (['boolean', 'number', 'bigint', 'string'].indexOf(typeof content) !== -1) {
      this.content = String(content);
    } else if (!content) {
      this.content = this.options.href || '';
    } else {
      throw new Error(`Content needs to be a primitive, got: ${typeof content}`);
    }
    this.colSpan = opts.colSpan || 1;
    this.rowSpan = opts.rowSpan || 1;
  }

  mergeTableOptions(tableOptions: TableInstanceOptions, cells: Cell[][]): void {
    this.cells = cells;

    const optionsChars = this.options.chars || {};
    const tableChars = tableOptions.chars;
    const chars = this.chars;
    CHAR_NAMES.forEach((name) => {
      setOption(optionsChars, tableChars, name, chars);
    });

    this.truncate = this.options.truncate || tableOptions.truncate;

    const style = this.options.style || {};
    const tableStyle = tableOptions.style;
    setOption(style, tableStyle, 'padding-left', this as unknown as Record<string, unknown>);
    setOption(style, tableStyle, 'padding-right', this as unknown as Record<string, unknown>);
    this.head = style.head || tableStyle.head;
    this.border = style.border || tableStyle.border;

    this.fixedWidth = this.x !== null ? tableOptions.colWidths[this.x] : null;
    this.lines = this.computeLines(tableOptions);

    this.desiredWidth = strlen(this.content) + this.paddingLeft + this.paddingRight;
    this.desiredHeight = this.lines.length;
  }

  computeLines(tableOptions: TableInstanceOptions): string[] {
    const tableWordWrap = tableOptions.wordWrap || (tableOptions as any).textWrap;
    const { wordWrap = tableWordWrap } = this.options;
    if (this.fixedWidth && wordWrap) {
      let fixedWidth = this.fixedWidth - this.paddingLeft - this.paddingRight;
      if (this.colSpan) {
        let i = 1;
        while (i < this.colSpan) {
          fixedWidth += tableOptions.colWidths[this.x! + i] || 0;
          i++;
        }
      }
      const { wrapOnWordBoundary: tableWrapOnWordBoundary = true } = tableOptions;
      const { wrapOnWordBoundary = tableWrapOnWordBoundary } = this.options;
      return this.wrapLines(multiLineWordWrap(fixedWidth, this.content, wrapOnWordBoundary));
    }
    return this.wrapLines(this.content.split('\n'));
  }

  wrapLines(computedLines: string[]): string[] {
    const lines = colorizeLines(computedLines);
    if (this.options.href) {
      return lines.map((line) => hyperlink(this.options.href!, line));
    }
    return lines;
  }

  /**
   * Initializes the Cells data structure.
   *
   * @param tableOptions - A fully populated set of tableOptions.
   * In addition to the standard default values, tableOptions must have fully populated the
   * `colWidths` and `rowWidths` arrays. Those arrays must have lengths equal to the number
   * of columns or rows (respectively) in this table, and each array item must be a Number.
   */
  init(tableOptions: TableInstanceOptions): void {
    const x = this.x!;
    const y = this.y!;
    this.widths = (tableOptions.colWidths.slice(x, x + this.colSpan) as number[]).filter((w): w is number => w !== null);
    this.heights = (tableOptions.rowHeights.slice(y, y + this.rowSpan) as number[]).filter((h): h is number => h !== null);
    this.width = this.widths.reduce(sumPlusOne, -1);
    this.height = this.heights.reduce(sumPlusOne, -1);

    this.hAlign = this.options.hAlign || tableOptions.colAligns[x];
    this.vAlign = this.options.vAlign || tableOptions.rowAligns[y];

    this.drawRight = x + this.colSpan === tableOptions.colWidths.length;
  }

  /**
   * Draws the given line of the cell.
   * This default implementation defers to methods `drawTop`, `drawBottom`, `drawLine` and `drawEmpty`.
   * @param lineNum - can be `top`, `bottom` or a numerical line number.
   * @param spanningCell - will be a number if being called from a RowSpanCell, and will represent how
   * many rows below it's being called from. Otherwise it's undefined.
   * @returns {String} The representation of this line.
   */
  draw(lineNum: 'top' | 'bottom' | number, spanningCell?: number): string {
    if (lineNum === 'top') return this.drawTop(this.drawRight);
    if (lineNum === 'bottom') return this.drawBottom(this.drawRight);
    const content = truncate(this.content, 10, this.truncate);
    if (!lineNum) {
      debug.info(`${this.y}-${this.x}: ${this.rowSpan - lineNum}x${this.colSpan} Cell ${content}`);
    } else {
      // debug.debug(`${lineNum}-${this.x}: 1x${this.colSpan} RowSpanCell ${content}`);
    }
    const padLen = Math.max(this.height - this.lines.length, 0);
    let padTop: number;
    switch (this.vAlign) {
      case 'center':
        padTop = Math.ceil(padLen / 2);
        break;
      case 'bottom':
        padTop = padLen;
        break;
      default:
        padTop = 0;
    }
    if (lineNum < padTop || lineNum >= padTop + this.lines.length) {
      return this.drawEmpty(this.drawRight, spanningCell);
    }
    const forceTruncation = this.lines.length > this.height && lineNum + 1 >= this.height;
    return this.drawLine(lineNum - padTop, this.drawRight, forceTruncation, spanningCell);
  }

  /**
   * Renders the top line of the cell.
   * @param drawRight - true if this method should render the right edge of the cell.
   * @returns {String}
   */
  drawTop(drawRight: boolean): string {
    const content: string[] = [];
    if (this.cells) {
      // TODO: cells should always exist - some tests don't fill it in though
      this.widths.forEach((width, index) => {
        content.push(this._topLeftChar(index));
        content.push(repeat(this.chars[this.y === 0 ? 'top' : 'mid'], width));
      }, this);
    } else {
      content.push(this._topLeftChar(0));
      content.push(repeat(this.chars[this.y === 0 ? 'top' : 'mid'], this.width));
    }
    if (drawRight) {
      content.push(this.chars[this.y === 0 ? 'topRight' : 'rightMid']);
    }
    return this.wrapWithStyleColors('border', content.join(''));
  }

  _topLeftChar(offset: number): string {
    const x = this.x! + offset;
    let leftChar: string;
    if (this.y === 0) {
      leftChar = x === 0 ? 'topLeft' : offset === 0 ? 'topMid' : 'top';
    } else {
      if (x === 0) {
        leftChar = 'leftMid';
      } else {
        leftChar = offset === 0 ? 'midMid' : 'bottomMid';
        if (this.cells && this.y !== null) {
          // TODO: cells should always exist - some tests don't fill it in though
          const spanAbove = this.cells[this.y - 1]?.[x] instanceof ColSpanCell;
          if (spanAbove) {
            leftChar = offset === 0 ? 'topMid' : 'mid';
          }
          if (offset === 0) {
            let i = 1;
            while (this.cells[this.y]?.[x - i] instanceof ColSpanCell) {
              i++;
            }
            if (this.cells[this.y]?.[x - i] instanceof RowSpanCell) {
              leftChar = 'leftMid';
            }
          }
        }
      }
    }
    return this.chars[leftChar as CharName];
  }

  wrapWithStyleColors(styleProperty: 'head' | 'border', content: string): string {
    if (this[styleProperty]?.length) {
      try {
        // Use basic ANSI color codes
        const colorMap: Record<string, string> = {
          red: '\x1b[31m',
          grey: '\x1b[90m',
          gray: '\x1b[90m',
        };
        let styledContent = content;
        for (const colorName of this[styleProperty]) {
          if (colorName in colorMap) {
            styledContent = `${colorMap[colorName] + styledContent}\x1b[0m`;
          }
        }
        return styledContent;
      } catch (_e) {
        return content;
      }
    } else {
      return content;
    }
  }

  /**
   * Renders a line of text.
   * @param lineNum - Which line of text to render. This is not necessarily the line within the cell.
   * There may be top-padding above the first line of text.
   * @param drawRight - true if this method should render the right edge of the cell.
   * @param forceTruncationSymbol - `true` if the rendered text should end with the truncation symbol even
   * if the text fits. This is used when the cell is vertically truncated. If `false` the text should
   * only include the truncation symbol if the text will not fit horizontally within the cell width.
   * @param spanningCell - a number of if being called from a RowSpanCell. (how many rows below). otherwise undefined.
   * @returns {String}
   */
  drawLine(
    lineNum: number,
    drawRight: boolean,
    forceTruncationSymbol: boolean,
    spanningCell?: number,
  ): string {
    let left = this.chars[this.x === 0 ? 'left' : 'middle'];
    if (this.x && this.x > 0 && spanningCell && this.cells && this.y !== null) {
      let cellLeft = this.cells[this.y + spanningCell]?.[this.x - 1];
      while (cellLeft instanceof ColSpanCell && cellLeft.y !== null && cellLeft.x !== null) {
        cellLeft = this.cells[cellLeft.y]?.[cellLeft.x - 1];
      }
      if (!(cellLeft instanceof RowSpanCell)) {
        left = this.chars['rightMid'];
      }
    }
    const leftPadding = repeat(' ', this.paddingLeft);
    const right = drawRight ? this.chars['right'] : '';
    const rightPadding = repeat(' ', this.paddingRight);
    let line = this.lines[lineNum];
    const len = this.width - (this.paddingLeft + this.paddingRight);
    if (forceTruncationSymbol) line += this.truncate || '…';
    let content = truncate(line, len, this.truncate);
    content = pad(content, len, ' ', this.hAlign);
    content = leftPadding + content + rightPadding;
    return this.stylizeLine(left, content, right);
  }

  stylizeLine(left: string, content: string, right: string): string {
    left = this.wrapWithStyleColors('border', left);
    right = this.wrapWithStyleColors('border', right);
    if (this.y === 0) {
      content = this.wrapWithStyleColors('head', content);
    }
    return left + content + right;
  }

  /**
   * Renders the bottom line of the cell.
   * @param drawRight - true if this method should render the right edge of the cell.
   * @returns {String}
   */
  drawBottom(drawRight: boolean): string {
    const left = this.chars[this.x === 0 ? 'bottomLeft' : 'bottomMid'];
    const content = repeat(this.chars.bottom, this.width);
    const right = drawRight ? this.chars['bottomRight'] : '';
    return this.wrapWithStyleColors('border', left + content + right);
  }

  /**
   * Renders a blank line of text within the cell. Used for top and/or bottom padding.
   * @param drawRight - true if this method should render the right edge of the cell.
   * @param spanningCell - a number of if being called from a RowSpanCell. (how many rows below). otherwise undefined.
   * @returns {String}
   */
  drawEmpty(drawRight: boolean, spanningCell?: number): string {
    let left = this.chars[this.x === 0 ? 'left' : 'middle'];
    if (this.x && this.x > 0 && spanningCell && this.cells && this.y !== null) {
      let cellLeft = this.cells[this.y + spanningCell]?.[this.x - 1];
      while (cellLeft instanceof ColSpanCell && cellLeft.y !== null && cellLeft.x !== null) {
        cellLeft = this.cells[cellLeft.y]?.[cellLeft.x - 1];
      }
      if (!(cellLeft instanceof RowSpanCell)) {
        left = this.chars['rightMid'];
      }
    }
    const right = drawRight ? this.chars['right'] : '';
    const content = repeat(' ', this.width);
    return this.stylizeLine(left, content, right);
  }
}

export class ColSpanCell {
  x: number | null = null;
  y: number | null = null;
  colSpan = 1;

  draw(lineNum: 'top' | 'bottom' | number): string {
    if (typeof lineNum === 'number') {
      debug.debug(`${this.y}-${this.x}: 1x1 ColSpanCell`);
    }
    return '';
  }

  init(): void {}

  mergeTableOptions(): void {}
}

export class RowSpanCell {
  originalCell: Cell;
  x: number | null = null;
  y: number | null = null;
  colSpan = 1;
  cellOffset = 0;
  offset = 0;

  /**
   * A placeholder Cell for a Cell that spans multiple rows.
   * It delegates rendering to the original cell, but adds the appropriate offset.
   */
  constructor(originalCell: Cell) {
    this.originalCell = originalCell;
  }

  init(tableOptions: TableInstanceOptions): void {
    const y = this.y!;
    const originalY = this.originalCell.y!;
    this.cellOffset = y - originalY;
    this.offset = findDimension(tableOptions.rowHeights as number[], originalY, this.cellOffset);
  }

  draw(lineNum: 'top' | 'bottom' | number): string {
    if (lineNum === 'top') {
      return this.originalCell.draw(this.offset, this.cellOffset);
    }
    if (lineNum === 'bottom') {
      return this.originalCell.draw('bottom');
    }
    debug.debug(`${this.y}-${this.x}: 1x${this.colSpan} RowSpanCell for ${this.originalCell.content}`);
    return this.originalCell.draw(this.offset + 1 + lineNum);
  }

  mergeTableOptions(): void {}
}

function firstDefined<T>(...args: T[]): T | undefined {
  return args.filter((v) => v !== undefined && v !== null).shift();
}

// HELPER FUNCTIONS
function setOption(
  objA: Record<string, unknown>,
  objB: Record<string, unknown>,
  nameB: string,
  targetObj: Record<string, unknown>,
): void {
  targetObj[nameB] = firstDefined(objA[nameB], objB[nameB]);
}

function findDimension(dimensionTable: number[], startingIndex: number, span: number): number {
  let ret = dimensionTable[startingIndex];
  for (let i = 1; i < span; i++) {
    ret += 1 + dimensionTable[startingIndex + i];
  }
  return ret;
}

function sumPlusOne(a: number, b: number): number {
  return a + b + 1;
}