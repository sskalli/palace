"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText, notifyNavigationChanged } from "@/lib/api-client";
import type { NoteDetail } from "@/lib/client-types";

export type SaveState = "saved" | "saving" | "failed";

/** The user-editable part of a note. */
export interface NoteDraft {
	title: string;
	contentMarkdown: string;
	tags: string[];
	isPinned: boolean;
	archived: boolean;
}

const SAVE_DELAY_MS = 800;

function toDraft(note: NoteDetail): NoteDraft {
	return {
		title: note.title,
		contentMarkdown: note.contentMarkdown,
		tags: note.tags.map(({ name }) => name),
		isPinned: note.isPinned,
		archived: Boolean(note.archivedAt),
	};
}

/** Loads a note and autosaves edits (debounced, one request at a time, never loses a newer edit). */
export function useNoteEditor(noteId: string) {
	const router = useRouter();
	const [note, setNote] = useState<NoteDetail | null>(null);
	const [folderId, setFolderId] = useState<string | null>(null);
	const [draft, setDraft] = useState<NoteDraft | null>(null);
	const [loadError, setLoadError] = useState("");
	const [saveState, setSaveState] = useState<SaveState>("saved");
	const [saveError, setSaveError] = useState("");

	// Autosave bookkeeping lives in refs: it must not trigger renders and must always see the latest values.
	const latest = useRef<NoteDraft | null>(null);
	const revision = useRef(0);
	const savedRevision = useRef(0);
	const saving = useRef(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const save = useRef<() => Promise<void>>(async () => {});

	const schedule = useCallback((delay: number) => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => void save.current(), delay);
	}, []);

	useEffect(() => {
		save.current = async () => {
			const snapshot = latest.current;
			if (!snapshot || saving.current || revision.current === savedRevision.current) return;
			const sentRevision = revision.current;
			saving.current = true;
			setSaveState("saving");
			setSaveError("");
			try {
				const saved = await api<NoteDetail>(`/api/notes/${noteId}`, {
					method: "PATCH",
					body: snapshot,
					fallback: "Your changes could not be saved.",
				});
				setNote(saved);
				setFolderId(saved.folderId);
				savedRevision.current = sentRevision;
				notifyNavigationChanged();
				if (revision.current === sentRevision) setSaveState("saved");
			} catch (cause) {
				setSaveState("failed");
				setSaveError(errorText(cause, "Your changes could not be saved."));
			} finally {
				saving.current = false;
				// The user kept typing while this request was in flight.
				if (revision.current > sentRevision) {
					setSaveState("saving");
					schedule(0);
				}
			}
		};
	}, [noteId, schedule]);

	useEffect(() => {
		let live = true;
		api<NoteDetail>(`/api/notes/${noteId}`, { fallback: "The note could not be loaded." })
			.then((loadedNote) => {
				if (!live) return;
				const loadedDraft = toDraft(loadedNote);
				latest.current = loadedDraft;
				setNote(loadedNote);
				setFolderId(loadedNote.folderId);
				setDraft(loadedDraft);
			})
			.catch((cause: unknown) => {
				if (live) setLoadError(errorText(cause, "The note could not be loaded."));
			});
		return () => {
			live = false;
			if (timer.current) clearTimeout(timer.current);
		};
	}, [noteId]);

	// The note can be moved from the sidebar; the draft never carries the folder, so a save cannot undo the move.
	useEffect(() => {
		const refresh = () =>
			void api<NoteDetail>(`/api/notes/${noteId}`)
				.then((current) => setFolderId(current.folderId))
				.catch(() => {});
		window.addEventListener("palace:notes-changed", refresh);
		return () => window.removeEventListener("palace:notes-changed", refresh);
	}, [noteId]);

	useEffect(() => {
		function onBeforeUnload(event: BeforeUnloadEvent) {
			if (revision.current === savedRevision.current) return;
			void save.current();
			event.preventDefault();
			event.returnValue = "";
		}
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, []);

	const update = useCallback(
		(patch: Partial<NoteDraft>) => {
			if (!latest.current) return;
			latest.current = { ...latest.current, ...patch };
			setDraft(latest.current);
			revision.current += 1;
			setSaveState("saving");
			schedule(SAVE_DELAY_MS);
		},
		[schedule],
	);

	/** Saves immediately if there are unsaved edits (used when focus leaves the editor). */
	const flush = useCallback(() => {
		if (revision.current === savedRevision.current) return;
		if (timer.current) clearTimeout(timer.current);
		void save.current();
	}, []);

	const retry = useCallback(() => void save.current(), []);

	/** Permanently deletes the (archived) note, discarding any pending autosave. Throws on failure. */
	const remove = useCallback(async () => {
		if (timer.current) clearTimeout(timer.current);
		await api(`/api/notes/${noteId}/permanent`, { method: "DELETE", fallback: "The note could not be deleted." });
		savedRevision.current = revision.current;
		notifyNavigationChanged();
		router.push("/?view=archived");
	}, [noteId, router]);

	return { note, folderId, draft, loadError, saveState, saveError, update, flush, retry, remove };
}
