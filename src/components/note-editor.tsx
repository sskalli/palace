"use client";

import Link from "next/link";
import { useEffect, useState, type FocusEvent } from "react";
import {
	ArchiveIcon,
	EyeIcon,
	ExpandIcon,
	ShrinkIcon,
	PenIcon,
	PinIcon,
	TrashIcon,
	UnarchiveIcon,
} from "@/components/icons";
import { LiveMarkdownEditor } from "@/components/live-markdown-editor";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Modal } from "@/components/modal";
import { useNoteStore } from "@/components/note-store-context";
import { errorText, requestOpenNote } from "@/lib/api-client";
import { useFolders } from "@/components/folders-context";
import { folderPath } from "@/lib/folder-tree";
import { TagEditor } from "@/components/tag-editor";
import { useNoteEditor, type SaveState } from "@/hooks/use-note-editor";

const SAVE_LABELS: Record<SaveState, string> = { saved: "Saved", saving: "Saving…", failed: "Save failed" };

export function NoteEditor({ noteId }: { noteId: string }) {
	const { note, folderId, draft, loadError, saveState, saveError, update, flush, retry, remove } =
		useNoteEditor(noteId);
	const store = useNoteStore();
	const folders = useFolders();
	const [preview, setPreview] = useState(false);
	const [wide, setWide] = useState(false);
	const pageTitle = draft?.title.trim() || "Untitled note";
	useEffect(() => {
		if (draft) document.title = `${pageTitle} · Palace`;
	}, [draft, pageTitle]);
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

	const previewLabel = preview ? "Back to writing" : "Preview";
	const widthLabel = wide ? "Narrow editor" : "Wide editor";
	const pinLabel = draft.isPinned ? "Unpin note" : "Pin note";
	const archiveLabel = draft.archived ? "Unarchive note" : "Archive note";

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
			<div className={`editor-wrap${wide ? " wide" : ""}`}>
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
						<button
							className="icon-button"
							title={widthLabel}
							aria-label={widthLabel}
							aria-pressed={wide}
							onClick={() => setWide((value) => !value)}
						>
							{wide ? <ShrinkIcon /> : <ExpandIcon />}
						</button>
						<button
							className="icon-button"
							title={previewLabel}
							aria-label={previewLabel}
							onClick={() => setPreview((value) => !value)}
						>
							{preview ? <PenIcon /> : <EyeIcon />}
						</button>
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

				<div className="note-path" aria-label="Note location">
					{folderPath(folders, folderId).map((folder) => (
						<span key={folder.id}>
							<Link href={`/?view=all&folder=${encodeURIComponent(folder.id)}`}>{folder.name}</Link>
							<span aria-hidden="true"> / </span>
						</span>
					))}
					<span aria-current="page">{draft.title.trim() || "Untitled note"}</span>
				</div>
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
					</div>
					{preview ? (
						<MarkdownPreview content={draft.contentMarkdown} wikilinks={note.wikilinks} />
					) : (
						<LiveMarkdownEditor
							value={draft.contentMarkdown}
							onChange={(contentMarkdown) => update({ contentMarkdown })}
							wikilinks={note.wikilinks}
							placeholder={"Start with a thought…\n\nWrite in Markdown. Link a note with [[its title]]."}
							label="Markdown note content"
							maxLength={100_000}
						/>
					)}
				</article>

				<section className="backlinks">
					<h2>
						Linked mentions · {note.backlinksLimited ? "First " : ""}
						{note.backlinks.length}
					</h2>
					{note.referencesLoaded === false && <p className="muted-text">Loading linked notes…</p>}
					{note.referencesError && (
						<p role="status" className="muted-text">
							Linked notes could not be loaded.{" "}
							<button className="text-button" onClick={() => void store.refreshReferences(noteId)}>
								Retry
							</button>
						</p>
					)}
					{note.backlinks.length ? (
						<div className="backlink-list">
							{note.backlinks.map((backlink) => (
								<Link
									className="backlink"
									href={`/notes/${backlink.id}`}
									onMouseEnter={() => store.prefetch(backlink.id)}
									onFocus={() => store.prefetch(backlink.id)}
									onNavigate={() => requestOpenNote(backlink.id)}
									key={backlink.id}
								>
									{backlink.title.trim() || "Untitled note"}
								</Link>
							))}
						</div>
					) : (
						note.referencesLoaded !== false &&
						!note.referencesError && (
							<span className="muted-text">Notes that link here will appear in this space.</span>
						)
					)}
				</section>
			</div>
		</div>
	);
}
