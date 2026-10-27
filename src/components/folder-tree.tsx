"use client";

import Link from "next/link";
import { useNoteStore } from "@/components/note-store-context";
import { useMemo, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { ChevronIcon, FolderIcon, NotesIcon } from "@/components/icons";
import { NOTE_DRAG_TYPE, type FolderSummary, type TreeNote } from "@/lib/client-types";
import { buildFolderTree, folderPath, isSameOrDescendant, type FolderNode } from "@/lib/folder-tree";

interface FolderTreeProps {
	folders: FolderSummary[];
	notes: TreeNote[];
	activeFolderId: string | null;
	activeNoteId: string | null;
	/** The folder whose context menu is open, if any. */
	menuFolderId: string | null;
	onOpenMenu: (folder: FolderSummary, anchor: DOMRect) => void;
	/** The note whose menu is open, if any. */
	menuNoteId: string | null;
	onOpenNoteMenu: (note: TreeNote, anchor: DOMRect) => void;
	/** Moves a folder under `parentId` (or to the top level when null). */
	onMove: (folder: FolderSummary, parentId: string | null) => void;
	/** Moves a note into `folderId` (or unfiles it when null). */
	onMoveNote: (noteId: string, folderId: string | null) => void;
	/** Rendered above the tree; dropping a folder on it moves the folder to the top level. */
	header: ReactNode;
	/** Explicit expand/collapse choices; folders without one are open only when they lead to the current folder or note. */
	openOverrides: Record<string, boolean>;
	setOpen: (folderId: string, open: boolean) => void;
}

const ROOT = "root";

export function FolderTree({
	folders,
	notes,
	activeFolderId,
	activeNoteId,
	menuFolderId,
	onOpenMenu,
	menuNoteId,
	onOpenNoteMenu,
	onMove,
	onMoveNote,
	header,
	openOverrides,
	setOpen,
}: FolderTreeProps) {
 const store = useNoteStore();
	// Explicit user choices; folders without one are open only when they lead to the current folder or note.
	const [dragged, setDragged] = useState<FolderSummary | null>(null);
	const [dropTarget, setDropTarget] = useState<string | null>(null);

	const tree = useMemo(() => buildFolderTree(folders), [folders]);
	const notesByFolder = useMemo(() => {
		const grouped = new Map<string, TreeNote[]>();
		for (const note of notes) {
			if (note.folderId) {
    const group = grouped.get(note.folderId) ?? [];
    group.push(note);
    grouped.set(note.folderId, group);
   }
		}
		return grouped;
	}, [notes]);
	const rootNotes = useMemo(() => notes.filter((note) => !note.folderId), [notes]);
	const openByDefault = useMemo(() => {
		const activeNoteFolder = notes.find((note) => note.id === activeNoteId)?.folderId ?? null;
		return new Set(
			[...folderPath(folders, activeFolderId), ...folderPath(folders, activeNoteFolder)].map(
				(folder) => folder.id,
			),
		);
	}, [folders, notes, activeFolderId, activeNoteId]);

	const isOpen = (id: string) => openOverrides[id] ?? openByDefault.has(id);

	const isNoteDrag = (event: DragEvent) => event.dataTransfer.types.includes(NOTE_DRAG_TYPE);

	function canDrop(targetId: string | null): boolean {
		if (!dragged || targetId === dragged.id) return false;
		if (targetId === null) return dragged.parentId !== null;
		return dragged.parentId !== targetId && !isSameOrDescendant(folders, targetId, dragged.id);
	}

	function endDrag() {
		setDragged(null);
		setDropTarget(null);
	}

	function dragOver(event: DragEvent, targetId: string | null) {
		event.stopPropagation();
		if (isNoteDrag(event)) {
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
			setDropTarget(targetId ?? ROOT);
			return;
		}
		if (!canDrop(targetId)) {
			setDropTarget(null);
			return;
		}
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		setDropTarget(targetId ?? ROOT);
	}

	function drop(event: DragEvent, targetId: string | null) {
		event.stopPropagation();
		if (isNoteDrag(event)) {
			event.preventDefault();
			const noteId = event.dataTransfer.getData(NOTE_DRAG_TYPE);
			endDrag();
			if (!noteId) return;
			if (targetId) setOpen(targetId, true);
			onMoveNote(noteId, targetId);
			return;
		}
		const folder = dragged;
		const allowed = canDrop(targetId);
		endDrag();
		if (!folder || !allowed) return;
		event.preventDefault();
		if (targetId) setOpen(targetId, true);
		onMove(folder, targetId);
	}

	function contextMenu(event: MouseEvent, folder: FolderSummary) {
		event.preventDefault();
		onOpenMenu(folder, new DOMRect(event.clientX, event.clientY, 0, 0));
	}

	function renderNote(note: TreeNote, depth: number) {
		return (
			<div
				className={`folder-row tree-note-row${depth >= 0 ? " nested" : ""}${menuNoteId === note.id ? " menu-open" : ""}`}
				style={{ "--depth": depth } as React.CSSProperties}
				key={note.id}
				draggable
				onDragStart={(event) => {
					event.stopPropagation();
					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData(NOTE_DRAG_TYPE, note.id);
				}}
				onDragEnd={endDrag}
				onContextMenu={(event) => {
					event.preventDefault();
					onOpenNoteMenu(note, new DOMRect(event.clientX, event.clientY, 0, 0));
				}}
			>
				<Link
					className={`nav-link tree-note${activeNoteId === note.id ? " active" : ""}`}
					href={`/notes/${note.id}`}
 onMouseEnter={() => store.prefetch(note.id)}
 onFocus={() => store.prefetch(note.id)}
				>
					<span className="nav-icon">
						<NotesIcon size={depth >= 0 ? 14 : undefined} />
					</span>
					<span className="nav-label">{note.title}</span>
				</Link>
				<div className="folder-tools">
					<button
						className="tiny-action"
						aria-label={`Note options for ${note.title}`}
						aria-haspopup="menu"
						title="Note options"
						onClick={(event) => onOpenNoteMenu(note, event.currentTarget.getBoundingClientRect())}
					>
						···
					</button>
				</div>
			</div>
		);
	}

	function renderBranch(node: FolderNode<FolderSummary>, depth: number) {
		const open = isOpen(node.id);
		const folderNotes = notesByFolder.get(node.id) ?? [];
		const expandable = node.children.length > 0 || folderNotes.length > 0;
		const classes = [
			"folder-row",
			depth > 0 ? "nested" : "",
			menuFolderId === node.id ? "menu-open" : "",
			dropTarget === node.id ? "drop-target" : "",
			dragged?.id === node.id ? "dragging" : "",
		];

		return (
			<div key={node.id}>
				<div
					className={classes.filter(Boolean).join(" ")}
					style={{ "--depth": depth } as React.CSSProperties}
					draggable
					onDragStart={(event) => {
						event.stopPropagation();
						event.dataTransfer.effectAllowed = "move";
						event.dataTransfer.setData("text/plain", node.name);
						setDragged(node);
					}}
					onDragEnd={endDrag}
					onDragOver={(event) => dragOver(event, node.id)}
					onDrop={(event) => drop(event, node.id)}
					onContextMenu={(event) => contextMenu(event, node)}
				>
					<button
						className={`tree-toggle${expandable ? "" : " empty"}`}
						aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
						aria-expanded={expandable ? open : undefined}
						tabIndex={expandable ? 0 : -1}
						onClick={() => expandable && setOpen(node.id, !open)}
					>
						<ChevronIcon size={13} />
					</button>
					<Link
						className={`nav-link${activeFolderId === node.id ? " active" : ""}`}
						href={`/?view=all&folder=${encodeURIComponent(node.id)}`}
						onClick={() => setOpen(node.id, true)}
					>
						<span className="nav-icon">
							<FolderIcon />
						</span>
						<span className="nav-label">{node.name}</span>
					</Link>
					<div className="folder-tools">
						<button
							className="tiny-action"
							aria-label={`Folder options for ${node.name}`}
							aria-haspopup="menu"
							title="Folder options"
							onClick={(event) => onOpenMenu(node, event.currentTarget.getBoundingClientRect())}
						>
							···
						</button>
					</div>
				</div>
				{open && (
					<>
						{node.children.map((child) => renderBranch(child, depth + 1))}
						{folderNotes.map((note) => renderNote(note, depth))}
					</>
				)}
			</div>
		);
	}

	return (
		<div
			className={`folder-tree${dropTarget === ROOT ? " drop-target" : ""}`}
			onDragOver={(event) => dragOver(event, null)}
			onDrop={(event) => drop(event, null)}
			onDragLeave={(event) => {
				if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
					setDropTarget(null);
				}
			}}
		>
			{header}
			<nav className="nav-list">
				{tree.map((node) => renderBranch(node, 0))}
				{rootNotes.map((note) => renderNote(note, -1))}
				{folders.length === 0 && rootNotes.length === 0 && (
					<span className="muted-text folder-empty">No folders yet</span>
				)}
			</nav>
		</div>
	);
}
