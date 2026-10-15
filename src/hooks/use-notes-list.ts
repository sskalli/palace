"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/api-client";
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
	const key = `${view}:${folderId ?? ""}:${tag ?? ""}`;
	const [state, setState] = useState<ListState>({ key: "", notes: [], nextCursor: null, error: "" });
	const [loadingMore, setLoadingMore] = useState(false);
	const [refreshToken, setRefreshToken] = useState(0);

	useEffect(() => {
		const refresh = () => setRefreshToken((value) => value + 1);
		window.addEventListener("palace:notes-changed", refresh);
		return () => window.removeEventListener("palace:notes-changed", refresh);
	}, []);

	useEffect(() => {
		let live = true;
		api<NotesPageData>(notesUrl({ view, folderId, tag }), { fallback: "Notes could not be loaded." })
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
	}, [view, folderId, tag, key, refreshToken]);

	const loadMore = useCallback(async () => {
		if (!state.nextCursor || loadingMore) return;
		setLoadingMore(true);
		try {
			const page = await api<NotesPageData>(notesUrl({ view, folderId, tag }, state.nextCursor), {
				fallback: "More notes could not be loaded.",
			});
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
	}, [state.nextCursor, loadingMore, view, folderId, tag, key]);

	const removeNote = useCallback(
		(id: string) => {
			setState((current) =>
				current.key === key ? { ...current, notes: current.notes.filter((note) => note.id !== id) } : current,
			);
		},
		[key],
	);

	const loading = state.key !== key;
	return {
		notes: loading ? [] : state.notes,
		error: loading ? "" : state.error,
		hasMore: !loading && state.nextCursor !== null,
		loading,
		loadingMore,
		loadMore,
		removeNote,
	};
}
