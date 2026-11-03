import { describe, expect, it } from "vitest";
import { availableImportName, IMPORT_LIMITS, validateMarkdownImport } from "./markdown-import";

const input = (path = ["Note.md"], content = "# hello") => ({ folderId: null, files: [{ path, content }] });

describe("Markdown import trust boundary", () => {
	it("preserves Markdown/frontmatter/HTML as data and accepts uppercase extensions", () => {
		const content = "---\ntitle: other\n---\n<script>alert(1)</script>\n[x](javascript:alert(1))";
		expect(validateMarkdownImport(input(["Work", "Note.MD"], content)).files[0].content).toBe(content);
	});
	it.each([
		["..", "Note.md"],
		["/root", "Note.md"],
		["C:\\root", "Note.md"],
		["a/b", "Note.md"],
		[".", "Note.md"],
		["\u0000", "Note.md"],
		["", "Note.md"],
	])("rejects unsafe logical paths %j", (...path) => {
		expect(() => validateMarkdownImport(input(path))).toThrow();
	});
	it("does not treat object-key-like names as properties", () => {
		expect(validateMarkdownImport(input(["__proto__", "constructor.md"])).files).toHaveLength(1);
	});
	it("rejects binary text, excessive bytes, file count, depth and folder count", () => {
		expect(() => validateMarkdownImport(input(["a.md"], "a\0b"))).toThrow();
		expect(() => validateMarkdownImport(input(["a.md"], "é".repeat(50_001)))).toThrow();
		expect(() =>
			validateMarkdownImport({ folderId: null, files: Array.from({ length: 101 }, () => input().files[0]) }),
		).toThrow();
		expect(() => validateMarkdownImport(input([...Array(21).fill("folder"), "a.md"]))).toThrow();
		const files = Array.from({ length: 100 }, (_, i) => ({ path: [String(i), "one", "two", "a.md"], content: "" }));
		expect(() => validateMarkdownImport({ folderId: null, files })).toThrow(/200 folders/);
	});
	it("bounds total decoded content independently of the request limit", () => {
		const files = Array.from({ length: 21 }, (_, i) => ({
			path: [`${i}.md`],
			content: "x".repeat(IMPORT_LIMITS.fileBytes),
		}));
		expect(() => validateMarkdownImport({ folderId: null, files })).toThrow(/2 MB/);
	});
	it("ignores non-Markdown files and rejects an entirely ignored selection", () => {
		expect(
			validateMarkdownImport({
				folderId: null,
				files: [...input().files, { path: ["photo.png"], content: "ignored" }],
			}).skipped,
		).toBe(1);
		expect(() => validateMarkdownImport(input(["photo.png"]))).toThrow(/No .md/);
	});
	it("rejects unexpected properties and forged destination types", () => {
		expect(() => validateMarkdownImport({ ...input(), userId: "victim" })).toThrow();
		expect(() => validateMarkdownImport({ ...input(), folderId: {} })).toThrow();
	});
	it("keeps both case-insensitive collisions and avoids collisions with numbered names", () => {
		const used = new Set(["note", "note (1)"]);
		expect(availableImportName("Note", used, 200)).toBe("Note (2)");
		expect(availableImportName("NOTE", used, 200)).toBe("NOTE (3)");
		const long = "x".repeat(80);
		expect(availableImportName(long, new Set([long]), 80)).toBe("x".repeat(76) + " (1)");
	});
});
