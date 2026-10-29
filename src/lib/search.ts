import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { folderPath } from "@/lib/folder-tree";

export const NOTE_SEARCH_LIMIT = 30;
export const FOLDER_SEARCH_LIMIT = 30;

export async function searchUserFolders(userId: string, query: string) {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) return [];
	const matches = await prisma.folder.findMany({
		where: { userId, name: { contains: trimmedQuery, mode: "insensitive" } },
		orderBy: [{ name: "asc" }, { id: "asc" }],
		take: FOLDER_SEARCH_LIMIT,
		select: { id: true, name: true, parentId: true },
	});
	if (!matches.length) return [];
	const folders = await prisma.folder.findMany({
		where: { userId },
		select: { id: true, name: true, parentId: true },
	});
	return matches.map((folder) => ({
		type: "folder" as const,
		id: folder.id,
		name: folder.name,
		path: folderPath(folders, folder.id).map(({ id, name }) => ({ id, name })),
	}));
}

export async function searchUserContent(userId: string, query: string) {
	const [notes, folders] = await Promise.all([searchUserNotes(userId, query), searchUserFolders(userId, query)]);
	return [...folders, ...notes.map((note) => ({ type: "note" as const, ...note }))];
}

export async function searchUserNotes(userId: string, query: string) {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) return [];

	const notes = await prisma.note.findMany({
		where: {
			userId,
			archivedAt: null,
			OR: [
				{ title: { contains: trimmedQuery, mode: "insensitive" } },
				{ contentMarkdown: { contains: trimmedQuery, mode: "insensitive" } },
			],
		},
		orderBy: { updatedAt: "desc" },
		take: NOTE_SEARCH_LIMIT,
		include: {
			folder: { select: { id: true, name: true } },
			noteTags: { include: { tag: { select: { id: true, name: true } } } },
		},
	});

	return notes.map((note) => ({
		id: note.id,
		title: note.title.trim() || "Untitled note",
		preview: getSearchPreview(note.contentMarkdown, trimmedQuery),
		folder: note.folder,
		tags: note.noteTags.map(({ tag }) => tag),
		updatedAt: note.updatedAt,
	}));
}

export function getSearchPreview(content: string, query: string): string {
	const plainText = content
		.replace(/[#>*_`~[\]()!|-]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	const index = plainText.toLowerCase().indexOf(query.toLowerCase());
	if (index < 0) return plainText.slice(0, 150);

	const start = Math.max(0, index - 55);
	const end = Math.min(plainText.length, index + query.length + 90);
	return `${start > 0 ? "…" : ""}${plainText.slice(start, end)}${end < plainText.length ? "…" : ""}`;
}

export function noteSearchWhere(userId: string, query: string): Prisma.NoteWhereInput {
	return {
		userId,
		archivedAt: null,
		OR: [
			{ title: { contains: query, mode: "insensitive" } },
			{ contentMarkdown: { contains: query, mode: "insensitive" } },
		],
	};
}
