import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteStore } from "./note-store";
import type { NoteDetail } from "./client-types";

const note = (id = "a"): NoteDetail => ({
	id,
	title: "Title",
	contentMarkdown: "Body",
	createdAt: "",
	updatedAt: "",
	folderId: null,
	folder: null,
	tags: [],
	wikilinks: [],
	backlinks: [],
	isPinned: false,
	archivedAt: null,
});
const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
};
afterEach(() => vi.useRealTimers());
describe("workspace note cache and save queue", () => {
	it("deduplicates prefetch and opening, then retains the result", async () => {
		const result = deferred<NoteDetail>();
		const request = vi.fn((_url: string) => result.promise);
		const store = new NoteStore("user", request as never);
		const first = store.load("a");
		const second = store.load("a");
		expect(request).toHaveBeenCalledTimes(1);
		result.resolve(note());
		await Promise.all([first, second]);
		await store.load("a");
		expect(request.mock.calls.filter(([url]) => url === "/api/notes/a")).toHaveLength(1);
		store.dispose();
	});
	it("sends only changed fields and saves newer edits after the in-flight revision", async () => {
		const first = deferred<Partial<NoteDetail>>();
		const request = vi
			.fn()
			.mockImplementationOnce(() => first.promise)
			.mockResolvedValue({ updatedAt: "saved" });
		const store = new NoteStore("user", request as never);
		store.seed(note());
		store.update("a", { title: "First" });
		const saving = store.flush("a");
		store.update("a", { title: "Second", contentMarkdown: "New body" });
		first.resolve({ title: "First" });
		await saving;
		expect(request.mock.calls[0][1].body).toEqual({ title: "First" });
		expect(request.mock.calls[1][1].body).toEqual({ title: "Second", contentMarkdown: "New body" });
		expect(store.get("a")?.draft.title).toBe("Second");
		expect(store.get("a")?.saveState).toBe("saved");
		store.dispose();
	});
	it("keeps a failed draft and retries without replacing it with background data", async () => {
		const request = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({ updatedAt: "saved" });
		const store = new NoteStore("user", request as never);
		store.seed(note());
		store.update("a", { contentMarkdown: "Keep me" });
		await store.flush("a");
		await store.load("a", true);
		expect(request).toHaveBeenCalledTimes(1);
		expect(store.get("a")?.saveState).toBe("failed");
		await store.flush("a");
		expect(store.get("a")?.draft.contentMarkdown).toBe("Keep me");
		expect(store.get("a")?.saveState).toBe("saved");
		store.dispose();
	});
	it("does not overwrite edits with a stale detail response", async () => {
		const result = deferred<NoteDetail>();
		const store = new NoteStore("user", vi.fn(() => result.promise) as never);
		store.seed(note());
		const loading = store.load("a", true);
		store.update("a", { title: "Local" });
		result.resolve(note());
		await loading;
		expect(store.get("a")?.draft.title).toBe("Local");
		store.dispose();
	});
	it("keeps saving note A independently after opening note B", async () => {
		vi.useFakeTimers();
		const request = vi.fn().mockResolvedValue({ updatedAt: "saved" });
		const store = new NoteStore("user", request as never);
		store.seed(note("a"));
		store.update("a", { title: "A edit" });
		store.seed(note("b"));
		await vi.advanceTimersByTimeAsync(800);
		expect(request).toHaveBeenCalledWith("/api/notes/a", expect.objectContaining({ body: { title: "A edit" } }));
		expect(store.get("b")?.draft.title).toBe("Title");
		store.dispose();
	});
});

it("opens a provisional note synchronously and queues edits until creation finishes", async () => {
	const creation = deferred<NoteDetail>();
	const request = vi
		.fn()
		.mockImplementationOnce(() => creation.promise)
		.mockResolvedValue({ updatedAt: "saved" });
	const store = new NoteStore("user", request as never);
	const id = store.create(null);
	expect(store.get(id)?.creating).toBe(true);
	store.update(id, { title: "Typed during creation" });
	expect(request).toHaveBeenCalledTimes(1);
	creation.resolve({ ...note(id), title: "", contentMarkdown: "" });
	await store.flush(id);
	expect(request.mock.calls[1]).toEqual([
		`/api/notes/${id}`,
		{ method: "PATCH", body: { title: "Typed during creation" } },
	]);
	expect(store.get(id)?.saveState).toBe("saved");
	store.dispose();
});
it("retries failed creation with the same id and retains its draft", async () => {
	const request = vi
		.fn()
		.mockRejectedValueOnce(new Error("Offline"))
		.mockImplementation(async (_url, options) => ({ ...note(options.body.id), title: "", contentMarkdown: "" }));
	const store = new NoteStore("user", request as never);
	const id = store.create(null);
	await store.flush(id);
	expect(store.get(id)?.saveState).toBe("failed");
	expect(store.get(id)?.creating).toBe(true);
	await store.flush(id);
	expect(request.mock.calls[0][1].body.id).toBe(id);
	expect(request.mock.calls[1][1].body.id).toBe(id);
	expect(store.get(id)?.creating).toBe(false);
	store.dispose();
});

it("merges server pin changes without overwriting a pending body edit", () => {
	const store = new NoteStore("user");
	store.seed(note());
	store.update("a", { contentMarkdown: "Local body" });
	store.patch("a", { isPinned: true });
	expect(store.get("a")?.draft).toMatchObject({ contentMarkdown: "Local body", isPinned: true });
	expect(store.get("a")?.baseline.isPinned).toBe(true);
	store.dispose();
});
it("retains unsaved drafts across store recreation and isolates accounts", async () => {
	const data = new Map<string, string>();
	vi.stubGlobal("sessionStorage", {
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => data.set(key, value),
		removeItem: (key: string) => data.delete(key),
	});
	try {
		const first = new NoteStore("user");
		first.seed(note());
		first.update("a", { title: "Recover this" });
		first.dispose();
		const request = vi.fn().mockResolvedValue(note());
		const recovered = new NoteStore("user", request as never);
		await recovered.load("a");
		expect(recovered.get("a")?.draft.title).toBe("Recover this");
		expect(request).not.toHaveBeenCalled();
		const other = new NoteStore("other", request as never);
		await other.load("a");
		expect(other.get("a")?.draft.title).toBe("Title");
		await recovered.flush("a");
		expect(data.has("palace:draft:user:a")).toBe(false);
		recovered.dispose();
		other.dispose();
	} finally {
		vi.unstubAllGlobals();
	}
});
it("discards invalidated list responses from the cache and deduplicates active reads", async () => {
	const response = deferred<{ notes: string[] }>();
	const request = vi
		.fn()
		.mockImplementationOnce(() => response.promise)
		.mockResolvedValue({ notes: ["new"] });
	const store = new NoteStore("user", request as never);
	const a = store.loadList("/api/notes");
	const b = store.loadList("/api/notes");
	expect(request).toHaveBeenCalledTimes(1);
	store.invalidateLists();
	response.resolve({ notes: ["stale"] });
	await Promise.all([a, b]);
	expect(store.getList("/api/notes")).toBeUndefined();
	await store.loadList("/api/notes");
	expect(store.getList("/api/notes")).toEqual({ notes: ["new"] });
	store.dispose();
});

it("does not undo unrelated server metadata acknowledged during an in-flight body save", async () => {
	const response = deferred<Partial<NoteDetail>>();
	const request = vi.fn(() => response.promise);
	const store = new NoteStore("user", request as never);
	store.seed(note());
	store.update("a", { contentMarkdown: "New body" });
	const saving = store.flush("a");
	store.patch("a", { isPinned: true });
	response.resolve({ updatedAt: "saved" });
	await saving;
	expect(request).toHaveBeenCalledTimes(1);
	expect(store.get("a")?.note.isPinned).toBe(true);
	expect(store.get("a")?.baseline.isPinned).toBe(true);
	store.dispose();
});

it("patches cached list previews, ordering, and filter membership without another list request", async () => {
	const request = vi.fn(async (url: string) =>
		url.includes("?") ? { notes: [], nextCursor: null } : { updatedAt: "2026-10-27T12:00:00.000Z" },
	);
	const store = new NoteStore("user", request as never);
	await store.loadList("/api/notes?view=all");
	await store.loadList("/api/notes?view=pinned");
	store.seed(note());
	store.update("a", { contentMarkdown: "New preview" });
	await store.flush("a");
	expect(store.getList<{ notes: Array<{ preview: string }> }>("/api/notes?view=all")?.notes[0].preview).toBe(
		"New preview",
	);
	expect(store.getList<{ notes: unknown[] }>("/api/notes?view=pinned")?.notes).toEqual([]);
	store.update("a", { isPinned: true });
	await store.flush("a");
	expect(store.getList<{ notes: Array<{ id: string }> }>("/api/notes?view=pinned")?.notes[0].id).toBe("a");
	expect(request.mock.calls.filter(([url]) => url.includes("?"))).toHaveLength(2);
	store.dispose();
});
