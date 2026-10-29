"use client";

import { selectionWrapping } from "@/lib/live-preview/selection-wrapping";
import { useEffect, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExtension } from "@codemirror/view";
import { convertWikilinks } from "@/components/markdown-preview";
import { normalizeHref } from "@/lib/urls";
import type { NoteDetail } from "@/lib/client-types";
import {
	blockRenderer,
	linkClickHandler,
	livePreviewField,
	livePreviewKeymap,
	livePreviewTheme,
	type BlockRenderer,
} from "@/lib/live-preview/extension";

interface LiveMarkdownEditorProps {
	value: string;
	onChange: (value: string) => void;
	wikilinks: NoteDetail["wikilinks"];
	placeholder: string;
	maxLength: number;
	label: string;
}

export function LiveMarkdownEditor({
	value,
	onChange,
	wikilinks,
	placeholder,
	maxLength,
	label,
}: LiveMarkdownEditorProps) {
	const host = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	const rendererCompartment = useRef(new Compartment());
	const initialValue = useRef(value);
	const rendererRef = useRef<BlockRenderer | null>(null);

	const wikilinksRef = useRef(wikilinks);

	useEffect(() => {
		onChangeRef.current = onChange;
		wikilinksRef.current = wikilinks;
	});

	const renderer = useMemo<BlockRenderer>(
		() => (container, source) => {
			container.innerHTML = renderToStaticMarkup(
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					components={{
						a: ({ href, children }) => (
							<a
								className="cm-rendered-link"
								href={href ? (normalizeHref(href) ?? undefined) : undefined}
							>
								{children}
							</a>
						),
					}}
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
					selectionWrapping,
					keymap.of([...defaultKeymap, ...historyKeymap]),
					markdown({ base: markdownLanguage }),
					EditorView.lineWrapping,
					placeholderExtension(placeholder),
					EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true" }),
					EditorState.transactionFilter.of((tr) => (tr.newDoc.length > maxLength ? [] : tr)),
					rendererCompartment.current.of(blockRenderer.of(rendererRef.current ?? (() => () => {}))),
					livePreviewField,
					livePreviewKeymap,
					linkClickHandler((target) => {
						let href: string | null = null;
						if (target.kind === "wiki") {
							const id = wikilinksRef.current.find(
								(l) => l.rawTargetTitle === target.title,
							)?.targetNoteId;
							href = id ? `/notes/${encodeURIComponent(id)}` : null;
						} else {
							href = normalizeHref(target.href);
						}
						if (!href) return false;
						window.open(href, "_blank", "noopener");
						return true;
					}),
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
