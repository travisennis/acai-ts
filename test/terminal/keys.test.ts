import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isNavigationKey,
  isShiftTab,
  isTab,
} from "../../source/terminal/keys.ts";

describe("key detection functions", () => {
  it("isTab should detect Tab key", () => {
    assert.equal(isTab("\t"), true);
    assert.equal(isTab("a"), false);
    assert.equal(isTab("\x1b[A"), false);
    assert.equal(isTab("\x1b[Z"), false);
  });

  it("isShiftTab should detect Shift+Tab keys", () => {
    assert.equal(isShiftTab("\x1b[Z"), true);
    assert.equal(isShiftTab("\x1b[9;2u"), true);
    assert.equal(isShiftTab("\x1b[1;2Z"), true); // Shift+Tab with modifier
    assert.equal(isShiftTab("\t"), false);
    assert.equal(isShiftTab("\x1b[A"), false);
    assert.equal(isShiftTab("a"), false);
  });

  it("isNavigationKey should detect arrows, Tab, and Shift+Tab", () => {
    assert.equal(isNavigationKey("\x1b[A"), true); // up arrow
    assert.equal(isNavigationKey("\x1b[B"), true); // down arrow
    assert.equal(isNavigationKey("\t"), true); // Tab
    assert.equal(isNavigationKey("\x1b[Z"), true); // Shift+Tab
    assert.equal(isNavigationKey("\x1b[9;2u"), true);
    assert.equal(isNavigationKey("\x1b[1;2Z"), true); // Shift+Tab with modifier
    assert.equal(isNavigationKey("\r"), false); // Enter
    assert.equal(isNavigationKey("a"), false); // regular key
    assert.equal(isNavigationKey("\x1b"), false); // Escape
  });
});
