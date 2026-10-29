import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ folders: vi.fn(), notes: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
	prisma: { folder: { findMany: mocks.folders }, note: { findMany: mocks.notes } },
}));

import { FOLDER_SEARCH_LIMIT, searchUserContent, searchUserFolders } from "@/lib/search";

beforeEach(() => vi.resetAllMocks());

describe("folder search", () => {
	it("skips the database for blank queries and ancestry for no matches", async () => {
		expect(await searchUserFolders("user", "  ")).toEqual([]);
		expect(mocks.folders).not.toHaveBeenCalled();
		mocks.folders.mockResolvedValueOnce([]);
		expect(await searchUserFolders("user", "missing")).toEqual([]);
		expect(mocks.folders).toHaveBeenCalledTimes(1);
	});

	it("matches names case insensitively and builds paths only from owned folders", async () => {
		const match = { id: "nested", name: "Research", parentId: "parent" };
		mocks.folders
			.mockResolvedValueOnce([match])
			.mockResolvedValueOnce([{ id: "parent", name: "Projects", parentId: null }, match]);
		expect(await searchUserFolders("user", "  RESEARCH  ")).toEqual([
			{
				type: "folder",
				id: "nested",
				name: "Research",
				path: [
					{ id: "parent", name: "Projects" },
					{ id: "nested", name: "Research" },
				],
			},
		]);
		expect(mocks.folders).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				where: { userId: "user", name: { contains: "RESEARCH", mode: "insensitive" } },
				take: FOLDER_SEARCH_LIMIT,
			}),
		);
		expect(mocks.folders).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { userId: "user" } }));
	});

	it("returns distinguishable folder and note results together", async () => {
		const folder = { id: "folder", name: "Research", parentId: null };
		mocks.folders.mockResolvedValueOnce([folder]).mockResolvedValueOnce([folder]);
		mocks.notes.mockResolvedValueOnce([
			{
				id: "note",
				title: "Research notes",
				contentMarkdown: "Findings",
				folder: null,
				noteTags: [],
				updatedAt: new Date("2026-10-29"),
			},
		]);
		const results = await searchUserContent("user", "research");
		expect(results.map(({ type, id }) => ({ type, id }))).toEqual([
			{ type: "folder", id: "folder" },
			{ type: "note", id: "note" },
		]);
		expect(mocks.notes).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ userId: "user", archivedAt: null }),
			}),
		);
	});
});
