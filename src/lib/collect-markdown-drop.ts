import {
	IMPORT_LIMITS,
	availableImportName,
	isMarkdownFile,
	MarkdownImportError,
	validateImportPath,
	validateMarkdownImport,
	type MarkdownImport,
} from "@/lib/markdown-import";

type Entry = FileSystemEntry;
type EntryItem = DataTransferItem & { getAsEntry?: () => Entry | null };
type DropSource = { entry: Entry | null; file: File | null };

/** Capture synchronously during `drop`; the browser closes DataTransfer access after the handler returns. */
export function captureDropSources(transfer: DataTransfer): DropSource[] {
	const items = Array.from(transfer.items ?? []).filter((item) => item.kind === "file");
	if (!items.length) return Array.from(transfer.files).map((file) => ({ entry: null, file }));
	return items.map((item: EntryItem) => ({
		entry: item.getAsEntry?.() ?? item.webkitGetAsEntry?.() ?? null,
		file: item.getAsFile(),
	}));
}

export async function collectMarkdownDrop(
	sources: DropSource[],
): Promise<{ files: MarkdownImport["files"]; skipped: number }> {
	const files: MarkdownImport["files"] = [];
	let skipped = 0;
	let scanned = 0;
	let totalBytes = 0;
	const tick = () => {
		if (++scanned > IMPORT_LIMITS.scannedEntries)
			throw new MarkdownImportError(
				"This selection has too many items. Drop fewer than 10,000 files and folders at a time.",
			);
	};
	const addFile = async (file: File, path: string[]) => {
		if (!isMarkdownFile(path[path.length - 1])) {
			skipped++;
			return;
		}
		validateImportPath(path);
		if (files.length >= IMPORT_LIMITS.files)
			throw new MarkdownImportError("Import at most 100 Markdown files at a time.");
		if (file.size > IMPORT_LIMITS.fileBytes)
			throw new MarkdownImportError(`${file.name} exceeds the 100 KB per-file limit.`);
		totalBytes += file.size;
		if (totalBytes > IMPORT_LIMITS.totalBytes)
			throw new MarkdownImportError("Import at most 2 MB of Markdown at a time.");
		let content: string;
		try {
			content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
		} catch {
			throw new MarkdownImportError(`${file.name} could not be read as UTF-8 text. Nothing was imported.`);
		}
		files.push({ path, content });
	};
	const visit = async (entry: Entry, ancestors: string[], name = entry.name) => {
		tick();
		const path = [...ancestors, name];
		if (entry.isFile) {
			if (!isMarkdownFile(entry.name)) {
				skipped++;
				return;
			}
			const file = await new Promise<File>((resolve, reject) =>
				(entry as FileSystemFileEntry).file(resolve, reject),
			);
			await addFile(file, path);
		} else if (entry.isDirectory) {
			const reader = (entry as FileSystemDirectoryEntry).createReader();
			// Chromium returns batches (often 100 entries); an empty batch marks completion.
			for (;;) {
				const batch = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject));
				if (!batch.length) break;
				for (const child of batch) await visit(child, path);
			}
		}
	};
	const rootNames = new Set<string>();
	for (const source of sources) {
		if (source.entry) {
			const name = source.entry.isDirectory
				? availableImportName(source.entry.name, rootNames, 80)
				: source.entry.name;
			await visit(source.entry, [], name);
		} else if (source.file) {
			tick();
			await addFile(
				source.file,
				source.file.webkitRelativePath ? source.file.webkitRelativePath.split("/") : [source.file.name],
			);
		} else
			throw new MarkdownImportError(
				"This browser could not read a dropped folder. Try Firefox, Chrome, Edge or Safari, or drop its .md files directly.",
			);
	}
	// Repeat structural checks before making any request; the server validates independently.
	validateMarkdownImport({ folderId: null, files });
	return { files, skipped };
}
