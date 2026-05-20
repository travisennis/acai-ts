// based on https://raw.githubusercontent.com/chalk/supports-hyperlinks/refs/heads/main/index.js
import process from "node:process";
import { createSupportsColor } from "./supports-color.ts";

interface Version {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(versionString = ""): Version {
  if (/^\d{3,4}$/.test(versionString)) {
    // Env var doesn't always use dots. example: 4601 => 46.1.0
    const match = /(\d{1,2})(\d{2})/.exec(versionString) ?? [];
    return {
      major: 0,
      minor: Number.parseInt(match[1] ?? "0", 10),
      patch: Number.parseInt(match[2] ?? "0", 10),
    };
  }

  const versions = (versionString ?? "")
    .split(".")
    .map((n) => Number.parseInt(n, 10));
  return {
    major: versions[0] ?? 0,
    minor: versions[1] ?? 0,
    patch: versions[2] ?? 0,
  };
}

export function createSupportsHyperlinks(stream: { isTty?: boolean }): boolean {
  const {
    CI,
    CURSOR_TRACE_ID,
    FORCE_HYPERLINK,
    NETLIFY,
    TEAMCITY_VERSION,
    TERM_PROGRAM,
    TERM_PROGRAM_VERSION,
    VTE_VERSION,
    TERM,
  } = process.env;

  if (FORCE_HYPERLINK) {
    return !(
      FORCE_HYPERLINK.length > 0 && Number.parseInt(FORCE_HYPERLINK, 10) === 0
    );
  }

  // Netlify does not run a TTY, it does not need `supportsColor` check
  if (NETLIFY) {
    return true;
  }

  // TERM=dumb means the terminal is incapable of rendering hyperlinks.
  // This is checked independently from supports-color because FORCE_COLOR
  // can make supports-color return truthy even for TERM=dumb, but
  // FORCE_COLOR does not enable hyperlinks on terminals that lack support.
  if (TERM === "dumb") {
    return false;
  }

  // If they specify no colors, they probably don't want hyperlinks.
  if (!createSupportsColor(stream)) {
    return false;
  }

  if (stream && !stream.isTty) {
    return false;
  }

  // Windows Terminal
  if ("WT_SESSION" in process.env) {
    return true;
  }

  if (process.platform === "win32") {
    return false;
  }

  if (CI) {
    return false;
  }

  if (TEAMCITY_VERSION) {
    return false;
  }

  const termProgramResult = checkTermProgram(
    TERM_PROGRAM,
    TERM_PROGRAM_VERSION,
    CURSOR_TRACE_ID,
  );
  if (termProgramResult !== undefined) {
    return termProgramResult;
  }

  const vteResult = checkVteVersion(VTE_VERSION);
  if (vteResult !== undefined) {
    return vteResult;
  }

  const termResult = checkTerm(TERM);
  if (termResult !== undefined) {
    return termResult;
  }

  return false;
}

/**
 * Check TERM_PROGRAM-based hyperlink support.
 * Returns boolean if a known terminal is matched, undefined otherwise.
 */
function checkTermProgram(
  termProgram: string | undefined,
  versionString: string | undefined,
  cursorTraceId: string | undefined,
): boolean | undefined {
  if (!termProgram) {
    return undefined;
  }

  const version = parseVersion(versionString);

  switch (termProgram) {
    case "iTerm.app": {
      if (version.major === 3) {
        return version.minor >= 1;
      }

      return version.major > 3;
    }

    case "WezTerm": {
      return version.major >= 20_200_620;
    }

    case "vscode": {
      // Cursor forked VS Code and supports hyperlinks in 0.x.x
      if (cursorTraceId) {
        return true;
      }

      // eslint-disable-next-line no-mixed-operators
      return version.major > 1 || (version.major === 1 && version.minor >= 72);
    }

    case "ghostty": {
      return true;
    }
    // No default
  }

  return undefined;
}

/**
 * Check VTE_VERSION-based hyperlink support.
 * Returns boolean if VTE_VERSION is set, undefined otherwise.
 */
function checkVteVersion(vteVersion: string | undefined): boolean | undefined {
  if (!vteVersion) {
    return undefined;
  }

  // 0.50.0 was supposed to support hyperlinks, but throws a segfault
  if (vteVersion === "0.50.0") {
    return false;
  }

  const version = parseVersion(vteVersion);
  return version.major > 0 || version.minor >= 50;
}

/**
 * Check TERM-based hyperlink support.
 * Returns boolean if a known terminal is matched, undefined otherwise.
 */
function checkTerm(term: string | undefined): boolean | undefined {
  switch (term) {
    case "alacritty": {
      // Support added in v0.11 (2022-10-13)
      return true;
    }
    // No default
  }

  return undefined;
}

export const supportsHyperlinks = {
  stdout: createSupportsHyperlinks({ isTty: process.stdout.isTTY }),
  stderr: createSupportsHyperlinks({ isTty: process.stderr.isTTY }),
};
