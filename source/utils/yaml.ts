type YamlValue = string | number | boolean | null | YamlObject | YamlValue[];
type YamlObject = { [key: string]: YamlValue };

function parseYaml(input: string): YamlObject {
  const lines = input.split("\n");
  const result: YamlObject = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIndex).trim();
    const afterColon = line.slice(colonIndex + 1).trim();

    if (afterColon) {
      result[key] = parseValue(afterColon);
      i++;
    } else {
      const [value, newIndex] = parseNestedContent(lines, i + 1, getIndent(line));
      result[key] = value;
      i = newIndex;
    }
  }

  return result;
}

function parseNestedContent(
  lines: string[],
  startIdx: number,
  parentIndent: number,
): [YamlValue, number] {
  if (startIdx >= lines.length) {
    return [null, startIdx];
  }

  const nextLine = lines[startIdx];
  const nextIndent = getIndent(nextLine);
  const nextTrimmed = nextLine.trim();

  if (nextTrimmed.startsWith("-")) {
    return parseArray(lines, startIdx, nextIndent);
  }

  if (nextIndent > parentIndent && nextTrimmed.includes(":")) {
    return parseObject(lines, startIdx, nextIndent);
  }

  return [null, startIdx];
}

function parseObject(
  lines: string[],
  start: number,
  baseIndent: number,
): [YamlObject, number] {
  const obj: YamlObject = {};
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    const indent = getIndent(line);
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    if (indent < baseIndent) {
      break;
    }

    if (indent !== baseIndent) {
      i++;
      continue;
    }

    const result = processObjectLine(lines, i, indent);
    if (result !== null) {
      obj[result.key] = result.value;
      i = result.nextIndex;
    } else {
      i++;
    }
  }

  return [obj, i];
}

interface ObjectLineResult {
  key: string;
  value: YamlValue;
  nextIndex: number;
}

function processObjectLine(
  lines: string[],
  currentIndex: number,
  indent: number,
): ObjectLineResult | null {
  const line = lines[currentIndex];
  const colonIndex = line.indexOf(":");

  if (colonIndex === -1) {
    return null;
  }

  const key = line.slice(0, colonIndex).trim();
  const afterColon = line.slice(colonIndex + 1).trim();

  if (afterColon) {
    return { key, value: parseValue(afterColon), nextIndex: currentIndex + 1 };
  }

  // Empty value after colon - look at next line for nested content
  const nextIndex = currentIndex + 1;
  if (nextIndex >= lines.length) {
    return { key, value: null, nextIndex };
  }

  const nextLine = lines[nextIndex];
  const nextIndent = getIndent(nextLine);
  const nextTrimmed = nextLine.trim();

  if (nextTrimmed.startsWith("-")) {
    const [arr, newIndex] = parseArray(lines, nextIndex, nextIndent);
    return { key, value: arr, nextIndex: newIndex };
  }

  if (nextIndent > indent && nextTrimmed.includes(":")) {
    const [nested, newIndex] = parseObject(lines, nextIndex, nextIndent);
    return { key, value: nested, nextIndex: newIndex };
  }

  return { key, value: null, nextIndex };
}

function parseArrayItem(
  lines: string[],
  currentIndex: number,
  arr: YamlValue[],
): number {
  const line = lines[currentIndex];
  const trimmed = line.trim();
  const afterDash = trimmed.slice(1).trim();

  if (afterDash) {
    arr.push(parseValue(afterDash));
    return currentIndex + 1;
  }

  // Empty dash - check next line for nested content
  const nextIndex = currentIndex + 1;
  if (nextIndex >= lines.length) {
    return nextIndex;
  }

  const nextLine = lines[nextIndex];
  const nextIndent = getIndent(nextLine);
  const nextTrimmed = nextLine.trim();

  if (nextTrimmed.includes(":")) {
    const [obj, newIndex] = parseObject(lines, nextIndex, nextIndent);
    arr.push(obj);
    return newIndex;
  }

  return nextIndex + 1;
}

function parseArray(
  lines: string[],
  start: number,
  baseIndent: number,
): [YamlValue[], number] {
  const arr: YamlValue[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    const indent = getIndent(line);
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    if (indent < baseIndent) {
      break;
    }

    if (indent === baseIndent && trimmed.startsWith("-")) {
      i = parseArrayItem(lines, i, arr);
    } else {
      i++;
    }
  }

  return [arr, i];
}

function parseValue(value: string): YamlValue {
  // Handle quoted strings
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Handle booleans
  if (value === "true") return true;
  if (value === "false") return false;

  // Handle null
  if (value === "null" || value === "~") return null;

  // Handle numbers
  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value);
  }

  // Default to string
  return value;
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

// Helper function to extract and parse Yaml front matter from markdown
export function parseFrontMatter(markdown: string): {
  data: YamlObject;
  content: string;
} {
  const lines = markdown.split("\n");

  if (lines[0] !== "---") {
    return { data: {}, content: markdown };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---" || lines[i] === "...") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { data: {}, content: markdown };
  }

  const yamlContent = lines.slice(1, endIndex).join("\n");
  const data = parseYaml(yamlContent);
  const content = lines.slice(endIndex + 1).join("\n");

  return { data, content };
}
