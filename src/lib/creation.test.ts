import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({
	noteFind: vi.fn(),
	noteCreate: vi.fn(),
	folderFind: vi.fn(),
	folderCreate: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/http", async (original) => ({
	...(await original<typeof import("@/lib/http")>()),
	getAuthenticatedUserId: async () => "user",
}));
vi.mock("@/lib/prisma", () => {
	const db = {
		note: { findFirst: mocks.noteFind, create: mocks.noteCreate },
		folder: { findFirst: mocks.folderFind, create: mocks.folderCreate },
	};
	return { prisma: { ...db, $transaction: (work: (tx: typeof db) => unknown) => work(db) } };
});
import { POST as createNote } from "@/app/api/notes/route";
import { POST as createFolder } from "@/app/api/folders/route";
const id = "a30a4c63-b2a1-4ea2-9a80-254f32adfa96";
const note = { id, title: "", contentMarkdown: "", folder: null, noteTags: [] };
const folder = { id, name: "Projects", parentId: null };
const request = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => vi.resetAllMocks());
it("returns an owned note on a repeated creation ID without another write", async () => {
	mocks.noteFind.mockResolvedValue(note);
	const response = await createNote(request({ id }));
	expect(response.status).toBe(200);
	expect((await response.json()).id).toBe(id);
	expect(mocks.noteFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id, userId: "user" } }));
	expect(mocks.noteCreate).not.toHaveBeenCalled();
});
it("reconciles concurrent creation retries after the primary-key conflict", async () => {
	mocks.noteFind.mockResolvedValueOnce(null).mockResolvedValueOnce(note);
	mocks.noteCreate.mockRejectedValue(
		new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "6.12.0" }),
	);
	const response = await createNote(request({ id }));
	expect(response.status).toBe(200);
	expect((await response.json()).id).toBe(id);
});
it("creates a blank note with its stable client ID and no relationship writes", async () => {
	mocks.noteFind.mockResolvedValue(null);
	mocks.noteCreate.mockResolvedValue(note);
	const response = await createNote(request({ id }));
	expect(response.status).toBe(201);
	expect(mocks.noteCreate.mock.calls[0][0].data.id).toBe(id);
});
it("returns an owned folder on a repeated creation ID without another write", async () => {
	mocks.folderFind.mockResolvedValue(folder);
	const response = await createFolder(request({ id, name: "Projects" }));
	expect(await response.json()).toEqual(folder);
	expect(mocks.folderCreate).not.toHaveBeenCalled();
	expect(mocks.folderFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id, userId: "user" } }));
});
it("rejects invalid client IDs and injected ownership fields", async () => {
	expect((await createNote(request({ id: "bad" }))).status).toBe(400);
	expect((await createFolder(request({ name: "Projects", userId: "other" }))).status).toBe(400);
	expect(mocks.noteCreate).not.toHaveBeenCalled();
	expect(mocks.folderCreate).not.toHaveBeenCalled();
});
