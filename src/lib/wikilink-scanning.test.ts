import { describe, expect, it } from "vitest";
import { parseWikilinkTargets, scanWikilinks, replaceWikilinks } from "./wikilinks";
import { convertWikilinks } from "@/components/markdown-preview";
import { findLinkAt, type LinkTarget } from "./live-preview/extension";

const originalWiki = /\[\[([^\]\r\n]+)\]\]/g;
const originalMarkdownLink = /\[[^\]\r\n]*\]\(\s*<?([^)\s>]+)>?[^)\r\n]*\)/g;
function originalFindLinkAt(text: string, offset: number): LinkTarget | null {
	for (const match of text.matchAll(originalWiki)) {
		if (offset >= match.index && offset <= match.index + match[0].length)
			return { kind: "wiki", title: match[1].trim() };
	}
	for (const match of text.matchAll(originalMarkdownLink)) {
		if (offset >= match.index && offset <= match.index + match[0].length) return { kind: "url", href: match[1] };
	}
	return null;
}

describe("bounded link scanning", () => {
	it.each([
		"[[First]] [[ Second ]] [[First]]",
		"[[]] [[[nested]] [[outer [[inner]] tail]]",
		"[[unfinished [[valid]] [[single] [[other]]",
		"[[one\ntwo]] [[three\rfour]] [[ valid ]]",
		"[[ ]] [[]] [[\t]] [[x]]] [[y]][[z]]",
		"prefix \\[[escaped]] `[[code]]` ![[image]]",
	])("preserves the previous match ranges, raw targets and replacements: %j", (text) => {
		const expected = Array.from(text.matchAll(originalWiki), (match) => ({
			index: match.index,
			end: match.index + match[0].length,
			raw: match[1],
		}));
		expect(Array.from(scanWikilinks(text))).toEqual(expected);
		expect(parseWikilinkTargets(text)).toEqual([...new Set(expected.map(({ raw }) => raw.trim()).filter(Boolean))]);
		expect(replaceWikilinks(text, (raw) => `<${raw}>`)).toBe(text.replace(originalWiki, (_, raw) => `<${raw}>`));
	});

	it("keeps rendered resolved, unresolved and empty wikilinks unchanged", () => {
		expect(
			convertWikilinks("[[ Found ]] [[Missing`name]] [[ ]]", [
				{ rawTargetTitle: "Found", targetNoteId: "id/1", targetTitle: "Found" },
			]),
		).toBe("[Found](/notes/id%2F1) `[[Missing'name]]` \\[\\[\\]\\]");
		expect(convertWikilinks("[[outer [[inner]]", [])).toBe("`[[outer [[inner]]`");
	});

	it("preserves ordinary link targets, optional angle brackets, priority and inclusive hit ranges", () => {
		const labels = ["label", "", "outer [inner", "[", "with space", "line\nbreak"];
		const destinations = [
			"url",
			"<url>",
			" <https://example.test> ",
			"< >",
			"<",
			"<<x>",
			"",
			">",
			"  ",
			"url title",
			"url\ntitle",
			"\nurl",
			"url]([nested](other",
			"\r\n <url>",
			"x\rtitle",
		];
		for (const label of labels)
			for (const destination of destinations) {
				const text = `before [${label}](${destination}) after [[ Wiki ]] [end](target)`;
				for (let offset = -1; offset <= text.length + 1; offset++)
					expect(findLinkAt(text, offset), `${JSON.stringify(text)} at ${offset}`).toEqual(
						originalFindLinkAt(text, offset),
					);
			}
	});

	it("handles note-sized malformed brackets in both server parsing and client conversion promptly", () => {
		const text = "[".repeat(100_000);
		const start = performance.now();
		expect(parseWikilinkTargets(text)).toEqual([]);
		expect(convertWikilinks(text, [])).toBe(text);
		expect(findLinkAt(text, text.length / 2)).toBeNull();
		expect(performance.now() - start).toBeLessThan(1000);
	});

	it("bounds destination-tail scanning for long missing closes and repeated malformed links", () => {
		const start = performance.now();
		expect(findLinkAt("[label](" + "x".repeat(100_000), 10)).toBeNull();
		expect(findLinkAt("[label](x".repeat(10_000) + "\n", 10)).toBeNull();
		expect(performance.now() - start).toBeLessThan(1000);
	});
});
