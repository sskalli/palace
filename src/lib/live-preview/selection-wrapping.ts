import { EditorSelection, type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const pairs: Record<string, string> = {
	"(": ")",
	"[": "]",
	"{": "}",
	'"': '"',
	"'": "'",
	"`": "`",
	"*": "*",
	_: "_",
	"~": "~",
};

export function wrapSelection(state: EditorState, text: string) {
	if (text.length !== 1) return null;
	const closing = pairs[text];
	if (!closing || !state.selection.ranges.some((range) => !range.empty)) return null;
	return {
		...state.changeByRange((range) =>
			range.empty
				? {
						changes: { from: range.from, insert: text },
						range: EditorSelection.cursor(range.from + text.length),
					}
				: {
						changes: [
							{ from: range.from, insert: text },
							{ from: range.to, insert: closing },
						],
						range: EditorSelection.range(range.anchor + text.length, range.head + text.length),
					},
		),
		userEvent: "input.type",
	};
}

export function isWrappingShortcut(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "getModifierState">) {
	return event.metaKey || ((event.ctrlKey || event.altKey) && !event.getModifierState("AltGraph"));
}

export const selectionWrapping = [
	EditorView.domEventHandlers({
		keydown(event, view) {
			if (isWrappingShortcut(event) || event.isComposing || view.composing) return false;
			const transaction = wrapSelection(view.state, event.key);
			if (!transaction) return false;
			event.preventDefault();
			view.dispatch(transaction);
			return true;
		},
	}),
	// Mobile keyboards may provide input without a printable keydown event.
	EditorView.inputHandler.of((view, from, to, text) => {
		if (view.composing || from !== view.state.selection.main.from || to !== view.state.selection.main.to)
			return false;
		const transaction = wrapSelection(view.state, text);
		if (!transaction) return false;
		view.dispatch(transaction);
		return true;
	}),
];
