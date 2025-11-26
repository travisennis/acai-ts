import type { Cell } from "./cell.ts";
import debug from "./debug.ts";
import {
  computeHeights,
  computeWidths,
  makeTableLayout,
} from "./layout-manager.ts";
import {
  type Cell as CellType,
  mergeOptions,
  type TableConstructorOptions,
  type TableInstanceOptions,
} from "./utils.ts";

export class Table extends Array<unknown> {
  options: TableInstanceOptions;

  constructor(opts?: TableConstructorOptions) {
    super();

    const options = mergeOptions(opts);
    this.options = options;
    Object.defineProperty(this, "options", {
      value: options,
      enumerable: Boolean(options.debug),
    });

    if (options.debug) {
      switch (typeof options.debug) {
        case "boolean":
          debug.setDebugLevel(debug.WARN);
          break;
        case "number":
          debug.setDebugLevel(options.debug);
          break;
        case "string":
          debug.setDebugLevel(Number.parseInt(options.debug, 10));
          break;
        default:
          debug.setDebugLevel(debug.WARN);
          debug.warn(
            `Debug option is expected to be boolean, number, or string. Received a ${typeof options.debug}`,
          );
      }
      Object.defineProperty(this, "messages", {
        get() {
          return debug.debugMessages();
        },
      });
    }
  }

  override toString(): string {
    let array: unknown[] = this;
    const headersPresent = this.options.head?.length;
    if (headersPresent) {
      array = [this.options.head];
      if (this.length) {
        array.push(...this);
      }
    } else {
      this.options.style.head = [];
    }

    const cells = makeTableLayout(array);

    cells.forEach((row) => {
      row.forEach((cell) => {
        cell.mergeTableOptions(this.options, cells);
      }, this);
    }, this);

    computeWidths(this.options.colWidths, cells);
    computeHeights(this.options.rowHeights, cells);

    cells.forEach((row) => {
      row.forEach((cell) => {
        cell.init(this.options);
      }, this);
    }, this);

    const result: string[] = [];

    for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
      const row = cells[rowIndex];
      const heightOfRow = this.options.rowHeights[rowIndex];

      if (
        rowIndex === 0 ||
        !this.options.style.compact ||
        (rowIndex === 1 && headersPresent)
      ) {
        doDraw(row, "top", result);
      }

      for (let lineNum = 0; lineNum < (heightOfRow || 0); lineNum++) {
        doDraw(row, lineNum, result);
      }

      if (rowIndex + 1 === cells.length) {
        doDraw(row, "bottom", result);
      }
    }

    return result.join("\n");
  }

  get width(): number {
    const str = this.toString().split("\n");
    return str[0].length;
  }

  static reset(): void {
    debug.reset();
  }
}

function doDraw(
  row: CellType[],
  lineNum: "top" | "bottom" | number,
  result: string[],
): void {
  const line: string[] = [];
  row.forEach((cell) => {
    if (cell && typeof (cell as Cell).draw === "function") {
      line.push((cell as Cell).draw(lineNum));
    }
  });
  const str = line.join("");
  if (str.length) result.push(str);
}
