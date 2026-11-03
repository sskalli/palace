import { z } from "zod";

export const IMPORT_LIMITS = {
	files: 100,
	fileBytes: 100_000,
	totalBytes: 2_000_000,
	requestBytes: 4_100_000,
	depth: 20,
	folders: 200,
	scannedEntries: 10_000,
} as const;

export class MarkdownImportError extends Error {
	constructor(
		message: string,
		readonly status = 400,
	) {
		super(message);
	}
}

export function isMarkdownFile(name: string): boolean {
	return /\.md$/i.test(name);
}

export function validateImportPath(path: string[]): void {
	if (!path.length || path.length > IMPORT_LIMITS.depth + 1)
		throw new MarkdownImportError(`Use at most ${IMPORT_LIMITS.depth} nested folders.`);
	for (const [index, segment] of path.entries()) {
		const max = index === path.length - 1 ? 203 : 80;
		if (
			!segment.trim() ||
			segment.length > max ||
			segment === "." ||
			segment === ".." ||
			/[\\/\u0000-\u001f\u007f]/.test(segment)
		)
			throw new MarkdownImportError(
				`A file or folder name is invalid or too long (folders: 80 characters, note titles: 200).`,
			);
	}
}

const importSchema = z
	.object({
		folderId: z.string().trim().min(1).max(100).nullable(),
		files: z
			.array(
				z
					.object({
						path: z
							.array(z.string().max(255))
							.min(1)
							.max(IMPORT_LIMITS.depth + 1),
						content: z.string().max(100_000),
					})
					.strict(),
			)
			.max(IMPORT_LIMITS.files),
	})
	.strict();

export type MarkdownImport = z.infer<typeof importSchema>;
export interface ImportSummary {
	notes: number;
	folders: number;
	skipped: number;
}

/** The server repeats all client checks; paths are logical database names, never filesystem paths. */
export function validateMarkdownImport(input: unknown): MarkdownImport & { skipped: number } {
	const parsed = importSchema.safeParse(input);
	if (!parsed.success)
		throw new MarkdownImportError("Invalid import. Import at most 100 Markdown files of 100 KB each.");
	let total = 0;
	let skipped = 0;
	const folders = new Set<string>();
	const files = parsed.data.files.filter((file) => {
		validateImportPath(file.path);
		if (!isMarkdownFile(file.path[file.path.length - 1])) {
			skipped++;
			return false;
		}
		const size = new TextEncoder().encode(file.content).byteLength;
		if (size > IMPORT_LIMITS.fileBytes || file.content.includes("\0"))
			throw new MarkdownImportError(
				"Markdown files must be UTF-8 text, without null bytes, and at most 100 KB each.",
			);
		total += size;
		for (let depth = 1; depth < file.path.length; depth++) folders.add(JSON.stringify(file.path.slice(0, depth)));
		return true;
	});
	if (total > IMPORT_LIMITS.totalBytes)
		throw new MarkdownImportError("Import at most 2 MB of Markdown at a time.", 413);
	if (folders.size > IMPORT_LIMITS.folders) throw new MarkdownImportError("Import at most 200 folders at a time.");
	if (!files.length) throw new MarkdownImportError("No .md files were found. Other file types are ignored.");
	return { ...parsed.data, files, skipped };
}

/** Case-insensitive collision handling keeps both copies, including names introduced in this batch. */
export function availableImportName(name: string, used: Set<string>, maxLength: number): string {
	const base = name.trim() || "Untitled note";
	let candidate = base;
	let suffix = 1;
	while (used.has(candidate.toLocaleLowerCase())) {
		const ending = ` (${suffix++})`;
		candidate = base.slice(0, maxLength - ending.length).replace(/[\uD800-\uDBFF]$/, "") + ending;
	}
	used.add(candidate.toLocaleLowerCase());
	return candidate;
}
