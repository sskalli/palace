import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId, jsonError, parseJson } from "@/lib/http";
import { folderUpdateSchema, recordIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return jsonError("Sign in to rename folders.", 401);
  const parsedId = recordIdSchema.safeParse((await context.params).id);
  if (!parsedId.success) return jsonError("Invalid folder ID.", 400);
  const id = parsedId.data;
  const data = await parseJson(request, folderUpdateSchema);
  if (!data) return jsonError("Enter a folder name up to 80 characters.", 400);

  try {
    const folder = await prisma.folder.updateMany({
      where: { id, userId },
      data: { name: data.name },
    });
    return folder.count
      ? Response.json({ id, name: data.name })
      : jsonError("Folder not found.", 404);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return jsonError("A folder with this name already exists.", 409);
    }
    console.error("Folder rename failed", error);
    return jsonError("The folder could not be renamed.", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return jsonError("Sign in to delete folders.", 401);
  const parsedId = recordIdSchema.safeParse((await context.params).id);
  if (!parsedId.success) return jsonError("Invalid folder ID.", 400);
  const id = parsedId.data;

  try {
    const deleted = await prisma.$transaction(async (transaction) => {
      const folder = await transaction.folder.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!folder) return false;
      await transaction.note.updateMany({
        where: { userId, folderId: id },
        data: { folderId: null },
      });
      await transaction.folder.delete({ where: { id } });
      return true;
    });
    return deleted
      ? Response.json({ deleted: true, notesUnfiled: true })
      : jsonError("Folder not found.", 404);
  } catch (error) {
    console.error("Folder deletion failed", error);
    return jsonError("The folder could not be deleted.", 500);
  }
}
