export interface ExportNote {
	id: string;
	title: string;
	contentMarkdown: string;
	folderName: string | null;
	tags: string[];
	createdAt: Date;
	updatedAt: Date;
}

export interface MarkdownExportEntry {
	path: string;
	content: string;
}

export function sanitizeExportSegment(value: string, fallback: string): string {
	const cleaned = value
		.normalize("NFKC")
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
		.replace(/\s+/g, " ")
		.replace(/[. ]+$/g, "")
		.trim()
		.replace(/^\.+$/, "");
	return cleaned || fallback;
}

function yamlString(value: string): string {
	return JSON.stringify(value);
}

export function buildMarkdownExportEntries(notes: ExportNote[]): MarkdownExportEntry[] {
	const usedPaths = new Set(["readme.md"]);

	return notes.map((note) => {
		const title = note.title.trim() || "Untitled note";
		const baseName = sanitizeExportSegment(title, "Untitled note");
		const folder = note.folderName ? `${sanitizeExportSegment(note.folderName, "Folder")}/` : "";
		const initialPath = `${folder}${baseName}.md`;
		let path = initialPath;
		const suffix = sanitizeExportSegment(note.id, "note");
		let duplicate = 1;
		while (usedPaths.has(path.toLowerCase())) {
			path = `${folder}${baseName}-${suffix}${duplicate > 1 ? `-${duplicate}` : ""}.md`;
			duplicate += 1;
		}
		usedPaths.add(path.toLowerCase());

		const tags = note.tags.map((tag) => `  - ${yamlString(tag)}`).join("\n");
		const frontmatter = [
			"---",
			`title: ${yamlString(title)}`,
			"tags:",
			tags || "  []",
			`createdAt: ${note.createdAt.toISOString()}`,
			`updatedAt: ${note.updatedAt.toISOString()}`,
			"---",
		].join("\n");
		const heading = `# ${title}`;
		const body = note.contentMarkdown.trim();

		return {
			path,
			content: `${frontmatter}\n\n${heading}${body ? `\n\n${body}` : ""}\n`,
		};
	});
}
