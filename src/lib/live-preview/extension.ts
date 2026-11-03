import { scanWikilinks } from "@/lib/wikilinks";
import { syntaxTree } from "@codemirror/language";
import { EditorSelection, Facet, Prec, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from "@codemirror/view";
import { collectLiveSyntax, type BlockKind, type LiveSyntax } from "./blocks";
import { codeCopyButton, copyCode, setCodeCopyState } from "@/lib/copy-code";

/** Renders markdown `source` into `container` and returns a cleanup function. */
export type BlockRenderer = (container: HTMLElement, source: string) => () => void;

const plainRenderer: BlockRenderer = (container, source) => {
	container.textContent = source;
	return () => {};
};

export type LinkTarget = { kind: "wiki"; title: string } | { kind: "url"; href: string };

/** Finds the `[[wikilink]]` or `[text](url)` covering `offset` in a single line of source. */
export function findLinkAt(text: string, offset: number): LinkTarget | null {
	for (const m of scanWikilinks(text)) {
		if (offset >= m.index && offset <= m.end) return { kind: "wiki", title: m.raw.trim() };
	}
	return findMarkdownLinkAt(text, offset);
}

/** The existing [label](URL) grammar, with bounded scans even for malformed destinations. */
function findMarkdownLinkAt(text: string, offset: number): LinkTarget | null {
	if (!text.includes("](")) return null;
	const targetStops = new Uint32Array(text.length + 1);
	const tailStops = new Uint32Array(text.length + 1);
	targetStops[text.length] = tailStops[text.length] = text.length;
	// A destination can contain more '[' openers. Reuse terminator positions rather
	// than rescanning the same malformed URL for every potential label before it.
	for (let i = text.length - 1; i >= 0; i--) {
		targetStops[i] = /[)\s>]/.test(text[i]) ? i : targetStops[i + 1];
		tailStops[i] = text[i] === ")" || text[i] === "\r" || text[i] === "\n" ? i : tailStops[i + 1];
	}
	let cursor = 0;
	while (cursor < text.length) {
		const index = text.indexOf("[", cursor);
		if (index < 0) break;
		let labelEnd = index + 1;
		while (labelEnd < text.length && text[labelEnd] !== "]" && text[labelEnd] !== "\r" && text[labelEnd] !== "\n")
			labelEnd++;
		if (text[labelEnd] === "]" && text[labelEnd + 1] === "(") {
			let start = labelEnd + 2;
			while (start < text.length && /\s/.test(text[start])) start++;
			// Match optional '<' greedily, but preserve the old fallback where '<'
			// itself is the nonempty target (for example [label](< >)).
			if (text[start] === "<" && start + 1 < text.length && targetStops[start + 1] > start + 1) start++;
			const targetEnd = targetStops[start];
			if (targetEnd > start) {
				const close = tailStops[targetEnd];
				if (text[close] === ")") {
					if (offset >= index && offset <= close + 1)
						return { kind: "url", href: text.slice(start, targetEnd) };
					cursor = close + 1;
					continue;
				}
			}
		}
		cursor = labelEnd + 1;
	}
	return null;
}

/** Ctrl/Cmd+click on a link in the editable source opens it via `open`. */
export function linkClickHandler(open: (target: LinkTarget) => boolean) {
	return EditorView.domEventHandlers({
		mousedown(event, view) {
			if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return false;
			const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
			if (pos === null) return false;
			const line = view.state.doc.lineAt(pos);
			const target = findLinkAt(line.text, pos - line.from);
			if (!target || !open(target)) return false;
			event.preventDefault();
			return true;
		},
	});
}

export const blockRenderer = Facet.define<BlockRenderer, BlockRenderer>({
	combine: (values) => values[0] ?? plainRenderer,
});

/** Source line index (relative to the block) to place the caret on for a click inside rendered content. */
function targetOffset(
	view: EditorView,
	from: number,
	to: number,
	kind: BlockKind,
	dom: HTMLElement,
	event: MouseEvent,
) {
	const doc = view.state.doc;
	const firstLine = doc.lineAt(from).number;
	const lastLine = doc.lineAt(to).number;
	const target = event.target instanceof Element ? event.target : dom;
	let line = firstLine;

	if (kind === "table") {
		const row = target.closest("tr");
		const rows = [...dom.querySelectorAll("tr")];
		const index = row ? rows.indexOf(row) : 0;
		line = firstLine + (index <= 0 ? 0 : index + 1);
		const cell = target.closest("th,td");
		if (row && cell) {
			const cellIndex = [...row.children].indexOf(cell);
			const text = doc.line(Math.min(line, lastLine)).text;
			const cells = [...text.matchAll(/[^|]+/g)].filter((m) => m[0].trim());
			const found = cells[cellIndex];
			if (found) {
				const lineStart = doc.line(Math.min(line, lastLine)).from;
				return lineStart + found.index + found[0].trimEnd().length;
			}
		}
	} else if (kind === "code") {
		const rect = dom.getBoundingClientRect();
		const fraction = rect.height ? Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 0.999) : 0;
		line = firstLine + Math.floor(fraction * (lastLine - firstLine + 1));
	}
	return doc.line(Math.min(Math.max(line, firstLine), lastLine)).to;
}

class RenderedBlockWidget extends WidgetType {
	private cleanup: (() => void) | null = null;

	constructor(
		readonly kind: BlockKind,
		readonly source: string,
		readonly render: BlockRenderer,
	) {
		super();
	}

	eq(other: RenderedBlockWidget) {
		return this.kind === other.kind && this.source === other.source && this.render === other.render;
	}

	toDOM(view: EditorView) {
		const dom = document.createElement("div");
		dom.className = `cm-rendered-block cm-rendered-${this.kind} preview-content`;
		this.cleanup = this.render(dom, this.source);
		dom.addEventListener("mousedown", (event) => {
			if (event.button !== 0) return;
			if (codeCopyButton(event.target)) return;
			event.preventDefault();
			const anchor = event.target instanceof Element ? event.target.closest("a") : null;
			if (anchor && (event.ctrlKey || event.metaKey)) {
				const href = anchor.getAttribute("href");
				if (href) window.open(href, "_blank", "noopener");
				return;
			}
			const start = view.posAtDOM(dom);
			const pos = targetOffset(view, start, start + this.source.length, this.kind, dom, event);
			view.dispatch({ selection: EditorSelection.cursor(pos), scrollIntoView: false });
			view.focus();
		});
		return dom;
	}

	destroy() {
		this.cleanup?.();
		this.cleanup = null;
	}

	ignoreEvent() {
		return true;
	}
}

class CodeCopyWidget extends WidgetType {
	constructor(
		readonly source: string,
		readonly id: string,
		readonly block = false,
	) {
		super();
	}
	eq(other: CodeCopyWidget) {
		return this.source === other.source && this.id === other.id && this.block === other.block;
	}
	toDOM() {
		const anchor = document.createElement("span");
		anchor.className = `cm-code-copy-anchor${this.block ? " cm-code-copy-block" : ""}`;
		anchor.dataset.codeCopyId = this.id;
		anchor.contentEditable = "false";
		anchor.addEventListener("mouseleave", () => anchor.classList.remove("is-code-hovered"));
		const button = document.createElement("button");
		button.type = "button";
		button.className = "code-copy-button cm-code-copy";
		setCodeCopyState(button, "ready");
		button.dataset.copyCode = "";
		for (const type of ["pointerdown", "mousedown"])
			button.addEventListener(type, (event) => {
				event.preventDefault();
				event.stopPropagation();
			});
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			void copyCode(button, this.source);
		});
		anchor.append(button);
		return anchor;
	}
	ignoreEvent() {
		return true;
	}
}

/** Associate all visual fragments of wrapped code with its one out-of-flow control. */
const codeCopyHover = EditorView.domEventHandlers({
	mouseover(event, view) {
		const region =
			event.target instanceof Element ? event.target.closest<HTMLElement>("[data-code-copy-id]") : null;
		for (const anchor of view.dom.querySelectorAll<HTMLElement>(".cm-code-copy-anchor")) {
			anchor.classList.toggle(
				"is-code-hovered",
				!!region && anchor.dataset.codeCopyId === region.dataset.codeCopyId,
			);
		}
		return false;
	},
	mouseout(event, view) {
		const next =
			event.relatedTarget instanceof Element
				? event.relatedTarget.closest<HTMLElement>("[data-code-copy-id]")
				: null;
		for (const anchor of view.dom.querySelectorAll<HTMLElement>(".cm-code-copy-anchor")) {
			anchor.classList.toggle("is-code-hovered", !!next && anchor.dataset.codeCopyId === next.dataset.codeCopyId);
		}
		return false;
	},
});

const activeSignatures = new WeakMap<DecorationSet, string>();

function unindentCode(source: string, indentation: number) {
	return source.replace(/^[ \t]*/gm, (prefix) => {
		let columns = 0;
		let index = 0;
		while (index < prefix.length && columns < indentation) {
			columns += prefix[index++] === "\t" ? 4 - (columns % 4) : 1;
		}
		return " ".repeat(Math.max(0, columns - indentation)) + prefix.slice(index);
	});
}

function activeSignature(spans: LiveSyntax) {
	return [spans.blocks, spans.inlineCode, spans.inline, spans.quotes]
		.map((group) =>
			group
				.filter((span) => span.active)
				.map((span) => `${span.from}:${span.to}`)
				.join(","),
		)
		.join(";");
}
export function buildDecorations(state: EditorState, spans = collectLiveSyntax(state)): DecorationSet {
	const { blocks, inlineCode, inline, quotes } = spans;
	const render = state.facet(blockRenderer);
	const ranges: Range<Decoration>[] = [];

	for (const block of blocks) {
		if (block.active || block.closed === false) {
			if (block.kind === "code" && block.closed) {
				const firstLine = state.doc.lineAt(block.from);
				const lastLine = state.doc.lineAt(block.to);
				const end = block.closed ? lastLine.from : block.to;
				const indentation = firstLine.text.match(/^ {0,3}/)![0].length;
				const source = unindentCode(state.doc.sliceString(Math.min(firstLine.to + 1, end), end), indentation);
				const id = String(block.from);
				for (let n = firstLine.number; n <= lastLine.number; n++) {
					ranges.push(
						Decoration.line({ attributes: { class: "cm-code-copy-line", "data-code-copy-id": id } }).range(
							state.doc.line(n).from,
						),
					);
				}
				ranges.push(
					Decoration.widget({ widget: new CodeCopyWidget(source, id, true), side: 1 }).range(firstLine.to),
				);
			}
			continue;
		}
		const source = state.doc.sliceString(block.from, block.to);
		ranges.push(
			Decoration.replace({ widget: new RenderedBlockWidget(block.kind, source, render), block: true }).range(
				block.from,
				block.to,
			),
		);
	}

	for (const span of inlineCode) {
		const id = String(span.from);
		ranges.push(
			Decoration.mark({ class: "cm-inline-code", attributes: { "data-code-copy-id": id } }).range(
				span.from,
				span.to,
			),
		);
		const source = state.doc
			.sliceString(span.from + span.markLength, span.to - span.markLength)
			.replace(/\n/g, " ");
		const normalized = /^ .* $/.test(source) && /[^ ]/.test(source) ? source.slice(1, -1) : source;
		ranges.push(Decoration.widget({ widget: new CodeCopyWidget(normalized, id), side: 1 }).range(span.to));
		if (span.active) continue;
		const hidden = Decoration.replace({});
		ranges.push(
			hidden.range(span.from, span.from + span.markLength),
			hidden.range(span.to - span.markLength, span.to),
		);
	}

	for (const span of inline) {
		if (span.to <= span.from) continue;
		ranges.push(Decoration.mark({ class: span.className }).range(span.from, span.to));
		if (span.active) continue;
		for (const hide of span.hide) {
			if (hide.to > hide.from) ranges.push(Decoration.replace({}).range(hide.from, hide.to));
		}
	}

	for (const quote of quotes) {
		const first = state.doc.lineAt(quote.from).number;
		const last = state.doc.lineAt(quote.to).number;
		for (let n = first; n <= last; n++) {
			ranges.push(Decoration.line({ class: "cm-quote-line" }).range(state.doc.line(n).from));
		}
		if (quote.active) continue;
		for (const mark of quote.marks) {
			const next = state.doc.sliceString(mark.to, mark.to + 1);
			ranges.push(Decoration.replace({}).range(mark.from, next === " " ? mark.to + 1 : mark.to));
		}
	}

	const decorations = Decoration.set(ranges, true);
	activeSignatures.set(decorations, activeSignature(spans));
	return decorations;
}

/** Presentation only: derived from document, selection and syntax tree; never writes to the document. */
export const livePreviewField = StateField.define<DecorationSet>({
	create: buildDecorations,
	update(value, tr) {
		if (
			tr.docChanged ||
			syntaxTree(tr.state) !== syntaxTree(tr.startState) ||
			tr.state.facet(blockRenderer) !== tr.startState.facet(blockRenderer)
		)
			return buildDecorations(tr.state);
		if (tr.selection) {
			const spans = collectLiveSyntax(tr.state);
			if (activeSignatures.get(value) !== activeSignature(spans)) return buildDecorations(tr.state, spans);
		}
		return value;
	},
	provide: (field) => [EditorView.decorations.from(field), codeCopyHover],
});

export const livePreviewTheme = EditorView.baseTheme({
	".cm-em": { fontStyle: "italic" },
	".cm-strong": { fontWeight: "700" },
	".cm-strike": { textDecoration: "line-through" },
	".cm-link": { cursor: "text", color: "var(--accent, #4f7cff)", textDecoration: "underline" },
	".cm-quote-line": { borderLeft: "3px solid var(--border-subtle, #8884)", paddingLeft: "12px !important" },
	".cm-inline-code": { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: "0.92em" },
});

function renderedBlockAt(state: EditorState, line: { from: number; to: number }) {
	const cursor = state.field(livePreviewField).iter();
	for (; cursor.value; cursor.next()) {
		if (cursor.value.spec.widget && cursor.value.spec.block && cursor.from <= line.from && cursor.to >= line.to) {
			return { from: cursor.from, to: cursor.to };
		}
	}
	return null;
}

/** Arrow keys step into an adjacent rendered block (revealing it) instead of skipping over it. */
export function enterAdjacentBlock(direction: "up" | "down" | "left" | "right") {
	return (view: EditorView) => {
		const { state } = view;
		const range = state.selection.main;
		if (!range.empty || state.selection.ranges.length > 1) return false;
		const line = state.doc.lineAt(range.head);
		const backward = direction === "up" || direction === "left";
		if (direction === "left" && range.head !== line.from) return false;
		if (direction === "right" && range.head !== line.to) return false;
		const neighbourNumber = line.number + (backward ? -1 : 1);
		if (neighbourNumber < 1 || neighbourNumber > state.doc.lines) return false;
		const block = renderedBlockAt(state, state.doc.line(neighbourNumber));
		if (!block) return false;
		view.dispatch({
			selection: EditorSelection.cursor(backward ? block.to : block.from),
			scrollIntoView: true,
			userEvent: "select",
		});
		return true;
	};
}

export const livePreviewKeymap = Prec.highest(
	keymap.of([
		{ key: "ArrowUp", run: enterAdjacentBlock("up") },
		{ key: "ArrowDown", run: enterAdjacentBlock("down") },
		{ key: "ArrowLeft", run: enterAdjacentBlock("left") },
		{ key: "ArrowRight", run: enterAdjacentBlock("right") },
	]),
);
