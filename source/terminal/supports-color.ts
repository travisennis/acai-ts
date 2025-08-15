// based on https://raw.githubusercontent.com/chalk/supports-color/refs/heads/main/index.js
import os from "node:os";
import process from "node:process";
import tty from "node:tty";

const { env } = process;

function envForceColor(): number | undefined {
  if (!("FORCE_COLOR" in env)) {
    return;
  }

  if (env["FORCE_COLOR"] === "true") {
    return 1;
  }

  if (env["FORCE_COLOR"] === "false") {
    return 0;
  }

  if (env["FORCE_COLOR"] && env["FORCE_COLOR"].length === 0) {
    return 1;
  }

  const level = Math.min(Number.parseInt(env["FORCE_COLOR"] || "0", 10), 3);

  if (![0, 1, 2, 3].includes(level)) {
    return;
  }

  return level;
}

interface ColorSupport {
  level: number;
  hasBasic: boolean;
  has256: boolean;
  has16m: boolean;
}

function translateLevel(level: number): ColorSupport | false {
  if (level === 0) {
    return false;
  }

  return {
    level,
    hasBasic: true,
    has256: level >= 2,
    has16m: level >= 3,
  };
}

function _supportsColor(
  haveStream: boolean,
  options: { streamIsTty?: boolean } = {},
): number {
  const noFlagForceColor = envForceColor();
  const forceColor = noFlagForceColor;

  if (forceColor === 0) {
    return 0;
  }

  // Check for Azure DevOps pipelines.
  // Has to be above the `!streamIsTTY` check.
  if ("TF_BUILD" in env && "AGENT_NAME" in env) {
    return 1;
  }

  if (haveStream && !options.streamIsTty && forceColor === undefined) {
    return 0;
  }

  const min = forceColor || 0;

  if (env["TERM"] === "dumb") {
    return min;
  }

  if (process.platform === "win32") {
    // Windows 10 build 10586 is the first Windows release that supports 256 colors.
    // Windows 10 build 14931 is the first release that supports 16m/TrueColor.
    const osRelease = os.release().split(".");
    if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10_586) {
      return Number(osRelease[2]) >= 14_931 ? 3 : 2;
    }

    return 1;
  }

  if ("CI" in env) {
    if (
      ["GITHUB_ACTIONS", "GITEA_ACTIONS", "CIRCLECI"].some((key) => key in env)
    ) {
      return 3;
    }

    if (
      ["TRAVIS", "APPVEYOR", "GITLAB_CI", "BUILDKITE", "DRONE"].some(
        (sign) => sign in env,
      ) ||
      env["CI_NAME"] === "codeship"
    ) {
      return 1;
    }

    return min;
  }

  if ("TEAMCITY_VERSION" in env) {
    return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env["TEAMCITY_VERSION"] || "")
      ? 1
      : 0;
  }

  if (env["COLORTERM"] === "truecolor") {
    return 3;
  }

  if (env["TERM"] === "xterm-kitty") {
    return 3;
  }

  if (env["TERM"] === "xterm-ghostty") {
    return 3;
  }

  if ("TERM_PROGRAM" in env) {
    const termProgramVersion = String(env["TERM_PROGRAM_VERSION"] || "0");
    const version = Number.parseInt(
      termProgramVersion.split(".")[0] ?? "0",
      10,
    );

    switch (env["TERM_PROGRAM"]) {
      case "iTerm.app": {
        return version >= 3 ? 3 : 2;
      }

      case "Apple_Terminal": {
        return 2;
      }
      // No default
    }
  }

  if (/-256(color)?$/i.test(env["TERM"] || "")) {
    return 2;
  }

  if (
    /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(
      env["TERM"] || "",
    )
  ) {
    return 1;
  }

  if ("COLORTERM" in env) {
    return 1;
  }

  return min;
}

export function createSupportsColor(
  stream: { isTty?: boolean },
  options: { streamIsTty?: boolean } = {},
): ColorSupport | false {
  const level = _supportsColor(true, {
    streamIsTty: stream?.isTty,
    ...options,
  });

  return translateLevel(level);
}

export const supportsColor = {
  stdout: createSupportsColor({ isTty: tty.isatty(1) }),
  stderr: createSupportsColor({ isTty: tty.isatty(2) }),
};
