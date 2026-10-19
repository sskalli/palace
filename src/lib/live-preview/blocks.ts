import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState, SelectionRange } from "@codemirror/state";

export type BlockKind = "table" | "list" | "code" | "heading" | "rule";

export interface LiveBlock {
	kind: BlockKind;
	from: number;
	to: number;
	active: boolean;
}

export interface InlineCodeSpan {
	from: number;
	to: number;
	/** Length of the opening/closing backtick delimiters. */
	markLength: number;
	active: boolean;
}

export interface InlineSpan {
	from: number;
	to: number;
	className: string;
	/** Ranges of Markdown syntax hidden while the span is inactive. */
	hide: { from: number; to: number }[];
	active: boolean;
}

export interface QuoteBlock {
	from: number;
	to: number;
	marks: { from: number; to: number }[];
	active: boolean;
}

const INLINE_STYLES: Record<string, { className: string; marks: string[] }> = {
	Emphasis: { className: "cm-em", marks: ["EmphasisMark"] },
	StrongEmphasis: { className: "cm-strong", marks: ["EmphasisMark"] },
	Strikethrough: { className: "cm-strike", marks: ["StrikethroughMark"] },
};

const BLOCK_NODES: Record<string, BlockKind> = {
	Table: "table",
	BulletList: "list",
	OrderedList: "list",
	FencedCode: "code",
	HorizontalRule: "rule",
	SetextHeading1: "heading",
	SetextHeading2: "heading",
	ATXHeading1: "heading",
	ATXHeading2: "heading",
	ATXHeading3: "heading",
	ATXHeading4: "heading",
	ATXHeading5: "heading",
	ATXHeading6: "heading",
};

/**
 * A caret touching the range (inclusive) activates it; a non-empty selection
 * must overlap it, so a selection that merely ends at a boundary does not.
 */
export function rangeTouches(selection: readonly SelectionRange[], from: number, to: number): boolean {
	return selection.some((range) =>
		range.empty ? range.from >= from && range.from <= to : range.from < to && range.to > from,
	);
}

/** Collects top-level tables, outermost lists, closed fenced code blocks, headings and rules, plus inline code spans. */
export function collectLiveSyntax(state: EditorState): { blocks: LiveBlock[]; inlineCode: InlineCodeSpan[]; inline: InlineSpan[]; quotes: QuoteBlock[] } {
	const blocks: LiveBlock[] = [];
	const inlineCode: InlineCodeSpan[] = [];
	const inline: InlineSpan[] = [];
	const quotes: QuoteBlock[] = [];
	const selection = state.selection.ranges;
	const tree = ensureSyntaxTree(state, state.doc.length, 100);
	if (!tree) return { blocks, inlineCode, inline, quotes };

	tree.iterate({
		enter(node) {
			const kind = BLOCK_NODES[node.name];
			if (kind) {
				// Top-level only: nested lists belong to their outermost list, and
				// containers such as blockquotes keep their existing raw presentation.
				if (node.node.parent?.name !== "Document") return false;
				if (kind === "code" && node.node.getChildren("CodeMark").length < 2) return false;
				blocks.push({ kind, from: node.from, to: node.to, active: rangeTouches(selection, node.from, node.to) });
				return false;
			}
			const style = INLINE_STYLES[node.name];
			if (style) {
				const hide = node.node.getChildren(style.marks[0]).map((m) => ({ from: m.from, to: m.to }));
				inline.push({ from: node.from, to: node.to, className: style.className, hide, active: rangeTouches(selection, node.from, node.to) });
				return;
			}
			if (node.name === "Link") {
				const marks = node.node.getChildren("LinkMark");
				if (marks.length >= 2) {
					const hide = [
						{ from: marks[0].from, to: marks[0].to },
						{ from: marks[1].from, to: node.to },
					];
					inline.push({ from: node.from, to: node.to, className: "cm-link", hide, active: rangeTouches(selection, node.from, node.to) });
				}
				return;
			}
			if (node.name === "Blockquote") {
				const marks = node.node.getChildren("QuoteMark").map((m) => ({ from: m.from, to: m.to }));
				quotes.push({ from: node.from, to: node.to, marks, active: rangeTouches(selection, node.from, node.to) });
				return;
			}
			if (node.name === "InlineCode") {
				const marks = node.node.getChildren("CodeMark");
				const markLength = marks[0] ? marks[0].to - marks[0].from : 1;
				inlineCode.push({
					from: node.from,
					to: node.to,
					markLength,
					active: rangeTouches(selection, node.from, node.to),
				});
				return false;
			}
		},
	});
	return { blocks, inlineCode, inline, quotes };
}
