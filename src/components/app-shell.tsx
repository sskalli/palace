"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { FoldersProvider } from "@/components/folders-context";
import { Topbar } from "@/components/topbar";
import { useNavigation } from "@/hooks/use-navigation";
import { api, errorText, notifyNavigationChanged } from "@/lib/api-client";

const TEXT_FIELDS = ["INPUT", "TEXTAREA", "SELECT"];

export function AppShell({ children, email }: { children: React.ReactNode; email: string }) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const router = useRouter();
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [creatingNote, setCreatingNote] = useState(false);
	const [toast, setToast] = useState("");
	const { folders, tags, treeNotes, reload, reloadNotes, patchTreeNote } = useNavigation(setToast);

	const currentFolderId = pathname === "/" ? searchParams.get("folder") : null;

	const createNote = useCallback(
		async (targetFolderId: string | null = currentFolderId) => {
			setCreatingNote(true);
			try {
				const note = await api<{ id: string }>("/api/notes", {
					method: "POST",
					body: targetFolderId ? { folderId: targetFolderId } : {},
				});
				notifyNavigationChanged();
				router.push(`/notes/${note.id}`);
			} catch (cause) {
				setToast(errorText(cause, "The note could not be created."));
			} finally {
				setCreatingNote(false);
			}
		},
		[router, currentFolderId],
	);

	// "n" and the empty-state button both create a note.
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.metaKey || event.ctrlKey || event.key.toLowerCase() !== "n") return;
			if (event.target instanceof HTMLElement && TEXT_FIELDS.includes(event.target.tagName)) return;
			event.preventDefault();
			void createNote();
		}
		const onRequest = () => void createNote();
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("palace:new-note", onRequest);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
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
		<div className="app-frame">
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
		</div>
	);
}
