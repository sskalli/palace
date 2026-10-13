"use client";

import { useNotesList, type NotesFilter } from "@/hooks/use-notes-list";
import { NoteCard } from "@/components/note-card";
import { requestNewNote } from "@/lib/api-client";

const HEADINGS = {
	all: ["All notes", "Everything you have collected, in one place."],
	pinned: ["Pinned notes", "The notes you want close at hand."],
	archived: ["Archived", "Notes set aside, still here when you need them."],
};

function EmptyState({ view, tag }: Pick<NotesFilter, "view" | "tag">) {
	const [title, message] =
		view === "archived"
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
	const { view, tag } = filter;
	const { notes, error, loading, loadingMore, hasMore, loadMore } = useNotesList(filter);
	const [title, subtitle] = HEADINGS[view];

	return (
		<div className="content-wrap">
			<div className="page-heading">
				<div>
					<div className="eyebrow">Your workspace{tag ? ` · #${tag}` : ""}</div>
					<h1 className="page-title">{tag ? `# ${tag}` : title}</h1>
					<p className="page-subtitle">{tag ? `Notes tagged “${tag}”.` : subtitle}</p>
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
			{loading ? (
				<div className="note-list" aria-label="Loading notes">
					<div className="skeleton" />
					<div className="skeleton" />
				</div>
			) : notes.length ? (
				<div className="note-list">
					{notes.map((note) => (
						<NoteCard key={note.id} note={note} />
					))}
				</div>
			) : (
				!error && <EmptyState view={view} tag={tag} />
			)}

			{hasMore && notes.length > 0 && (
				<div className="load-more">
					<button className="text-button" onClick={() => void loadMore()} disabled={loadingMore}>
						{loadingMore ? "Loading…" : "Load more notes"}
					</button>
				</div>
			)}
		</div>
	);
}
