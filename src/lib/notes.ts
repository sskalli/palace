import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeTagName, normalizeTagNames } from "@/lib/tags";
import { parseWikilinkTargets, resolveWikilinkTargets } from "@/lib/wikilinks";

type Transaction = Prisma.TransactionClient;

export async function replaceNoteTags(transaction: Transaction, noteId: string, userId: string, names: string[]) {
	const normalizedNames = normalizeTagNames(names);
	const tags = await Promise.all(
		normalizedNames.map((name) => {
			const normalizedName = normalizeTagName(name);
			return transaction.tag.upsert({
				where: { userId_normalizedName: { userId, normalizedName } },
				create: { userId, name, normalizedName },
				update: {},
			});
		}),
	);

	await transaction.noteTag.deleteMany({ where: { noteId } });
	if (tags.length) {
		await transaction.noteTag.createMany({
			data: tags.map(({ id }) => ({ noteId, tagId: id })),
			skipDuplicates: true,
		});
	}
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
				where: { userId, archivedAt: null },
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

export function noteDetailInclude(userId: string) {
	return {
		folder: { select: { id: true, name: true } },
		noteTags: { include: { tag: { select: { id: true, name: true } } } },
		outgoingLinks: {
			select: {
				rawTargetTitle: true,
				targetNote: { select: { id: true, title: true } },
			},
		},
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
		outgoingLinks: Array<{
			rawTargetTitle: string;
			targetNote: { id: string; title: string } | null;
		}>;
		incomingLinks?: Array<{ sourceNote: { id: string; title: string; updatedAt: Date } }>;
	},
>(note: T) {
	return {
		...note,
		tags: note.noteTags.map(({ tag }) => tag),
		wikilinks: note.outgoingLinks.map(({ rawTargetTitle, targetNote }) => ({
			rawTargetTitle,
			targetNoteId: targetNote?.id ?? null,
			targetTitle: targetNote?.title ?? null,
		})),
		backlinks: note.incomingLinks?.map(({ sourceNote }) => sourceNote) ?? [],
	};
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

	if (filter.cursor) {
		const cursorNote = await prisma.note.findFirst({
			where: { ...where, id: filter.cursor },
			select: { id: true },
		});
		if (!cursorNote) return null;
	}

	const rows = await prisma.note.findMany({
		where,
		...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
		take: NOTE_PAGE_SIZE + 1,
		orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
		include: {
			folder: { select: { id: true, name: true } },
			noteTags: { include: { tag: { select: { id: true, name: true } } } },
		},
	});
	const page = rows.slice(0, NOTE_PAGE_SIZE);

	return {
		notes: page.map(({ noteTags, ...note }) => ({
			...note,
			title: note.title.trim() || "Untitled note",
			preview: note.contentMarkdown.replace(/\s+/g, " ").trim().slice(0, 180),
			tags: noteTags.map(({ tag }) => tag),
		})),
		nextCursor: rows.length > NOTE_PAGE_SIZE ? (page[page.length - 1]?.id ?? null) : null,
	};
}
