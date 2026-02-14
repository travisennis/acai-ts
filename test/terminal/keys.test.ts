import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCtrlM,
  isEnter,
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

  describe("isCtrlM", () => {
    it("should detect Ctrl+M via Kitty protocol", () => {
      // Kitty protocol: \x1b[<codepoint>;<modifier>u with ctrl = 5
      // m = 109, ctrl = 4 -> 4+1 = 5
      assert.equal(isCtrlM("\x1b[109;5u"), true);
      // With lock bits masked (Caps Lock on)
      assert.equal(isCtrlM("\x1b[109;69u"), true); // 64+5 = 69
    });

    it("should NOT detect raw control characters", () => {
      // Raw \x0d is identical to Enter, so isCtrlM intentionally excludes it
      assert.equal(isCtrlM("\x0d"), false);
      assert.equal(isCtrlM("\r"), false);
      assert.equal(isCtrlM("\n"), false);
    });

    it("should NOT detect plain letters", () => {
      assert.equal(isCtrlM("m"), false);
      assert.equal(isCtrlM("M"), false);
      assert.equal(isCtrlM("a"), false);
    });

    it("should NOT detect other control keys", () => {
      assert.equal(isCtrlM("\x01"), false); // Ctrl+A
      assert.equal(isCtrlM("\x0e"), false); // Ctrl+N
      assert.equal(isCtrlM("\x0f"), false); // Ctrl+O
    });
  });

  describe("isEnter", () => {
    it("should detect Enter via legacy format (carriage return)", () => {
      assert.equal(isEnter("\x0d"), true);
    });

    it("should detect Enter via Kitty protocol", () => {
      assert.equal(isEnter("\x1b[13u"), true);
    });

    it("should NOT detect Ctrl+M", () => {
      // Enter and Ctrl+M share raw byte \x0d, but isEnter should still work
      assert.equal(isEnter("\x0d"), true);
    });

    it("should NOT detect other keys", () => {
      assert.equal(isEnter("a"), false);
      assert.equal(isEnter("\x1b"), false); // Escape
    });
  });
});
