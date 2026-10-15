import { describe, expect, it } from "vitest";
import { buildMarkdownExportEntries, sanitizeExportSegment } from "@/lib/markdown-export";

const createdAt = new Date("2026-10-12T00:00:00.000Z");

describe("Markdown export generation", () => {
	it("preserves the folder path and emits portable YAML frontmatter", () => {
		const [entry] = buildMarkdownExportEntries([
			{
				id: "note-1",
				title: "Example note",
				contentMarkdown: "Markdown content here.",
				folderPath: ["Work"],
				tags: ["career", "project"],
				createdAt,
				updatedAt: createdAt,
			},
		]);

		expect(entry.path).toBe("Work/Example note.md");
		expect(entry.content).toContain('title: "Example note"');
		expect(entry.content).toContain('  - "career"\n  - "project"');
		expect(entry.content).toContain("createdAt: 2026-10-12T00:00:00.000Z");
		expect(entry.content).toContain("# Example note\n\nMarkdown content here.");
	});

	it("uses safe fallback names, sanitizes path segments, and prevents archive collisions", () => {
		expect(sanitizeExportSegment("../:?", "Fallback")).toBe("..---");
		const entries = buildMarkdownExportEntries([
			{ id: "one", title: "", contentMarkdown: "", folderPath: [], tags: [], createdAt, updatedAt: createdAt },
			{
				id: "two",
				title: "README",
				contentMarkdown: "",
				folderPath: [],
				tags: [],
				createdAt,
				updatedAt: createdAt,
			},
			{
				id: "three",
				title: "Untitled note",
				contentMarkdown: "",
				folderPath: [],
				tags: [],
				createdAt,
				updatedAt: createdAt,
			},
		]);

		expect(entries.map(({ path }) => path)).toEqual([
			"Untitled note.md",
			"README-two.md",
			"Untitled note-three.md",
		]);
	});
});
