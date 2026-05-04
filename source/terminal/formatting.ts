/**
 * Terminal Formatting Utilities
 *
 * Provides functions for formatting and displaying text in the terminal.
 */
import { supportsHyperlinks } from "./supports-hyperlinks.ts";

const OSC = "\u001B]";
const BEL = "\u0007";
const SEP = ";";

export const link = (text: string, url: string) => {
  if (supportsHyperlinks.stdout) {
    return [OSC, "8", SEP, SEP, url, BEL, text, OSC, "8", SEP, SEP, BEL].join(
      "",
    );
  }
  return null;
};
