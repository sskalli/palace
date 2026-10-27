"use client";

import { useCallback, useEffect, useState } from "react";
import { errorText } from "@/lib/api-client";
import { useNoteStore } from "@/components/note-store-context";
import type { NoteSummary } from "@/lib/client-types";

export interface NotesFilter {
	view: "all" | "pinned" | "archived";
	folderId: string | null;
	tag: string | null;
}

interface NotesPageData {
	notes: NoteSummary[];
	nextCursor: string | null;
}

interface ListState extends NotesPageData {
	/** The filter this data belongs to; stale data from a previous filter is hidden. */
	key: string;
	error: string;
}

function notesUrl({ view, folderId, tag }: NotesFilter, cursor?: string): string {
	const params = new URLSearchParams({ view });
	if (folderId) params.set("folderId", folderId);
	if (tag) params.set("tag", tag);
	if (cursor) params.set("cursor", cursor);
	return `/api/notes?${params}`;
}

/** A filtered, cursor-paginated list of notes. */
export function useNotesList({ view, folderId, tag }: NotesFilter) {
	const store = useNoteStore();
	const key = `${view}:${folderId ?? ""}:${tag ?? ""}`;
	const [state, setState] = useState<ListState>(() => {
		const cached = store.getList<NotesPageData>(notesUrl({ view, folderId, tag }));
		return cached ? { key, ...cached, error: "" } : { key: "", notes: [], nextCursor: null, error: "" };
	});
	const [loadingMore, setLoadingMore] = useState(false);
	const [refreshToken, setRefreshToken] = useState(0);

	useEffect(() => {
		const refresh = () => {
			store.invalidateLists();
			setRefreshToken((value) => value + 1);
		};
		window.addEventListener("palace:notes-changed", refresh);
		return () => window.removeEventListener("palace:notes-changed", refresh);
	}, [store]);

	useEffect(() => {
		let live = true;
		store
			.loadList<NotesPageData>(notesUrl({ view, folderId, tag }))
			.then((page) => {
				if (live) setState({ key, ...page, error: "" });
			})
			.catch((cause: unknown) => {
				if (live)
					setState({
						key,
						notes: [],
						nextCursor: null,
						error: errorText(cause, "Notes could not be loaded."),
					});
			});
		return () => {
			live = false;
		};
	}, [view, folderId, tag, key, refreshToken, store]);

	const loadMore = useCallback(async () => {
		if (!state.nextCursor || loadingMore) return;
		setLoadingMore(true);
		try {
			const page = await store.loadList<NotesPageData>(notesUrl({ view, folderId, tag }, state.nextCursor));
			setState((current) =>
				current.key === key
					? { ...current, notes: [...current.notes, ...page.notes], nextCursor: page.nextCursor, error: "" }
					: current,
			);
		} catch (cause) {
			setState((current) =>
				current.key === key
					? { ...current, error: errorText(cause, "More notes could not be loaded.") }
					: current,
			);
		} finally {
			setLoadingMore(false);
		}
	}, [state.nextCursor, loadingMore, view, folderId, tag, key, store]);

	const removeNote = useCallback(
		(id: string) => {
			setState((current) =>
				current.key === key ? { ...current, notes: current.notes.filter((note) => note.id !== id) } : current,
			);
		},
		[key],
	);

	const cached = store.getList<NotesPageData>(notesUrl({ view, folderId, tag }));
	const visible = state.key === key ? state : cached ? { key, ...cached, error: "" } : state;
	const loading = state.key !== key && !cached;
	return {
		notes: loading ? [] : visible.notes,
		error: loading ? "" : visible.error,
		hasMore: !loading && visible.nextCursor !== null,
		loading,
		loadingMore,
		loadMore,
		removeNote,
	};
}
