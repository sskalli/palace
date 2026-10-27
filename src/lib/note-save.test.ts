import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
	tags: vi.fn(),
	find: vi.fn(),
	update: vi.fn(),
	replaceTags: vi.fn(),
	refreshLinks: vi.fn(),
	resolveLinks: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/http", async (original) => ({
	...(await original<typeof import("@/lib/http")>()),
	getAuthenticatedUserId: async () => "user",
}));
vi.mock("@/lib/prisma", () => ({
	prisma: {
		note: { update: mocks.update },
		$transaction: async (work: (tx: unknown) => unknown) =>
			work({ note: { findFirst: mocks.find, update: mocks.update }, noteTag: { findMany: mocks.tags } }),
	},
}));
vi.mock("@/lib/notes", async (original) => ({
	...(await original<typeof import("@/lib/notes")>()),
	replaceNoteTags: mocks.replaceTags,
	refreshNoteLinks: mocks.refreshLinks,
	resolveLiveWikilinks: mocks.resolveLinks,
}));
import { PATCH } from "@/app/api/notes/[id]/route";
beforeEach(() => {
	vi.clearAllMocks();
	mocks.tags.mockResolvedValue([{ tag: { id: "tag-id", name: "tag", normalizedName: "tag" } }]);
	mocks.update.mockResolvedValue({ id: "note", updatedAt: "now", noteTags: [] });
	mocks.find.mockResolvedValue({ contentMarkdown: "[[Target]] old", noteTags: [{ tag: { normalizedName: "tag" } }] });
	mocks.resolveLinks.mockResolvedValue({ wikilinks: [] });
});
async function save(body: unknown) {
	return PATCH(new Request("http://localhost/api/notes/note", { method: "PATCH", body: JSON.stringify(body) }), {
		params: Promise.resolve({ id: "note" }),
	});
}
it("saves metadata without pre-reading content or loading relationships", async () => {
	const response = await save({ title: "New" });
	expect(await response.json()).toEqual({ id: "note", updatedAt: "now" });
	expect(mocks.find).not.toHaveBeenCalled();
	expect(mocks.update.mock.calls[0][0].include).toBeUndefined();
	expect(mocks.resolveLinks).not.toHaveBeenCalled();
});
it("does not rewrite links when a body edit preserves the target set", async () => {
	await save({ contentMarkdown: "[[Target]] new" });
	expect(mocks.refreshLinks).not.toHaveBeenCalled();
	expect(mocks.replaceTags).not.toHaveBeenCalled();
	expect(mocks.tags).not.toHaveBeenCalled();
	expect(mocks.resolveLinks).not.toHaveBeenCalled();
});
it("does not rewrite normalized tag membership when unchanged", async () => {
	await save({ tags: ["TAG"] });
	expect(mocks.replaceTags).not.toHaveBeenCalled();
});
it("maintains links when the target set changes", async () => {
	await save({ contentMarkdown: "[[Other]]" });
	expect(mocks.refreshLinks).toHaveBeenCalledWith(expect.anything(), "user", "note", "[[Other]]");
});
