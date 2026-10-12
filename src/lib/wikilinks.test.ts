import { describe, expect, it } from "vitest";
import { parseWikilinks, resolveLinkTargets } from "./wikilinks";

describe("parseWikilinks", () => {
  it("extracts unique trimmed targets and ignores empty or multiline links", () => {
    expect(
      parseWikilinks("See [[ Project plan ]] and [[Inbox]]. Again [[Project plan]]. [[ ]] [[line\nbreak]]"),
    ).toEqual(["Project plan", "Inbox"]);
  });
});

describe("resolveLinkTargets", () => {
  it("resolves only unique active notes owned by the current user", () => {
    const candidates = [
      { id: "mine", userId: "u1", title: "Plan", archivedAt: null },
      { id: "theirs", userId: "u2", title: "Secret", archivedAt: null },
      { id: "archived", userId: "u1", title: "Old", archivedAt: new Date() },
      { id: "duplicate-a", userId: "u1", title: "Repeated", archivedAt: null },
      { id: "duplicate-b", userId: "u1", title: " repeated ", archivedAt: null },
    ];

    expect(
      [...resolveLinkTargets("u1", ["plan", "Secret", "Old", "Repeated"], candidates)],
    ).toEqual([["plan", "mine"]]);
  });
});
