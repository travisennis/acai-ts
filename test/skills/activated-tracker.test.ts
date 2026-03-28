import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ActivatedSkillsTracker } from "../../source/skills/activated-tracker.ts";

describe("ActivatedSkillsTracker", () => {
  it("should start with no activated skills", () => {
    const tracker = new ActivatedSkillsTracker();
    assert.equal(tracker.has("pdf"), false);
    assert.equal(tracker.has("commit"), false);
  });

  it("should track activated skills", () => {
    const tracker = new ActivatedSkillsTracker();
    assert.equal(tracker.has("pdf"), false);

    tracker.add("pdf");
    assert.equal(tracker.has("pdf"), true);
  });

  it("should track multiple skills", () => {
    const tracker = new ActivatedSkillsTracker();

    tracker.add("pdf");
    tracker.add("commit");
    tracker.add("review-pr");

    assert.equal(tracker.has("pdf"), true);
    assert.equal(tracker.has("commit"), true);
    assert.equal(tracker.has("review-pr"), true);
    assert.equal(tracker.has("nonexistent"), false);
  });

  it("should be idempotent when adding same skill multiple times", () => {
    const tracker = new ActivatedSkillsTracker();

    tracker.add("pdf");
    tracker.add("pdf");
    tracker.add("pdf");

    assert.equal(tracker.has("pdf"), true);
  });

  it("should reset all activated skills", () => {
    const tracker = new ActivatedSkillsTracker();

    tracker.add("pdf");
    tracker.add("commit");
    assert.equal(tracker.has("pdf"), true);
    assert.equal(tracker.has("commit"), true);

    tracker.reset();

    assert.equal(tracker.has("pdf"), false);
    assert.equal(tracker.has("commit"), false);
  });

  it("should allow re-adding skills after reset", () => {
    const tracker = new ActivatedSkillsTracker();

    tracker.add("pdf");
    assert.equal(tracker.has("pdf"), true);

    tracker.reset();
    assert.equal(tracker.has("pdf"), false);

    tracker.add("pdf");
    assert.equal(tracker.has("pdf"), true);
  });
});
