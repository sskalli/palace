"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { FoldersProvider } from "@/components/folders-context";
import { Topbar } from "@/components/topbar";
import { NoteStore } from "@/lib/note-store";
import { NoteStoreContext } from "@/components/note-store-context";
import { NoteEditor } from "@/components/note-editor";
import { useNavigation } from "@/hooks/use-navigation";
import { api } from "@/lib/api-client";

export function AppShell({ children, email, userId }: { children: React.ReactNode; email: string; userId: string }) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const router = useRouter();
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [openingNote, setOpeningNote] = useState<string | null>(null);

	const [toast, setToast] = useState("");
	const { folders, tags, treeNotes, reload, reloadNotes, patchTreeNote, addTreeNote, upsertFolder, removeFolder } =
		useNavigation(setToast);

	const [noteStore] = useState(
		() =>
			new NoteStore(userId, api, (note, fields) => {
				window.dispatchEvent(new CustomEvent("palace:note-saved", { detail: { note, fields } }));
			}),
	);
	useEffect(() => {
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (!noteStore.hasPending()) return;
			noteStore.flushAll();
			event.preventDefault();
			event.returnValue = "";
		};
		const invalidate = () => noteStore.invalidateLists();
		window.addEventListener("palace:notes-changed", invalidate);
		window.addEventListener("beforeunload", beforeUnload);
		return () => {
			window.removeEventListener("beforeunload", beforeUnload);
			window.removeEventListener("palace:notes-changed", invalidate);
		};
	}, [noteStore]);

	useEffect(() => {
		for (const { note, draft, creating } of noteStore.restoreDrafts()) {
			addTreeNote({
				id: note.id,
				title: draft.title.trim() || "Untitled note",
				folderId: note.folderId,
				isPinned: draft.isPinned,
				pending: creating,
			});
		}
	}, [noteStore, addTreeNote]);

	const currentFolderId = pathname === "/" ? searchParams.get("folder") : null;

	const createNote = useCallback(
		(targetFolderId: string | null = currentFolderId) => {
			setDrawerOpen(false);
			const folder = folders.find((folder) => folder.id === targetFolderId);
			const id = noteStore.create(targetFolderId, folder ? { id: folder.id, name: folder.name } : null);
			addTreeNote({ id, pending: true, title: "Untitled note", folderId: targetFolderId, isPinned: false });
			setOpeningNote(id);
			router.push(`/notes/${id}`);
		},
		[router, currentFolderId, addTreeNote, noteStore, folders],
	);
	useEffect(() => {
		setOpeningNote(null);
	}, [pathname]);

	// The empty-state button asks for a new note through this event.
	useEffect(() => {
		const onRequest = () => void createNote();
		const onOpen = (event: Event) => setOpeningNote((event as CustomEvent<string>).detail);
		window.addEventListener("palace:new-note", onRequest);
		window.addEventListener("palace:open-note", onOpen);
		return () => {
			window.removeEventListener("palace:new-note", onRequest);
			window.removeEventListener("palace:open-note", onOpen);
		};
	}, [createNote]);

	useEffect(() => {
		if (!toast) return;
		const timer = window.setTimeout(() => setToast(""), 3500);
		return () => window.clearTimeout(timer);
	}, [toast]);

	const folderId = searchParams.get("folder");
	const activeNoteId = openingNote ?? (pathname.startsWith("/notes/") ? pathname.split("/")[2] : null);
	const label = activeNoteId
		? "Note"
		: pathname === "/search"
			? "Search"
			: (folders.find((folder) => folder.id === folderId)?.name ?? "Your notes");

	return (
		<NoteStoreContext value={noteStore}>
			<div className="app-frame">
				{drawerOpen && (
					<button
						className="sidebar-scrim"
						aria-label="Close navigation"
						onClick={() => setDrawerOpen(false)}
					/>
				)}
				<Sidebar
					email={email}
					folders={folders}
					tags={tags}
					treeNotes={treeNotes}
					drawerOpen={drawerOpen}
					creatingNote={false}
					onCloseDrawer={() => setDrawerOpen(false)}
					onNewNote={(folderId) => void createNote(folderId)}
					onFoldersChanged={reload}
					onFolderPatched={upsertFolder}
					onFolderRemoved={removeFolder}
					onNotesChanged={reloadNotes}
					onTreeNotePatched={patchTreeNote}
					onError={setToast}
				/>
				<main className="main-area">
					<Topbar label={label} onOpenDrawer={() => setDrawerOpen(true)} />
					<FoldersProvider value={folders}>
						{activeNoteId ? <NoteEditor key={activeNoteId} noteId={activeNoteId} /> : children}
					</FoldersProvider>
					{toast && (
						<div role="alert" className="toast-error">
							{toast}
						</div>
					)}
				</main>
			</div>
		</NoteStoreContext>
	);
}
