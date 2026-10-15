"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/api-client";
import type { FolderSummary, TagSummary, TreeNote } from "@/lib/client-types";

/** Folders, tags and notes shown in the sidebar. Reloads on route change and when a note is saved. */
export function useNavigation(pathname: string, onError: (message: string) => void) {
	const [folders, setFolders] = useState<FolderSummary[]>([]);
	const [tags, setTags] = useState<TagSummary[]>([]);
	const [treeNotes, setTreeNotes] = useState<TreeNote[]>([]);

	const reload = useCallback(async () => {
		try {
			const [nextFolders, nextTags, nextNotes] = await Promise.all([
				api<FolderSummary[]>("/api/folders"),
				api<TagSummary[]>("/api/tags"),
				api<TreeNote[]>("/api/notes/tree"),
			]);
			setFolders(nextFolders);
			setTags(nextTags);
			setTreeNotes(nextNotes);
		} catch (cause) {
			onError(errorText(cause, "Navigation could not be loaded."));
		}
	}, [onError]);

	useEffect(() => {
		void Promise.resolve().then(reload);
	}, [reload, pathname]);

	useEffect(() => {
		const refresh = () => void reload();
		window.addEventListener("palace:navigation-changed", refresh);
		return () => window.removeEventListener("palace:navigation-changed", refresh);
	}, [reload]);

	return { folders, tags, treeNotes, reload };
}
