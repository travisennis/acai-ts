function hasPathIndicator(pathPrefix: string): boolean {
  return (
    pathPrefix.includes("/") ||
    pathPrefix.endsWith("/") ||
    pathPrefix.startsWith(".") ||
    pathPrefix.startsWith("~/")
  );
}

function isPartialPath(pathPrefix: string): boolean {
  return (
    !pathPrefix.includes("/") &&
    !pathPrefix.includes(".") &&
    !pathPrefix.startsWith("./") &&
    !pathPrefix.startsWith("../") &&
    !pathPrefix.startsWith("~/") &&
    pathPrefix.length > 3
  );
}

function shouldReturnEmptyForForceExtract(
  pathPrefix: string,
  text: string,
): boolean {
  return (
    !pathPrefix.includes("/") &&
    !pathPrefix.endsWith("/") &&
    !pathPrefix.startsWith(".") &&
    !pathPrefix.startsWith("~/") &&
    (text === "" || text.endsWith(" "))
  );
}

export function extractPathPrefix(
  text: string,
  forceExtract = false,
): string | null {
  // Match paths - more conservative approach to avoid matching already completed paths
  // This regex captures:
  // - Paths starting from beginning of line or after space
  // - Optional ./ or ../ or ~/ prefix
  // - The path itself (must contain at least one / or start with ./ or ../ or ~/)
  const matches = text.match(
    /(?:^|\s)((?:\/{1,2}|\.{1,2}\/|~\/)?(?:[^\s]*\/)*[^\s/]*)$/,
  );
  if (!matches) {
    // If forced extraction and no matches, return empty string to trigger from current dir
    return forceExtract ? "" : null;
  }

  const pathPrefix = matches[1] || "";

  // For forced extraction (Tab key), always return something
  if (forceExtract) {
    if (shouldReturnEmptyForForceExtract(pathPrefix, text)) {
      return "";
    }
    return pathPrefix;
  }

  // For natural triggers, be more conservative:
  // Only trigger if we have a clear path indicator
  if (!hasPathIndicator(pathPrefix)) {
    return null;
  }

  // Additional check: don't trigger if the path looks like it's already completed
  // (i.e., doesn't end with a partial filename)
  // Only apply this check for paths that don't have clear path indicators
  // and look like single directory names (no path separators)
  if (isPartialPath(pathPrefix)) {
    return null;
  }

  return pathPrefix;
}
