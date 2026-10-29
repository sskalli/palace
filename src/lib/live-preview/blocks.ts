import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState, SelectionRange, Text } from "@codemirror/state";

export type BlockKind = "table" | "code" | "heading" | "rule";

export interface LiveBlock {
	kind: BlockKind;
	from: number;
	to: number;
	active: boolean;
	/** Unclosed fences stay editable even when the caret is elsewhere. */
	closed?: boolean;
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

export interface LiveSyntax {
	blocks: LiveBlock[];
	inlineCode: InlineCodeSpan[];
	inline: InlineSpan[];
	quotes: QuoteBlock[];
}
const syntaxCache = new WeakMap<Text, { tree: ReturnType<typeof syntaxTree>; spans: LiveSyntax }>();
function applySelection(spans: LiveSyntax, selection: readonly SelectionRange[]): LiveSyntax {
	const activate = <T extends { from: number; to: number }>(span: T) => ({
		...span,
		active: rangeTouches(selection, span.from, span.to),
	});
	return {
		blocks: spans.blocks.map(activate),
		inlineCode: spans.inlineCode.map(activate),
		inline: spans.inline.map(activate),
		quotes: spans.quotes.map(activate),
	};
}

/** Collects top-level tables, closed fenced code blocks, headings and rules, plus inline code spans. */
export function collectLiveSyntax(state: EditorState): LiveSyntax {
	const previous = syntaxCache.get(state.doc);
	if (previous?.tree === syntaxTree(state)) return applySelection(previous.spans, state.selection.ranges);
	const blocks: LiveBlock[] = [];
	const inlineCode: InlineCodeSpan[] = [];
	const inline: InlineSpan[] = [];
	const quotes: QuoteBlock[] = [];
	const selection = state.selection.ranges;
	// Let CodeMirror finish large parses in the background instead of blocking input for 100 ms.
	const tree = ensureSyntaxTree(state, state.doc.length, 5) ?? syntaxTree(state);

	tree.iterate({
		enter(node) {
			const kind = BLOCK_NODES[node.name];
			if (kind) {
				// Top-level only: nested lists belong to their outermost list, and
				// containers such as blockquotes keep their existing raw presentation.
				if (node.node.parent?.name !== "Document") return false;
				blocks.push({
					kind,
					from: node.from,
					to: node.to,
					active: rangeTouches(selection, node.from, node.to),
					...(kind === "code" ? { closed: node.node.getChildren("CodeMark").length >= 2 } : {}),
				});
				return false;
			}
			const style = INLINE_STYLES[node.name];
			if (style) {
				const hide = node.node.getChildren(style.marks[0]).map((m) => ({ from: m.from, to: m.to }));
				inline.push({
					from: node.from,
					to: node.to,
					className: style.className,
					hide,
					active: rangeTouches(selection, node.from, node.to),
				});
				return;
			}
			if (node.name === "Link") {
				const marks = node.node.getChildren("LinkMark");
				if (marks.length >= 2 && node.node.getChild("URL")) {
					const hide = [
						{ from: marks[0].from, to: marks[0].to },
						{ from: marks[1].from, to: node.to },
					];
					inline.push({
						from: node.from,
						to: node.to,
						className: "cm-link",
						hide,
						active: rangeTouches(selection, node.from, node.to),
					});
				}
				return;
			}
			if (node.name === "Blockquote") {
				const marks = node.node.getChildren("QuoteMark").map((m) => ({ from: m.from, to: m.to }));
				quotes.push({
					from: node.from,
					to: node.to,
					marks,
					active: rangeTouches(selection, node.from, node.to),
				});
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

	const covered = [...blocks, ...inlineCode].sort((a, b) => a.from - b.from);
	let coveredIndex = 0;
	const text = state.doc.toString();
	for (const match of text.matchAll(/\[\[([^\]\r\n]+)\]\]/g)) {
		const from = match.index;
		const to = from + match[0].length;
		while (coveredIndex < covered.length && covered[coveredIndex].to <= from) coveredIndex++;
		if (coveredIndex < covered.length && from < covered[coveredIndex].to && to > covered[coveredIndex].from)
			continue;
		inline.push({
			from,
			to,
			className: "cm-link",
			hide: [
				{ from, to: from + 2 },
				{ from: to - 2, to },
			],
			active: rangeTouches(selection, from, to),
		});
	}
	const spans = { blocks, inlineCode, inline, quotes };
	syntaxCache.set(state.doc, { tree, spans });
	return spans;
}
