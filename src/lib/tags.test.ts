import { describe, expect, it } from "vitest";
import { normalizeTagName, normalizeTagNames } from "@/lib/tags";

describe("tag normalization", () => {
  it("trims and case-folds tag names", () => {
    expect(normalizeTagName("  Career  ")).toBe("career");
  });

  it("prevents duplicates while preserving the first entered spelling", () => {
    expect(normalizeTagNames([" Career ", "career", "PROJECT", " project ", ""])).toEqual([
      "Career",
      "PROJECT",
    ]);
  });
});
