import { normalizeTagName, normalizeTagNames } from "@/lib/tags";
import { parseWikilinkTargets } from "@/lib/wikilinks";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
	makePreview,
	resolveLiveWikilinks,
	noteCoreInclude,
	refreshNoteLinks,
	replaceNoteTags,
	serializeNote,
} from "@/lib/notes";
import { getAuthenticatedUserId, jsonError, parseJson } from "@/lib/http";
import { noteUpdateSchema, recordIdSchema } from "@/lib/validation";

interface RouteContext {
	params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to view this note.", 401);
	const parsedId = recordIdSchema.safeParse((await context.params).id);
	if (!parsedId.success) return jsonError("Invalid note ID.", 400);
	const id = parsedId.data;

	try {
		const note = await prisma.note.findFirst({
			where: { id, userId },
			include: noteCoreInclude(),
		});
		return note
			? Response.json(serializeNote(note))
			: jsonError("Note not found.", 404);
	} catch (error) {
		console.error("Note fetch failed", error);
		return jsonError("The note could not be loaded.", 500);
	}
}

export async function PATCH(request: Request, context: RouteContext) {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to update notes.", 401);
	const parsedId = recordIdSchema.safeParse((await context.params).id);
	if (!parsedId.success) return jsonError("Invalid note ID.", 400);
	const id = parsedId.data;
	const data = await parseJson(request, noteUpdateSchema);
	if (!data) return jsonError("The note update is invalid.", 400);

	const updateData: Prisma.NoteUpdateInput = {
		...(data.title !== undefined ? { title: data.title } : {}),
		...(data.contentMarkdown !== undefined
			? { contentMarkdown: data.contentMarkdown, preview: makePreview(data.contentMarkdown) }
			: {}),
		...(data.folderId !== undefined
			? { folder: data.folderId ? { connect: { id: data.folderId, userId } } : { disconnect: true } }
			: {}),
		...(data.isPinned !== undefined ? { isPinned: data.isPinned } : {}),
		...(data.archived !== undefined ? { archivedAt: data.archived ? new Date() : null } : {}),
	};
	const select = { id: true, updatedAt: true, noteTags: { select: { tag: { select: { id: true, name: true } } } } } satisfies Prisma.NoteSelect;

	try {
		// Moves, pins and archives touch one row, so they skip the transaction and the pre-read.
		if (data.contentMarkdown === undefined && data.tags === undefined) {
			const note = await prisma.note.update({ where: { id, userId }, data: updateData, select: { id: true, updatedAt: true } });
			return Response.json({ id: note.id, updatedAt: note.updatedAt });
		}

		const note = await prisma.$transaction(async (transaction) => {
   const existing = await transaction.note.findFirst({
    where: { id, userId },
    select: { contentMarkdown: true, noteTags: { select: { tag: { select: { normalizedName: true } } } } },
   });
   if (!existing) return null;
   if (data.tags !== undefined) {
    const previous = existing.noteTags.map(({ tag }) => tag.normalizedName).sort();
    const next = normalizeTagNames(data.tags).map(normalizeTagName).sort();
    if (JSON.stringify(previous) !== JSON.stringify(next)) await replaceNoteTags(transaction, id, userId, data.tags);
   }
   if (data.contentMarkdown !== undefined) {
    const previous = parseWikilinkTargets(existing.contentMarkdown).sort();
    const next = parseWikilinkTargets(data.contentMarkdown).sort();
    if (JSON.stringify(previous) !== JSON.stringify(next)) await refreshNoteLinks(transaction, userId, id, data.contentMarkdown);
   }
   return transaction.note.update({ where: { id, userId }, data: updateData, select });
		});

  if (!note) return jsonError("Note not found.", 404);
  const response: { id: string; updatedAt: Date; tags?: Array<{ id: string; name: string }>; wikilinks?: unknown } = { id: note.id, updatedAt: note.updatedAt };
  if (data.tags !== undefined) response.tags = note.noteTags.map(({ tag }) => tag);
  if (data.contentMarkdown !== undefined) {
   response.wikilinks = (await resolveLiveWikilinks(userId, { contentMarkdown: data.contentMarkdown, wikilinks: [] })).wikilinks;
  }
  return Response.json(response);
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
			// The update matched nothing: either the note or the target folder is not the user's.
			const owned = await prisma.note.count({ where: { id, userId } });
			return owned
				? jsonError("Choose a folder belonging to your account.", 400)
				: jsonError("Note not found.", 404);
		}
		console.error("Note update failed", error);
		return jsonError("The note could not be saved.", 500);
	}
}

export async function DELETE(_request: Request, context: RouteContext) {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to archive notes.", 401);
	const parsedId = recordIdSchema.safeParse((await context.params).id);
	if (!parsedId.success) return jsonError("Invalid note ID.", 400);
	const id = parsedId.data;

	try {
		const result = await prisma.note.updateMany({
			where: { id, userId },
			data: { archivedAt: new Date() },
		});
		return result.count ? Response.json({ archived: true }) : jsonError("Note not found.", 404);
	} catch (error) {
		console.error("Note archive failed", error);
		return jsonError("The note could not be archived.", 500);
	}
}
