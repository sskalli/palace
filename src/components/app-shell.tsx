"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { FoldersProvider } from "@/components/folders-context";
import { Topbar } from "@/components/topbar";
import { NoteStore } from "@/lib/note-store";
import { NoteStoreContext } from "@/components/note-store-context";
import type { NoteDetail } from "@/lib/client-types";
import { useNavigation } from "@/hooks/use-navigation";
import { api, errorText } from "@/lib/api-client";

export function AppShell({ children, email, userId }: { children: React.ReactNode; email: string; userId: string }) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const router = useRouter();
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [creatingNote, setCreatingNote] = useState(false);
	const [toast, setToast] = useState("");
	const { folders, tags, treeNotes, reload, reloadNotes, patchTreeNote, addTreeNote } = useNavigation(setToast);

	const [noteStore] = useState(() => new NoteStore(userId, api, (note, fields) => {
  window.dispatchEvent(new CustomEvent("palace:note-saved", { detail: { note, fields } }));
 }));
 useEffect(() => {
  const beforeUnload = (event: BeforeUnloadEvent) => {
   if (!noteStore.hasPending()) return;
   noteStore.flushAll(); event.preventDefault(); event.returnValue = "";
  };
  window.addEventListener("beforeunload", beforeUnload);
  return () => window.removeEventListener("beforeunload", beforeUnload);
 }, [noteStore]);

 const currentFolderId = pathname === "/" ? searchParams.get("folder") : null;

	const createNote = useCallback(
		async (targetFolderId: string | null = currentFolderId) => {
			setCreatingNote(true);
			setDrawerOpen(false);
			try {
				const note = await api<NoteDetail>("/api/notes", {
					method: "POST",
					body: targetFolderId ? { folderId: targetFolderId } : {},
				});
				noteStore.seed(note);
				// A blank note adds no tags, so the tree is patched instead of refetched.
				addTreeNote({
					id: note.id,
					title: note.title.trim() || "Untitled note",
					folderId: note.folderId,
					isPinned: note.isPinned,
				});
				router.push(`/notes/${note.id}`);
			} catch (cause) {
				setToast(errorText(cause, "The note could not be created."));
			} finally {
				setCreatingNote(false);
			}
		},
		[router, currentFolderId, addTreeNote, noteStore],
	);

	// The empty-state button asks for a new note through this event.
	useEffect(() => {
		const onRequest = () => void createNote();
		window.addEventListener("palace:new-note", onRequest);
		return () => {
			window.removeEventListener("palace:new-note", onRequest);
		};
	}, [createNote]);

	useEffect(() => {
		if (!toast) return;
		const timer = window.setTimeout(() => setToast(""), 3500);
		return () => window.clearTimeout(timer);
	}, [toast]);

	const folderId = searchParams.get("folder");
	const label = pathname.startsWith("/notes/")
		? "Note"
		: pathname === "/search"
			? "Search"
			: (folders.find((folder) => folder.id === folderId)?.name ?? "Your notes");

	return (
		<NoteStoreContext value={noteStore}><div className="app-frame">
			{drawerOpen && (
				<button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} />
			)}
			<Sidebar
				email={email}
				folders={folders}
				tags={tags}
				treeNotes={treeNotes}
				drawerOpen={drawerOpen}
				creatingNote={creatingNote}
				onCloseDrawer={() => setDrawerOpen(false)}
				onNewNote={(folderId) => void createNote(folderId)}
				onFoldersChanged={reload}
				onNotesChanged={reloadNotes}
				onTreeNotePatched={patchTreeNote}
				onError={setToast}
			/>
			<main className="main-area">
				<Topbar label={label} onOpenDrawer={() => setDrawerOpen(true)} />
				<FoldersProvider value={folders}>{children}</FoldersProvider>
				{toast && (
					<div role="alert" className="toast-error">
						{toast}
					</div>
				)}
			</main>
		</div></NoteStoreContext>
	);
}
