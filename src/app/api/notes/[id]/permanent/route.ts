import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId, jsonError } from "@/lib/http";
import { recordIdSchema } from "@/lib/validation";

interface RouteContext {
	params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, context: RouteContext) {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to delete notes.", 401);
	const parsedId = recordIdSchema.safeParse((await context.params).id);
	if (!parsedId.success) return jsonError("Invalid note ID.", 400);

	try {
		const result = await prisma.note.deleteMany({
			where: { id: parsedId.data, userId, archivedAt: { not: null } },
		});
		return result.count ? Response.json({ deleted: true }) : jsonError("Archived note not found.", 404);
	} catch (error) {
		console.error("Permanent note deletion failed", error);
		return jsonError("The note could not be deleted.", 500);
	}
}
