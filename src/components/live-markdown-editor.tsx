"use client";

import { useEffect, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExtension } from "@codemirror/view";
import { convertWikilinks } from "@/components/markdown-preview";
import type { NoteDetail } from "@/lib/client-types";
import { blockRenderer, livePreviewField, livePreviewKeymap, livePreviewTheme, type BlockRenderer } from "@/lib/live-preview/extension";

interface LiveMarkdownEditorProps {
	value: string;
	onChange: (value: string) => void;
	wikilinks: NoteDetail["wikilinks"];
	placeholder: string;
	maxLength: number;
	label: string;
}

export function LiveMarkdownEditor({ value, onChange, wikilinks, placeholder, maxLength, label }: LiveMarkdownEditorProps) {
	const host = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	const rendererCompartment = useRef(new Compartment());
	const initialValue = useRef(value);
	const rendererRef = useRef<BlockRenderer | null>(null);

	useEffect(() => {
		onChangeRef.current = onChange;
	});

	const renderer = useMemo<BlockRenderer>(
		() => (container, source) => {
			container.innerHTML = renderToStaticMarkup(
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					components={{ a: ({ children }) => <span className="cm-rendered-link">{children}</span> }}
				>
					{convertWikilinks(source, wikilinks)}
				</ReactMarkdown>,
			);
			return () => {};
		},
		[wikilinks],
	);

	useEffect(() => {
		rendererRef.current = renderer;
	});

	useEffect(() => {
		const view = new EditorView({
			parent: host.current!,
			state: EditorState.create({
				doc: initialValue.current,
				extensions: [
					history(),
					keymap.of([...defaultKeymap, ...historyKeymap]),
					markdown({ base: markdownLanguage }),
					EditorView.lineWrapping,
					placeholderExtension(placeholder),
					EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true" }),
					EditorState.transactionFilter.of((tr) => (tr.newDoc.length > maxLength ? [] : tr)),
					rendererCompartment.current.of(blockRenderer.of(rendererRef.current ?? (() => () => {}))),
					livePreviewField,
					livePreviewKeymap,
					livePreviewTheme,
					EditorView.updateListener.of((update) => {
						if (update.docChanged) onChangeRef.current(update.state.doc.toString());
					}),
				],
			}),
		});
		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, [placeholder, label, maxLength]);

	useEffect(() => {
		viewRef.current?.dispatch({ effects: rendererCompartment.current.reconfigure(blockRenderer.of(renderer)) });
	}, [renderer]);

	// Only external changes (e.g. a reloaded note) touch the document; user edits already match.
	useEffect(() => {
		const view = viewRef.current;
		if (view && view.state.doc.toString() !== value) {
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
		}
	}, [value]);

	return <div className="markdown-editor" ref={host} />;
}
