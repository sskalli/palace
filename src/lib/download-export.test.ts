import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMarkdownExport } from "./download-export";
import { NoteStore } from "./note-store";
import type { NoteDetail } from "./client-types";

afterEach(() => vi.unstubAllGlobals());

describe("saving drafts for downloads", () => {
	it("waits for saves before fetching and refuses to download failed revisions", async () => {
		let finish!: () => void;
		const pending = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const fetcher = vi.fn();
		vi.stubGlobal("fetch", fetcher);
		const store = {
			flush: vi.fn(() => pending),
			get: vi.fn(() => ({ saveState: "failed" })),
			cachedNoteIds: () => [],
		};
		const work = downloadMarkdownExport(store as never, ["a"], "?noteId=a");
		expect(fetcher).not.toHaveBeenCalled();
		finish();
		await expect(work).rejects.toThrow("Save your changes");
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("includes cached notes outside the sidebar snapshot, scoped to the selected tree", async () => {
		const store = new NoteStore("user", vi.fn() as never);
		for (const [id, folderId] of [
			["hidden", "child"],
			["unrelated", "elsewhere"],
		]) {
			store.seed({
				id,
				folderId,
				title: id,
				contentMarkdown: "",
				tags: [],
				wikilinks: [],
				backlinks: [],
				isPinned: false,
				archivedAt: null,
			} as unknown as NoteDetail);
		}
		const flush = vi.spyOn(store, "flush").mockResolvedValue(undefined);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Server message" }), { status: 500 })),
		);
		await expect(downloadMarkdownExport(store, null, "?folderId=root", new Set(["root", "child"]))).rejects.toThrow(
			"Server message",
		);
		expect(flush.mock.calls).toEqual([["hidden"]]);
		store.dispose();
	});
});
