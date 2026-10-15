import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId, jsonError, parseJson } from "@/lib/http";
import { ensureNameFree, folderErrorResponse, FolderError } from "@/lib/folders";
import { folderCreateSchema } from "@/lib/validation";

export async function GET() {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to view folders.", 401);

	try {
		const folders = await prisma.folder.findMany({
			where: { userId },
			orderBy: [{ name: "asc" }, { id: "asc" }],
			select: {
				id: true,
				name: true,
				parentId: true,
				_count: { select: { notes: { where: { archivedAt: null } } } },
			},
		});
		return Response.json(folders);
	} catch (error) {
		console.error("Folder list failed", error);
		return jsonError("Folders could not be loaded.", 500);
	}
}

export async function POST(request: Request) {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to create folders.", 401);
	const data = await parseJson(request, folderCreateSchema);
	if (!data) return jsonError("Enter a folder name up to 80 characters.", 400);

	const parentId = data.parentId ?? null;

	try {
		const folder = await prisma.$transaction(async (transaction) => {
			if (parentId) {
				const parent = await transaction.folder.findFirst({
					where: { id: parentId, userId },
					select: { id: true },
				});
				if (!parent) throw new FolderError("Choose a parent folder belonging to your account.", 400);
			}
			await ensureNameFree(transaction, userId, parentId, data.name);
			return transaction.folder.create({
				data: { userId, name: data.name, parentId },
				select: { id: true, name: true, parentId: true },
			});
		});
		return Response.json(folder, { status: 201 });
	} catch (error) {
		const known = folderErrorResponse(error);
		if (known) return known;
		console.error("Folder creation failed", error);
		return jsonError("The folder could not be created.", 500);
	}
}
