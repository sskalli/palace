"use client";

import Link from "next/link";
import { useNotesList, type NotesFilter } from "@/hooks/use-notes-list";
import { FolderCard } from "@/components/folder-card";
import { useFolders } from "@/components/folders-context";
import { NoteCard } from "@/components/note-card";
import { Modal } from "@/components/modal";
import { api, errorText, requestNewNote } from "@/lib/api-client";
import { folderPath } from "@/lib/folder-tree";
import type { NoteSummary } from "@/lib/client-types";
import { useState } from "react";

const HEADINGS = {
	all: ["All notes", "Everything you have collected, in one place."],
	pinned: ["Pinned notes", "The notes you want close at hand."],
	archived: ["Archived", "Notes set aside, still here when you need them."],
};

function EmptyState({ view, tag, inFolder }: Pick<NotesFilter, "view" | "tag"> & { inFolder: boolean }) {
	const [title, message] = inFolder
		? ["This folder is empty", "Create a note here, drag notes in from the sidebar, or add a subfolder."]
		: view === "archived"
			? ["Nothing archived", "When you archive a note, it will be tucked away here."]
			: view === "pinned"
				? ["No pinned notes yet", "Capture an idea, a reminder, or anything you want to remember."]
				: tag
					? ["No notes with this tag", "Add this tag to a note and it will show up here."]
					: [
							"A little room for a new thought",
							"Capture an idea, a reminder, or anything you want to remember.",
						];

	return (
		<div className="empty-state">
			<div className="empty-icon">✧</div>
			<h2>{title}</h2>
			<p>{message}</p>
			{view !== "archived" && (
				<button className="primary-button" onClick={requestNewNote}>
					＋ Create a note
				</button>
			)}
		</div>
	);
}

export function NotesPage(filter: NotesFilter) {
	const { view, tag, folderId } = filter;
	const { notes, error, loading, loadingMore, hasMore, loadMore, removeNote } = useNotesList(filter);
	const folders = useFolders();
	const [noteToDelete, setNoteToDelete] = useState<NoteSummary | null>(null);
	const [deleteError, setDeleteError] = useState("");
	const [title, subtitle] = HEADINGS[view];

	const path = folderPath(folders, folderId);
	const folder = path[path.length - 1] ?? null;
	const subfolders = folderId ? folders.filter((candidate) => candidate.parentId === folderId) : [];
	const heading = tag ? `# ${tag}` : (folder?.name ?? title);
	const description = tag ? `Notes tagged “${tag}”.` : folder ? "Subfolders and notes in this folder." : subtitle;

	async function deleteNote() {
		if (!noteToDelete) return;
		try {
			await api(`/api/notes/${noteToDelete.id}/permanent`, { method: "DELETE" });
			removeNote(noteToDelete.id);
			setNoteToDelete(null);
			setDeleteError("");
		} catch (cause) {
			setDeleteError(errorText(cause, "The note could not be deleted."));
		}
	}

	return (
		<div className="content-wrap">
			<div className="page-heading">
				<div>
					<div className="eyebrow breadcrumb">
						{folder ? (
							<>
								<Link href="/">Your workspace</Link>
								{path.slice(0, -1).map((ancestor) => (
									<span key={ancestor.id}>
										{" / "}
										<Link href={`/?view=all&folder=${encodeURIComponent(ancestor.id)}`}>
											{ancestor.name}
										</Link>
									</span>
								))}
							</>
						) : (
							`Your workspace${tag ? ` · #${tag}` : ""}`
						)}
					</div>
					<h1 className="page-title">{heading}</h1>
					<p className="page-subtitle">{description}</p>
				</div>
				<span className="count-label">
					{!loading && `${notes.length} ${notes.length === 1 ? "note" : "notes"}`}
				</span>
			</div>

			{error && (
				<div className="message-error" role="alert">
					{error}
				</div>
			)}
			{!loading && subfolders.length > 0 && (
				<section className="list-section">
					<h2 className="list-section-title">Folders</h2>
					<div className="note-list">
						{subfolders.map((subfolder) => (
							<FolderCard
								key={subfolder.id}
								folder={subfolder}
								subfolderCount={
									folders.filter((candidate) => candidate.parentId === subfolder.id).length
								}
							/>
						))}
					</div>
				</section>
			)}
			{loading ? (
				<div className="note-list" aria-label="Loading notes">
					<div className="skeleton" />
					<div className="skeleton" />
				</div>
			) : notes.length ? (
				<section className="list-section">
					{subfolders.length > 0 && <h2 className="list-section-title">Notes</h2>}
					<div className="note-list">
						{notes.map((note) => (
							<NoteCard
								key={note.id}
								note={note}
								onDelete={view === "archived" ? () => setNoteToDelete(note) : undefined}
							/>
						))}
					</div>
				</section>
			) : (
				!error &&
				(subfolders.length === 0 ? (
					<EmptyState view={view} tag={tag} inFolder={Boolean(folder)} />
				) : (
					<section className="list-section">
						<h2 className="list-section-title">Notes</h2>
						<div className="section-empty">
							<p className="muted-text">No notes directly in this folder yet.</p>
							{view !== "archived" && (
								<button className="primary-button" onClick={requestNewNote}>
									＋ Create a note
								</button>
							)}
						</div>
					</section>
				))
			)}

			{hasMore && notes.length > 0 && (
				<div className="load-more">
					<button className="text-button" onClick={() => void loadMore()} disabled={loadingMore}>
						{loadingMore ? "Loading…" : "Load more notes"}
					</button>
				</div>
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
		</div>
	);
}
