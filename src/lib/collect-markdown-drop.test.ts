import { describe, expect, it, vi } from "vitest";
import { captureDropSources, collectMarkdownDrop } from "./collect-markdown-drop";

function fileEntry(name: string, content = "hello") {
	return {
		name,
		isFile: true,
		isDirectory: false,
		file: vi.fn((resolve: (file: File) => void) => resolve(new File([content], name))),
	} as unknown as FileSystemFileEntry;
}
function directory(name: string, batches: FileSystemEntry[][]) {
	const readEntries = vi.fn((resolve: (entries: FileSystemEntry[]) => void) => resolve(batches.shift() ?? []));
	return {
		name,
		isFile: false,
		isDirectory: true,
		createReader: () => ({ readEntries }),
	} as unknown as FileSystemDirectoryEntry;
}

describe("external drop traversal", () => {
	it("captures entry and file handles before asynchronous traversal begins", () => {
		const entry = fileEntry("a.md");
		const getAsEntry = vi.fn(() => entry);
		const getAsFile = vi.fn(() => null);
		const sources = captureDropSources({
			items: [{ kind: "file", getAsEntry, getAsFile }, { kind: "string" }],
		} as unknown as DataTransfer);
		expect(sources).toEqual([{ entry, file: null }]);
		expect(getAsFile).toHaveBeenCalled();
	});
	it("uses Firefox's webkit-prefixed API and drains all directory batches", async () => {
		const ignored = fileEntry("photo.png");
		const root = directory("Work", [
			[fileEntry("a.MD"), directory("Empty", [])],
			[directory("Child", [[fileEntry("b.md")]]), ignored],
		]);
		const sources = captureDropSources({
			items: [{ kind: "file", webkitGetAsEntry: () => root, getAsFile: () => null }],
		} as unknown as DataTransfer);
		const result = await collectMarkdownDrop(sources);
		expect(result.files.map((file) => file.path)).toEqual([
			["Work", "a.MD"],
			["Work", "Child", "b.md"],
		]);
		expect(result.skipped).toBe(1);
		expect(ignored.file).not.toHaveBeenCalled();
	});
	it("keeps identically named dropped root folders separate", async () => {
		const result = await collectMarkdownDrop([
			{ entry: directory("Work", [[fileEntry("a.md")]]), file: null },
			{ entry: directory("Work", [[fileEntry("b.md")]]), file: null },
		]);
		expect(result.files.map((file) => file.path)).toEqual([
			["Work", "a.md"],
			["Work (1)", "b.md"],
		]);
	});
	it("ignores deep non-Markdown branches but rejects deep Markdown paths", async () => {
		const nested = (leaf: FileSystemEntry) => {
			let branch = leaf;
			for (let depth = 0; depth < 22; depth++) branch = directory(`Level ${depth}`, [[branch]]);
			return branch;
		};
		const result = await collectMarkdownDrop([
			{
				entry: directory("Work", [
					[
						fileEntry("README.md"),
						nested(directory("Empty", [])),
						nested(fileEntry("photo.png")),
					],
				]),
				file: null,
			},
		]);
		expect(result.files.map((file) => file.path)).toEqual([["Work", "README.md"]]);
		expect(result.skipped).toBe(1);

		await expect(
			collectMarkdownDrop([{ entry: directory("Work", [[nested(fileEntry("deep.md"))]]), file: null }]),
		).rejects.toThrow("Use at most 20 nested folders.");
	});
	it("falls back to ordinary files when directory entries are unavailable", async () => {
		const file = new File(["---\nhello\n"], "hello.md");
		const result = await collectMarkdownDrop(
			captureDropSources({ items: [], files: [file] } as unknown as DataTransfer),
		);
		expect(result.files).toEqual([{ path: ["hello.md"], content: "---\nhello\n" }]);
	});
	it("preserves a UTF-8 BOM rather than rewriting note content", async () => {
		const result = await collectMarkdownDrop([
			{ entry: null, file: new File([new Uint8Array([239, 187, 191, 65])], "a.md") },
		]);
		expect(result.files[0].content).toBe("\uFEFFA");
	});
	it("aborts before upload on unreadable files, invalid UTF-8 and oversize files", async () => {
		await expect(
			collectMarkdownDrop([{ entry: null, file: new File([new Uint8Array([255])], "a.md") }]),
		).rejects.toThrow(/UTF-8/);
		await expect(
			collectMarkdownDrop([{ entry: null, file: new File(["x".repeat(100_001)], "a.md") }]),
		).rejects.toThrow(/100 KB/);
		const entry = {
			...fileEntry("a.md"),
			file: (_: unknown, reject: (error: Error) => void) => reject(new Error("Unreadable")),
		} as unknown as FileSystemFileEntry;
		await expect(collectMarkdownDrop([{ entry, file: null }])).rejects.toThrow("Unreadable");
	});
});
