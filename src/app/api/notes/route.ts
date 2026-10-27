import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
	listNotes,
	makePreview,
	noteDetailInclude,
 noteCoreInclude,
	refreshNoteLinks,
	replaceNoteTags,
	resolveLiveWikilinks,
	serializeNote,
} from "@/lib/notes";
import { getAuthenticatedUserId, jsonError, parseJson } from "@/lib/http";
import { noteCreateSchema } from "@/lib/validation";
import { z } from "zod";

const listQuerySchema = z.object({
	view: z.enum(["all", "pinned", "archived"]).default("all"),
	folderId: z.string().trim().min(1).max(100).optional(),
	tag: z.string().trim().max(50).optional(),
	cursor: z.string().trim().min(1).max(100).optional(),
});

export async function GET(request: Request) {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to view notes.", 401);

	const { searchParams } = new URL(request.url);
	const parsed = listQuerySchema.safeParse({
		view: searchParams.get("view") ?? undefined,
		folderId: searchParams.get("folderId") ?? undefined,
		tag: searchParams.get("tag") ?? undefined,
		cursor: searchParams.get("cursor") ?? undefined,
	});
	if (!parsed.success) return jsonError("Invalid note filters.", 400);

	try {
		const page = await listNotes(userId, parsed.data);
		if (!page) return jsonError("Invalid note list cursor.", 400);
		return Response.json(page);
	} catch (error) {
		console.error("Note list failed", error);
		return jsonError("Notes could not be loaded.", 500);
	}
}

export async function POST(request: Request) {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to create notes.", 401);

	const data = await parseJson(request, noteCreateSchema);
	if (!data) return jsonError("The note details are invalid.", 400);

	try {
		if (data.id) {
   const existing = await prisma.note.findFirst({ where: { id: data.id, userId }, include: noteCoreInclude() });
   if (existing) return Response.json(serializeNote(existing));
  }
  const include = noteDetailInclude(userId);
		const createData: Prisma.NoteCreateInput = {
   ...(data.id ? { id: data.id } : {}),
			user: { connect: { id: userId } },
			...(data.folderId ? { folder: { connect: { id: data.folderId, userId } } } : {}),
			title: data.title,
			contentMarkdown: data.contentMarkdown,
			preview: makePreview(data.contentMarkdown),
		};

		if (!data.contentMarkdown && !data.tags.length) {
			// A blank note has no tags, links or backlinks, so only the folder needs to be read back.
			const created = await prisma.note.create({
				data: createData,
				include: { folder: { select: { id: true, name: true } } },
			});
			return Response.json({ ...created, tags: [], wikilinks: [], backlinks: [] }, { status: 201 });
		}

		const note = await prisma.$transaction(async (transaction) => {
			const created = await transaction.note.create({ data: createData, select: { id: true } });
			if (data.contentMarkdown) {
				await refreshNoteLinks(transaction, userId, created.id, data.contentMarkdown);
			}
			if (data.tags.length) {
				await replaceNoteTags(transaction, created.id, userId, data.tags);
			}
			return transaction.note.findFirstOrThrow({ where: { id: created.id, userId }, include });
		});
		return Response.json(await resolveLiveWikilinks(userId, serializeNote(note)), { status: 201 });
	} catch (error) {
  if (data.id && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
   const existing = await prisma.note.findFirst({ where: { id: data.id, userId }, include: noteCoreInclude() });
   if (existing) return Response.json(serializeNote(existing));
  }
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
			return jsonError("Choose a folder belonging to your account.", 400);
		}
		console.error("Note creation failed", error);
		return jsonError("The note could not be created.", 500);
	}
}
