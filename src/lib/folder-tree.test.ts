import { describe, expect, it } from "vitest";
import { buildFolderTree, descendantIds, folderPath, isSameOrDescendant } from "@/lib/folder-tree";

const folders = [
	{ id: "a", parentId: null },
	{ id: "b", parentId: "a" },
	{ id: "c", parentId: "b" },
	{ id: "d", parentId: null },
	{ id: "orphan", parentId: "missing" },
];

describe("folder tree helpers", () => {
	it("nests folders and treats orphans as roots", () => {
		const tree = buildFolderTree(folders);
		expect(tree.map((node) => node.id)).toEqual(["a", "d", "orphan"]);
		expect(tree[0].children[0].children[0].id).toBe("c");
	});

	it("returns the path from the root", () => {
		expect(folderPath(folders, "c").map((folder) => folder.id)).toEqual(["a", "b", "c"]);
		expect(folderPath(folders, "nope")).toEqual([]);
		expect(folderPath(folders, null)).toEqual([]);
	});

	it("detects descendants and survives cycles", () => {
		expect(isSameOrDescendant(folders, "c", "a")).toBe(true);
		expect(isSameOrDescendant(folders, "a", "a")).toBe(true);
		expect(isSameOrDescendant(folders, "a", "c")).toBe(false);
		const cyclic = [
			{ id: "x", parentId: "y" },
			{ id: "y", parentId: "x" },
		];
		expect(folderPath(cyclic, "x")).toHaveLength(2);
		expect(descendantIds(cyclic, "x")).toEqual(["y"]);
	});

	it("collects all descendants", () => {
		expect(descendantIds(folders, "a").sort()).toEqual(["b", "c"]);
		expect(descendantIds(folders, "d")).toEqual([]);
	});
});
