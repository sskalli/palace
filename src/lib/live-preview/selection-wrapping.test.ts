import { EditorSelection, EditorState } from "@codemirror/state";
import { history, redo, undo } from "@codemirror/commands";
import { describe, expect, it } from "vitest";
import { isWrappingShortcut, wrapSelection } from "./selection-wrapping";

describe("selection wrapping", () => {
	it("accepts AltGraph punctuation but leaves command shortcuts untouched", () => {
		const event = {
			ctrlKey: true,
			altKey: true,
			metaKey: false,
			getModifierState: (key: string) => key === "AltGraph",
		};
		expect(isWrappingShortcut(event)).toBe(false);
		expect(isWrappingShortcut({ ...event, getModifierState: () => false })).toBe(true);
		expect(isWrappingShortcut({ ...event, metaKey: true })).toBe(true);
		expect(isWrappingShortcut({ ...event, ctrlKey: false, altKey: false, getModifierState: () => false })).toBe(
			false,
		);
	});
	it.each([
		["(", ")"],
		["[", "]"],
		["{", "}"],
		['"', '"'],
		["'", "'"],
		["`", "`"],
		["*", "*"],
		["_", "_"],
		["~", "~"],
	])("wraps with %s and keeps selected text", (opening, closing) => {
		const state = EditorState.create({ doc: "before selected after", selection: { anchor: 7, head: 15 } });
		const next = state.update(wrapSelection(state, opening)!).state;
		expect(next.doc.toString()).toBe(`before ${opening}selected${closing} after`);
		expect(next.sliceDoc(next.selection.main.from, next.selection.main.to)).toBe("selected");
	});

	it("preserves backwards multiline selections and allows repeated wrapping", () => {
		let state = EditorState.create({ doc: "one\ntwo", selection: { anchor: 7, head: 0 } });
		state = state.update(wrapSelection(state, "*")!).state;
		state = state.update(wrapSelection(state, "*")!).state;
		expect(state.doc.toString()).toBe("**one\ntwo**");
		expect(state.selection.main.anchor).toBe(9);
		expect(state.selection.main.head).toBe(2);
	});

	it("wraps multiple selections while typing normally at empty cursors", () => {
		const state = EditorState.create({
			doc: "one two end",
			selection: EditorSelection.create([
				EditorSelection.range(0, 3),
				EditorSelection.range(4, 7),
				EditorSelection.cursor(11),
			]),
			extensions: EditorState.allowMultipleSelections.of(true),
		});
		const next = state.update(wrapSelection(state, "(")!).state;
		expect(next.doc.toString()).toBe("(one) (two) end(");
		expect(next.selection.ranges.map((range) => next.sliceDoc(range.from, range.to))).toEqual(["one", "two", ""]);
	});

	it("leaves ordinary typing and empty selections to CodeMirror", () => {
		const state = EditorState.create({ doc: "text", selection: { anchor: 0, head: 4 } });
		expect(wrapSelection(state, "x")).toBeNull();
		expect(wrapSelection(EditorState.create({ doc: "text" }), "(")).toBeNull();
	});

	it("undoes wrapping as a single edit and restores the original selection", () => {
		let state = EditorState.create({ doc: "text", selection: { anchor: 0, head: 4 }, extensions: history() });
		state = state.update(wrapSelection(state, "[")!).state;
		undo({
			state,
			dispatch: (tr) => {
				state = tr.state;
			},
		});
		expect(state.doc.toString()).toBe("text");
		expect(state.selection.main.to).toBe(4);
		redo({
			state,
			dispatch: (tr) => {
				state = tr.state;
			},
		});
		expect(state.doc.toString()).toBe("[text]");
	});
});
