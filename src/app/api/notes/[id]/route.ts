import { prisma } from "@/lib/prisma";
import {
  noteDetailInclude,
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
      include: noteDetailInclude(userId),
    });
    return note ? Response.json(serializeNote(note)) : jsonError("Note not found.", 404);
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

  try {
    const note = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.note.findFirst({
        where: { id, userId },
        select: { id: true, contentMarkdown: true },
      });
      if (!existing) return null;

      if (data.folderId) {
        const folder = await transaction.folder.findFirst({
          where: { id: data.folderId, userId },
          select: { id: true },
        });
        if (!folder) throw new Error("INVALID_FOLDER");
      }

      await transaction.note.update({
        where: { id: existing.id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.contentMarkdown !== undefined
            ? { contentMarkdown: data.contentMarkdown }
            : {}),
          ...(data.folderId !== undefined ? { folderId: data.folderId } : {}),
          ...(data.isPinned !== undefined ? { isPinned: data.isPinned } : {}),
          ...(data.archived !== undefined
            ? { archivedAt: data.archived ? new Date() : null }
            : {}),
        },
      });

      if (data.tags !== undefined) {
        await replaceNoteTags(transaction, id, userId, data.tags);
      }
      if (
        data.contentMarkdown !== undefined &&
        data.contentMarkdown !== existing.contentMarkdown
      ) {
        await refreshNoteLinks(transaction, userId, id, data.contentMarkdown);
      }

      return transaction.note.findFirstOrThrow({
        where: { id, userId },
        include: noteDetailInclude(userId),
      });
    });

    return note ? Response.json(serializeNote(note)) : jsonError("Note not found.", 404);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_FOLDER") {
      return jsonError("Choose a folder belonging to your account.", 400);
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
    return result.count
      ? Response.json({ archived: true })
      : jsonError("Note not found.", 404);
  } catch (error) {
    console.error("Note archive failed", error);
    return jsonError("The note could not be archived.", 500);
  }
}
