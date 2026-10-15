import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId, jsonError, parseJson } from "@/lib/http";
import { ensureNameFree, folderErrorResponse, folderWithDescendantIds, FolderError } from "@/lib/folders";
import { folderUpdateSchema, recordIdSchema } from "@/lib/validation";

interface RouteContext {
	params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to update folders.", 401);
	const parsedId = recordIdSchema.safeParse((await context.params).id);
	if (!parsedId.success) return jsonError("Invalid folder ID.", 400);
	const id = parsedId.data;
	const data = await parseJson(request, folderUpdateSchema);
	if (!data) return jsonError("Enter a folder name up to 80 characters.", 400);

	try {
		const folder = await prisma.$transaction(async (transaction) => {
			const existing = await transaction.folder.findFirst({
				where: { id, userId },
				select: { name: true, parentId: true },
			});
			if (!existing) return null;

			const name = data.name ?? existing.name;
			const parentId = data.parentId === undefined ? existing.parentId : data.parentId;

			if (parentId && parentId !== existing.parentId) {
				const [parent, subtree] = await Promise.all([
					transaction.folder.findFirst({ where: { id: parentId, userId }, select: { id: true } }),
					folderWithDescendantIds(transaction, userId, id),
				]);
				if (!parent) {
					throw new FolderError("Choose a parent folder belonging to your account.", 400);
				}
				if (subtree.includes(parentId)) {
					throw new FolderError("A folder cannot be moved into itself or one of its subfolders.", 400);
				}
			}
			if (name !== existing.name || parentId !== existing.parentId) {
				await ensureNameFree(transaction, userId, parentId, name, id);
				await transaction.folder.update({ where: { id }, data: { name, parentId } });
			}
			return { id, name, parentId };
		});
		return folder ? Response.json(folder) : jsonError("Folder not found.", 404);
	} catch (error) {
		const known = folderErrorResponse(error);
		if (known) return known;
		console.error("Folder update failed", error);
		return jsonError("The folder could not be updated.", 500);
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
			// Subfolders go with their parent; the notes inside are kept and become unfiled.
			const ids = await folderWithDescendantIds(transaction, userId, id);
			if (!ids.length) return false;
			await transaction.note.updateMany({
				where: { userId, folderId: { in: ids } },
				data: { folderId: null },
			});
			await transaction.folder.deleteMany({ where: { userId, id: { in: ids } } });
			return true;
		});
		return deleted ? Response.json({ deleted: true, notesUnfiled: true }) : jsonError("Folder not found.", 404);
	} catch (error) {
		console.error("Folder deletion failed", error);
		return jsonError("The folder could not be deleted.", 500);
	}
}
