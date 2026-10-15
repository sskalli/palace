"use client";

import Link from "next/link";
import { useState, type FocusEvent } from "react";
import { ArchiveIcon, PinIcon, TrashIcon, UnarchiveIcon } from "@/components/icons";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Modal } from "@/components/modal";
import { errorText } from "@/lib/api-client";
import { folderPath } from "@/lib/folder-tree";
import { TagEditor } from "@/components/tag-editor";
import { useNoteEditor, type SaveState } from "@/hooks/use-note-editor";

const SAVE_LABELS: Record<SaveState, string> = { saved: "Saved", saving: "Saving…", failed: "Save failed" };

export function NoteEditor({ noteId }: { noteId: string }) {
	const { note, folders, draft, loadError, saveState, saveError, update, flush, retry, remove } =
		useNoteEditor(noteId);
	const [preview, setPreview] = useState(false);
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [deleteError, setDeleteError] = useState("");

	if (loadError) {
		return (
			<div className="content-wrap">
				<div className="message-error" role="alert">
					{loadError}
				</div>
				<p>
					<Link className="text-button" href="/">
						← Back to notes
					</Link>
				</p>
			</div>
		);
	}
	if (!note || !draft) {
		return (
			<div className="content-wrap">
				<div className="loading-state">Opening your note…</div>
			</div>
		);
	}

	// Save as soon as focus leaves the editor, not only after the debounce.
	function onBlur(event: FocusEvent<HTMLElement>) {
		if (event.relatedTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return;
		flush();
	}

	const pinLabel = draft.isPinned ? "Unpin note" : "Pin note";
	const archiveLabel = draft.archived ? "Unarchive note" : "Archive note";
	const folderOptions = folders
		.map((folder) => ({
			id: folder.id,
			label: folderPath(folders, folder.id)
				.map((part) => part.name)
				.join(" / "),
		}))
		.sort((a, b) => a.label.localeCompare(b.label));

	return (
		<div className="content-wrap" onBlur={onBlur}>
			{confirmingDelete && (
				<Modal
					title="Delete note permanently?"
					description={`“${draft.title.trim() || "Untitled note"}” will be permanently deleted and cannot be recovered.`}
					errorMessage={deleteError}
					confirmLabel="Delete permanently"
					danger
					onConfirm={async () => {
						try {
							await remove();
						} catch (cause) {
							setDeleteError(errorText(cause, "The note could not be deleted."));
						}
					}}
					onClose={() => {
						setConfirmingDelete(false);
						setDeleteError("");
					}}
				/>
			)}
			<div className="editor-wrap">
				<div className="editor-toolbar">
					<div className="editor-toolbar-left">
						<Link className="text-button" href={draft.archived ? "/?view=archived" : "/"}>
							← Notes
						</Link>
						<span className={`save-status ${saveState === "saved" ? "" : saveState}`} aria-live="polite">
							<span className="save-dot" />
							{SAVE_LABELS[saveState]}
						</span>
						{saveState === "failed" && (
							<button className="text-button" onClick={retry}>
								Retry
							</button>
						)}
					</div>
					<div className="editor-toolbar-right">
						<select
							className="editor-select"
							aria-label="Move note to folder"
							value={draft.folderId ?? ""}
							onChange={(event) => update({ folderId: event.target.value || null })}
						>
							<option value="">No folder</option>
							{folderOptions.map(({ id, label }) => (
								<option value={id} key={id}>
									{label}
								</option>
							))}
						</select>
						<button
							className="icon-button"
							title={pinLabel}
							aria-label={pinLabel}
							onClick={() => update({ isPinned: !draft.isPinned })}
						>
							<PinIcon filled={draft.isPinned} />
						</button>
						<button
							className="icon-button"
							title={archiveLabel}
							aria-label={archiveLabel}
							onClick={() => update({ archived: !draft.archived })}
						>
							{draft.archived ? <UnarchiveIcon /> : <ArchiveIcon />}
						</button>
						{draft.archived && (
							<button
								className="icon-button danger"
								title="Delete permanently"
								aria-label="Delete permanently"
								onClick={() => setConfirmingDelete(true)}
							>
								<TrashIcon />
							</button>
						)}
					</div>
				</div>
				{saveState === "failed" && saveError && (
					<div className="message-error message-spaced" role="alert">
						{saveError}
					</div>
				)}

				<article className="editor-paper">
					<input
						className="title-input"
						value={draft.title}
						onChange={(event) => update({ title: event.target.value })}
						placeholder="Untitled note"
						aria-label="Note title"
						maxLength={200}
					/>
					<div className="editor-meta">
						<TagEditor tags={draft.tags} onChange={(tags) => update({ tags })} />
						<button
							className={`text-button${preview ? " selected" : ""}`}
							onClick={() => setPreview((value) => !value)}
						>
							{preview ? "Write" : "Preview"}
						</button>
					</div>
					{preview ? (
						<MarkdownPreview content={draft.contentMarkdown} wikilinks={note.wikilinks} />
					) : (
						<textarea
							className="markdown-textarea"
							value={draft.contentMarkdown}
							onChange={(event) => update({ contentMarkdown: event.target.value })}
							placeholder="Start with a thought…&#10;&#10;Write in Markdown. Link a note with [[its title]]."
							aria-label="Markdown note content"
							maxLength={100_000}
						/>
					)}
				</article>

				<section className="backlinks">
					<h2>Linked mentions · {note.backlinks.length}</h2>
					{note.backlinks.length ? (
						<div className="backlink-list">
							{note.backlinks.map((backlink) => (
								<Link className="backlink" href={`/notes/${backlink.id}`} key={backlink.id}>
									{backlink.title.trim() || "Untitled note"}
								</Link>
							))}
						</div>
					) : (
						<span className="muted-text">Notes that link here will appear in this space.</span>
					)}
				</section>
			</div>
		</div>
	);
}
