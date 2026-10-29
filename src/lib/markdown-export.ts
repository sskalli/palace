export interface ExportNote {
	id: string;
	title: string;
	contentMarkdown: string;
	/** Folder names from the top level down. */
	folderPath: string[];
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

export interface ExportFolder {
	id: string;
	name: string;
	parentId: string | null;
}

/** Allocate sibling names by identity so sanitized names never merge distinct folders. */
export function buildExportFolderPaths(
	folders: ExportFolder[],
	reservedRootNames: string[] = [],
): Map<string, string[]> {
	const paths = new Map<string, string[]>();
	const byId = new Map(folders.map((folder) => [folder.id, folder]));
	const usedNames = new Map<string | null, Set<string>>();
	usedNames.set(null, new Set(reservedRootNames.map((name) => name.toLowerCase())));
	const visiting = new Set<string>();
	function visit(folder: ExportFolder): string[] {
		const existing = paths.get(folder.id);
		if (existing) return existing;
		if (visiting.has(folder.id)) throw new Error("Folder hierarchy contains a cycle.");
		visiting.add(folder.id);
		const parent = folder.parentId ? byId.get(folder.parentId) : undefined;
		const ancestors = parent ? visit(parent) : [];
		const parentKey = parent?.id ?? null;
		const used = usedNames.get(parentKey) ?? new Set<string>();
		usedNames.set(parentKey, used);
		const base = sanitizeExportSegment(folder.name, "Folder");
		let name = base;
		let duplicate = 1;
		while (used.has(name.toLowerCase())) {
			name = `${base}-${sanitizeExportSegment(folder.id, "folder")}${duplicate > 1 ? `-${duplicate}` : ""}`;
			duplicate += 1;
		}
		used.add(name.toLowerCase());
		const path = [...ancestors, name];
		paths.set(folder.id, path);
		visiting.delete(folder.id);
		return path;
	}
	for (const folder of [...folders].sort((a, b) => a.id.localeCompare(b.id))) visit(folder);
	return paths;
}

export function buildMarkdownExportEntries(
	notes: ExportNote[],
	reservedPaths: string[] = ["README.md"],
): MarkdownExportEntry[] {
	const usedPaths = new Set(reservedPaths.map((path) => path.toLowerCase()));

	return notes.map((note) => {
		const title = note.title.trim() || "Untitled note";
		const baseName = sanitizeExportSegment(title, "Untitled note");
		const folder = note.folderPath.map((name) => `${sanitizeExportSegment(name, "Folder")}/`).join("");
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
