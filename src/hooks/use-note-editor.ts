"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api, errorText, notifyNavigationChanged } from "@/lib/api-client";
import { useNoteStore } from "@/components/note-store-context";
import type { NoteDraft } from "@/lib/note-store";
export type { NoteDraft, SaveState } from "@/lib/note-store";

export function useNoteEditor(noteId: string) {
	const router = useRouter();
	const store = useNoteStore();
	const entry = useSyncExternalStore(
		store.subscribe,
		() => store.get(noteId),
		() => undefined,
	);
	const [loadError, setLoadError] = useState("");
	useEffect(() => {
		let live = true;
		void store.load(noteId).catch((cause) => {
			if (live) setLoadError(errorText(cause, "The note could not be loaded."));
		});
		return () => {
			live = false;
			void store.flush(noteId);
		};
	}, [store, noteId]);
	useEffect(() => {
		const refresh = (event: Event) => {
			const detail = (event as CustomEvent<{ noteId: string; folderId?: string | null } | undefined>).detail;
			if (detail) {
				if (detail.noteId === noteId && detail.folderId !== undefined)
					store.patch(noteId, { folderId: detail.folderId });
			} else void store.load(noteId, true).catch(() => {});
		};
		window.addEventListener("palace:notes-changed", refresh);
		return () => window.removeEventListener("palace:notes-changed", refresh);
	}, [store, noteId]);
	const update = useCallback((patch: Partial<NoteDraft>) => store.update(noteId, patch), [store, noteId]);
	const flush = useCallback(() => {
		void store.flush(noteId);
	}, [store, noteId]);
	const remove = useCallback(async () => {
		await store.flush(noteId);
		if (store.get(noteId)?.saveState === "failed") throw new Error("Save your changes before deleting this note.");
		await api(`/api/notes/${noteId}/permanent`, { method: "DELETE" });
		store.remove(noteId);
		notifyNavigationChanged();
		router.push("/?view=archived");
	}, [store, noteId, router]);
	return {
		note: entry?.note ?? null,
		folderId: entry?.note.folderId ?? null,
		draft: entry?.draft ?? null,
		loadError,
		saveState: entry?.saveState ?? "saved",
		saveError: entry?.error ?? "",
		update,
		flush,
		retry: flush,
		remove,
	};
}
