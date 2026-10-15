"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/api-client";
import type { FolderSummary, TagSummary, TreeNote } from "@/lib/client-types";

/** Folders, tags and notes shown in the sidebar. Loads once, then refreshes only what a change affects. */
export function useNavigation(onError: (message: string) => void) {
	const [folders, setFolders] = useState<FolderSummary[]>([]);
	const [tags, setTags] = useState<TagSummary[]>([]);
	const [treeNotes, setTreeNotes] = useState<TreeNote[]>([]);
	// Only the newest request of each kind may apply its result, so a slow stale response cannot overwrite fresh data.
	const latest = useRef({ folders: 0, notes: 0 });

	const run = useCallback(
		async (kind: "folders" | "notes", load: () => Promise<void>) => {
			const ticket = ++latest.current[kind];
			try {
				await load();
			} catch (cause) {
				if (ticket === latest.current[kind]) onError(errorText(cause, "Navigation could not be loaded."));
			}
		},
		[onError],
	);

	const reloadFolders = useCallback(
		() =>
			run("folders", async () => {
				const ticket = latest.current.folders;
				const next = await api<FolderSummary[]>("/api/folders");
				if (ticket === latest.current.folders) setFolders(next);
			}),
		[run],
	);

	/** Notes in the tree and the tags derived from them. */
	const reloadNotes = useCallback(
		() =>
			run("notes", async () => {
				const ticket = latest.current.notes;
				const [nextTags, nextNotes] = await Promise.all([
					api<TagSummary[]>("/api/tags"),
					api<TreeNote[]>("/api/notes/tree"),
				]);
				if (ticket !== latest.current.notes) return;
				setTags(nextTags);
				setTreeNotes(nextNotes);
			}),
		[run],
	);

	const reload = useCallback(async () => {
		await Promise.all([reloadFolders(), reloadNotes()]);
	}, [reloadFolders, reloadNotes]);

	/** Applies a change the server already confirmed, without refetching. */
	const patchTreeNote = useCallback((id: string, patch: Partial<TreeNote>) => {
		latest.current.notes++;
		setTreeNotes((current) => current.map((note) => (note.id === id ? { ...note, ...patch } : note)));
	}, []);

	useEffect(() => {
		void Promise.resolve().then(reload);
	}, [reload]);

	useEffect(() => {
		const refresh = () => void reloadNotes();
		window.addEventListener("palace:navigation-changed", refresh);
		return () => window.removeEventListener("palace:navigation-changed", refresh);
	}, [reloadNotes]);

	return { folders, tags, treeNotes, reload, reloadNotes, patchTreeNote };
}
