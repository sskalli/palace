import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeTagName, normalizeTagNames } from "@/lib/tags";
import { parseWikilinkTargets, resolveWikilinkTargets } from "@/lib/wikilinks";

type Transaction = Prisma.TransactionClient;

export function makePreview(markdown: string): string {
	return markdown.replace(/\s+/g, " ").trim().slice(0, 180);
}

export async function replaceNoteTags(transaction: Transaction, noteId: string, userId: string, names: string[]) {
	const entries = normalizeTagNames(names).map((name) => ({ name, normalizedName: normalizeTagName(name) }));
	if (!entries.length) {
		await transaction.noteTag.deleteMany({ where: { noteId } });
		return;
	}

	await transaction.tag.createMany({
		data: entries.map((entry) => ({ userId, ...entry })),
		skipDuplicates: true,
	});
	const tags = await transaction.tag.findMany({
		where: { userId, normalizedName: { in: entries.map((entry) => entry.normalizedName) } },
		select: { id: true },
	});
	const tagIds = tags.map(({ id }) => id);
	await transaction.noteTag.deleteMany({ where: { noteId, tagId: { notIn: tagIds } } });
	await transaction.noteTag.createMany({
		data: tagIds.map((tagId) => ({ noteId, tagId })),
		skipDuplicates: true,
	});
}

export async function refreshNoteLinks(
	transaction: Transaction,
	userId: string,
	sourceNoteId: string,
	markdown: string,
) {
	const targets = parseWikilinkTargets(markdown);
	const candidates = targets.length
		? await transaction.note.findMany({
				where: { userId, archivedAt: null, title: { in: targets } },
				select: { id: true, userId: true, title: true, archivedAt: true },
			})
		: [];
	const links = resolveWikilinkTargets(userId, targets, candidates);

	await transaction.noteLink.deleteMany({ where: { sourceNoteId } });
	if (links.length) {
		await transaction.noteLink.createMany({
			data: links.map(({ rawTargetTitle, targetNoteId }) => ({
				sourceNoteId,
				rawTargetTitle,
				targetNoteId,
			})),
		});
	}
}

export function noteCoreInclude() {
 return {
  folder: { select: { id: true, name: true } },
  noteTags: { select: { tag: { select: { id: true, name: true } } } },
 } satisfies Prisma.NoteInclude;
}
export function noteDetailInclude(userId: string) {
 return {
  ...noteCoreInclude(),
		incomingLinks: {
			where: { sourceNote: { userId, archivedAt: null } },
			select: {
				sourceNote: { select: { id: true, title: true, updatedAt: true } },
			},
		},
	} satisfies Prisma.NoteInclude;
}

export function serializeNote<
	T extends {
		noteTags: Array<{ tag: { id: string; name: string } }>;
		incomingLinks?: Array<{ sourceNote: { id: string; title: string; updatedAt: Date } }>;
	},
>(note: T) {
	const { noteTags, incomingLinks, ...fields } = note;
 return {
		...fields,
		tags: noteTags.map(({ tag }) => tag),
		wikilinks: [] as Array<{ rawTargetTitle: string; targetNoteId: string | null; targetTitle: string | null }>,
		backlinks: incomingLinks?.map(({ sourceNote }) => sourceNote) ?? [],
	};
}

/** Resolves the note's [[wikilinks]] against current titles, so notes created or renamed after the last save still link. */
export async function resolveLiveWikilinks<T extends { contentMarkdown: string; wikilinks: unknown }>(
	userId: string,
	note: T,
) {
	const targets = parseWikilinkTargets(note.contentMarkdown);
	if (!targets.length) return { ...note, wikilinks: [] };
	const candidates = await prisma.note.findMany({
		where: { userId, archivedAt: null, title: { in: targets } },
		select: { id: true, userId: true, title: true, archivedAt: true },
	});
	const titles = new Map(candidates.map((candidate) => [candidate.id, candidate.title]));
	const wikilinks = resolveWikilinkTargets(userId, targets, candidates).map(({ rawTargetTitle, targetNoteId }) => ({
		rawTargetTitle,
		targetNoteId,
		targetTitle: targetNoteId ? (titles.get(targetNoteId) ?? null) : null,
	}));
	return { ...note, wikilinks };
}

export interface NoteListFilter {
	view: "all" | "pinned" | "archived";
	folderId?: string;
	tag?: string;
	cursor?: string;
}

const NOTE_PAGE_SIZE = 50;

/** One page of a user's notes, newest first. Returns null when the cursor is not one of the user's notes in this filter. */
export async function listNotes(userId: string, filter: NoteListFilter) {
	const where: Prisma.NoteWhereInput = {
		userId,
		archivedAt: filter.view === "archived" ? { not: null } : null,
		...(filter.view === "pinned" ? { isPinned: true } : {}),
		...(filter.folderId ? { folderId: filter.folderId } : {}),
		...(filter.tag
			? { noteTags: { some: { tag: { userId, normalizedName: normalizeTagName(filter.tag) } } } }
			: {}),
	};

	const [cursorNote, rows] = await Promise.all([
		filter.cursor
			? prisma.note.findFirst({ where: { ...where, id: filter.cursor }, select: { id: true } })
			: Promise.resolve(true),
		prisma.note.findMany({
			where,
			...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
			take: NOTE_PAGE_SIZE + 1,
			orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
			select: {
				id: true,
				userId: true,
				folderId: true,
				title: true,
				preview: true,
				isPinned: true,
				archivedAt: true,
				createdAt: true,
				updatedAt: true,
				folder: { select: { id: true, name: true } },
				noteTags: { select: { tag: { select: { id: true, name: true } } } },
			},
		}),
	]);
	if (!cursorNote) return null;
	const page = rows.slice(0, NOTE_PAGE_SIZE);

	return {
		notes: page.map(({ noteTags, ...note }) => ({
			...note,
			title: note.title.trim() || "Untitled note",
			tags: noteTags.map(({ tag }) => tag),
		})),
		nextCursor: rows.length > NOTE_PAGE_SIZE ? (page[page.length - 1]?.id ?? null) : null,
	};
}
