import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SelectItem } from "../../../source/tui/components/select-list.ts";
import {
  isNavigationKey,
  isShiftTab,
  isTab,
  SelectList,
} from "../../../source/tui/components/select-list.ts";

describe("SelectList key detection helpers", () => {
  it("isTab should detect Tab key", () => {
    assert.equal(isTab("\t"), true);
    assert.equal(isTab("a"), false);
    assert.equal(isTab("\x1b[A"), false);
    assert.equal(isTab("\x1b[Z"), false);
  });

  it("isShiftTab should detect Shift+Tab keys", () => {
    assert.equal(isShiftTab("\x1b[Z"), true);
    assert.equal(isShiftTab("\x1b[1;2Z"), true);
    assert.equal(isShiftTab("\t"), false);
    assert.equal(isShiftTab("\x1b[A"), false);
    assert.equal(isShiftTab("a"), false);
  });

  it("isNavigationKey should detect arrows, Tab, and Shift+Tab", () => {
    assert.equal(isNavigationKey("\x1b[A"), true); // up arrow
    assert.equal(isNavigationKey("\x1b[B"), true); // down arrow
    assert.equal(isNavigationKey("\t"), true); // Tab
    assert.equal(isNavigationKey("\x1b[Z"), true); // Shift+Tab
    assert.equal(isNavigationKey("\x1b[1;2Z"), true); // Shift+Tab with modifier
    assert.equal(isNavigationKey("\r"), false); // Enter
    assert.equal(isNavigationKey("a"), false); // regular key
    assert.equal(isNavigationKey("\x1b"), false); // Escape
  });
});

describe("SelectList navigation", () => {
  const testItems: SelectItem[] = [
    { value: "1", label: "Option 1" },
    { value: "2", label: "Option 2" },
    { value: "3", label: "Option 3" },
    { value: "4", label: "Option 4" },
    { value: "5", label: "Option 5" },
  ];

  it("should handle Tab navigation with wrapping", () => {
    const list = new SelectList(testItems, 5);
    assert.equal(list.getSelectedItem()?.value, "1");

    // Tab moves down
    list.handleInput("\t");
    assert.equal(list.getSelectedItem()?.value, "2");

    // Multiple Tabs
    list.handleInput("\t");
    list.handleInput("\t");
    assert.equal(list.getSelectedItem()?.value, "4");

    // Wrap from bottom to top
    list.handleInput("\t");
    list.handleInput("\t");
    assert.equal(list.getSelectedItem()?.value, "1");
  });

  it("should handle Shift+Tab navigation with wrapping", () => {
    const list = new SelectList(testItems, 5);
    assert.equal(list.getSelectedItem()?.value, "1");

    // Shift+Tab moves up (should wrap to bottom)
    list.handleInput("\x1b[Z");
    assert.equal(list.getSelectedItem()?.value, "5");

    // Multiple Shift+Tabs
    list.handleInput("\x1b[Z");
    list.handleInput("\x1b[Z");
    assert.equal(list.getSelectedItem()?.value, "3");

    // Wrap from top to bottom
    list.setSelectedIndex(0);
    assert.equal(list.getSelectedItem()?.value, "1");
    list.handleInput("\x1b[Z");
    assert.equal(list.getSelectedItem()?.value, "5");
  });

  it("should handle Shift+Tab with modifier sequence", () => {
    const list = new SelectList(testItems, 5);
    assert.equal(list.getSelectedItem()?.value, "1");

    list.handleInput("\x1b[1;2Z");
    assert.equal(list.getSelectedItem()?.value, "5");
  });

  it("should handle arrow keys with wrapping", () => {
    const list = new SelectList(testItems, 5);
    assert.equal(list.getSelectedItem()?.value, "1");

    // Down arrow moves down
    list.handleInput("\x1b[B");
    assert.equal(list.getSelectedItem()?.value, "2");

    // Up arrow moves up
    list.handleInput("\x1b[A");
    assert.equal(list.getSelectedItem()?.value, "1");

    // Up arrow at top wraps to bottom
    list.handleInput("\x1b[A");
    assert.equal(list.getSelectedItem()?.value, "5");

    // Down arrow at bottom wraps to top
    list.setSelectedIndex(4);
    list.handleInput("\x1b[B");
    assert.equal(list.getSelectedItem()?.value, "1");
  });

  it("should maintain consistent behavior between Tab and down arrow", () => {
    const list1 = new SelectList(testItems, 5);
    const list2 = new SelectList(testItems, 5);

    // Both start at index 0
    assert.equal(list1.getSelectedItem()?.value, "1");
    assert.equal(list2.getSelectedItem()?.value, "1");

    // Tab should produce same result as down arrow
    list1.handleInput("\t");
    list2.handleInput("\x1b[B");
    assert.equal(
      list1.getSelectedItem()?.value,
      list2.getSelectedItem()?.value,
    );
  });

  it("should maintain consistent behavior between Shift+Tab and up arrow", () => {
    const list1 = new SelectList(testItems, 5);
    const list2 = new SelectList(testItems, 5);

    // Move both to index 2 first
    list1.setSelectedIndex(2);
    list2.setSelectedIndex(2);

    // Shift+Tab should produce same result as up arrow
    list1.handleInput("\x1b[Z");
    list2.handleInput("\x1b[A");
    assert.equal(
      list1.getSelectedItem()?.value,
      list2.getSelectedItem()?.value,
    );
  });

  it("should not change selection on Enter without callback", () => {
    const list = new SelectList(testItems, 5);
    const initial = list.getSelectedItem();
    list.handleInput("\r");
    assert.equal(list.getSelectedItem()?.value, initial?.value);
  });

  it("should not change selection on Escape without callback", () => {
    const list = new SelectList(testItems, 5);
    const initial = list.getSelectedItem();
    list.handleInput("\x1b");
    assert.equal(list.getSelectedItem()?.value, initial?.value);
  });

  it("should filter items and maintain selection within filtered set", () => {
    const items: SelectItem[] = [
      { value: "apple", label: "Apple" },
      { value: "banana", label: "Banana" },
      { value: "apricot", label: "Apricot" },
      { value: "cherry", label: "Cherry" },
    ];
    const list = new SelectList(items, 5);
    list.setFilter("ap");

    // Only apple and apricot should remain
    assert.equal(list.getSelectedItem()?.value, "apple");

    // Tab should navigate within filtered items only
    list.handleInput("\t");
    assert.equal(list.getSelectedItem()?.value, "apricot");

    // Tab at end of filtered list should wrap
    list.handleInput("\t");
    assert.equal(list.getSelectedItem()?.value, "apple");
  });
});
