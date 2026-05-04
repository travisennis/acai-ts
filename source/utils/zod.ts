// Many models do not reliably pass null to optional tool fields. Instead they pass "null", "None", "undefined", or empty strings.
// This function will coerce all of those values into null.
export const convertNullString = (value: unknown): unknown => {
  if (typeof value === "undefined") {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      trimmed.toLowerCase() === "null" ||
      trimmed.toLowerCase() === "none" ||
      trimmed.toLowerCase() === "undefined" ||
      trimmed === ""
    ) {
      return null;
    }
  }
  return value;
};
