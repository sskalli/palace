import { expect, it } from "vitest";
import { mergeNavigation } from "@/hooks/use-navigation";
it("merges creation during initial tree loading without losing existing notes", () => {
	expect(
		mergeNavigation([{ id: "existing", title: "Existing" }], new Map([["new", { id: "new", title: "New" }]])),
	).toEqual([
		{ id: "existing", title: "Existing" },
		{ id: "new", title: "New" },
	]);
});
it("keeps newer folder names and removals over an older snapshot", () => {
	const changes = new Map<string, { id: string; name: string } | null>([
		["folder", { id: "folder", name: "Renamed" }],
		["deleted", null],
	]);
	expect(
		mergeNavigation(
			[
				{ id: "folder", name: "Old" },
				{ id: "deleted", name: "Deleted" },
			],
			changes,
		),
	).toEqual([{ id: "folder", name: "Renamed" }]);
});
