import { describe, expect, it } from "vitest";
import { parseWikilinkTargets, resolveWikilinkTargets } from "@/lib/wikilinks";

describe("parseWikilinkTargets", () => {
	it("extracts trimmed unique targets from Markdown", () => {
		expect(parseWikilinkTargets("See [[ First note ]] and [[Second]], then [[First note]].")).toEqual([
			"First note",
			"Second",
		]);
	});

	it("ignores malformed, empty, and multiline links", () => {
		expect(parseWikilinkTargets("[[ ]] [[unclosed] [[line\nbreak]] []")).toEqual([]);
	});
});

describe("resolveWikilinkTargets", () => {
	it("only resolves a unique active note owned by the current user", () => {
		const candidates = [
			{ id: "mine", userId: "user-a", title: "Journal", archivedAt: null },
			{ id: "theirs", userId: "user-b", title: "Private", archivedAt: null },
			{ id: "old", userId: "user-a", title: "Archive", archivedAt: new Date() },
			{ id: "dup-a", userId: "user-a", title: "Duplicate", archivedAt: null },
			{ id: "dup-b", userId: "user-a", title: "Duplicate", archivedAt: null },
		];

		expect(resolveWikilinkTargets("user-a", ["Journal", "Private", "Archive", "Duplicate"], candidates)).toEqual([
			{ rawTargetTitle: "Journal", targetNoteId: "mine" },
			{ rawTargetTitle: "Private", targetNoteId: null },
			{ rawTargetTitle: "Archive", targetNoteId: null },
			{ rawTargetTitle: "Duplicate", targetNoteId: null },
		]);
	});
});
