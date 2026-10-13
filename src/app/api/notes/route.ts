import { prisma } from "@/lib/prisma";
import { listNotes, noteDetailInclude, refreshNoteLinks, replaceNoteTags, serializeNote } from "@/lib/notes";
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
		const note = await prisma.$transaction(async (transaction) => {
			const folderId = data.folderId ?? null;
			if (folderId) {
				const folder = await transaction.folder.findFirst({
					where: { id: folderId, userId },
					select: { id: true },
				});
				if (!folder) throw new Error("INVALID_FOLDER");
			}

			const created = await transaction.note.create({
				data: {
					userId,
					folderId,
					title: data.title,
					contentMarkdown: data.contentMarkdown,
				},
			});
			if (data.contentMarkdown) {
				await refreshNoteLinks(transaction, userId, created.id, data.contentMarkdown);
			}
			if (data.tags.length) {
				await replaceNoteTags(transaction, created.id, userId, data.tags);
			}
			return transaction.note.findFirstOrThrow({
				where: { id: created.id, userId },
				include: noteDetailInclude(userId),
			});
		});
		return Response.json(serializeNote(note), { status: 201 });
	} catch (error) {
		if (error instanceof Error && error.message === "INVALID_FOLDER") {
			return jsonError("Choose a folder belonging to your account.", 400);
		}
		console.error("Note creation failed", error);
		return jsonError("The note could not be created.", 500);
	}
}
