"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useNoteStore } from "@/components/note-store-context";
import { signOut } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import {
	ArchiveIcon,
	CollapseFoldersIcon,
	DownloadIcon,
	NotesIcon,
	PinIcon,
	PlusIcon,
	SignOutIcon,
} from "@/components/icons";
import { ContextMenu } from "@/components/context-menu";
import { FolderDialogs, type FolderDialog } from "@/components/folder-dialogs";
import { FolderTree } from "@/components/folder-tree";
import { Modal } from "@/components/modal";
import packageInfo from "../../package.json";
const { version } = packageInfo;
import { api, errorText } from "@/lib/api-client";
import { downloadMarkdownExport } from "@/lib/download-export";
import { descendantIds, isSameOrDescendant } from "@/lib/folder-tree";
import type { FolderSummary, TagSummary, TreeNote } from "@/lib/client-types";

interface SidebarProps {
	email: string;
	folders: FolderSummary[];
	tags: TagSummary[];
	treeNotes: TreeNote[];
	drawerOpen: boolean;
	creatingNote: boolean;
	onCloseDrawer: () => void;
	/** Creates a note in the given folder (none when null); without an argument it goes in the folder being viewed. */
	onNewNote: (folderId?: string | null) => void;
	onFoldersChanged: () => Promise<void>;
	onFolderPatched: (folder: FolderSummary) => void;
	onFolderRemoved: (id: string) => void;
	/** Reloads notes and tags only (folders are untouched). */
	onNotesChanged: () => Promise<void>;
	/** Applies a confirmed change to one sidebar note without refetching. */
	onTreeNotePatched: (id: string, patch: Partial<TreeNote>) => void;
	onError: (message: string) => void;
}

function NavLink({ href, active, icon, label }: { href: string; active: boolean; icon: ReactNode; label: string }) {
	return (
		<Link className={`nav-link${active ? " active" : ""}`} href={href}>
			<span className="nav-icon">{icon}</span>
			<span className="nav-label">{label}</span>
		</Link>
	);
}

export function Sidebar({
	email,
	folders,
	tags,
	treeNotes,
	drawerOpen,
	creatingNote,
	onCloseDrawer,
	onNewNote,
	onFoldersChanged,
	onFolderPatched,
	onFolderRemoved,
	onNotesChanged,
	onTreeNotePatched,
	onError,
}: SidebarProps) {
	const store = useNoteStore();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const router = useRouter();
	const [menu, setMenu] = useState<{ folder: FolderSummary; anchor: DOMRect } | null>(null);
	const [noteMenu, setNoteMenu] = useState<{ note: TreeNote; anchor: DOMRect } | null>(null);
	const [noteToDelete, setNoteToDelete] = useState<TreeNote | null>(null);
	const [deleteError, setDeleteError] = useState("");
	const [dragging, setDragging] = useState(false);
	const [dialog, setDialog] = useState<FolderDialog | null>(null);
	const [downloading, setDownloading] = useState(false);
	const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});
	const setOpen = (id: string, open: boolean) => setOpenOverrides((current) => ({ ...current, [id]: open }));

	// Keeps the sidebar open while dragging, since the pointer-hover that expands it is lost mid-drag.
	useEffect(() => {
		const start = () => setDragging(true);
		const end = () => setDragging(false);
		document.addEventListener("dragstart", start);
		document.addEventListener("dragend", end);
		document.addEventListener("drop", end);
		return () => {
			document.removeEventListener("dragstart", start);
			document.removeEventListener("dragend", end);
			document.removeEventListener("drop", end);
		};
	}, []);

	const view = searchParams.get("view") ?? "all";
	const folderId = searchParams.get("folder");
	const tag = searchParams.get("tag");
	const onNotesPage = pathname === "/";

	async function download(selector = "", noteIds: string[] | null = null, folderIds?: ReadonlySet<string>) {
		if (downloading) return;
		setDownloading(true);
		try {
			await downloadMarkdownExport(store, noteIds, selector, folderIds);
		} catch (cause) {
			onError(errorText(cause, "The notes could not be downloaded."));
		} finally {
			setDownloading(false);
		}
	}

	async function moveFolder(folder: FolderSummary, parentId: string | null) {
		try {
			const saved = await api<FolderSummary>(`/api/folders/${folder.id}`, {
				method: "PATCH",
				body: { parentId },
			});
			onFolderPatched({ ...folder, ...saved });
		} catch (cause) {
			onError(errorText(cause, "The folder could not be moved."));
		}
	}

	async function moveNote(noteId: string, folderId: string | null) {
		try {
			await api(`/api/notes/${noteId}`, { method: "PATCH", body: { folderId } });
			onTreeNotePatched(noteId, { folderId });
			store.patch(noteId, { folderId });
			window.dispatchEvent(
				new CustomEvent("palace:notes-changed", {
					detail: {
						noteId,
						folderId,
						previousFolderId: treeNotes.find((note) => note.id === noteId)?.folderId,
					},
				}),
			);
		} catch (cause) {
			onError(errorText(cause, "The note could not be moved."));
		}
	}

	async function updateNote(note: TreeNote, body: { isPinned?: boolean; archived?: boolean }, fallback: string) {
		try {
			await api(`/api/notes/${note.id}`, { method: "PATCH", body });
			store.patch(note.id, {
				...(body.isPinned !== undefined ? { isPinned: body.isPinned } : {}),
				...(body.archived !== undefined ? { archivedAt: body.archived ? new Date().toISOString() : null } : {}),
			});
			window.dispatchEvent(
				new CustomEvent("palace:note-saved", { detail: { note: { ...note, ...body }, fields: body } }),
			);
			window.dispatchEvent(new CustomEvent("palace:notes-changed", { detail: { noteId: note.id } }));
		} catch (cause) {
			onError(errorText(cause, fallback));
		}
	}

	// Only archived notes can be deleted permanently, so the note is archived first.
	async function deleteNote() {
		if (!noteToDelete) return;
		try {
			await store.flush(noteToDelete.id);
			if (store.get(noteToDelete.id)?.saveState === "failed")
				throw new Error("Save your changes before deleting this note.");
			await api(`/api/notes/${noteToDelete.id}`, { method: "PATCH", body: { archived: true } });
			await api(`/api/notes/${noteToDelete.id}/permanent`, { method: "DELETE" });
		} catch (cause) {
			setDeleteError(errorText(cause, "The note could not be deleted."));
			return;
		}
		window.dispatchEvent(
			new CustomEvent("palace:note-saved", { detail: { note: noteToDelete, fields: { archived: true } } }),
		);
		const deletedId = noteToDelete.id;
		store.remove(deletedId);
		setNoteToDelete(null);
		setDeleteError("");
		await onNotesChanged();
		window.dispatchEvent(new CustomEvent("palace:notes-changed"));
		if (pathname === `/notes/${deletedId}`) router.push("/");
	}

	return (
		<>
			<aside
				className={`sidebar${drawerOpen ? " open" : ""}${menu || noteMenu || dragging ? " expanded" : ""}`}
				aria-label="Main navigation"
				onClick={(event) => {
					if (event.target instanceof Element && event.target.closest("a")) onCloseDrawer();
				}}
			>
				<div className="brand">
					<span className="brand-mark" title={`Palace v${version}`}>
						🧠
					</span>
					<span className="brand-name">palace</span>
					<button className="mobile-close" aria-label="Close navigation" onClick={onCloseDrawer}>
						×
					</button>
				</div>
				<button
					className="primary-button new-note-button"
					onClick={() => onNewNote(null)}
					disabled={creatingNote}
				>
					<PlusIcon />
					<span className="nav-label">New note</span>
				</button>

				<div className="nav-section">
					<span className="nav-label">Workspace</span>
				</div>
				<nav className="nav-list">
					<NavLink
						href="/"
						active={onNotesPage && view === "all" && !folderId && !tag}
						icon={<NotesIcon />}
						label="All notes"
					/>
					<NavLink
						href="/?view=pinned"
						active={onNotesPage && view === "pinned"}
						icon={<PinIcon />}
						label="Pinned"
					/>
					<NavLink
						href="/?view=archived"
						active={onNotesPage && view === "archived"}
						icon={<ArchiveIcon />}
						label="Archived"
					/>
				</nav>

				<FolderTree
					folders={folders}
					notes={treeNotes}
					activeFolderId={onNotesPage ? folderId : null}
					activeNoteId={pathname.startsWith("/notes/") ? pathname.slice("/notes/".length) : null}
					menuFolderId={menu?.folder.id ?? null}
					onOpenMenu={(folder, anchor) => setMenu({ folder, anchor })}
					menuNoteId={noteMenu?.note.id ?? null}
					onOpenNoteMenu={(note, anchor) => setNoteMenu({ note, anchor })}
					onMove={(folder, parentId) => void moveFolder(folder, parentId)}
					onMoveNote={(noteId, folderId) => void moveNote(noteId, folderId)}
					openOverrides={openOverrides}
					setOpen={setOpen}
					header={
						<div className="nav-section nav-section-folders">
							<span className="nav-label">Folders</span>
							<div className="folder-header-actions">
								<button
									className="tiny-action"
									title="Collapse all folders"
									aria-label="Collapse all folders"
									onClick={() =>
										setOpenOverrides(
											Object.fromEntries(folders.map((folder) => [folder.id, false])),
										)
									}
								>
									<CollapseFoldersIcon size={14} />
								</button>
								<button
									className="tiny-action"
									title="Create folder"
									aria-label="Create folder"
									onClick={() => setDialog({ kind: "create" })}
								>
									<PlusIcon size={14} />
								</button>
							</div>
						</div>
					}
				/>

				<div className="nav-section nav-section-tags">
					<span className="nav-label">Tags</span>
				</div>
				<div className="tag-list">
					{tags.map((item) => (
						<Link
							key={item.id}
							className={`tag-chip${tag === item.normalizedName ? " active" : ""}`}
							href={`/?view=all&tag=${encodeURIComponent(item.normalizedName)}`}
						>
							{item.name}
						</Link>
					))}
					{tags.length === 0 && <span className="muted-text">Add tags from a note</span>}
				</div>

				<div className="sidebar-spacer" />
				<div className="sidebar-bottom">
					<button className="nav-action" disabled={downloading} onClick={() => void download()}>
						<span className="nav-icon">
							<DownloadIcon />
						</span>
						<span className="nav-label">Export Markdown</span>
					</button>
					<button
						className="nav-action"
						onClick={() =>
							void (async () => {
								await store.flushAll();
								store.dispose();
								await signOut({ redirectTo: "/login" });
							})()
						}
					>
						<span className="nav-icon">
							<SignOutIcon />
						</span>
						<span className="nav-label">Sign out</span>
					</button>
					<div className="user-panel">
						<span className="avatar">{email.slice(0, 1).toLocaleUpperCase() || "P"}</span>
						<span className="user-copy">
							<span className="user-email">{email}</span>
						</span>
					</div>
				</div>
			</aside>

			{menu && (
				<ContextMenu
					anchor={menu.anchor}
					onClose={() => setMenu(null)}
					items={[
						{ label: "New note", onSelect: () => onNewNote(menu.folder.id) },
						{
							label: "New subfolder",
							onSelect: () => {
								setOpen(menu.folder.id, true);
								setDialog({ kind: "create", parent: menu.folder });
							},
						},
						{ label: "Rename", onSelect: () => setDialog({ kind: "rename", folder: menu.folder }) },
						{
							label: "Download folder",
							onSelect: () => {
								const ids = new Set([menu.folder.id, ...descendantIds(folders, menu.folder.id)]);
								void download(`?folderId=${encodeURIComponent(menu.folder.id)}`, null, ids);
							},
						},
						{
							label: "Delete",
							danger: true,
							onSelect: () =>
								setDialog({
									kind: "delete",
									folder: menu.folder,
									subfolderCount: descendantIds(folders, menu.folder.id).length,
								}),
						},
					]}
				/>
			)}
			{noteMenu && (
				<ContextMenu
					anchor={noteMenu.anchor}
					onClose={() => setNoteMenu(null)}
					items={[
						{
							label: "Download Markdown",
							onSelect: () =>
								void download(`?noteId=${encodeURIComponent(noteMenu.note.id)}`, [noteMenu.note.id]),
						},
						{
							label: noteMenu.note.isPinned ? "Unpin" : "Pin",
							onSelect: () =>
								void updateNote(
									noteMenu.note,
									{ isPinned: !noteMenu.note.isPinned },
									"The note could not be updated.",
								),
						},
						{
							label: "Archive",
							onSelect: () =>
								void updateNote(noteMenu.note, { archived: true }, "The note could not be archived."),
						},
						{ label: "Delete", danger: true, onSelect: () => setNoteToDelete(noteMenu.note) },
					]}
				/>
			)}
			{noteToDelete && (
				<Modal
					title="Delete note permanently?"
					description={`“${noteToDelete.title}” will be permanently deleted and cannot be recovered.`}
					errorMessage={deleteError}
					confirmLabel="Delete permanently"
					danger
					onConfirm={deleteNote}
					onClose={() => {
						setNoteToDelete(null);
						setDeleteError("");
					}}
				/>
			)}
			<FolderDialogs
				dialog={dialog}
				onClose={() => setDialog(null)}
				onChanged={onFoldersChanged}
				onUpsert={onFolderPatched}
				onRemove={onFolderRemoved}
				onRecover={setDialog}
				onError={onError}
				onDeleted={(folder) => {
					if (folderId && isSameOrDescendant(folders, folderId, folder.id)) router.push("/");
				}}
			/>
		</>
	);
}
