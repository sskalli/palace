import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { history, undo, redo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { MarkdownPreview } from "@/components/markdown-preview";
import { collectLiveSyntax } from "./blocks";
import { enterAdjacentBlock, livePreviewField } from "./extension";

function make(doc: string, anchor = 0, head = anchor) {
	return makeAt(doc, anchor, head);
}

const TABLE = "| Feature | Status |\n| :------ | :----: |\n| Notes   | Done   |\n| Canvas  | Planned |";
const LIST = "- Palace\n  - Improve the editor\n  - Add boards\n- Portfolio\n  - [ ] Update screenshots\n  - [x] Write project description";
const CODE = "```typescript\nconst title = \"Palace\";\nconsole.log(title);\n```";

function makeAt(doc: string, anchor = 0, head = anchor) {
	return EditorState.create({
		doc,
		selection: { anchor, head },
		extensions: [history(), markdown({ base: markdownLanguage }), livePreviewField],
	});
}

function at(state: EditorState, needle: string, offset = 0) {
	const index = state.doc.toString().indexOf(needle);
	if (index < 0) throw new Error(`missing ${needle}`);
	return index + offset;
}

function withSelection(state: EditorState, anchor: number, head = anchor) {
	return state.update({ selection: { anchor, head } }).state;
}

function widgets(state: EditorState) {
	const found: { from: number; to: number }[] = [];
	const cursor = state.field(livePreviewField).iter();
	for (; cursor.value; cursor.next()) if (cursor.value.spec.widget) found.push({ from: cursor.from, to: cursor.to });
	return found;
}

function hiddenMarks(state: EditorState) {
	const found: string[] = [];
	const cursor = state.field(livePreviewField).iter();
	for (; cursor.value; cursor.next()) {
		if (!cursor.value.spec.widget && !cursor.value.spec.class) found.push(state.doc.sliceString(cursor.from, cursor.to));
	}
	return found;
}

describe("tables", () => {
	const doc = `intro\n\n${TABLE}\n\noutro`;

	it("renders an inactive table as one block", () => {
		const state = make(doc, 0);
		expect(widgets(state)).toEqual([{ from: at(state, "|"), to: at(state, "|") + TABLE.length }]);
	});

	it.each(["Feature", ":------", "Notes", "Planned"])("reveals the whole table with caret in %s", (needle) => {
		expect(widgets(withSelection(make(doc), at(make(doc), needle, 2)))).toEqual([]);
	});

	it("keeps the table raw when moving between rows and restores it on leaving", () => {
		let state = make(doc, at(make(doc), "Feature"));
		for (const needle of ["Notes", "Canvas"]) {
			state = withSelection(state, at(state, needle));
			expect(widgets(state)).toEqual([]);
		}
		expect(widgets(withSelection(state, doc.length))).toHaveLength(1);
	});
});

describe("lists", () => {
	const doc = `${LIST}\n\nmiddle\n\n- other one\n- other two\n\n1. first\n2. second`;
	const make = (text: string) => makeAt(text, text.indexOf("middle"));

	it("reveals the whole enclosing list from any item, including nested ones", () => {
		const base = make(doc);
		expect(widgets(base)).toHaveLength(3);
		for (const needle of ["Palace", "Improve", "[x]", "Portfolio"]) {
			const state = withSelection(base, at(base, needle, 1));
			const remaining = widgets(state);
			expect(remaining).toHaveLength(2);
			expect(remaining.every((w) => w.from > LIST.length)).toBe(true);
		}
	});

	it("does not activate adjacent separate lists together", () => {
		const base = make(doc);
		const state = withSelection(base, at(base, "other one", 2));
		expect(widgets(state)).toHaveLength(2);
		expect(widgets(state).some((w) => w.from === at(base, "- other one"))).toBe(false);
	});

	it("keeps a loose list with blank lines as a single block", () => {
		const loose = "- one\n\n- two\n\n  continued\n\n- three";
		const state = makeAt(`${loose}\n\nafter`, loose.length + 2);
		expect(widgets(state)).toEqual([{ from: 0, to: loose.length }]);
		expect(widgets(withSelection(state, at(state, "continued")))).toEqual([]);
	});

	it("never alters list text when presentation changes", () => {
		const base = make(doc);
		const moved = withSelection(base, at(base, "[ ]"));
		expect(moved.doc.toString()).toBe(doc);
	});
});

describe("fenced code", () => {
	const doc = `before\n\n${CODE}\n\nafter\n\n~~~~js\nlong\n~~~~`;

	it("renders inactive blocks, including tilde fences", () => {
		expect(widgets(make(doc))).toHaveLength(2);
	});

	it("reveals both fences and info when the caret is anywhere in the block", () => {
		const base = make(doc);
		for (const needle of ["```typescript", "console", "title);\n```"]) {
			const state = withSelection(base, at(base, needle, 3));
			expect(widgets(state)).toHaveLength(1);
		}
		expect(widgets(withSelection(base, at(base, "```\n", 3)))).toHaveLength(1);
	});

	it("restores rendering after leaving", () => {
		const base = make(doc, at(make(doc), "console"));
		expect(widgets(withSelection(base, 0))).toHaveLength(2);
	});

	it("leaves unclosed fences raw without throwing", () => {
		const unclosed = "text\n\n```ts\nconst x = 1;\n";
		const state = make(unclosed, 0);
		expect(widgets(state)).toEqual([]);
		expect(() => collectLiveSyntax(withSelection(state, unclosed.length))).not.toThrow();
		expect(widgets(make("```"))).toEqual([]);
	});
});

describe("inline code", () => {
	const doc = "a `code` b and `` x`y `` c";

	it("hides delimiters when inactive and reveals them when the caret is inside", () => {
		expect(hiddenMarks(make(doc, 0))).toEqual(["`", "`", "``", "``"]);
		const inside = withSelection(make(doc), at(make(doc), "code", 2));
		expect(hiddenMarks(inside)).toEqual(["``", "``"]);
	});

	it("respects multi-backtick delimiters", () => {
		const state = make(doc);
		const spans = collectLiveSyntax(state).inlineCode;
		expect(spans.map((s) => s.markLength)).toEqual([1, 2]);
		expect(hiddenMarks(withSelection(state, at(state, "x`y", 1)))).toEqual(["`", "`"]);
	});

	it("restores formatting after leaving and stays raw inside revealed blocks", () => {
		const state = withSelection(make(doc), at(make(doc), "code", 1));
		expect(hiddenMarks(withSelection(state, doc.length))).toHaveLength(4);
		const listDoc = "- item `x`\n\nplain";
		expect(hiddenMarks(make(listDoc, 3))).toEqual([]);
	});
});

describe("selection and integrity", () => {
	const doc = `${TABLE}\n\ntext\n\n${CODE}\n\n- a\n- b`;

	it("reveals every intersected block for multi-block selections", () => {
		const base = make(doc);
		const state = withSelection(base, at(base, "Notes"), at(base, "console"));
		expect(widgets(state)).toEqual([{ from: at(base, "- a"), to: doc.length }]);
	});

	it("does not activate a block when a selection only ends at its boundary", () => {
		const base = make(doc);
		const state = withSelection(base, 0, TABLE.length + 2);
		expect(widgets(state).some((w) => w.from === 0)).toBe(false);
		const touching = withSelection(base, TABLE.length + 2, at(base, "```"));
		expect(widgets(touching).some((w) => w.from === 0)).toBe(true);
	});

	it("keeps presentation changes out of the document and history", () => {
		let state = make(doc);
		state = withSelection(state, at(state, "Notes"));
		state = withSelection(state, at(state, "console"));
		expect(state.doc.toString()).toBe(doc);
		expect(undo({ state, dispatch: () => {} })).toBe(false);
	});

	it("undoes and redoes text edits only", () => {
		let state = make("- a\n- b", 3);
		state = state.update({ changes: { from: 3, insert: "!" }, userEvent: "input" }).state;
		let current = state;
		undo({ state: current, dispatch: (tr) => (current = tr.state) });
		expect(current.doc.toString()).toBe("- a\n- b");
		redo({ state: current, dispatch: (tr) => (current = tr.state) });
		expect(current.doc.toString()).toBe("- a!\n- b");
	});

	it("only reports document changes for autosave-relevant transactions", () => {
		const base = make(doc);
		expect(base.update({ selection: { anchor: 5 } }).docChanged).toBe(false);
		expect(base.update({ changes: { from: 0, insert: "x" } }).docChanged).toBe(true);
	});
});

describe("preview mode", () => {
	it("renders the whole document regardless of any editor selection", () => {
		const html = renderToStaticMarkup(
			createElement(MarkdownPreview, { content: `${TABLE}\n\n${LIST}\n\n${CODE}\n\n\`inline\` [[Missing]]`, wikilinks: [] }),
		);
		expect(html).toContain("<table>");
		expect(html).toContain("<ul>");
		expect(html).toContain("<pre><code");
		expect(html).toContain("<code>inline</code>");
		expect(html).not.toContain("| Feature");
		expect(html).not.toContain("```");
	});

	it("keeps resolving wikilinks", () => {
		const html = renderToStaticMarkup(
			createElement(MarkdownPreview, {
				content: "see [[Other]]",
				wikilinks: [{ rawTargetTitle: "Other", targetNoteId: "n1", targetTitle: "Other" }],
			}),
		);
		expect(html).toContain('href="/notes/n1"');
	});
});

describe("headings and rules", () => {
	const doc = "### title\n\ntext\n\n---\n\nmore";

	it("renders inactive headings and rules and reveals them under the caret", () => {
		expect(widgets(make(doc, doc.length))).toHaveLength(2);
		expect(widgets(make(doc, 3))).toHaveLength(1);
		expect(widgets(make(doc, doc.indexOf("---") + 1))).toHaveLength(1);
	});
});

describe("inline formatting and quotes", () => {
	const doc = "a **bold** *it* ~~gone~~ [site](https://x.io) b\n\n> quoted\n\n* star\n* list";

	function hidden(state: EditorState) {
		const out: string[] = [];
		const cursor = state.field(livePreviewField).iter();
		for (; cursor.value; cursor.next()) {
			if (!cursor.value.spec.widget && !cursor.value.spec.class && !cursor.value.spec.attributes)
				out.push(state.doc.sliceString(cursor.from, cursor.to));
		}
		return out;
	}

	it("hides delimiters, link targets and quote markers when inactive", () => {
		const state = make(doc, doc.indexOf("* list"));
		expect(hidden(state)).toEqual(
			expect.arrayContaining(["**", "*", "~~", "[", "](https://x.io)", "> "]),
		);
	});

	it("reveals only the span under the caret", () => {
		const state = make(doc, doc.indexOf("bold") + 1);
		const marks = hidden(state);
		expect(marks).not.toContain("**");
		expect(marks).toContain("~~");
		expect(marks).toContain("](https://x.io)");
	});

	it("reveals link syntax and quote marker when active", () => {
		expect(hidden(make(doc, doc.indexOf("site") + 1))).not.toContain("](https://x.io)");
		expect(hidden(make(doc, doc.indexOf("quoted") + 1))).not.toContain("> ");
	});

	it("renders `*` lists as blocks too", () => {
		expect(widgets(make(doc, 0))).toHaveLength(1);
		expect(widgets(make(doc, doc.indexOf("list")))).toHaveLength(0);
	});
});

describe("arrow navigation into rendered blocks", () => {
	const doc = "above\n\n---\n\nbelow";
	function press(state: EditorState, key: "up" | "down" | "left" | "right") {
		let next = state;
		const view = { state, dispatch: (tr: import("@codemirror/state").TransactionSpec) => (next = state.update(tr).state) };
		return { handled: enterAdjacentBlock(key)(view as never), next };
	}

	it("enters a rule from below with the caret at its end", () => {
		const r = press(make(doc, doc.indexOf("---") + 4), "up");
		expect(r.handled).toBe(true);
		expect(r.next.selection.main.head).toBe(doc.indexOf("---") + 3);
		expect(widgets(r.next)).toEqual([]);
	});

	it("enters a rule from above with the caret at its start", () => {
		const r = press(make(doc, 6), "down");
		expect(r.next.selection.main.head).toBe(doc.indexOf("---"));
		expect(press(make(doc, 6), "right").handled).toBe(true);
		expect(press(make(doc, doc.indexOf("---") + 4), "left").next.selection.main.head).toBe(doc.indexOf("---") + 3);
	});

	it("leaves ordinary movement alone", () => {
		expect(press(make(doc, 2), "left").handled).toBe(false);
		expect(press(make(doc, doc.length), "down").handled).toBe(false);
	});
});
