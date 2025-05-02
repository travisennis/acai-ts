import process from "node:process";
import ansiEscapes from "ansi-escapes";
import chalk, { type ChalkInstance } from "chalk"; // Added ChalkInstance
import { highlight as highlightCli } from "cli-highlight";
import Table from "cli-table3";
import { type MarkedOptions, Renderer } from "marked";
import { get as emojiGet } from "node-emoji";
import supportsHyperlinks from "supports-hyperlinks";
import wrapAnsi from "wrap-ansi";

// --- Helper Functions (moved some from original global scope) ---

function escapeRegExp(str: string): string {
  return str.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&");
}

const TABLE_CELL_SPLIT = "^*||*^";
const TABLE_ROW_WRAP = "*|*|*|*";
const TABLE_ROW_WRAP_REGEXP = new RegExp(escapeRegExp(TABLE_ROW_WRAP), "g");

const COLON_REPLACER = "*#COLON|*";
const COLON_REPLACER_REGEXP = new RegExp(escapeRegExp(COLON_REPLACER), "g");

const TAB_ALLOWED_CHARACTERS = ["\t"];

const HARD_RETURN = "\r";
const HARD_RETURN_RE = new RegExp(HARD_RETURN);

function identity<T = string>(str: T): T {
  return str;
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type AnyType = any;

function compose<T extends AnyType[], R>(
  ...funcs: Array<(...args: AnyType[]) => AnyType>
): (...args: T) => R {
  if (funcs.length === 0) {
    return ((arg: AnyType) => arg) as unknown as (...args: T) => R;
  }
  if (funcs.length === 1) {
    return funcs[0] as (...args: T) => R;
  }
  return function (this: AnyType, ...args: T): R {
    return funcs.reduceRight((acc, fn, idx) => {
      // Ensure 'acc' is always an array, even for the first call
      const currentArgs = idx === funcs.length - 1 ? acc : [acc[0]];
      // Call the function with the actual argument(s)
      const result = fn.apply(this, currentArgs);
      // Always return the result wrapped in an array for the next iteration
      return [result];
    }, args as AnyType[])[0]; // Start with original args, final result is extracted
  };
}

function isAllowedTabString(str: string): boolean {
  return TAB_ALLOWED_CHARACTERS.some((char) => str.match(`^(${char})+$`));
}

function sanitizeTab(
  tab: number | string | undefined,
  fallbackTab: number,
): string {
  if (typeof tab === "number") {
    return " ".repeat(tab);
  }
  if (typeof tab === "string" && isAllowedTabString(tab)) {
    return tab;
  }
  return " ".repeat(fallbackTab);
}

function fixHardReturn(text: string, reflow: boolean): string {
  // Assuming HARD_RETURN is meant to be replaced by literal \n for reflow
  return reflow ? text.replace(HARD_RETURN_RE, "\n") : text;
}

function section(text: string): string {
  return `${text}\n\n`;
}

function indentLines(indent: string, text: string): string {
  return text.replace(/(^|\n)(.+)/g, `$1${indent}$2`);
}

function indentify(indent: string, text: string): string {
  if (!text) {
    return text;
  }
  return indent + text.split("\n").join(`\n${indent}`);
}

function undoColon(str: string): string {
  return str.replace(COLON_REPLACER_REGEXP, ":");
}

function unescapeEntities(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function insertEmojis(text: string): string {
  return text.replace(/:([A-Za-z0-9_\-+]+?):/g, (emojiString) => {
    const emojiSign = emojiGet(emojiString);
    if (!emojiSign) {
      return emojiString;
    }
    return `${emojiSign} `;
  });
}

function hr(inputHrStr: string, length?: number | boolean): string {
  // Handle boolean case from `this.o.reflowText && this.o.width`
  const effectiveLength =
    typeof length === "number" ? length : process.stdout.columns || 80;
  return inputHrStr.repeat(effectiveLength);
}

// --- Placeholder Types (Refine later) ---
interface TerminalRendererOptions {
  code?: ChalkInstance;
  blockquote?: ChalkInstance;
  html?: ChalkInstance;
  heading?: ChalkInstance;
  firstHeading?: ChalkInstance;
  hr?: ChalkInstance;
  listitem?: ChalkInstance;
  list?: (body: string, ordered: boolean, indent: string) => string;
  table?: ChalkInstance;
  paragraph?: ChalkInstance;
  strong?: ChalkInstance;
  em?: ChalkInstance;
  codespan?: ChalkInstance;
  del?: ChalkInstance;
  link?: ChalkInstance;
  href?: ChalkInstance;
  text?: (text: string) => string;
  image?: (href: string, title: string | null, text: string) => string;
  unescape?: boolean;
  emoji?: boolean;
  width?: number;
  showSectionPrefix?: boolean;
  reflowText?: boolean;
  tab?: number | string;
  tableOptions?: object; // cli-table3 options
  // Properties used by marked itself
  gfm?: boolean;
  sanitize?: boolean;
}

interface HighlightOptions {
  language?: string;
  // other cli-highlight options...
}

// --- Default Options --- (Using inferred type for now)
const defaultOptions = {
  code: chalk.yellow,
  blockquote: chalk.gray.italic,
  html: chalk.gray,
  heading: chalk.green.bold,
  firstHeading: chalk.magenta.underline.bold,
  hr: chalk.reset,
  listitem: chalk.reset,
  list: list, // Function defined later
  table: chalk.reset,
  paragraph: chalk.reset,
  strong: chalk.bold,
  em: chalk.italic,
  codespan: chalk.yellow,
  del: chalk.dim.gray.strikethrough,
  link: chalk.blue,
  href: chalk.blue.underline,
  text: identity,
  image: undefined, // Default image handling is text-based
  unescape: true,
  emoji: true,
  width: 80,
  showSectionPrefix: true,
  reflowText: false,
  tab: 4,
  tableOptions: {},
  gfm: true, // Assuming GFM is default based on usage
  sanitize: false, // Assuming sanitize is off by default
};

// --- Main Renderer Class ---
export class TerminalRenderer extends Renderer {
  // Properties
  o: TerminalRendererOptions;
  tab: string;
  tableSettings: object;
  emoji: (text: string) => string;
  unescape: (html: string) => string;
  highlightOptions: HighlightOptions;
  transform: (text: string) => string;
  override parser: AnyType; // Marked parser instance, set externally
  override options: MarkedOptions; // Marked options, set externally

  constructor(
    options?: Partial<TerminalRendererOptions>,
    highlightOptions?: HighlightOptions,
  ) {
    super();
    // Merge options with defaults
    this.o = { ...defaultOptions, ...options }; // Use spread for cleaner merge

    this.tab = sanitizeTab(this.o.tab, defaultOptions.tab);
    this.tableSettings = this.o.tableOptions || {};
    this.emoji = this.o.emoji ? insertEmojis : identity;
    this.unescape = this.o.unescape ? unescapeEntities : identity;
    this.highlightOptions = highlightOptions || {};

    // Compose transformation functions
    this.transform = compose(undoColon, this.unescape, this.emoji);

    // Initialize parser and options (will be overridden by markedTerminal)
    this.parser = {};
    this.options = {};
  }

  // --- Block Level Methods ---

  override code(
    code: string | { text: string; lang?: string; escaped?: boolean },
    lang?: string,
    _escaped?: boolean,
  ): string {
    let currentCode: string;
    let currentLang: string | undefined = lang;
    // let currentEscaped: boolean | undefined = _escaped; // Unused

    if (typeof code === "object") {
      currentLang = code.lang;
      // currentEscaped = !!code.escaped; // Unused
      currentCode = code.text;
    } else {
      currentCode = code;
    }

    const highlightedCode = highlight(
      currentCode,
      currentLang,
      this.o,
      this.highlightOptions,
    );
    return section(indentify(this.tab, highlightedCode));
  }

  override blockquote(quote: string | { tokens: AnyType[] }): string {
    let currentQuote: string;
    if (typeof quote === "object") {
      // Assuming this.parser.parse returns string
      currentQuote = this.parser.parse(quote.tokens);
    } else {
      currentQuote = quote;
    }
    // Ensure blockquote function exists before calling
    const blockquoteFn = this.o.blockquote || identity;
    return section(blockquoteFn(indentify(this.tab, currentQuote.trim())));
  }

  override html(html: string | { text: string }): string {
    let currentHtml: string;
    if (typeof html === "object") {
      currentHtml = html.text;
    } else {
      currentHtml = html;
    }
    const htmlFn = this.o.html || identity;
    return htmlFn(currentHtml);
  }

  override heading(
    text: string | { tokens: AnyType[]; depth: number },
    level?: number,
  ): string {
    let currentText: string;
    let currentLevel: number | undefined = level;

    if (typeof text === "object") {
      currentLevel = text.depth;
      // Assuming this.parser.parseInline returns string
      currentText = this.parser.parseInline(text.tokens);
    } else {
      currentText = text;
    }

    if (currentLevel === undefined) {
      // Should not happen if called by marked, but defensively handle
      currentLevel = 1;
    }

    currentText = this.transform(currentText);

    const prefix = this.o.showSectionPrefix
      ? `${"#".repeat(currentLevel)} `
      : "";
    currentText = prefix + currentText;

    if (this.o.reflowText) {
      // Pass gfm flag from options
      currentText = wrapAnsi(currentText, this.o.width ?? defaultOptions.width);
    }

    const headingFn =
      (currentLevel === 1 ? this.o.firstHeading : this.o.heading) || identity;
    return section(headingFn(currentText));
  }

  override hr(): string {
    const hrFn = this.o.hr || identity;
    const hrText = hr(
      "-",
      this.o.reflowText ? (this.o.width ?? defaultOptions.width) : undefined,
    );
    return section(hrFn(hrText));
  }

  override list(
    body:
      | string
      | {
          items: AnyType[];
          ordered: boolean;
          start: number | "";
          loose?: boolean;
        },
    ordered?: boolean,
  ): string {
    let currentBody: string;
    let isOrdered: boolean | undefined = ordered;

    if (typeof body === "object") {
      const listToken = body;
      // const _start = listToken.start; // Unused
      // const _loose = listToken.loose; // Unused
      isOrdered = listToken.ordered;
      currentBody = "";
      for (const item of listToken.items) {
        // Use for...of
        currentBody += this.listitem(item);
      }
    } else {
      currentBody = body;
    }

    if (isOrdered === undefined) {
      isOrdered = false; // Default to unordered
    }

    // Ensure list function exists
    const listFn = this.o.list || list; // Use standalone list as default
    currentBody = listFn(currentBody, isOrdered, this.tab);
    return fixNestedLists(indentLines(this.tab, currentBody), this.tab);
  }

  override listitem(
    text:
      | string
      | {
          tokens: AnyType[];
          task?: boolean;
          checked?: boolean;
          loose?: boolean;
        },
  ): string {
    let currentText: string;
    let itemToken: {
      tokens: AnyType[];
      task?: boolean;
      checked?: boolean;
      loose?: boolean;
    } | null = null;

    if (typeof text === "object") {
      itemToken = text;
      currentText = "";
      if (itemToken.task) {
        const checkboxStr = this.checkbox({ checked: !!itemToken.checked });
        if (itemToken.loose) {
          // Modify the first paragraph token or unshift a text token
          if (
            itemToken.tokens.length > 0 &&
            itemToken.tokens[0].type === "paragraph"
          ) {
            // Attempt to prepend checkbox to existing text/tokens
            if (
              itemToken.tokens[0].tokens &&
              itemToken.tokens[0].tokens.length > 0 &&
              itemToken.tokens[0].tokens[0].type === "text"
            ) {
              itemToken.tokens[0].tokens[0].text = `${checkboxStr} ${itemToken.tokens[0].tokens[0].text}`;
            } else {
              // Fallback if no inner text token
              itemToken.tokens[0].text = `${checkboxStr} ${itemToken.tokens[0].text || ""}`;
            }
          } else {
            // Unshift a new text token if no paragraph or empty tokens
            itemToken.tokens.unshift({
              type: "text",
              raw: checkboxStr,
              text: checkboxStr,
            });
          }
          // Parse modified tokens for loose list item
          currentText = this.parser.parse(itemToken.tokens, !!itemToken.loose);
        } else {
          // Prepend checkbox for tight list item
          currentText = `${checkboxStr} ${this.parser.parse(itemToken.tokens, !!itemToken.loose)}`;
        }
      } else {
        // Regular list item (no task)
        currentText = this.parser.parse(itemToken.tokens, !!itemToken.loose);
      }
    } else {
      currentText = text;
    }

    const transformFn = compose<string[], string>(
      this.o.listitem || identity,
      this.transform,
    );
    const transformedText = transformFn(currentText);

    // Trim trailing newline if nested list
    const isNested = transformedText.includes("\n");
    const finalItemText = isNested
      ? transformedText.trimEnd()
      : transformedText;

    // Use BULLET_POINT marker (handled by list function)
    return `\n${BULLET_POINT}${finalItemText}`;
  }

  override checkbox(checked: boolean | { checked: boolean }): string {
    let isChecked: boolean;
    if (typeof checked === "object") {
      isChecked = checked.checked;
    } else {
      isChecked = checked;
    }
    return `[${isChecked ? "X" : " "}] `;
  }

  override paragraph(text: string | { tokens: AnyType[] }): string {
    let currentText: string;
    if (typeof text === "object") {
      currentText = this.parser.parseInline(text.tokens);
    } else {
      currentText = text;
    }

    const paragraphFn = this.o.paragraph || identity;
    const transformFn = compose<string[], string>(paragraphFn, this.transform);
    currentText = transformFn(currentText);

    if (this.o.reflowText) {
      currentText = wrapAnsi(currentText, this.o.width ?? defaultOptions.width);
    }
    return section(currentText);
  }

  override table(
    header: string | { header: AnyType[]; rows: AnyType[][] },
    body?: string,
  ): string {
    let headerText: string;
    let bodyText: string | undefined = body;

    if (typeof header === "object") {
      const token = header;
      headerText = "";
      let headerCellContent = "";
      for (const cellToken of token.header) {
        // Use for...of
        headerCellContent += this.tablecell(cellToken);
      }
      headerText += this.tablerow({ text: headerCellContent });

      bodyText = "";
      for (const rowTokens of token.rows) {
        // Use for...of
        let rowCellContent = "";
        for (const cellToken of rowTokens) {
          // Use for...of
          rowCellContent += this.tablecell(cellToken);
        }
        bodyText += this.tablerow({ text: rowCellContent });
      }
    } else {
      headerText = header;
    }

    if (bodyText === undefined) {
      // Should not happen if called by marked
      bodyText = "";
    }

    const tableInstance = new Table({
      ...(this.tableSettings || {}),
      head: generateTableRow(headerText)[0] || [], // Provide default empty array
    });

    const bodyRows = generateTableRow(bodyText, this.transform);
    for (const row of bodyRows) {
      // Use for...of
      tableInstance.push(row);
    }

    const tableFn = this.o.table || identity;
    return section(tableFn(tableInstance.toString()));
  }

  override tablerow(content: string | { text: string }): string {
    let currentContent: string;
    if (typeof content === "object") {
      currentContent = content.text;
    } else {
      currentContent = content;
    }
    // Ensure content is string before concatenation
    return `${TABLE_ROW_WRAP}${String(currentContent)}${TABLE_ROW_WRAP}\n`;
  }

  override tablecell(content: string | { tokens: AnyType[] }): string {
    let currentContent: string;
    if (typeof content === "object") {
      currentContent = this.parser.parseInline(content.tokens);
    } else {
      currentContent = content;
    }
    // Ensure content is string before concatenation
    return String(currentContent) + TABLE_CELL_SPLIT;
  }

  // --- Span Level Methods ---

  override strong(text: string | { tokens: AnyType[] }): string {
    let currentText: string;
    if (typeof text === "object") {
      currentText = this.parser.parseInline(text.tokens);
    } else {
      currentText = text;
    }
    const strongFn = this.o.strong || identity;
    return strongFn(currentText);
  }

  override em(text: string | { tokens: AnyType[] }): string {
    let currentText: string;
    if (typeof text === "object") {
      currentText = this.parser.parseInline(text.tokens);
    } else {
      currentText = text;
    }
    currentText = fixHardReturn(currentText, !!this.o.reflowText);
    const emFn = this.o.em || identity;
    return emFn(currentText);
  }

  override codespan(text: string | { text: string }): string {
    let currentText: string;
    if (typeof text === "object") {
      currentText = text.text;
    } else {
      currentText = text;
    }
    currentText = fixHardReturn(currentText, !!this.o.reflowText);
    const codespanFn = this.o.codespan || identity;
    // Apply COLON_REPLACER before styling
    return codespanFn(currentText.replace(/:/g, COLON_REPLACER));
  }

  override br(): string {
    return this.o.reflowText ? HARD_RETURN : "\n";
  }

  override del(text: string | { tokens: AnyType[] }): string {
    let currentText: string;
    if (typeof text === "object") {
      currentText = this.parser.parseInline(text.tokens);
    } else {
      currentText = text;
    }
    const delFn = this.o.del || identity;
    return delFn(currentText);
  }

  override link(
    href: string | { href: string; title?: string | null; tokens: AnyType[] },
    _title?: string | null,
    text?: string,
  ): string {
    let currentHref: string;
    let currentText: string | undefined = text;

    if (typeof href === "object") {
      currentText = this.parser.parseInline(href.tokens);
      currentHref = href.href;
    } else {
      currentHref = href;
    }

    const linkFn = this.o.link || identity;
    const hrefFn = this.o.href || identity;
    const textTransform = this.emoji; // Apply emoji transformation

    const hasText = currentText && currentText !== currentHref;
    let output = "";

    // Use text from token if available and not empty
    const linkText = currentText ? textTransform(currentText) : null;

    if (supportsHyperlinks.stdout) {
      const displayLink = linkText ? hrefFn(linkText) : hrefFn(currentHref);
      // Sanitize URL for ansiEscapes.link
      const safeHref = currentHref.replace(/\+/g, "%20");
      output = ansiEscapes.link(displayLink, safeHref);
    } else {
      if (linkText && hasText) {
        output += `${linkText} (`;
      }
      output += hrefFn(currentHref);
      if (linkText && hasText) {
        output += ")";
      }
    }
    return linkFn(output);
  }

  override image(
    href: string | { href: string; title?: string | null; text: string },
    title?: string | null,
    text?: string,
  ): string {
    let currentHref: string;
    let currentTitle: string | null | undefined = title;
    let currentText: string | undefined = text;

    if (typeof href === "object") {
      currentTitle = href.title;
      currentText = href.text;
      currentHref = href.href;
    } else {
      currentHref = href;
    }

    if (typeof this.o.image === "function") {
      // Ensure currentText is provided, default to empty string if undefined
      return this.o.image(currentHref, currentTitle ?? null, currentText ?? "");
    }

    // Default text-based representation
    let out = `![${currentText ?? ""}`;
    if (currentTitle) {
      out += ` – ${currentTitle}`;
    }
    out += `](${currentHref})\n`;
    return out;
  }
}

// --- Standalone Helper Functions (Potentially used by options or internally) ---

const BULLET_POINT_REGEX = "\\*";
const NUMBERED_POINT_REGEX = "\\d+\\.";
const POINT_REGEX = `(?:${[BULLET_POINT_REGEX, NUMBERED_POINT_REGEX].join("|")})`;

// Prevents nested lists from joining their parent list's last line
function fixNestedLists(body: string, indent: string): string {
  // Regex needs careful escaping if indent contains special characters
  const escapedIndent = escapeRegExp(indent);
  const regex = new RegExp(
    `(\\S(?: | {2})?)(${escapedIndent}+)(${POINT_REGEX}(?:.*)+)$`,
    "gm",
  );
  return body.replace(regex, `$1\n${indent}$2$3`);
}

const isPointedLine = (line: string, indent: string): boolean => {
  const escapedIndent = escapeRegExp(indent);
  const regex = new RegExp(`^(?:${escapedIndent})*${POINT_REGEX}`);
  return regex.test(line);
};

function toSpaces(str: string): string {
  return " ".repeat(str.length);
}

const BULLET_POINT = "* ";
function bulletPointLine(indent: string, line: string): string {
  return isPointedLine(line, indent) ? line : toSpaces(BULLET_POINT) + line;
}

function bulletPointLines(lines: string, indent: string): string {
  const transform = (line: string) => bulletPointLine(indent, line);
  return lines.split("\n").filter(identity).map(transform).join("\n");
}

const numberedPoint = (n: number): string => `${n}. `;
function numberedLine(
  indent: string,
  line: string,
  num: number,
): { num: number; line: string } {
  if (isPointedLine(line, indent)) {
    const newNum = num + 1;
    // Replace the existing bullet/number with the new number
    const escapedIndent = escapeRegExp(indent);
    const pointRegex = new RegExp(`^((?:${escapedIndent})*)(${POINT_REGEX}) `);
    const newLine = line.replace(pointRegex, `$1${numberedPoint(newNum)}`);
    return { num: newNum, line: newLine };
  }
  // Indent non-pointed lines
  return { num: num, line: toSpaces(numberedPoint(num)) + line };
}

function numberedLines(lines: string, indent: string): string {
  let num = 0;
  return lines
    .split("\n")
    .filter(identity)
    .map((line) => {
      const numbered = numberedLine(indent, line, num);
      num = numbered.num;
      return numbered.line;
    })
    .join("\n");
}

// Default list formatter function (can be overridden in options)
function list(body: string, ordered: boolean, indent: string): string {
  const trimmedBody = body.trim(); // Trim whitespace
  if (!trimmedBody) {
    return ""; // Return empty if body is empty after trim
  }
  return ordered
    ? numberedLines(trimmedBody, indent)
    : bulletPointLines(trimmedBody, indent);
}

function highlight(
  code: string,
  language: string | undefined,
  opts: TerminalRendererOptions,
  highlightOpts: HighlightOptions,
): string {
  if (chalk.level === 0) {
    return code; // No colors
  }

  const style = opts.code || identity; // Default to identity if no style
  const codeToHighlight = fixHardReturn(code, !!opts.reflowText);

  try {
    // Pass language if provided
    const cliHighlightOptions = { ...(highlightOpts || {}), language };
    // Remove language property if undefined, as cli-highlight might expect it to be a string
    if (cliHighlightOptions.language === undefined) {
      cliHighlightOptions.language = "text";
    }
    return highlightCli(codeToHighlight, cliHighlightOptions);
  } catch (_e) {
    // Fallback to basic styling
    return style(codeToHighlight);
  }
}

function generateTableRow(
  text: string,
  transform?: (text: string) => string,
): string[][] {
  if (!text) {
    return [];
  }
  const escapeFn = transform || identity;
  const lines = escapeFn(text).split("\n");

  const data: string[][] = []; // Explicitly type
  for (const line of lines) {
    // Use for...of
    if (!line) {
      continue;
    }
    const parsed = line
      .replace(TABLE_ROW_WRAP_REGEXP, "")
      .split(TABLE_CELL_SPLIT);

    // Remove the last empty string caused by trailing TABLE_CELL_SPLIT
    data.push(parsed.slice(0, -1));
  }
  return data;
}
