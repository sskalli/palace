import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteStore } from "./note-store";
import type { NoteDetail } from "./client-types";

const note = (id = "a"): NoteDetail => ({ id, title: "Title", contentMarkdown: "Body", createdAt: "", updatedAt: "", folderId: null, folder: null, tags: [], wikilinks: [], backlinks: [], isPinned: false, archivedAt: null });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
afterEach(() => vi.useRealTimers());
describe("workspace note cache and save queue", () => {
 it("deduplicates prefetch and opening, then retains the result", async () => {
  const result = deferred<NoteDetail>();
  const request = vi.fn(() => result.promise);
  const store = new NoteStore("user", request as never);
  const first = store.load("a"); const second = store.load("a");
  expect(request).toHaveBeenCalledTimes(1);
  result.resolve(note()); await Promise.all([first, second]);
  await store.load("a"); expect(request).toHaveBeenCalledTimes(1);
  store.dispose();
 });
 it("sends only changed fields and saves newer edits after the in-flight revision", async () => {
  const first = deferred<Partial<NoteDetail>>();
  const request = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue({ updatedAt: "saved" });
  const store = new NoteStore("user", request as never);
  store.seed(note()); store.update("a", { title: "First" });
  const saving = store.flush("a");
  store.update("a", { title: "Second", contentMarkdown: "New body" });
  first.resolve({ title: "First" }); await saving;
  expect(request.mock.calls[0][1].body).toEqual({ title: "First" });
  expect(request.mock.calls[1][1].body).toEqual({ title: "Second", contentMarkdown: "New body" });
  expect(store.get("a")?.draft.title).toBe("Second");
  expect(store.get("a")?.saveState).toBe("saved"); store.dispose();
 });
 it("keeps a failed draft and retries without replacing it with background data", async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({ updatedAt: "saved" });
  const store = new NoteStore("user", request as never);
  store.seed(note()); store.update("a", { contentMarkdown: "Keep me" });
  await store.flush("a"); await store.load("a", true);
  expect(request).toHaveBeenCalledTimes(1);
  expect(store.get("a")?.saveState).toBe("failed");
  await store.flush("a"); expect(store.get("a")?.draft.contentMarkdown).toBe("Keep me");
  expect(store.get("a")?.saveState).toBe("saved"); store.dispose();
 });
 it("does not overwrite edits with a stale detail response", async () => {
  const result = deferred<NoteDetail>();
  const store = new NoteStore("user", vi.fn(() => result.promise) as never);
  store.seed(note()); const loading = store.load("a", true);
  store.update("a", { title: "Local" }); result.resolve(note()); await loading;
  expect(store.get("a")?.draft.title).toBe("Local"); store.dispose();
 });
 it("keeps saving note A independently after opening note B", async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockResolvedValue({ updatedAt: "saved" });
  const store = new NoteStore("user", request as never);
  store.seed(note("a")); store.update("a", { title: "A edit" }); store.seed(note("b"));
  await vi.advanceTimersByTimeAsync(800);
  expect(request).toHaveBeenCalledWith("/api/notes/a", expect.objectContaining({ body: { title: "A edit" } }));
  expect(store.get("b")?.draft.title).toBe("Title"); store.dispose();
 });
});
