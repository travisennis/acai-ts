import path from "node:path";
import os from "node:os";
import process from "node:process";

const homedir = os.homedir();
const tmpdir = os.tmpdir();
const { env } = process;

const windows = (name: string) => {
  const appData = env.APPDATA ?? path.join(homedir, "AppData", "Roaming");
  const localAppData =
    env.LOCALAPPDATA ?? path.join(homedir, "AppData", "Local");

  return {
    // Data/config/cache/log are invented by me as Windows isn't opinionated about this
    data: path.join(localAppData, name, "Data"),
    config: path.join(appData, name, "Config"),
    cache: path.join(localAppData, name, "Cache"),
    logs: path.join(localAppData, name, "Logs"),
    state: path.join(localAppData, name, "state"),
    temp: path.join(tmpdir, name),
  };
};

// https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
const unix = (name: string) => {
  const username = path.basename(homedir);

  return {
    data: path.join(
      env.XDG_DATA_HOME ?? path.join(homedir, ".local", "share"),
      name,
    ),
    config: path.join(
      env.XDG_CONFIG_HOME ?? path.join(homedir, ".config"),
      name,
    ),
    cache: path.join(env.XDG_CACHE_HOME ?? path.join(homedir, ".cache"), name),
    // https://wiki.debian.org/XDGBaseDirectorySpecification#state
    logs: path.join(
      env.XDG_STATE_HOME ?? path.join(homedir, ".local", "state"),
      name,
      "logs",
    ),
    state: path.join(
      env.XDG_STATE_HOME ?? path.join(homedir, ".local", "state"),
      name,
    ),
    temp: path.join(tmpdir, username, name),
  };
};

export default function envPaths(name: string) {
  if (process.platform === "win32") {
    return windows(name);
  }

  return unix(name);
}
