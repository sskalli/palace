import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	userId: vi.fn(),
	folders: vi.fn(),
	notes: vi.fn(),
	note: vi.fn(),
}));
vi.mock("@/lib/http", () => ({
	getAuthenticatedUserId: mocks.userId,
	jsonError: (error: string, status: number) => Response.json({ error }, { status }),
}));
vi.mock("@/lib/prisma", () => ({
	prisma: { folder: { findMany: mocks.folders }, note: { findMany: mocks.notes, findFirst: mocks.note } },
}));
import { GET } from "./route";

const date = new Date("2026-10-12T00:00:00Z");
const note = {
	id: "note",
	title: "README",
	contentMarkdown: "Hello",
	folderId: "child",
	noteTags: [],
	createdAt: date,
	updatedAt: date,
};

beforeEach(() => {
	vi.resetAllMocks();
	mocks.userId.mockResolvedValue("user");
	mocks.folders.mockResolvedValue([
		{ id: "ancestor", name: "Ancestor", parentId: null },
		{ id: "root", name: "Work", parentId: "ancestor" },
		{ id: "child", name: "Child", parentId: "root" },
		{ id: "empty", name: "Empty", parentId: "root" },
		{ id: "other", name: "Other", parentId: null },
	]);
	mocks.notes.mockResolvedValue([note]);
	mocks.note.mockResolvedValue(note);
});

describe("scoped Markdown downloads", () => {
	it("requires authentication before querying data", async () => {
		mocks.userId.mockResolvedValue(null);
		expect((await GET(new Request("http://localhost/api/export/markdown?noteId=note"))).status).toBe(401);
		expect(mocks.note).not.toHaveBeenCalled();
	});

	it("rejects ambiguous or empty selectors", async () => {
		for (const query of ["noteId=note&folderId=root", "noteId=", "folderId="]) {
			expect((await GET(new Request(`http://localhost/api/export/markdown?${query}`))).status).toBe(400);
		}
		expect(mocks.folders).not.toHaveBeenCalled();
	});

	it("downloads an owned note as Markdown with its original filename", async () => {
		const response = await GET(new Request("http://localhost/api/export/markdown?noteId=note"));
		expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
		expect(response.headers.get("Content-Disposition")).toContain('filename="README.md"');
		expect(await response.text()).toContain("# README\n\nHello");
		expect(mocks.note).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "note", userId: "user" } }));
	});

	it("returns 404 for missing or foreign notes and folders", async () => {
		mocks.note.mockResolvedValue(null);
		expect((await GET(new Request("http://localhost/api/export/markdown?noteId=foreign"))).status).toBe(404);
		expect((await GET(new Request("http://localhost/api/export/markdown?folderId=foreign"))).status).toBe(404);
		expect(mocks.notes).not.toHaveBeenCalled();
	});

	it("roots folder archives at the selected folder and preserves empty descendants", async () => {
		const response = await GET(new Request("http://localhost/api/export/markdown?folderId=root"));
		const zip = await JSZip.loadAsync(await response.arrayBuffer());
		expect(Object.keys(zip.files).sort()).toEqual(["Work/", "Work/Child/", "Work/Child/README.md", "Work/Empty/"]);
		expect(mocks.folders).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user" } }));
		expect(mocks.notes).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { userId: "user", archivedAt: null, folderId: { in: ["root", "child", "empty"] } },
			}),
		);
	});
});
