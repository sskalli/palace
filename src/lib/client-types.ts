export interface FolderSummary {
	id: string;
	name: string;
	parentId: string | null;
	_count?: { notes: number };
}

/** A note, as shown in the sidebar tree. */
/** Drag & drop data type carrying a note id. */
export const NOTE_DRAG_TYPE = "application/x-palace-note";

export interface TreeNote {
	id: string;
	title: string;
	folderId: string | null;
	isPinned: boolean;
}

export interface TagSummary {
	id: string;
	name: string;
	normalizedName: string;
}

export interface NoteSummary {
	id: string;
	title: string;
	preview: string;
	updatedAt: string;
	isPinned: boolean;
	folder: { id: string; name: string } | null;
	tags: Array<{ id: string; name: string }>;
}

export interface NoteDetail {
	id: string;
	title: string;
	contentMarkdown: string;
	updatedAt: string;
	createdAt: string;
	isPinned: boolean;
	archivedAt: string | null;
	folderId: string | null;
	folder: { id: string; name: string } | null;
	tags: Array<{ id: string; name: string }>;
	wikilinks: Array<{
		rawTargetTitle: string;
		targetNoteId: string | null;
		targetTitle: string | null;
	}>;
	backlinks: Array<{ id: string; title: string; updatedAt: string }>;
}

export interface SearchResult {
	id: string;
	title: string;
	preview: string;
	folder: { id: string; name: string } | null;
	tags: Array<{ id: string; name: string }>;
	updatedAt: string;
}
