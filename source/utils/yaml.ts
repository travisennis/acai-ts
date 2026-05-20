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

    if (indent === baseIndent) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) {
        i++;
        continue;
      }

      const key = line.slice(0, colonIndex).trim();
      const afterColon = line.slice(colonIndex + 1).trim();

      if (afterColon) {
        obj[key] = parseValue(afterColon);
        i++;
      } else {
        i++;
        if (i < lines.length) {
          const nextLine = lines[i];
          const nextIndent = getIndent(nextLine);
          const nextTrimmed = nextLine.trim();

          if (nextTrimmed.startsWith("-")) {
            const [arr, newIndex] = parseArray(lines, i, nextIndent);
            obj[key] = arr;
            i = newIndex;
          } else if (nextIndent > indent && nextTrimmed.includes(":")) {
            const [nested, newIndex] = parseObject(lines, i, nextIndent);
            obj[key] = nested;
            i = newIndex;
          } else {
            obj[key] = null;
          }
        } else {
          obj[key] = null;
        }
      }
    } else {
      i++;
    }
  }

  return [obj, i];
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
      const afterDash = trimmed.slice(1).trim();

      if (afterDash) {
        // Inline array item
        arr.push(parseValue(afterDash));
        i++;
      } else {
        // Check next line for nested content
        i++;
        if (i < lines.length) {
          const nextLine = lines[i];
          const nextIndent = getIndent(nextLine);
          const nextTrimmed = nextLine.trim();

          if (nextTrimmed.includes(":")) {
            const [obj, newIndex] = parseObject(lines, i, nextIndent);
            arr.push(obj);
            i = newIndex;
          } else {
            i++;
          }
        }
      }
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
