import { readFileSync } from "node:fs";
import { join } from "@travisennis/stdlib/desm";

export function getPackageVersion(fallback = "version unavailable"): string {
  try {
    const pkgPath = join(import.meta.url, "..", "package.json");
    const pkgRaw = readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(pkgRaw) as { version?: unknown };
    const v = typeof parsed.version === "string" ? parsed.version : undefined;
    if (v && v.length > 0) {
      return v;
    }
  } catch {
    // ignore
  }
  const envV = process.env["npm_package_version"];
  if (typeof envV === "string" && envV.length > 0) {
    return envV;
  }
  return fallback;
}
