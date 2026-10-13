"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, type ReactNode } from "react";
import { ArchiveIcon, DownloadIcon, FolderIcon, NotesIcon, PinIcon, PlusIcon, SignOutIcon } from "@/components/icons";
import { ContextMenu } from "@/components/context-menu";
import { FolderDialogs, type FolderDialog } from "@/components/folder-dialogs";
import type { FolderSummary, TagSummary } from "@/lib/client-types";

interface SidebarProps {
	email: string;
	folders: FolderSummary[];
	tags: TagSummary[];
	drawerOpen: boolean;
	creatingNote: boolean;
	onCloseDrawer: () => void;
	onNewNote: () => void;
	onFoldersChanged: () => Promise<void>;
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
	drawerOpen,
	creatingNote,
	onCloseDrawer,
	onNewNote,
	onFoldersChanged,
	onError,
}: SidebarProps) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const router = useRouter();
	const [menu, setMenu] = useState<{ folder: FolderSummary; anchor: DOMRect } | null>(null);
	const [dialog, setDialog] = useState<FolderDialog | null>(null);

	const view = searchParams.get("view") ?? "all";
	const folderId = searchParams.get("folder");
	const tag = searchParams.get("tag");
	const onNotesPage = pathname === "/";

	return (
		<>
			<aside
				className={`sidebar${drawerOpen ? " open" : ""}${menu ? " expanded" : ""}`}
				aria-label="Main navigation"
				onClick={(event) => {
					if (event.target instanceof Element && event.target.closest("a")) onCloseDrawer();
				}}
			>
				<div className="brand">
					<span className="brand-mark" aria-hidden="true">
						🧠
					</span>
					<span className="brand-name">palace</span>
					<button className="mobile-close" aria-label="Close navigation" onClick={onCloseDrawer}>
						×
					</button>
				</div>
				<button className="primary-button new-note-button" onClick={onNewNote} disabled={creatingNote}>
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

				<div className="nav-section nav-section-folders">
					<span className="nav-label">Folders</span>
					<button
						className="tiny-action"
						title="Create folder"
						aria-label="Create folder"
						onClick={() => setDialog({ kind: "create" })}
					>
						<PlusIcon size={14} />
					</button>
				</div>
				<nav className="nav-list">
					{folders.map((folder) => (
						<div
							className={`folder-row${menu?.folder.id === folder.id ? " menu-open" : ""}`}
							key={folder.id}
						>
							<NavLink
								href={`/?view=all&folder=${encodeURIComponent(folder.id)}`}
								active={folderId === folder.id}
								icon={<FolderIcon />}
								label={folder.name}
							/>
							<div className="folder-tools">
								<button
									className="tiny-action"
									aria-label={`Folder options for ${folder.name}`}
									aria-haspopup="menu"
									title="Folder options"
									onClick={(event) =>
										setMenu({ folder, anchor: event.currentTarget.getBoundingClientRect() })
									}
								>
									···
								</button>
							</div>
						</div>
					))}
					{folders.length === 0 && <span className="muted-text folder-empty">No folders yet</span>}
				</nav>

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
					<a className="nav-link" href="/api/export/markdown">
						<span className="nav-icon">
							<DownloadIcon />
						</span>
						<span className="nav-label">Export Markdown</span>
					</a>
					<button className="nav-action" onClick={() => void signOut({ redirectTo: "/login" })}>
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
						{ label: "Rename", onSelect: () => setDialog({ kind: "rename", folder: menu.folder }) },
						{
							label: "Delete",
							danger: true,
							onSelect: () => setDialog({ kind: "delete", folder: menu.folder }),
						},
					]}
				/>
			)}
			<FolderDialogs
				dialog={dialog}
				onClose={() => setDialog(null)}
				onChanged={onFoldersChanged}
				onError={onError}
				onDeleted={(folder) => {
					if (folderId === folder.id) router.push("/");
				}}
			/>
		</>
	);
}
