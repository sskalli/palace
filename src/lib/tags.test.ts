import { describe, expect, it } from "vitest";
import { normalizeTagName, normalizeTagNames } from "./tags";

describe("tag normalization", () => {
  it("trims and case-folds names", () => {
    expect(normalizeTagName("  Career  ")).toBe("career");
  });

  it("removes empty tags and normalized duplicates", () => {
    expect(normalizeTagNames(["Career", " career ", "", "PROJECT"])).toEqual([
      "career",
      "project",
    ]);
  });
});
