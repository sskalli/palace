import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId, jsonError } from "@/lib/http";

const TREE_NOTE_LIMIT = 2000;

/** Lightweight list of filed, non-archived notes for the sidebar tree. */
export async function GET() {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to view notes.", 401);

	try {
		const notes = await prisma.note.findMany({
			where: { userId, archivedAt: null, folderId: { not: null } },
			orderBy: [{ title: "asc" }, { id: "asc" }],
			take: TREE_NOTE_LIMIT,
			select: { id: true, title: true, folderId: true, isPinned: true },
		});
		return Response.json(notes.map((note) => ({ ...note, title: note.title.trim() || "Untitled note" })));
	} catch (error) {
		console.error("Note tree failed", error);
		return jsonError("Notes could not be loaded.", 500);
	}
}
