import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), links: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/notes", () => ({
	makePreview: (content: string) => content.slice(0, 180),
	refreshNoteLinks: mocks.links,
}));
import { importMarkdown } from "./import-markdown-server";

const tx = {
	folder: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
	note: { findMany: vi.fn(), create: vi.fn() },
};

beforeEach(() => {
	vi.resetAllMocks();
	mocks.transaction.mockImplementation((callback) => callback(tx));
	tx.folder.findFirst.mockResolvedValue({ id: "target" });
	tx.folder.findMany.mockResolvedValue([]);
	tx.note.findMany.mockResolvedValue([]);
	let folders = 0,
		notes = 0;
	tx.folder.create.mockImplementation(async () => ({ id: `folder-${++folders}` }));
	tx.note.create.mockImplementation(async () => ({ id: `note-${++notes}` }));
});

describe("atomic owned Markdown imports", () => {
	it("rejects a foreign destination before creating anything", async () => {
		tx.folder.findFirst.mockResolvedValue(null);
		await expect(
			importMarkdown("owner", { folderId: "foreign", files: [{ path: ["a.md"], content: "" }] }),
		).rejects.toThrow(/belonging/);
		expect(tx.folder.findFirst).toHaveBeenCalledWith({
			where: { id: "foreign", userId: "owner" },
			select: { id: true },
		});
		expect(tx.folder.create).not.toHaveBeenCalled();
		expect(tx.note.create).not.toHaveBeenCalled();
	});
	it("preserves hierarchy and shares each created folder within a drop", async () => {
		const files = [
			{ path: ["Work", "a.md"], content: "[[b]]" },
			{ path: ["Work", "Child", "b.md"], content: "b" },
		];
		expect(await importMarkdown("owner", { folderId: "target", files })).toEqual({
			notes: 2,
			folders: 2,
			skipped: 0,
		});
		expect(tx.folder.create.mock.calls.map(([query]) => query.data)).toEqual([
			{ userId: "owner", parentId: "target", name: "Work" },
			{ userId: "owner", parentId: "folder-1", name: "Child" },
		]);
		expect(tx.note.create.mock.calls.map(([query]) => query.data)).toEqual([
			{ userId: "owner", folderId: "folder-1", title: "a", contentMarkdown: "[[b]]", preview: "[[b]]" },
			{ userId: "owner", folderId: "folder-2", title: "b", contentMarkdown: "b", preview: "b" },
		]);
		expect(mocks.links.mock.invocationCallOrder[0]).toBeGreaterThan(tx.note.create.mock.invocationCallOrder[1]);
		expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
			isolationLevel: "Serializable",
			timeout: 30_000,
		});
	});
	it("suffixes existing and same-drop note/folder collisions instead of updating existing records", async () => {
		tx.folder.findMany.mockResolvedValue([{ name: "work" }, { name: "work (1)" }]);
		tx.note.findMany.mockResolvedValue([{ title: "a" }, { title: "A (1)" }]);
		await importMarkdown("owner", {
			folderId: null,
			files: [
				{ path: ["Work", "A.md"], content: "one" },
				{ path: ["Work", "a.MD"], content: "two" },
				{ path: ["WORK", "A.md"], content: "three" },
			],
		});
		expect(tx.folder.create.mock.calls.map(([query]) => query.data.name)).toEqual(["Work (2)", "WORK (3)"]);
		expect(tx.note.create.mock.calls.map(([query]) => query.data.title)).toEqual(["A (2)", "a (3)", "A (2)"]);
		for (const [query] of [...tx.folder.findMany.mock.calls, ...tx.note.findMany.mock.calls])
			expect(query.where.userId).toBe("owner");
	});
	it("lets a write failure reject the entire transaction and stops further creation", async () => {
		tx.note.create.mockRejectedValue(new Error("Database failure"));
		await expect(
			importMarkdown("owner", {
				folderId: null,
				files: [
					{ path: ["Work", "a.md"], content: "a" },
					{ path: ["Work", "b.md"], content: "b" },
				],
			}),
		).rejects.toThrow("Database failure");
		expect(mocks.transaction).toHaveBeenCalledTimes(1);
		expect(tx.note.create).toHaveBeenCalledTimes(1);
		expect(mocks.links).not.toHaveBeenCalled();
	});
});
